import { getSupabaseAdminClient, getClientIp } from '@/lib/supabase/admin';
import { checkStoreAuthRateLimit } from '@/lib/store-auth/otp';
import { recordStoreAuthAudit } from '@/lib/store-auth/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ip = getClientIp(request);

  // IPベースの永続レート制限（1分間に最大40回）
  const rateLimit = await checkStoreAuthRateLimit(`search:ip:${ip}`, 40, 60);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'リクエスト回数が上限を超えました。しばらく待ってから再試行してください。' },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  if (q.length < 2) {
    return Response.json(
      { error: '検索キーワードは2文字以上で入力してください。' },
      { status: 400 },
    );
  }

  if (q.length > 50) {
    return Response.json(
      { error: '検索キーワードが長すぎます。50文字以内で入力してください。' },
      { status: 400 },
    );
  }

  try {
    const client = getSupabaseAdminClient();

    // is_active = true のみ、部分一致検索（ilike）、最大10件
    // notification_email はブラウザに一切返却しない
    const { data: stores, error } = await client
      .from('stores')
      .select('id, code, name, area, is_active')
      .eq('is_active', true)
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(10);

    if (error) {
      console.error('[STORES_SEARCH_ERROR]', error.message);
      return Response.json(
        { error: '店舗情報の取得中にエラーが発生しました。' },
        { status: 500 },
      );
    }

    const safeResults = (stores || []).map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      area: s.area,
    }));

    // 監査ログ（店舗検索イベント）
    await recordStoreAuthAudit({
      action: 'store_search',
      actorType: 'anonymous',
      metadata: {
        ip,
        queryLength: q.length,
        resultCount: safeResults.length,
      },
    });

    return Response.json({ stores: safeResults });
  } catch (err) {
    console.error('[STORES_SEARCH_EXCEPTION]', err);
    return Response.json(
      { error: '店舗検索の処理中に予期せぬエラーが発生しました。' },
      { status: 500 },
    );
  }
}
