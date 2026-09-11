import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// Read configuration strictly from environment variables (NEVER hardcode secrets)
const SUPABASE_URL =
  process.env.VERIFICATION_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const OTP_HMAC_SECRET = process.env.OTP_HMAC_SECRET;

if (!SUPABASE_URL || !SECRET_KEY || !OTP_HMAC_SECRET) {
  console.error(
    'Error: Missing required environment variables.\n' +
      'Please run with: node --env-file=.env.verification.local scripts/test-store-auth.mjs\n' +
      'or ensure SUPABASE_URL, SUPABASE_SECRET_KEY, and OTP_HMAC_SECRET are exported.',
  );
  process.exit(1);
}

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SECRET_KEY = SECRET_KEY;
process.env.OTP_HMAC_SECRET = OTP_HMAC_SECRET;

const client = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false },
});

console.log('=== Starting Phase 2 Store Auth Security Hardened Tests ===\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Get test store from Verification DB
  console.log('--- 1. Target Test Store ---');
  const { data: stores, error: storeErr } = await client
    .from('stores')
    .select('id, code, name, is_active, notification_email')
    .eq('is_active', true)
    .limit(1);

  if (storeErr || !stores || stores.length === 0) {
    console.error('No active test store found in Verification DB:', storeErr);
    process.exit(1);
  }
  const testStore = stores[0];
  console.log(`  Target Store: ID=${testStore.id}, Code=${testStore.code}, Name=${testStore.name}`);
  assert(testStore.is_active === true, 'Test store is active');

  if (!testStore.notification_email) {
    await client
      .from('stores')
      .update({ notification_email: 'store-tc01@insou.internal' })
      .eq('id', testStore.id);
    testStore.notification_email = 'store-tc01@insou.internal';
    console.log('  Updated test store notification_email to store-tc01@insou.internal');
  }

  // 2. Test Store Search API Handler & Information Exposure
  console.log('\n--- 2. Store Search Handler (Info Exposure & Validation) ---');
  const { GET: searchHandler } = await import('../app/api/store-auth/stores/route.ts');

  // 2.1 Short query (<2 chars)
  const reqShort = new Request('http://localhost:3000/api/store-auth/stores?q=a');
  const resShort = await searchHandler(reqShort);
  assert(resShort.status === 400, 'Search with < 2 chars returns status 400');

  // 2.2 Valid query & Information Exposure Check
  const queryTerm = testStore.name.slice(0, 3);
  const reqValid = new Request(`http://localhost:3000/api/store-auth/stores?q=${encodeURIComponent(queryTerm)}`);
  const resValid = await searchHandler(reqValid);
  assert(resValid.status === 200, 'Search with valid query returns status 200');
  const validData = await resValid.json();
  assert(Array.isArray(validData.stores), 'Search returns stores array');
  const matchedStore = validData.stores.find((s) => s.id === testStore.id);
  assert(!!matchedStore, 'Test store found in search results');
  assert(matchedStore.notification_email === undefined, 'notification_email is NOT exposed in search results');
  assert(matchedStore.hasNotificationEmail === undefined, 'hasNotificationEmail is NOT exposed in search results (info minimization)');

  // 3. Test Resend Fail-Closed vs Explicit Dry-Run
  console.log('\n--- 3. Resend Fail-Closed & OTP Request Handler ---');
  const { POST: requestOtpHandler } = await import('../app/api/store-auth/request-otp/route.ts');

  // Reset rate limits for test store to ensure clean test state
  await client
    .from('store_auth_rate_limits')
    .delete()
    .eq('rate_key', `request-otp:store:${testStore.id}`);

  const testDeviceId = 'test-device-ipad-pro-hardened-01';

  // 3.1 Without RESEND_API_KEY and without DRY_RUN flag -> Must FAIL CLOSED (502)
  delete process.env.STORE_AUTH_EMAIL_DRY_RUN;
  delete process.env.RESEND_API_KEY;

  const reqFailClosed = new Request('http://localhost:3000/api/store-auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: testStore.id, deviceId: testDeviceId }),
  });
  const resFailClosed = await requestOtpHandler(reqFailClosed);
  assert(resFailClosed.status === 502, 'Missing RESEND_API_KEY without dry-run flag fails closed with status 502');

  // 3.2 With STORE_AUTH_EMAIL_DRY_RUN=true in non-production -> Allowed for automated testing
  process.env.STORE_AUTH_EMAIL_DRY_RUN = 'true';

  const reqOtpValid = new Request('http://localhost:3000/api/store-auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: testStore.id, deviceId: testDeviceId }),
  });
  const resOtpValid = await requestOtpHandler(reqOtpValid);
  assert(resOtpValid.status === 200, 'Explicit STORE_AUTH_EMAIL_DRY_RUN=true allows OTP request in non-production');
  const otpData = await resOtpValid.json();
  assert(otpData.success === true, 'Response success is true');
  assert(typeof otpData.challengeId === 'string' && otpData.challengeId.length === 36, 'challengeId is returned as UUID');
  assert(otpData.otp === undefined, 'OTP plain code is NEVER returned in API response');
  assert(typeof otpData.maskedEmail === 'string' && otpData.maskedEmail.includes('***'), 'maskedEmail is safely obfuscated');
  assert(otpData.expiresInSeconds === 900, 'expiresInSeconds is 900 (15 min)');

  // 4. Test OTP Verify API Handler & Persistent Rate Limit
  console.log('\n--- 4. OTP Verify Handler & Persistent Rate Limit ---');
  const { POST: verifyOtpHandler } = await import('../app/api/store-auth/verify-otp/route.ts');

  // 4.1 Wrong OTP code
  const reqWrongCode = new Request('http://localhost:3000/api/store-auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: otpData.challengeId,
      otp: '000000',
      deviceId: testDeviceId,
      deviceName: 'Test iPad Tablet',
    }),
  });
  const resWrongCode = await verifyOtpHandler(reqWrongCode);
  assert(resWrongCode.status === 400, 'Wrong OTP code returns status 400');
  const wrongCodeData = await resWrongCode.json();
  assert(wrongCodeData.error.includes('正しくありません'), 'Error message informs incorrect code');

  // 4.2 Test with Known Valid OTP using newly rotated OTP_HMAC_SECRET
  const knownChallengeId = crypto.randomUUID();
  const knownOtp = '824915';
  const { computeOtpHmac } = await import('../lib/store-auth/otp.ts');
  const knownCodeHash = computeOtpHmac(knownChallengeId, knownOtp);

  // Call RPC to register known challenge
  await client.rpc('create_store_otp_challenge', {
    p_challenge_id: knownChallengeId,
    p_store_id: testStore.id,
    p_code_hash: knownCodeHash,
    p_expires_in: '15 minutes',
  });

  // Verify with known OTP
  const reqVerifyValid = new Request('http://localhost:3000/api/store-auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: knownChallengeId,
      otp: knownOtp,
      deviceId: testDeviceId,
      deviceName: 'Test iPad Pro Tablet Hardened',
    }),
  });
  const resVerifyValid = await verifyOtpHandler(reqVerifyValid);
  assert(resVerifyValid.status === 200, 'Valid OTP verify returns status 200');
  const setCookieHeader = resVerifyValid.headers.get('set-cookie');
  assert(!!setCookieHeader && setCookieHeader.includes('insou_store_device_session='), 'Set-Cookie contains insou_store_device_session');
  assert(setCookieHeader.includes('HttpOnly'), 'Cookie is HttpOnly');
  assert(setCookieHeader.includes('Max-Age=2592000'), 'Cookie Max-Age is 30 days (2592000s)');
  assert(setCookieHeader.includes('SameSite=Lax'), 'Cookie SameSite is Lax');

  // Extract raw session token
  const matchToken = setCookieHeader.match(/insou_store_device_session=([^;]+)/);
  const sessionCookie = `insou_store_device_session=${matchToken[1]}`;

  // 4.3 Persistent Rate Limit Check in DB
  const { data: rateLimits, error: rateLimitErr } = await client
    .from('store_auth_rate_limits')
    .select('*')
    .limit(5);
  assert(!rateLimitErr && Array.isArray(rateLimits) && rateLimits.length > 0, 'Persistent rate limits table contains entries');
  console.log(`  store_auth_rate_limits entries found: ${rateLimits.length}`);

  // 4.4 Test Persistent Rate Limit Exceeded returns 429
  const floodIp = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
  let hit429 = false;
  for (let i = 0; i < 43; i++) {
    const reqFlood = new Request(
      `http://localhost:3000/api/store-auth/stores?q=${encodeURIComponent(queryTerm)}`,
      { headers: { 'x-forwarded-for': floodIp } },
    );
    const resFlood = await searchHandler(reqFlood);
    if (resFlood.status === 429) {
      hit429 = true;
      break;
    }
  }
  assert(hit429 === true, 'Persistent rate limit returns 429 when limit exceeded');

  // 5. Test Session Validation Handler & Session Version Check
  console.log('\n--- 5. Session Validation & Version Validation ---');
  const { GET: sessionHandler } = await import('../app/api/store-auth/session/route.ts');

  // 5.1 With Valid Session Cookie
  const reqValidSession = new Request('http://localhost:3000/api/store-auth/session', {
    headers: { cookie: sessionCookie },
  });
  const resValidSession = await sessionHandler(reqValidSession);
  assert(resValidSession.status === 200, 'Valid session cookie returns status 200');
  const validSessionData = await resValidSession.json();
  assert(validSessionData.authenticated === true, 'authenticated is true');
  assert(validSessionData.store.id === testStore.id, 'store.id matches');

  // 5.2 Test Session Version Mismatch Rejection
  // Alter session version in DB to simulate deprecated session version
  const tokenHash = crypto.createHash('sha256').update(decodeURIComponent(matchToken[1])).digest('hex');
  await client
    .from('store_device_sessions')
    .update({ session_version: 99 })
    .eq('token_hash', tokenHash);

  const reqVersionMismatch = new Request('http://localhost:3000/api/store-auth/session', {
    headers: { cookie: sessionCookie },
  });
  const resVersionMismatch = await sessionHandler(reqVersionMismatch);
  assert(resVersionMismatch.status === 401, 'Mismatched session_version returns status 401');
  const mismatchData = await resVersionMismatch.json();
  assert(mismatchData.reason === 'version_mismatch', 'Rejection reason is "version_mismatch"');
  assert(mismatchData.clearCache === true, 'Instructs client clearCache=true on version mismatch');

  // Restore session_version back to 1 for remaining tests
  await client
    .from('store_device_sessions')
    .update({ session_version: 1 })
    .eq('token_hash', tokenHash);

  // 6. Test Store Menus (No storagePath Exposure) & PDF Authorization
  console.log('\n--- 6. Menus API (No storagePath) & PDF Authorization ---');
  const { GET: menusHandler } = await import('../app/api/store-auth/menus/route.ts');
  const { GET: pdfHandler } = await import('../app/api/store-auth/pdf/[id]/route.ts');

  // 6.1 Authenticated Menus Request
  const reqMenusAuth = new Request('http://localhost:3000/api/store-auth/menus', {
    headers: { cookie: sessionCookie },
  });
  const resMenusAuth = await menusHandler(reqMenusAuth);
  assert(resMenusAuth.status === 200, 'Authenticated menus request returns status 200');
  const menusData = await resMenusAuth.json();
  assert(Array.isArray(menusData.menus), 'menus is returned as array');
  for (const m of menusData.menus) {
    assert(m.storagePath === undefined, `Menu ${m.id} storagePath is NOT exposed to client`);
  }

  // 6.2 PDF Authorization with Non-existent Menu (403)
  const fakeMenuId = crypto.randomUUID();
  const reqPdfFake = new Request(`http://localhost:3000/api/store-auth/pdf/${fakeMenuId}`, {
    headers: { cookie: sessionCookie },
  });
  const resPdfFake = await pdfHandler(reqPdfFake, { params: Promise.resolve({ id: fakeMenuId }) });
  assert(resPdfFake.status === 403, 'Unassigned/non-existent menu returns status 403');

  // 7. Test Logout Handler & Revocation
  console.log('\n--- 7. Logout & Revocation Handler ---');
  const { POST: logoutHandler } = await import('../app/api/store-auth/logout/route.ts');

  const reqLogout = new Request('http://localhost:3000/api/store-auth/logout', {
    method: 'POST',
    headers: { cookie: sessionCookie },
  });
  const resLogout = await logoutHandler(reqLogout);
  assert(resLogout.status === 200, 'Logout returns status 200');
  const logoutSetCookie = resLogout.headers.get('set-cookie');
  assert(logoutSetCookie.includes('Max-Age=0'), 'Set-Cookie clears session with Max-Age=0');

  // 8. Fail-Closed Test on missing OTP_HMAC_SECRET
  console.log('\n--- 8. Fail-Closed Test on missing OTP_HMAC_SECRET ---');
  const savedSecret = process.env.OTP_HMAC_SECRET;
  delete process.env.OTP_HMAC_SECRET;
  let threwExpected = false;
  try {
    computeOtpHmac(crypto.randomUUID(), '123456');
  } catch (err) {
    threwExpected = true;
    assert(err.message.includes('OTP_HMAC_SECRET が設定されていません'), 'computeOtpHmac fails closed when secret is missing');
  }
  assert(threwExpected, 'computeOtpHmac throws when OTP_HMAC_SECRET is missing');
  process.env.OTP_HMAC_SECRET = savedSecret;

  // 9. Audit Logs Verification
  console.log('\n--- 9. Audit Logs Table Verification ---');
  const { data: auditEntries, error: auditErr } = await client
    .from('audit_logs')
    .select('action, actor_type, store_id, metadata, occurred_at')
    .eq('store_id', testStore.id)
    .order('occurred_at', { ascending: false })
    .limit(10);

  assert(!auditErr && Array.isArray(auditEntries), 'Successfully queried audit_logs');

  let foundLeak = false;
  for (const entry of auditEntries) {
    const meta = entry.metadata || {};
    if (meta.otp || meta.password || meta.token || meta.code) {
      foundLeak = true;
    }
  }
  assert(!foundLeak, 'ZERO secret leak: No plain OTP, passwords, or tokens in audit_logs metadata');

  console.log(`\n=== Verification Summary: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
