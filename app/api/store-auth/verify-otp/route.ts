import { getSupabaseAdminClient, getClientIp } from '@/lib/supabase/admin';
import {
  checkStoreAuthRateLimit,
  computeOtpHmac,
  isValidOtpCode,
  isValidUuid,
} from '@/lib/store-auth/otp';
import {
  createDeviceSessionToken,
  createSessionCookieHeader,
} from '@/lib/store-auth/session';
import { recordStoreAuthAudit } from '@/lib/store-auth/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VerifyOtpBody {
  challengeId?: unknown;
  otp?: unknown;
  deviceId?: unknown;
  deviceName?: unknown;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // 1. IPベースの永続レート制限（1分間に最大15回）
  const ipRateLimit = await checkStoreAuthRateLimit(`verify-otp:ip:${ip}`, 15, 60);
  if (!ipRateLimit.allowed) {
    return Response.json(
      { error: 'リクエスト回数が上限を超えました。しばらく待ってから再試行してください。' },
      { status: 429 },
    );
  }

  let body: VerifyOtpBody;
  try {
    body = (await request.json()) as VerifyOtpBody;
  } catch {
    return Response.json({ error: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const { challengeId, otp, deviceId, deviceName } = body;

  if (!isValidUuid(challengeId)) {
    return Response.json({ error: '有効なチャレンジIDを指定してください。' }, { status: 400 });
  }

  // 2. チャレンジ単位の永続レート制限（10分間に最大10回）
  const challengeRateLimit = await checkStoreAuthRateLimit(
    `verify-otp:challenge:${challengeId}`,
    10,
    600,
  );
  if (!challengeRateLimit.allowed) {
    return Response.json(
      { error: '試行回数の上限を超えました。新しい認証コードを発行してください。' },
      { status: 429 },
    );
  }

  if (!isValidOtpCode(otp)) {
    return Response.json({ error: '認証コードは6桁の半角数字で入力してください。' }, { status: 400 });
  }

  if (typeof deviceId !== 'string' || deviceId.trim().length < 8 || deviceId.trim().length > 128) {
    return Response.json(
      { error: '有効な端末識別子（8〜128文字）が指定されていません。' },
      { status: 400 },
    );
  }

  const cleanDeviceId = deviceId.trim();
  const cleanDeviceName =
    typeof deviceName === 'string' ? deviceName.trim().slice(0, 100) : '';

  try {
    const client = getSupabaseAdminClient();

    // 2. HMAC-SHA256 を計算
    const codeHash = computeOtpHmac(challengeId, otp.trim());

    // 3. DB RPC verify_store_otp 呼び出し
    const { data: rpcData, error: rpcError } = await client.rpc('verify_store_otp', {
      p_challenge_id: challengeId,
      p_code_hash: codeHash,
      p_max_attempts: 5,
    });

    if (rpcError) {
      console.error('[VERIFY_OTP_RPC_ERROR]', rpcError.message);
      return Response.json(
        { error: '認証コードの検証処理中にエラーが発生しました。' },
        { status: 500 },
      );
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    if (!result || !result.success) {
      const reason = result?.message || 'unknown';
      const storeId = result?.store_id || undefined;

      await recordStoreAuthAudit({
        action: 'otp_failed',
        actorType: 'store',
        storeId,
        metadata: {
          ip,
          challengeId,
          reason,
        },
      });

      if (reason === 'locked') {
        return Response.json(
          { error: '試行回数の上限（5回）を超えました。新しい認証コードを発行してください。' },
          { status: 429 },
        );
      }

      if (reason === 'expired') {
        return Response.json(
          { error: '認証コードの有効期限（15分）が切れています。新しいコードを発行してください。' },
          { status: 400 },
        );
      }

      if (reason === 'not_found' || reason === 'invalidated' || reason === 'used') {
        return Response.json(
          { error: 'この認証コードは既に使用されたか、無効化されています。' },
          { status: 400 },
        );
      }

      return Response.json(
        { error: '認証コードが正しくありません。' },
        { status: 400 },
      );
    }

    const verifiedStoreId = result.store_id;

    // 4. 成功: 30日端末認証セッションを作成
    const { rawToken, tokenHash } = createDeviceSessionToken();

    const { data: sessionId, error: sessionError } = await client.rpc(
      'create_store_device_session',
      {
        p_store_id: verifiedStoreId,
        p_device_id: cleanDeviceId,
        p_token_hash: tokenHash,
        p_device_name: cleanDeviceName,
        p_expires_in: '30 days',
      },
    );

    if (sessionError || !sessionId) {
      console.error('[CREATE_SESSION_RPC_ERROR]', sessionError?.message);
      return Response.json(
        { error: '端末セッションの作成に失敗しました。' },
        { status: 500 },
      );
    }

    // 5. 監査ログ記録
    await recordStoreAuthAudit({
      action: 'otp_verified',
      actorType: 'store',
      storeId: verifiedStoreId,
      metadata: {
        ip,
        challengeId,
        deviceId: cleanDeviceId,
      },
    });

    await recordStoreAuthAudit({
      action: 'device_session_created',
      actorType: 'store',
      storeId: verifiedStoreId,
      metadata: {
        ip,
        sessionId,
        deviceId: cleanDeviceId,
        deviceName: cleanDeviceName,
      },
    });

    // 6. HttpOnly Cookie の付与
    const cookieHeader = createSessionCookieHeader(rawToken);

    return new Response(
      JSON.stringify({
        success: true,
        storeId: verifiedStoreId,
        message: '端末の認証が完了しました。',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader,
        },
      },
    );
  } catch (err) {
    console.error('[VERIFY_OTP_EXCEPTION]', err);
    return Response.json(
      { error: '認証処理中に予期せぬエラーが発生しました。' },
      { status: 500 },
    );
  }
}
