import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { validateStoreSession } from '@/lib/store-auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = await validateStoreSession(request);

  if (!result.isValid || !result.store || !result.session) {
    return Response.json(
      { error: '端末認証が必要です。', clearCache: true, reason: result.reason },
      { status: 401 },
    );
  }

  try {
    const client = getSupabaseAdminClient();

    // 自店舗に割り当てられ、かつ公開中 (is_published = true) のメニューのみ取得
    const { data: assignments, error } = await client
      .from('menu_store_assignments')
      .select(`
        menu_id,
        menus (
          id,
          title,
          file_name,
          storage_path,
          created_at,
          pdf_updated_at,
          updated_at,
          is_published
        )
      `)
      .eq('store_id', result.session.store_id);

    if (error) {
      console.error('[STORE_MENUS_FETCH_ERROR]', error.message);
      return Response.json(
        { error: 'メニュー一覧の取得に失敗しました。' },
        { status: 500 },
      );
    }

    const menus = (assignments || [])
      .map((a) => (Array.isArray(a.menus) ? a.menus[0] : a.menus))
      .filter((m): m is NonNullable<typeof m> => !!m && m.is_published)
      .map((m) => ({
        id: m.id,
        title: m.title,
        fileName: m.file_name,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        pdfUpdatedAt: m.pdf_updated_at,
      }));

    return Response.json({
      store: {
        id: result.store.id,
        name: result.store.name,
      },
      menus,
    });
  } catch (err) {
    console.error('[STORE_MENUS_EXCEPTION]', err);
    return Response.json(
      { error: 'メニュー一覧の処理中にエラーが発生しました。' },
      { status: 500 },
    );
  }
}
