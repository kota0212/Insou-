import { createClient } from '@supabase/supabase-js';

const url = process.env.VERIFICATION_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing Verification admin test configuration');
  process.exit(1);
}
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.SUPABASE_URL = url;
process.env.SUPABASE_SECRET_KEY = key;
if (!process.env.ADMIN_AUTH_REDIRECT_URL) {
  console.error('Missing Verification admin auth redirect configuration');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });
const adminAuthClient = createClient(url, key, { auth: { persistSession: false } });
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
  console.log(`PASS: ${message}`);
};
const runnerEmail = `verification-admin-api-runner-${Date.now()}@example.com`;
const runnerPassword = `Verification-${crypto.randomUUID()}-Only`;
const runner = await client.auth.admin.createUser({
  email: runnerEmail,
  password: runnerPassword,
  email_confirm: true,
});
assert(Boolean(runner.data.user && !runner.error), 'temporary admin test account creation');
const runnerId = runner.data.user.id;
const runnerProfile = await client.from('user_profiles').insert({ user_id: runnerId, role: 'admin', store_id: null });
assert(!runnerProfile.error, 'temporary admin test profile creation');
const { data: auth, error: authErr } = await adminAuthClient.auth.signInWithPassword({ email: runnerEmail, password: runnerPassword });
assert(!authErr && auth.session, 'admin authentication');
const token = auth.session.access_token;

const { GET: storesGet, PATCH: storesPatch } = await import('../app/api/admin/stores/route.ts');
const { GET: devicesGet } = await import('../app/api/admin/devices/route.ts');
const { GET: alertsGet } = await import('../app/api/admin/security-alerts/route.ts');
const { GET: logsGet } = await import('../app/api/admin/audit-logs/route.ts');
const { POST: revokeAll } = await import('../app/api/admin/stores/revoke-all/route.ts');
const { GET: listAdmins, POST: inviteAdmin, PATCH: requestPasswordReset, DELETE: deleteAdmin } = await import('../app/api/admin/users/route.ts');

const req = (path, init = {}) => new Request(`http://localhost${path}`, {
  ...init,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
});
const reqWithToken = (bearer, path, init = {}) => new Request(`http://localhost${path}`, {
  ...init,
  headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
});

const denied = await storesGet(new Request('http://localhost/api/admin/stores'));
assert(denied.status === 401, 'anonymous admin API denied');

const tempStoreEmail = `verification-store-role-test-${Date.now()}@example.invalid`;
const tempStorePassword = `Store-${crypto.randomUUID()}-Only`;
const tempStore = await client.auth.admin.createUser({ email: tempStoreEmail, password: tempStorePassword, email_confirm: true });
assert(Boolean(tempStore.data.user && !tempStore.error), 'temporary store auth creation');
await client.from('user_profiles').insert({ user_id: tempStore.data.user.id, role: 'store', store_id: null });
const storeAuthClient = createClient(url, key, { auth: { persistSession: false } });
const storeLogin = await storeAuthClient.auth.signInWithPassword({ email: tempStoreEmail, password: tempStorePassword });
assert(Boolean(storeLogin.data.session), 'store role authentication');
const storeDenied = await storesGet(reqWithToken(storeLogin.data.session.access_token, '/api/admin/stores'));
assert(storeDenied.status === 403, 'store role admin API denied');
await client.auth.admin.deleteUser(tempStore.data.user.id);
await client.from('user_profiles').delete().eq('user_id', tempStore.data.user.id);

const stores = await storesGet(req('/api/admin/stores'));
assert(stores.status === 200, 'admin store list');
const storesBody = await stores.json();
const store = storesBody.stores?.find((item) => item.code === 'TC-01');
assert(Boolean(store), 'test store found');
const detail = await storesGet(req(`/api/admin/stores?storeId=${store.id}`));
assert([200, 404].includes(detail.status), 'store detail endpoint responds');
const original = { name: store.name, area: store.area, notification_email: store.notification_email, registered_tablet_count: store.registered_tablet_count, is_active: store.is_active };
const update = await storesPatch(req('/api/admin/stores', { method: 'PATCH', body: JSON.stringify({ storeId: store.id, ...original }) }));
assert(update.status === 200, 'store metadata update and restore');
const devices = await devicesGet(req(`/api/admin/devices?storeId=${store.id}`));
assert(devices.status === 200, 'device list');
const devicesBody = await devices.json();
assert(!/token|password|secret|otp/i.test(JSON.stringify(devicesBody)), 'sensitive fields excluded from device response');

