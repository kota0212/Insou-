import { adminApiErrorResponse, requireAdmin } from '@/lib/supabase/admin';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { const { client } = await requireAdmin(request); const storeId = new URL(request.url).searchParams.get('storeId'); let q = client.from('store_device_sessions').select('id,store_id,device_id,device_name,issued_at,expires_at,last_accessed_at,revoked_at,revoked_reason,session_version').order('issued_at',{ascending:false}); if (storeId) q=q.eq('store_id',storeId); const {data,error}=await q; if(error) throw error; return Response.json({devices:data??[]}); } catch(e){ return adminApiErrorResponse(e); }
}
