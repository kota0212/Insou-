import {
  adminApiErrorResponse,
  auditLog,
  getClientIp,
  isValidUuid,
  requireAdmin,
} from '@/lib/supabase/admin';

/**
 * [Phase 2 移行TODO]
 * 既存の店舗固定共有パスワード作成・再設定処理は、Phase 2の「店舗名検索・OTP認証・30日端末認証」
 * および店舗管理UI改修完了時に廃止・移行対象となります。
 * 現時点では既存機能との互換性維持のため提供を継続しています。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateStoreBody = {
  code?: unknown;
  name?: unknown;
  area?: unknown;
  password?: unknown;
};
type ResetStorePasswordBody = { storeId?: unknown; password?: unknown };

function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function normalizeCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export async function POST(request: Request) {
  let userId: string | undefined;
  let storeId: string | undefined;
  let adminUserId = 'unknown';
  const ip = getClientIp(request);

  try {
    const body = (await request.json()) as CreateStoreBody;
    const code = normalizeCode(body.code);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const area = typeof body.area === 'string' ? body.area.trim() : '';

    if (!/^[A-Z0-9-]{3,32}$/.test(code) || !name || name.length > 100 || !area || area.length > 100) {
      return Response.json(
        { error: '店舗コード（3〜32文字の半角英数・ハイフン）、店舗名、所属エリアを正しく入力してください。' },
        { status: 400 },
      );
    }
    if (!validPassword(body.password)) {
      return Response.json(
        { error: '初期パスワードは8文字以上128文字以下で入力してください。' },
        { status: 400 },
      );
    }

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    const client = admin.client;

    const existing = await client
      .from('stores')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      return Response.json(
        { error: 'この店舗コードはすでに使われています。' },
        { status: 409 },
      );
    }

    const auth = await client.auth.admin.createUser({
      email: `${code.toLowerCase()}@stores.insou.internal`,
      password: body.password,
      email_confirm: true,
    });
    if (auth.error || !auth.data.user) {
      throw auth.error ?? new Error('店舗ログインを作成できませんでした。');
    }
    userId = auth.data.user.id;

    const store = await client
      .from('stores')
      .insert({
        code,
        name,
        area,
        password_updated_at: new Date().toISOString(),
      })
      .select('id, code, name, area, password_updated_at, last_login_at')
      .single();
    if (store.error || !store.data) {
      throw store.error ?? new Error('店舗を作成できませんでした。');
    }
    storeId = store.data.id;

    const profile = await client.from('user_profiles').insert({
      user_id: userId,
      role: 'store',
      store_id: storeId,
    });
    if (profile.error) throw profile.error;

    auditLog({
      action: 'CREATE_STORE',
      adminUserId,
      targetId: storeId,
      targetType: 'store',
      ip,
      status: 'SUCCESS',
      details: { code, name, area },
    });

    return Response.json(
      {
        store: {
          id: store.data.id,
          code: store.data.code,
          name: store.data.name,
          area: store.data.area,
          passwordUpdatedAt: store.data.password_updated_at ?? undefined,
          lastLoginAt: store.data.last_login_at ?? undefined,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (adminUserId !== 'unknown') {
      try {
        const { client } = await requireAdmin(request);
        if (storeId) await client.from('stores').delete().eq('id', storeId);
        if (userId) await client.auth.admin.deleteUser(userId);
      } catch {
        console.error('Created store cleanup failed');
      }
    }
    auditLog({
      action: 'CREATE_STORE',
      adminUserId,
      ip,
      status: 'FAILURE',
    });
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  let adminUserId = 'unknown';
  const ip = getClientIp(request);
  try {
    const body = (await request.json()) as ResetStorePasswordBody;
    if (!isValidUuid(body.storeId) || !validPassword(body.password)) {
      return Response.json(
        { error: '対象店舗ID（UUID形式）と8文字以上の新しいパスワードを入力してください。' },
        { status: 400 },
      );
    }

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    const client = admin.client;

    const profile = await client
      .from('user_profiles')
      .select('user_id')
      .eq('role', 'store')
      .eq('store_id', body.storeId)
      .maybeSingle();
    if (profile.error || !profile.data) {
      return Response.json(
        { error: '対象店舗のログイン情報が見つかりません。' },
        { status: 404 },
      );
    }

    const auth = await client.auth.admin.updateUserById(profile.data.user_id, {
      password: body.password,
    });
    if (auth.error) throw auth.error;

    const updated = await client
      .from('stores')
      .update({ password_updated_at: new Date().toISOString() })
      .eq('id', body.storeId)
      .select('password_updated_at')
      .single();
    if (updated.error) throw updated.error;

    auditLog({
      action: 'RESET_STORE_PASSWORD',
      adminUserId,
      targetId: body.storeId,
      targetType: 'store',
      ip,
      status: 'SUCCESS',
    });

    return Response.json({ passwordUpdatedAt: updated.data.password_updated_at });
  } catch (error) {
    auditLog({
      action: 'RESET_STORE_PASSWORD',
      adminUserId,
      ip,
      status: 'FAILURE',
    });
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  let adminUserId = 'unknown';
  const ip = getClientIp(request);
  try {
    const storeId = new URL(request.url).searchParams.get('storeId');
    if (!isValidUuid(storeId)) {
      return Response.json(
        { error: '対象店舗ID（UUID形式）を正しく指定してください。' },
        { status: 400 },
      );
    }

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    const client = admin.client;

    const profile = await client
      .from('user_profiles')
      .select('user_id')
      .eq('role', 'store')
      .eq('store_id', storeId)
      .maybeSingle();
    if (profile.error) throw profile.error;
    if (profile.data) {
      const deletedUser = await client.auth.admin.deleteUser(profile.data.user_id);
      if (deletedUser.error) throw deletedUser.error;
    }

    const deletedStore = await client.from('stores').delete().eq('id', storeId);
    if (deletedStore.error) throw deletedStore.error;

    auditLog({
      action: 'DELETE_STORE',
      adminUserId,
      targetId: storeId,
      targetType: 'store',
      ip,
      status: 'SUCCESS',
    });

    return Response.json({ ok: true });
  } catch (error) {
    auditLog({
      action: 'DELETE_STORE',
      adminUserId,
      ip,
      status: 'FAILURE',
    });
    return adminApiErrorResponse(error);
  }
}
