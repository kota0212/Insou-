import {
  AdminApiError,
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

type SupabaseAuthError = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
};

function authEmailError(error: SupabaseAuthError, operation: 'invite' | 'reset'): AdminApiError {
  const code = typeof error.code === 'string' ? error.code : 'unknown';
  const status = typeof error.status === 'number' ? error.status : undefined;
  const text = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  let category = 'unknown';
  let message = operation === 'invite'
    ? '招待メールを送信できませんでした。時間をおいて再試行してください。'
    : 'パスワード再設定メールを送信できませんでした。時間をおいて再試行してください。';
  let responseStatus = 502;

  if (code === 'email_address_invalid' || /invalid email|email.*invalid/.test(text)) {
    category = 'invalid_email';
    message = '有効なメールアドレスを入力してください。';
    responseStatus = 400;
  } else if (status === 429 || /rate.?limit|too many/.test(text)) {
    category = 'rate_limited';
    message = 'メール送信回数の上限に達しました。しばらくしてから再試行してください。';
    responseStatus = 429;
  } else if (/email address not authorized|email not authorized|email.*not.*allowed/.test(text)) {
    category = 'email_not_authorized';
    message = 'このメールアドレスには現在のメール設定では招待を送信できません。VerificationのSupabase Authメール設定を確認してください。';
    responseStatus = 422;
  } else if (/redirect|redirect_to|site url/.test(text)) {
    category = 'redirect_not_allowed';
    message = '認証メールのリンク設定に問題があります。管理者へ連絡してください。';
    responseStatus = 503;
  } else if (/already registered|already exists|user already/.test(text)) {
    category = 'already_registered';
    message = 'このメールアドレスは既に登録されています。';
    responseStatus = 409;
  } else if (/smtp|email provider|mail/.test(text)) {
    category = 'email_delivery_unavailable';
    message = '現在のメール設定では認証メールを送信できません。管理者へ連絡してください。';
    responseStatus = 502;
  }

  console.error('[ADMIN_AUTH_EMAIL_ERROR]', { operation, code, status: status ?? null, category });
  return new AdminApiError(message, responseStatus);
}

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
      throw authEmailError(invited.error ?? {}, 'invite');
    }
    invitedUserId = invited.data.user.id;

    const profile = await admin.client.from('user_profiles').insert({
      user_id: invitedUserId,
      role: 'admin',
      store_id: null,
    });
    if (profile.error) {
      console.error('[ADMIN_INVITE_PROFILE_ERROR]', { code: profile.error.code ?? 'unknown' });
      throw new AdminApiError('招待先の管理者情報を作成できませんでした。', 500);
    }

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
    if (reset.error) throw authEmailError(reset.error, 'reset');

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
  let failurePoint = 'request_validation';
  const ip = getClientIp(request);
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!isValidUuid(id)) return Response.json({ error: 'idが不正です。' }, { status: 400 });

    const admin = await requireAdmin(request);
    adminUserId = admin.adminUserId;
    failurePoint = 'self_delete_protection';
    if (id === adminUserId) return Response.json({ error: '自分自身は削除できません。' }, { status: 400 });

    failurePoint = 'admin_count';
    const profiles = await admin.client.from('user_profiles').select('user_id').eq('role', 'admin');
    if (profiles.error) throw profiles.error;
    if ((profiles.data ?? []).length <= 1) {
      return Response.json({ error: '最後の管理者は削除できません。' }, { status: 400 });
    }
    failurePoint = 'target_profile';
    const targetProfile = await admin.client.from('user_profiles').select('role').eq('user_id', id).maybeSingle();
    if (targetProfile.error || targetProfile.data?.role !== 'admin') {
      return Response.json({ error: '対象の管理者が見つかりません。' }, { status: 404 });
    }

    failurePoint = 'auth_user_delete';
    const deleted = await admin.client.auth.admin.deleteUser(id);
    if (deleted.error) throw deleted.error;
    failurePoint = 'profile_cleanup';
    const profileDelete = await admin.client.from('user_profiles').delete().eq('user_id', id);
    if (profileDelete.error) throw profileDelete.error;

    failurePoint = 'audit_log';
    await recordAdminAudit(admin.client, {
      action: 'admin_deleted',
      adminUserId,
      targetId: id,
      targetType: 'admin_user',
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_DELETE_ERROR]', {
      failurePoint,
      code: typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'unknown',
      status: error instanceof AdminApiError ? error.status : null,
    });
    auditLog({ action: 'ADMIN_DELETE', adminUserId, ip, status: 'FAILURE' });
    return adminApiErrorResponse(error instanceof AdminApiError ? error : new AdminApiError('管理者削除処理に失敗しました。', 500));
  }
}
