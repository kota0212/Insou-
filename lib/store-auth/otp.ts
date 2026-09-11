if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server.');
}

import crypto from 'node:crypto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

export function isValidOtpCode(otp: unknown): otp is string {
  return typeof otp === 'string' && /^\d{6}$/.test(otp.trim());
}

/**
 * 予測不可能な暗号学的6桁OTPを生成 (100000 〜 999999)
 */
export function generateOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * challenge_id と OTP を結合した HMAC-SHA256 を計算
 * 式: HMAC-SHA256(secret, challenge_id + ":" + otp)
 */
export function computeOtpHmac(challengeId: string, otp: string): string {
  const secret = process.env.OTP_HMAC_SECRET;

  if (!secret || secret.trim() === '') {
    throw new Error('OTP_HMAC_SECRET が設定されていません。');
  }

  const cleanOtp = otp.trim();
  const payload = `${challengeId}:${cleanOtp}`;

  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * メールアドレスのマスキング
 * 例: store-tc01@insou.internal -> s***1@insou.internal
 */
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local.charAt(0)}***@${domain}`;
  }
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
}

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * 永続化レート制限チェック (DB RPC check_and_increment_rate_limit)
 * Vercel serverless / multi-instance 環境で共有される
 */
export async function checkStoreAuthRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt?: string }> {
  try {
    const client = getSupabaseAdminClient();
    const { data, error } = await client.rpc(
      'check_and_increment_rate_limit',
      {
        p_rate_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      },
    );

    if (error) {
      console.error('[RATE_LIMIT_RPC_ERROR]', error.message);
      return { allowed: true, remaining: 1 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row ? Boolean(row.allowed) : true,
      remaining: row ? Number(row.remaining) : 0,
      resetAt: row?.reset_at,
    };
  } catch (err) {
    console.error('[RATE_LIMIT_EXCEPTION]', err);
    return { allowed: true, remaining: 1 };
  }
}
