if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server.');
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function checkAdminRateLimit(client: SupabaseClient, key: string, limit = 30, windowSeconds = 60): Promise<void> {
  const { data, error } = await client.rpc('check_and_increment_rate_limit', { p_rate_key: `admin:${key}`, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new AdminApiError('管理APIのレート制限を確認できません。', 503);
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) throw new AdminApiError('リクエスト制限を超過しました。しばらくしてから再試行してください。', 429);
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function auditLog(entry: {
  action: string;
  adminUserId?: string;
  targetId?: string;
  targetType?: string;
  ip?: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: Record<string, unknown>;
}): void {
  // Never log passwords, tokens, or secret keys
  const safeEntry = {
    timestamp: new Date().toISOString(),
    service: 'admin-api',
    ...entry,
  };
  console.info('[AUDIT]', JSON.stringify(safeEntry));
}

/**
 * 管理画面から行った権限操作を監査ログへ記録する。
 * 認証メールのトークンやパスワードは、この関数へ渡してはならない。
 */
export async function recordAdminAudit(
  client: SupabaseClient,
  entry: {
    action: string;
    adminUserId: string;
    targetId?: string;
    targetType?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const metadata = { ...(entry.metadata ?? {}) };
  for (const key of ['password', 'token', 'secret', 'otp', 'code', 'inviteToken', 'resetToken']) {
    delete metadata[key];
  }

  const { error } = await client.from('audit_logs').insert({
    actor_type: 'admin',
    actor_id: entry.adminUserId,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata,
  });
  if (error) {
    console.error('[ADMIN_AUDIT_INSERT_ERROR]', error.message);
  }
}

/**
 * Supabase Secret Key は管理用 Route Handler でのみ利用する。クライアント側の
 * NEXT_PUBLIC_* 環境変数へは絶対に設定しないこと。漏洩済みとして扱う
 * legacy service_role key へのfallbackは許可しない。
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new AdminApiError(
      '管理APIの設定が未完了です。サーバー環境変数を確認してください。',
      503,
    );
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AdminContext {
  client: SupabaseClient;
  adminUserId: string;
}

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const token = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');
  if (!token) throw new AdminApiError('ログイン情報がありません。', 401);

  const ip = getClientIp(request);
  // IP-level rate limiting before expensive auth queries
  const client = getSupabaseAdminClient();
  await checkAdminRateLimit(client, `ip:${ip}`, 60, 60);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new AdminApiError('ログイン情報を確認できませんでした。', 401);
  }

  const profile = await client
    .from('user_profiles')
    .select('role')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (profile.error || profile.data?.role !== 'admin') {
    throw new AdminApiError('この操作を行う権限がありません。', 403);
  }

  // Admin user rate limit
  await checkAdminRateLimit(client, `user:${data.user.id}`, 30, 60);

  return { client, adminUserId: data.user.id };
}

export function adminApiErrorResponse(error: unknown): Response {
  if (error instanceof AdminApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error('Admin API error', {
    name: error instanceof Error ? error.name : 'unknown',
    status: error instanceof AdminApiError ? error.status : undefined,
  });
  return Response.json(
    { error: '管理処理中に問題が発生しました。' },
    { status: 500 },
  );
}
