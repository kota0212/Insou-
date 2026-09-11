import { getSupabaseAdminClient, getClientIp } from '@/lib/supabase/admin';
import {
  createClearSessionCookieHeader,
  extractSessionTokenFromCookie,
  hashSessionToken,
} from '@/lib/store-auth/session';
import { recordStoreAuthAudit } from '@/lib/store-auth/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const cookieHeader = request.headers.get('cookie');
  const rawToken = extractSessionTokenFromCookie(cookieHeader);

  if (rawToken) {
    try {
      const client = getSupabaseAdminClient();
      const tokenHash = hashSessionToken(rawToken);

      const { data: session } = await client
        .from('store_device_sessions')
        .select('id, store_id, device_id')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (session) {
        // RPC経由でセッション失効（失効理由: logout、台数Reconciliationも自動実行）
        await client.rpc('revoke_store_device_session', {
          p_session_id: session.id,
          p_reason: 'logout',
        });

        await recordStoreAuthAudit({
          action: 'device_session_revoked',
          actorType: 'store',
          storeId: session.store_id,
          metadata: {
            ip,
            sessionId: session.id,
            deviceId: session.device_id,
            reason: 'logout',
          },
        });
      }
    } catch (err) {
      console.error('[LOGOUT_ERROR]', err);
    }
  }

  const clearCookieHeader = createClearSessionCookieHeader();

  return new Response(
    JSON.stringify({
      success: true,
      clearCache: true,
      message: 'ログアウトしました。',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookieHeader,
      },
    },
  );
}
