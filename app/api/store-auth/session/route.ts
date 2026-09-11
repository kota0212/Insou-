import { getClientIp } from '@/lib/supabase/admin';
import {
  createClearSessionCookieHeader,
  validateStoreSession,
} from '@/lib/store-auth/session';
import { recordStoreAuthAudit } from '@/lib/store-auth/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const result = await validateStoreSession(request);

  if (!result.isValid || !result.store || !result.session) {
    if (result.reason && result.reason !== 'no_session') {
      await recordStoreAuthAudit({
        action: 'session_validation_failed',
        actorType: 'store',
        storeId: result.store?.id,
        metadata: {
          ip,
          reason: result.reason,
          sessionId: result.session?.id,
          deviceId: result.session?.device_id,
        },
      });
    }

    // 失効・期限切れ・無効セッションの場合はCookieを削除し、クライアントにキャッシュクリアを指示
    const clearCookieHeader = createClearSessionCookieHeader();

    return new Response(
      JSON.stringify({
        authenticated: false,
        clearCache: true,
        reason: result.reason || 'unauthenticated',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': clearCookieHeader,
        },
      },
    );
  }

  return Response.json({
    authenticated: true,
    store: {
      id: result.store.id,
      code: result.store.code,
      name: result.store.name,
      area: result.store.area,
    },
    session: {
      deviceId: result.session.device_id,
      deviceName: result.session.device_name,
      expiresAt: result.session.expires_at,
    },
  });
}
