import { createClient } from '@supabase/supabase-js';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
  'BOOTSTRAP_STORE_CODE',
  'BOOTSTRAP_STORE_PASSWORD',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} を設定してください。`);
}

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const storeCode = process.env.BOOTSTRAP_STORE_CODE.trim().toUpperCase();
const storePassword = process.env.BOOTSTRAP_STORE_PASSWORD;
const storeEmail = `${storeCode.toLowerCase()}@stores.insou.internal`;

if (adminPassword.length < 8 || storePassword.length < 8) {
  throw new Error('パスワードは8文字以上にしてください。');
}
if (!/^[A-Z0-9-]{3,32}$/.test(storeCode)) {
  throw new Error('BOOTSTRAP_STORE_CODE は英数字とハイフンで3〜32文字にしてください。');
}

async function findUserByEmail(email) {
  const result = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw result.error;
  return result.data.users.find((user) => user.email?.toLowerCase() === email);
}

async function ensureUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) {
    const updated = await client.auth.admin.updateUserById(existing.id, { password });
    if (updated.error) throw updated.error;
    return existing.id;
  }
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error(`${email} を作成できませんでした。`);
  }
  return created.data.user.id;
}

const adminUserId = await ensureUser(adminEmail, adminPassword);
const adminProfile = await client.from('user_profiles').upsert({
  user_id: adminUserId,
  role: 'admin',
});
if (adminProfile.error) throw adminProfile.error;

const storeUserId = await ensureUser(storeEmail, storePassword);
let store = await client.from('stores').select('id').eq('code', storeCode).maybeSingle();
if (store.error) throw store.error;
if (!store.data) {
  const inserted = await client
    .from('stores')
    .insert({
      code: storeCode,
      name: process.env.BOOTSTRAP_STORE_NAME?.trim() || 'テスト店舗',
      area: process.env.BOOTSTRAP_STORE_AREA?.trim() || 'テスト',
      password_updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) throw inserted.error ?? new Error('テスト店舗を作成できませんでした。');
  store = { data: inserted.data, error: null };
}
const storeProfile = await client.from('user_profiles').upsert({
  user_id: storeUserId,
  role: 'store',
  store_id: store.data.id,
});
if (storeProfile.error) throw storeProfile.error;

console.log(`管理者 ${adminEmail} とテスト店舗 ${storeCode} を準備しました。`);
