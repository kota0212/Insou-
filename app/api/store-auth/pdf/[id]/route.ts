import { getSupabaseAdminClient, isValidUuid } from '@/lib/supabase/admin';
import { validateStoreSession } from '@/lib/store-auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: menuId } = await context.params;

  if (!isValidUuid(menuId)) {
    return Response.json({ error: '無効なメニューIDです。' }, { status: 400 });
  }

  // 1. 端末認証Cookieの検証
  const result = await validateStoreSession(request);
  if (!result.isValid || !result.store || !result.session) {
    return Response.json(
      { error: '端末認証が必要です。', clearCache: true, reason: result.reason },
      { status: 401 },
    );
  }

  try {
    const client = getSupabaseAdminClient();

    // 2. 自店舗への配信かつ公開中か確認
    const { data: assignment, error: assignError } = await client
      .from('menu_store_assignments')
      .select(`
        menu_id,
        menus (
          id,
          title,
          storage_path,
          is_published
        )
      `)
      .eq('store_id', result.session.store_id)
      .eq('menu_id', menuId)
      .maybeSingle();

    if (assignError || !assignment) {
      return Response.json(
        { error: '指定されたメニューは閲覧権限がないか、存在しません。' },
        { status: 403 },
      );
    }

    const menu = Array.isArray(assignment.menus)
      ? assignment.menus[0]
      : assignment.menus;

    if (!menu || !menu.is_published) {
      return Response.json(
        { error: '指定されたメニューは現在公開されていません。' },
        { status: 403 },
      );
    }

    // 3. Supabase Storage から短時間（60秒）の署名付きURLを発行
    const { data: signedData, error: signError } = await client.storage
      .from('menu-pdfs')
      .createSignedUrl(menu.storage_path, 60);

    if (signError || !signedData?.signedUrl) {
      console.error('[PDF_SIGN_URL_ERROR]', signError?.message);
      return Response.json(
        { error: 'PDFの閲覧用URLの発行に失敗しました。' },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('redirect') === 'true') {
      return Response.redirect(signedData.signedUrl, 302);
    }

    return Response.json({
      menuId: menu.id,
      title: menu.title,
      signedUrl: signedData.signedUrl,
      expiresInSeconds: 60,
    });
  } catch (err) {
    console.error('[PDF_AUTH_EXCEPTION]', err);
    return Response.json(
      { error: 'PDF認可処理中にエラーが発生しました。' },
      { status: 500 },
    );
  }
}
