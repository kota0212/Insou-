if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server.');
}

import crypto from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const STORE_DEVICE_SESSION_COOKIE = 'insou_store_device_session';
export const STORE_SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
export const CURRENT_DEVICE_SESSION_VERSION = 1;

export interface StoreDeviceSessionData {
  id: string;
  store_id: string;
  device_id: string;
  device_name: string;
  session_version: number;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface StoreData {
  id: string;
  code: string;
  name: string;
  area: string;
  is_active: boolean;
}

export interface SessionValidationResult {
  isValid: boolean;
  reason?:
    | 'no_session'
    | 'invalid_session'
    | 'revoked'
    | 'expired'
    | 'store_inactive'
    | 'version_mismatch';
  session?: StoreDeviceSessionData;
  store?: StoreData;
}

/**
 * 30日端末認証用の一意なトークン（平文とハッシュ）を生成
 */
export function createDeviceSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

/**
 * トークン平文からハッシュを計算
 */
export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Cookie 文字列から insou_store_device_session を抽出
 */
export function extractSessionTokenFromCookie(cookieHeader?: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STORE_DEVICE_SESSION_COOKIE}=`));

  if (!match) return null;
  const val = match.substring(STORE_DEVICE_SESSION_COOKIE.length + 1).trim();
  return val ? decodeURIComponent(val) : null;
}

/**
 * Set-Cookie ヘッダー値の生成（ログイン時）
 */
export function createSessionCookieHeader(rawToken: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${STORE_DEVICE_SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
    `Path=/`,
    `Max-Age=${STORE_SESSION_MAX_AGE}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (isProd) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Set-Cookie ヘッダー値の生成（失効・ログアウト時）
 */
export function createClearSessionCookieHeader(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${STORE_DEVICE_SESSION_COOKIE}=`,
    `Path=/`,
    `Max-Age=0`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (isProd) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Request から端末認証セッションを検証
 */
export async function validateStoreSession(request: Request): Promise<SessionValidationResult> {
  const cookieHeader = request.headers.get('cookie');
  const rawToken = extractSessionTokenFromCookie(cookieHeader);

  if (!rawToken) {
    return { isValid: false, reason: 'no_session' };
  }

  const tokenHash = hashSessionToken(rawToken);
  const client = getSupabaseAdminClient();

  const { data, error } = await client
    .from('store_device_sessions')
    .select(`
      id,
      store_id,
      device_id,
      device_name,
      session_version,
      issued_at,
      expires_at,
      revoked_at,
      revoked_reason,
      stores (
        id,
        code,
        name,
        area,
        is_active
      )
    `)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !data) {
    return { isValid: false, reason: 'invalid_session' };
  }

  const session: StoreDeviceSessionData = {
    id: data.id,
    store_id: data.store_id,
    device_id: data.device_id,
    device_name: data.device_name,
    session_version: data.session_version ?? 1,
    issued_at: data.issued_at,
    expires_at: data.expires_at,
    revoked_at: data.revoked_at,
    revoked_reason: data.revoked_reason,
  };

  const store = Array.isArray(data.stores) ? data.stores[0] : (data.stores as unknown as StoreData | null);

  // 1. セッションバージョン検証（想定バージョンと不一致なら拒否）
  if (session.session_version !== CURRENT_DEVICE_SESSION_VERSION) {
    return { isValid: false, reason: 'version_mismatch', session, store: store || undefined };
  }

  if (session.revoked_at) {
    return { isValid: false, reason: 'revoked', session, store: store || undefined };
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return { isValid: false, reason: 'expired', session, store: store || undefined };
  }

  if (!store || !store.is_active) {
    return { isValid: false, reason: 'store_inactive', session, store: store || undefined };
  }

  // 非同期で last_accessed_at を更新
  client
    .from('store_device_sessions')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', session.id)
    .then(
      () => {},
      (err) => console.error('[UPDATE_LAST_ACCESSED_ERROR]', err),
    );

  return {
    isValid: true,
    session,
    store,
  };
}
