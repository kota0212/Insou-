import {
  adminApiErrorResponse,
  auditLog,
  getClientIp,
  isValidEmail,
  isValidUuid,
  requireAdmin,
} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateAdminBody = { email?: unknown; password?: unknown };
type ResetAdminPasswordBody = { userId?: unknown; password?: unknown };

function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

export async function GET(request: Request) {
  let adminUserId = 'unknown';
  const ip = getClientIp(request);
  try {
    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    const client = admin.client;

    const [profiles, users] = await Promise.all([
      client
        .from('user_profiles')
        .select('user_id, created_at')
        .eq('role', 'admin')
        .order('created_at'),
      client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (profiles.error) throw profiles.error;
    if (users.error) throw users.error;

    const usersById = new Map(users.data.users.map((user) => [user.id, user]));

    auditLog({
      action: 'LIST_ADMIN_USERS',
      adminUserId,
      ip,
      status: 'SUCCESS',
    });

    return Response.json({
      users: (profiles.data ?? []).flatMap((profile) => {
        const user = usersById.get(profile.user_id);
        if (!user?.email) return [];
        return [
          {
            id: user.id,
            email: user.email,
            createdAt: profile.created_at,
            lastSignInAt: user.last_sign_in_at ?? null,
          },
        ];
      }),
    });
  } catch (error) {
    auditLog({
      action: 'LIST_ADMIN_USERS',
      adminUserId,
      ip,
      status: 'FAILURE',
    });
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let createdUserId: string | undefined;
  let adminUserId = 'unknown';
  const ip = getClientIp(request);
  try {
    const body = (await request.json()) as CreateAdminBody;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      return Response.json(
        { error: '有効なメールアドレスを入力してください。' },
        { status: 400 },
      );
    }
    if (!validPassword(body.password)) {
      return Response.json(
        { error: 'パスワードは8文字以上128文字以下で入力してください。' },
        { status: 400 },
      );
    }

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    const client = admin.client;

    const created = await client.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error('ユーザーを作成できませんでした。');
    }
    createdUserId = created.data.user.id;

    const profile = await client.from('user_profiles').insert({
      user_id: createdUserId,
      role: 'admin',
    });
    if (profile.error) throw profile.error;

    auditLog({
      action: 'CREATE_ADMIN_USER',
      adminUserId,
      targetId: createdUserId,
      targetType: 'admin_user',
      ip,
      status: 'SUCCESS',
      details: { email },
    });

    return Response.json(
      { user: { id: createdUserId, email, createdAt: created.data.user.created_at } },
      { status: 201 },
    );
  } catch (error) {
    if (createdUserId && adminUserId !== 'unknown') {
      try {
        const { client } = await requireAdmin(request);
        await client.auth.admin.deleteUser(createdUserId);
      } catch {
        console.error('Created auth user cleanup failed');
      }
    }
    auditLog({
      action: 'CREATE_ADMIN_USER',
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
    const body = (await request.json()) as ResetAdminPasswordBody;
    if (!isValidUuid(body.userId) || !validPassword(body.password)) {
      return Response.json(
        { error: '対象ユーザーID（UUID形式）と8文字以上の新しいパスワードを入力してください。' },
        { status: 400 },
      );
    }

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    const client = admin.client;

    const profile = await client
      .from('user_profiles')
      .select('role')
      .eq('user_id', body.userId)
      .maybeSingle();
    if (profile.error || profile.data?.role !== 'admin') {
      return Response.json(
        { error: '対象の管理者が見つかりません。' },
        { status: 404 },
      );
    }

    const updated = await client.auth.admin.updateUserById(body.userId, {
      password: body.password,
    });
    if (updated.error) throw updated.error;

    auditLog({
      action: 'RESET_ADMIN_PASSWORD',
      adminUserId,
      targetId: body.userId,
      targetType: 'admin_user',
      ip,
      status: 'SUCCESS',
    });

    return Response.json({ ok: true });
  } catch (error) {
    auditLog({
      action: 'RESET_ADMIN_PASSWORD',
      adminUserId,
      ip,
      status: 'FAILURE',
    });
    return adminApiErrorResponse(error);
  }
}
