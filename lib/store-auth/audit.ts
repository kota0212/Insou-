if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server.');
}

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type StoreAuthAuditEvent =
  | 'store_search'
  | 'otp_requested'
  | 'otp_request_failed'
  | 'otp_verified'
  | 'otp_failed'
  | 'device_session_created'
  | 'session_validation_failed'
  | 'device_session_revoked';

export async function recordStoreAuthAudit(entry: {
  action: StoreAuthAuditEvent;
  actorType?: 'admin' | 'store' | 'system' | 'anonymous';
  actorId?: string;
  storeId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // CRITICAL: Never log OTP plaintext, passwords, session tokens, or HMAC secrets
  const cleanMetadata = { ...(entry.metadata || {}) };
  delete cleanMetadata.otp;
  delete cleanMetadata.password;
  delete cleanMetadata.token;
  delete cleanMetadata.secret;
  delete cleanMetadata.code;

  try {
    const client = getSupabaseAdminClient();
    await client.from('audit_logs').insert({
      actor_type: entry.actorType || 'store',
      actor_id: entry.actorId || null,
      store_id: entry.storeId || null,
      action: entry.action,
      target_type: entry.targetType || null,
      target_id: entry.targetId || null,
      metadata: cleanMetadata,
    });
  } catch (err) {
    console.error('[AUDIT_INSERT_ERROR]', err);
  }
}

