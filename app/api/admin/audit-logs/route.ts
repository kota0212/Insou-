import { adminApiErrorResponse, requireAdmin } from '@/lib/supabase/admin';
export const runtime='nodejs'; export const dynamic='force-dynamic';
const sensitiveKey = /password|token|secret|otp|code|authorization|cookie/i;
function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveKey.test(key))
      .map(([key, child]) => [key, sanitizeMetadata(child)]),
  );
}
export async function GET(request:Request){try{const {client}=await requireAdmin(request); const p=new URL(request.url).searchParams; let q=client.from('audit_logs').select('id,occurred_at,actor_type,actor_id,store_id,action,target_type,target_id,metadata').order('occurred_at',{ascending:false}).limit(200); if(p.get('action'))q=q.eq('action',p.get('action')!); if(p.get('actorType'))q=q.eq('actor_type',p.get('actorType')!); if(p.get('storeId'))q=q.eq('store_id',p.get('storeId')!); const {data,error}=await q;if(error)throw error; return Response.json({logs:(data??[]).map((entry)=>({...entry,metadata:sanitizeMetadata(entry.metadata)}))});}catch(e){return adminApiErrorResponse(e);}}
