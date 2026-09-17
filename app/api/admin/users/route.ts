import {
  adminApiErrorResponse,
  auditLog,
  getClientIp,
  isValidEmail,
  isValidUuid,
  recordAdminAudit,
  requireAdmin,
} from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type InviteAdminBody = { email?: unknown };
type PasswordResetBody = { userId?: unknown };

function getAuthRedirectUrl(): string {
  const configured = process.env.ADMIN_AUTH_REDIRECT_URL;
  if (!configured) {
    throw new Error('管理者認証メールのリダイレクトURLが未設定です。');
  }

  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new Error('invalid protocol');
    }
    return url.toString();
  } catch {
    throw new Error('管理者認証メールのリダイレクトURLが不正です。');
  }
}

async function findUserByEmail(
  client: Awaited<ReturnType<typeof requireAdmin>>['client'],
  email: string,
) {
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email);
}

export async function GET(request: Request) {
  let adminUserId = 'unknown';
  const ip = getClientIp(request);
  try {
    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    const [profiles, users] = await Promise.all([
      admin.client.from('user_profiles').select('user_id, created_at').eq('role', 'admin').order('created_at'),
      admin.client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (profiles.error) throw profiles.error;
    if (users.error) throw users.error;

    const usersById = new Map(users.data.users.map((user) => [user.id, user]));
    auditLog({ action: 'LIST_ADMIN_USERS', adminUserId, ip, status: 'SUCCESS' });
    return Response.json({
      users: (profiles.data ?? []).flatMap((profile) => {
        const user = usersById.get(profile.user_id);
        if (!user?.email) return [];
        return [{
          id: user.id,
          email: user.email,
          createdAt: profile.created_at,
          lastSignInAt: user.last_sign_in_at ?? null,
          invitedAt: user.invited_at ?? null,
        }];
      }),
    });
  } catch (error) {
    auditLog({ action: 'LIST_ADMIN_USERS', adminUserId, ip, status: 'FAILURE' });
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let invitedUserId: string | undefined;
  let adminUserId = 'unknown';
  let adminClient: SupabaseClient | undefined;
  const ip = getClientIp(request);
  try {
    const body = (await request.json()) as InviteAdminBody;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      return Response.json({ error: '有効なメールアドレスを入力してください。' }, { status: 400 });
    }

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    adminClient = admin.client;
    if (await findUserByEmail(admin.client, email)) {
      return Response.json({ error: 'このメールアドレスは既に登録されています。' }, { status: 409 });
    }

    const invited = await admin.client.auth.admin.inviteUserByEmail(email, {
      redirectTo: getAuthRedirectUrl(),
    });
    if (invited.error || !invited.data.user) {
      throw invited.error ?? new Error('招待メールを送信できませんでした。');
    }
    invitedUserId = invited.data.user.id;

    const profile = await admin.client.from('user_profiles').insert({
      user_id: invitedUserId,
      role: 'admin',
      store_id: null,
    });
    if (profile.error) throw profile.error;

    await recordAdminAudit(admin.client, {
      action: 'admin_invited',
      adminUserId,
      targetId: invitedUserId,
      targetType: 'admin_user',
    });
    return Response.json({
      user: {
        id: invitedUserId,
        email,
        createdAt: invited.data.user.created_at,
        invitedAt: invited.data.user.invited_at ?? null,
      },
    }, { status: 201 });
  } catch (error) {
    if (invitedUserId && adminClient) {
      try {
        await adminClient.auth.admin.deleteUser(invitedUserId);
      } catch {
        console.error('Invited auth user cleanup failed');
      }
    }
    auditLog({ action: 'ADMIN_INVITE', adminUserId, ip, status: 'FAILURE' });
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  let adminUserId = 'unknown';
  const ip = getClientIp(request);
  try {
    const body = (await request.json()) as PasswordResetBody;
    if (!isValidUuid(body.userId)) {
      return Response.json({ error: '対象管理者IDが不正です。' }, { status: 400 });
    }

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    const profile = await admin.client.from('user_profiles').select('role').eq('user_id', body.userId).maybeSingle();
    if (profile.error || profile.data?.role !== 'admin') {
      return Response.json({ error: '対象の管理者が見つかりません。' }, { status: 404 });
    }

    const target = await admin.client.auth.admin.getUserById(body.userId);
    if (target.error || !target.data.user.email) {
      return Response.json({ error: '対象の管理者が見つかりません。' }, { status: 404 });
    }
    const reset = await admin.client.auth.resetPasswordForEmail(target.data.user.email, {
      redirectTo: getAuthRedirectUrl(),
    });
    if (reset.error) throw reset.error;

    await recordAdminAudit(admin.client, {
      action: 'admin_password_reset_requested',
      adminUserId,
      targetId: body.userId,
      targetType: 'admin_user',
    });
    return Response.json({ ok: true });
  } catch (error) {
    auditLog({ action: 'ADMIN_PASSWORD_RESET_REQUEST', adminUserId, ip, status: 'FAILURE' });
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  let adminUserId = 'unknown';
  const ip = getClientIp(request);
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!isValidUuid(id)) return Response.json({ error: 'idが不正です。' }, { status: 400 });

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    if (id === adminUserId) return Response.json({ error: '自分自身は削除できません。' }, { status: 400 });

    const profiles = await admin.client.from('user_profiles').select('user_id').eq('role', 'admin');
    if (profiles.error) throw profiles.error;
    if ((profiles.data ?? []).length <= 1) {
      return Response.json({ error: '最後の管理者は削除できません。' }, { status: 400 });
    }
    const targetProfile = await admin.client.from('user_profiles').select('role').eq('user_id', id).maybeSingle();
    if (targetProfile.error || targetProfile.data?.role !== 'admin') {
      return Response.json({ error: '対象の管理者が見つかりません。' }, { status: 404 });
    }

    const deleted = await admin.client.auth.admin.deleteUser(id);
    if (deleted.error) throw deleted.error;
    const profileDelete = await admin.client.from('user_profiles').delete().eq('user_id', id);
    if (profileDelete.error) throw profileDelete.error;

    await recordAdminAudit(admin.client, {
      action: 'admin_deleted',
      adminUserId,
      targetId: id,
      targetType: 'admin_user',
    });
    return Response.json({ success: true });
  } catch (error) {
    auditLog({ action: 'ADMIN_DELETE', adminUserId, ip, status: 'FAILURE' });
    return adminApiErrorResponse(error);
  }
}
