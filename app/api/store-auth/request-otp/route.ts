import crypto from 'node:crypto';
import { getSupabaseAdminClient, getClientIp } from '@/lib/supabase/admin';
import {
  checkStoreAuthRateLimit,
  computeOtpHmac,
  generateOtpCode,
  isValidUuid,
  maskEmail,
} from '@/lib/store-auth/otp';
import { sendStoreOtpEmail } from '@/lib/store-auth/email';
import { recordStoreAuthAudit } from '@/lib/store-auth/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RequestOtpBody {
  storeId?: unknown;
  deviceId?: unknown;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // 1. IPベースの永続レート制限（1分間に最大10回）
  const ipRateLimit = await checkStoreAuthRateLimit(`request-otp:ip:${ip}`, 10, 60);
  if (!ipRateLimit.allowed) {
    return Response.json(
      { error: 'リクエスト回数が上限を超えました。しばらく待ってから再試行してください。' },
      { status: 429 },
    );
  }

  let body: RequestOtpBody;
  try {
    body = (await request.json()) as RequestOtpBody;
  } catch {
    return Response.json({ error: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const { storeId, deviceId } = body;

  if (!isValidUuid(storeId)) {
    return Response.json({ error: '有効な店舗IDを指定してください。' }, { status: 400 });
  }

  // 2. 店舗単位の永続レート制限（10分間に最大5回）
  const storeRateLimit = await checkStoreAuthRateLimit(
    `request-otp:store:${storeId}`,
    5,
    600,
  );
  if (!storeRateLimit.allowed) {
    return Response.json(
      { error: '認証コードの発行回数上限に達しました。しばらく待ってから再試行してください。' },
      { status: 429 },
    );
  }

  try {
    const client = getSupabaseAdminClient();

    // 3. 店舗の存在確認とメールアドレスの取得
    const { data: store, error: storeError } = await client
      .from('stores')
      .select('id, name, is_active, notification_email')
      .eq('id', storeId)
      .maybeSingle();

    if (storeError || !store || !store.is_active) {
      await recordStoreAuthAudit({
        action: 'otp_request_failed',
        actorType: 'anonymous',
        storeId,
        metadata: { ip, reason: 'store_not_found_or_inactive' },
      });
      return Response.json(
        { error: '指定された店舗が見つからないか、無効化されています。' },
        { status: 404 },
      );
    }

    if (!store.notification_email || store.notification_email.trim() === '') {
      await recordStoreAuthAudit({
        action: 'otp_request_failed',
        actorType: 'anonymous',
        storeId,
        metadata: { ip, reason: 'missing_notification_email' },
      });
      return Response.json(
        {
          error:
            '店舗の通知用メールアドレスが登録されていません。管理本部にお問い合わせください。',
        },
        { status: 400 },
      );
    }

    // 4. チャレンジIDの先行生成 & 暗号学的OTP & HMAC-SHA256 生成
    const challengeId = crypto.randomUUID();
    const otp = generateOtpCode();
    const codeHash = computeOtpHmac(challengeId, otp);

    // 5. DB 関数 create_store_otp_challenge 呼び出し (先行生成IDを渡す)
    const { data: rpcChallengeId, error: rpcError } = await client.rpc(
      'create_store_otp_challenge',
      {
        p_challenge_id: challengeId,
        p_store_id: storeId,
        p_code_hash: codeHash,
        p_expires_in: '15 minutes',
      },
    );

    if (rpcError || !rpcChallengeId) {
      console.error('[CREATE_OTP_CHALLENGE_RPC_ERROR]', rpcError?.message);
      return Response.json(
        { error: '認証コードの発行処理に失敗しました。' },
        { status: 500 },
      );
    }

    // 6. Resend を用いたメール送信
    const emailResult = await sendStoreOtpEmail({
      to: store.notification_email,
      storeName: store.name,
      otp,
    });

    if (!emailResult.success) {
      await recordStoreAuthAudit({
        action: 'otp_request_failed',
        actorType: 'store',
        storeId,
        metadata: {
          ip,
          challengeId,
          error: emailResult.error,
        },
      });
      return Response.json(
        { error: '認証コードメールの送信に失敗しました。時間をおいて再試行してください。' },
        { status: 502 },
      );
    }

    // 7. 監査ログ記録（OTP平文は絶対に記録しない）
    await recordStoreAuthAudit({
      action: 'otp_requested',
      actorType: 'store',
      storeId,
      metadata: {
        ip,
        challengeId,
        deviceId: typeof deviceId === 'string' ? deviceId.slice(0, 64) : undefined,
        maskedEmail: maskEmail(store.notification_email),
        emailSkipped: emailResult.skipped ?? false,
      },
    });

    return Response.json({
      success: true,
      challengeId,
      maskedEmail: maskEmail(store.notification_email),
      expiresInSeconds: 900,
    });
  } catch (err) {
    console.error('[REQUEST_OTP_EXCEPTION]', err);
    return Response.json(
      { error: '認証コード発行中に予期せぬエラーが発生しました。' },
      { status: 500 },
    );
  }
}