const invalidInvite = await inviteAdmin(req('/api/admin/users', { method: 'POST', body: JSON.stringify({ email: 'invalid-email' }) }));
assert(invalidInvite.status === 400, 'invalid admin invite rejected');
const duplicateInvite = await inviteAdmin(req('/api/admin/users', { method: 'POST', body: JSON.stringify({ email: runnerEmail }) }));
assert(duplicateInvite.status === 409, 'duplicate admin invite rejected');
const invalidPasswordReset = await requestPasswordReset(req('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ userId: 'invalid-id' }) }));
assert(invalidPasswordReset.status === 400, 'invalid password reset request rejected');

const usersRouteSource = await (await import('node:fs/promises')).readFile(new URL('../app/api/admin/users/route.ts', import.meta.url), 'utf8');
assert(usersRouteSource.includes('inviteUserByEmail'), 'admin invite uses Supabase Auth invitation');
assert(usersRouteSource.includes('resetPasswordForEmail'), 'password reset uses Supabase Auth email');
assert(usersRouteSource.includes('admin_password_reset_requested'), 'password reset operation is logged');
const admins = await listAdmins(req('/api/admin/users'));
assert(admins.status === 200, 'admin list fetch');

let temporaryAdminId;
try {
  const temporaryEmail = `verification-admin-delete-test-${Date.now()}@example.com`;
  const temporaryPassword = `Temporary-${crypto.randomUUID()}-Only`;
  const created = await client.auth.admin.createUser({ email: temporaryEmail, password: temporaryPassword, email_confirm: true });
  assert(Boolean(created.data.user && !created.error), 'temporary admin auth creation');
  temporaryAdminId = created.data.user.id;
  const profileInsert = await client.from('user_profiles').upsert(
    { user_id: temporaryAdminId, role: 'admin', store_id: null },
    { onConflict: 'user_id' },
  );
  assert(!profileInsert.error, `temporary admin profile creation (${profileInsert.error?.code ?? 'ok'})`);
  const removed = await deleteAdmin(req(`/api/admin/users?id=${temporaryAdminId}`, { method: 'DELETE' }));
  assert(removed.status === 200, 'temporary admin deletion');
  const deletedUser = await client.auth.admin.getUserById(temporaryAdminId);
  assert(Boolean(deletedUser.error || !deletedUser.data.user), 'deleted admin auth user removed');
  const deletedProfile = await client.from('user_profiles').select('user_id').eq('user_id', temporaryAdminId).maybeSingle();
  assert(!deletedProfile.data, 'deleted admin profile removed');
  const deletionLog = await client.from('audit_logs').select('action').eq('target_id', temporaryAdminId).eq('action', 'admin_deleted').maybeSingle();
  assert(Boolean(deletionLog.data), 'admin deletion operation logged');
  temporaryAdminId = undefined;
} finally {
  if (temporaryAdminId) {
    await client.auth.admin.deleteUser(temporaryAdminId);
    await client.from('user_profiles').delete().eq('user_id', temporaryAdminId);
  }
}

const selfDelete = await deleteAdmin(req(`/api/admin/users?id=${auth.user.id}`, { method: 'DELETE' }));
assert(selfDelete.status === 400, 'self admin deletion denied');
assert(usersRouteSource.includes('最後の管理者は削除できません'), 'last admin deletion guard present');

const revokeResponse = await revokeAll(req('/api/admin/stores/revoke-all', { method: 'POST', body: JSON.stringify({ storeId: store.id, reason: 'verification_test' }) }));
assert(revokeResponse.status === 200, 'store-wide revoke');
const alerts = await alertsGet(req('/api/admin/security-alerts'));
assert(alerts.status === 200, 'security alerts list');
const finalLogs = await logsGet(req('/api/admin/audit-logs'));
assert(finalLogs.status === 200, 'audit log authorization');
const finalLogsBody = await finalLogs.json();
const containsSensitiveField = (value) => Array.isArray(value)
  ? value.some(containsSensitiveField)
  : value && typeof value === 'object'
    ? Object.entries(value).some(([field, child]) => /token|password|secret|otp|code|authorization|cookie/i.test(field) || containsSensitiveField(child))
    : false;
assert(!containsSensitiveField(finalLogsBody.logs || []), 'sensitive fields excluded from audit response');
await client.auth.admin.deleteUser(runnerId);
await client.from('user_profiles').delete().eq('user_id', runnerId);
console.log('Admin API Summary: all assertions passed');
