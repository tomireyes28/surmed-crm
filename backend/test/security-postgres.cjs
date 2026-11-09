// Isolated real PostgreSQL + real Nest HTTP + optional production Next BFF.
// This script owns and truncates ONLY the guarded disposable database.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');
const url = new URL(process.env.SECURITY_TEST_DATABASE_URL || 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/surmed_security_test') throw Error('Only disposable local surmed_security_test is allowed.');
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url.href, JWT_SECRET: 'synthetic_security_test_secret_2026_at_least_32', SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-only', CORS_ORIGINS: 'http://127.0.0.1:55602' });
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/setup-app');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { StorageService } = require('../dist/storage/storage.service');
const { AuthService } = require('../dist/auth/auth.service');
const { TokenRevocationService } = require('../dist/auth/token-revocation.service');
const { LoginRateLimitService } = require('../dist/auth/login-rate-limit.service');
const { JwtService } = require('@nestjs/jwt');
const bcrypt = require('bcrypt');

async function main() {
  const db = new PrismaService(), db2 = new PrismaService();
  await db.onModuleInit(); await db2.onModuleInit();
  let app, next;
  let checks = 0;
  const passed = message => { console.log(`PASS ${++checks}: ${message}`); };
  const objects = new Map();
  const storage = {
    validateClinicalFile: file => new StorageService().validateClinicalFile(file),
    uploadValidatedFile: async file => {
      const metadata = new StorageService().validateClinicalFile(file);
      const storagePath = `${crypto.randomUUID()}.${metadata.canonicalExt}`;
      objects.set(storagePath, file.buffer);
      return { ...metadata, storagePath };
    },
    downloadFile: async key => { if (!objects.has(key)) throw Error('missing'); return objects.get(key); },
    removeFile: async key => { objects.delete(key); },
  };
  try {
    await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "users", "patients", "products", "specialties", "auth_rate_buckets" CASCADE');
    const password = 'Synthetic2026!';
    const hash = await bcrypt.hash(password, 4);
    const makeUser = role => db.user.create({ data: { email: `${crypto.randomUUID()}@example.invalid`, password: hash, name: 'Synthetic', role } });
    const admin = await makeUser('ADMIN'), doctor = await makeUser('MEDICO'), doctor2 = await makeUser('MEDICO'), reception = await makeUser('RECEPCION');
    const patient = await db.patient.create({ data: { documentId: crypto.randomUUID(), firstName: 'Synthetic', lastName: 'Patient', birthDate: new Date('1990-01-01T12:00:00Z') } });
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(StorageService).useValue(storage).compile();
    app = module.createNestApplication(); configureApp(app); await app.listen(0, '127.0.0.1');
    const backend = await app.getUrl();
    async function request(endpoint, method = 'GET', body, token) {
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';
      return fetch(`${backend}/${endpoint}`, { method, headers, body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined });
    }
    async function login(user, key = password) {
      const response = await request('auth/login', 'POST', { email: user.email, password: key });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).backendToken;
    }
    const a = await login(admin), d = await login(doctor), d2 = await login(doctor2), r = await login(reception);
    assert.equal((await request(`medical-records/patient/${patient.id}`, 'GET', undefined, a)).status, 403);
    assert.equal((await request(`medical-records/patient/${patient.id}`, 'GET', undefined, r)).status, 403);
    assert.equal((await request(`medical-records/patient/${patient.id}`, 'GET', undefined, d)).status, 403);
    passed('ADMIN and reception cannot read histories; unrelated doctor denied');
    const grant = { patientId: patient.id, doctorId: doctor.id, reason: 'Identity and clinical assignment verified' };
    assert.equal((await request('medical-records/access/grant', 'POST', grant, d)).status, 403);
    assert.equal((await request('medical-records/access/grant', 'POST', grant, a)).status, 201);
    assert.equal((await request(`medical-records/patient/${patient.id}`, 'GET', undefined, d)).status, 200);
    passed('only ADMIN manages clinical assignments; assigned doctor can read');
    const file = new FormData(); file.append('patientId', patient.id); file.append('notes', 'Synthetic note'); file.append('file', new Blob(['%PDF-1.7\nSynthetic'], { type: 'application/pdf' }), 'synthetic.pdf');
    const created = await request('medical-records', 'POST', file, d);
    assert.equal(created.status, 201, await created.clone().text());
    const history = await (await request(`medical-records/patient/${patient.id}`, 'GET', undefined, d)).json();
    const link = history[0].attachments[0];
    assert.match(link, /^\/api\/backend\/medical-records\/attachments\/.+\/content$/);
    assert.equal(JSON.stringify(history).includes('signedUrl'), false);
    const fileId = history[0].attachmentFiles[0].id;
    assert.equal((await request(`medical-records/attachments/${fileId}/content`, 'GET', undefined, d2)).status, 403);
    assert.equal((await request(`medical-records/attachments/${fileId}/content`, 'GET', undefined, a)).status, 403);
    const download = await request(`medical-records/attachments/${fileId}/content`, 'GET', undefined, d);
    assert.equal(download.status, 200); assert.match(await download.text(), /^%PDF/);
    passed('attachment links contain no Storage token; every download enforces patient access');
    assert.equal((await request(`medical-records/attachments/${fileId}/revoke`, 'POST', { reason: 'Wrong attachment selected by author' }, d)).status, 201);
    assert.equal((await request(`medical-records/attachments/${fileId}/content`, 'GET', undefined, d)).status, 403);
    passed('revoked attachment denies even a previously copied application URL');
    const spec = await db.specialty.create({ data: { name: crypto.randomUUID() } });
    await db.appointment.create({ data: { patientId: patient.id, doctorId: doctor2.id, specialtyId: spec.id, date: new Date(), duration: 30 } });
    assert.equal((await request(`medical-records/patient/${patient.id}`, 'GET', undefined, d2)).status, 200);
    assert.equal((await request('medical-records/access/revoke', 'POST', { ...grant, doctorId: doctor2.id }, a)).status, 201);
    assert.equal((await request(`medical-records/patient/${patient.id}`, 'GET', undefined, d2)).status, 403);
    passed('own appointment grants access; explicit revocation overrides that appointment');
    const legacyPath = `${crypto.randomUUID()}.pdf`;
    objects.set(legacyPath, Buffer.from('%PDF-1.7\nLegacy synthetic'));
    const legacy = await db.medicalRecord.create({ data: { patientId: patient.id, doctorId: doctor.id, notes: 'Legacy synthetic', attachments: [legacyPath] } });
    const legacyHistory = await (await request(`medical-records/patient/${patient.id}`, 'GET', undefined, d)).json();
    const legacyFile = legacyHistory.find(row => row.id === legacy.id).attachmentFiles[0];
    assert.ok(legacyFile?.id);
    assert.equal((await request(`medical-records/attachments/${legacyFile.id}/content`, 'GET', undefined, d)).status, 200);
    // Reading again must not resurrect a previously revoked legacy file.
    await request(`medical-records/attachments/${legacyFile.id}/revoke`, 'POST', { reason: grant.reason }, d);
    const reread = await (await request(`medical-records/patient/${patient.id}`, 'GET', undefined, d)).json();
    assert.deepEqual(reread.find(row => row.id === legacy.id).attachments, []);
    passed('legacy studies are verified before exposure and remain revoked after rereading');
    assert.equal((await request('auth/recovery/issue', 'POST', { userId: doctor.id, reason: grant.reason }, d)).status, 403);
    const issue = async userId => {
      const response = await request('auth/recovery/issue', 'POST', { userId, reason: grant.reason }, a);
      assert.equal(response.status, 201, await response.clone().text()); return response.json();
    };
    const token1 = await issue(doctor.id);
    const rows = await db.recoveryToken.findMany();
    assert.equal(rows.some(row => row.tokenHash === token1.token), false);
    const hashed = crypto.createHash('sha256').update(token1.token).digest('hex');
    assert.equal(rows.some(row => row.tokenHash === hashed), true);
    const token2 = await issue(doctor.id);
    assert.equal((await request('auth/recovery/redeem', 'POST', { token: token1.token, newPassword: 'NewSynthetic2026!' })).status, 400);
    await db.recoveryToken.update({ where: { tokenHash: crypto.createHash('sha256').update(token2.token).digest('hex') }, data: { expiresAt: new Date(0) } });
    assert.equal((await request('auth/recovery/redeem', 'POST', { token: token2.token, newPassword: 'NewSynthetic2026!' })).status, 400);
    passed('recovery issuance restricted to ADMIN; hashes at rest, replacement and expiration enforced');
    const token3 = await issue(doctor.id);
    const jwt = new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '8h' } });
    const auth1 = new AuthService(db, jwt, new TokenRevocationService(db));
    const auth2 = new AuthService(db2, jwt, new TokenRevocationService(db2));
    const redemption = await Promise.allSettled([auth1.redeemRecovery({ token: token3.token, newPassword: 'NewSynthetic2026!' }), auth2.redeemRecovery({ token: token3.token, newPassword: 'NewSynthetic2026!' })]);
    assert.equal(redemption.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal((await request('auth/me', 'GET', undefined, d)).status, 401);
    const fresh = await login(doctor, 'NewSynthetic2026!');
    assert.equal((await request('auth/login', 'POST', { email: doctor.email, password })).status, 401);
    passed('concurrent redemption succeeds once, revokes old sessions, preserves new-password login');
    const payload = jwt.verify(fresh);
    await db.authSession.update({ where: { jti: payload.jti }, data: { lastSeenAt: new Date(Date.now() - 31 * 60000) } });
    assert.equal((await request('auth/me', 'GET', undefined, fresh)).status, 401);
    assert.equal(await new TokenRevocationService(db2).isRevoked(payload.jti, doctor.id), true);
    passed('server-side inactivity expiration survives another instance');
    const loginBeforeLogout = await login(doctor, 'NewSynthetic2026!');
    assert.equal((await request('auth/logout', 'POST', {}, loginBeforeLogout)).status, 200);
    assert.equal(await new TokenRevocationService(db2).isRevoked(jwt.verify(loginBeforeLogout).jti, doctor.id), true);
    passed('logout remains persistent after services are recreated');
    const limiter1 = new LoginRateLimitService(db), limiter2 = new LoginRateLimitService(db2);
    const limits = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => (i % 2 ? limiter1 : limiter2).assertAllowed('synthetic-limit@example.invalid', '192.0.2.20')));
    assert.equal(limits.filter(x => x.status === 'fulfilled').length, 5);
    await assert.rejects(new LoginRateLimitService(db2).assertAllowed('synthetic-limit@example.invalid', '192.0.2.20'), e => e.getStatus?.() === 429);
    passed('login quotas are shared atomically across pools and survive recreation');
    await db.authRateBucket.upsert({ where: { key: 'expired' }, create: { key: 'expired', count: 2, expiresAt: new Date(0) }, update: {} });
    await limiter1.assertAllowed('cleanup@example.invalid', '192.0.2.30');
    assert.equal(await db.authRateBucket.findUnique({ where: { key: 'expired' } }), null);
    passed('expired attempt buckets are cleaned instead of accumulating in process memory');

    if (process.env.TEST_BFF === '1') {
      let log = '';
      next = spawn(process.execPath, [path.resolve(__dirname, '../../frontend/node_modules/next/dist/bin/next'), 'start', '-p', '55602', '-H', '127.0.0.1'], {
        cwd: path.resolve(__dirname, '../../frontend'), windowsHide: true,
        env: { ...process.env, NODE_ENV: 'production', API_URL: backend, APP_ORIGIN: 'http://127.0.0.1:55602' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      next.stdout.on('data', chunk => { log = (log + chunk).slice(-4000); }); next.stderr.on('data', chunk => { log = (log + chunk).slice(-4000); });
      const origin = 'http://127.0.0.1:55602';
      let ready = false;
      for (let i = 0; i < 80; i++) { try { await fetch(origin); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); } }
      assert.equal(ready, true, log);
      const loginWeb = await fetch(`${origin}/api/backend/auth/login`, { method: 'POST', headers: { origin, 'x-surmed-request': '1', 'content-type': 'application/json' }, body: JSON.stringify({ email: admin.email, password }) });
      assert.equal(loginWeb.status, 200, await loginWeb.clone().text());
      assert.equal('backendToken' in await loginWeb.json(), false);
      const sessionCookie = loginWeb.headers.getSetCookie().find(c => c.startsWith('surmed-session='));
      assert.match(sessionCookie, /HttpOnly/i); assert.match(sessionCookie, /Secure/i); assert.match(sessionCookie, /SameSite=strict/i);
      const cookie = sessionCookie.split(';')[0];
      passed('Next BFF login hides JWT from JSON and sets HttpOnly/Secure/SameSite cookie');
      assert.equal((await fetch(`${origin}/api/backend/auth/me`, { headers: { cookie } })).status, 200);
      assert.equal((await fetch(`${origin}/api/backend/auth/me`, { headers: { authorization: `Bearer ${a}` } })).status, 401);
      assert.equal((await fetch(`${origin}/api/backend/auth/logout`, { method: 'POST', headers: { cookie, origin: 'https://attacker.invalid', 'x-surmed-request': '1' } })).status, 403);
      assert.equal((await fetch(`${origin}/api/backend/auth/logout`, { method: 'POST', headers: { cookie, origin } })).status, 403);
      passed('BFF authenticates only its cookie and rejects cross-origin or simple-header mutations');
      const logoutWeb = await fetch(`${origin}/api/backend/auth/logout`, { method: 'POST', headers: { cookie, origin, 'x-surmed-request': '1' } });
      assert.equal(logoutWeb.status, 200); assert.match(logoutWeb.headers.get('set-cookie'), /surmed-session=;/);
      assert.equal((await fetch(`${origin}/api/backend/auth/me`, { headers: { cookie } })).status, 401);
      passed('BFF logout clears cookie only after API confirms and rejects copied old cookie');
      assert.equal((await fetch(`${origin}/recover`)).status, 200);
      passed('recovery page is reachable without a session');
      const doctorWeb = await fetch(`${origin}/api/backend/auth/login`, { method: 'POST', headers: { origin, 'x-surmed-request': '1', 'content-type': 'application/json' }, body: JSON.stringify({ email: doctor.email, password: 'NewSynthetic2026!' }) });
      assert.equal(doctorWeb.status, 200);
      const doctorCookie = doctorWeb.headers.getSetCookie().find(c => c.startsWith('surmed-session=')).split(';')[0];
      const webFile = new FormData();
      webFile.append('patientId', patient.id); webFile.append('notes', 'BFF synthetic attachment');
      webFile.append('file', new Blob(['%PDF-1.7\nBFF synthetic'], { type: 'application/pdf' }), 'synthetic.pdf');
      const webCreated = await fetch(`${origin}/api/backend/medical-records`, { method: 'POST', headers: { cookie: doctorCookie, origin, 'x-surmed-request': '1' }, body: webFile });
      assert.equal(webCreated.status, 201, await webCreated.clone().text());
      const webRecords = await (await fetch(`${origin}/api/backend/medical-records/patient/${patient.id}`, { headers: { cookie: doctorCookie } })).json();
      const webLink = webRecords.find(row => row.notes === 'BFF synthetic attachment').attachments[0];
      const webDownload = await fetch(`${origin}${webLink}`, { headers: { cookie: doctorCookie } });
      assert.equal(webDownload.status, 200); assert.match(await webDownload.text(), /^%PDF/);
      assert.match(webDownload.headers.get('content-disposition'), /^attachment/);
      assert.equal(webDownload.headers.get('cache-control'), 'no-store');
      passed('multipart upload, history link and binary download work through authenticated BFF');
      // A failed backend logout must not pretend that server revocation happened.
      await app.close(); app = undefined;
      const unavailableLogout = await fetch(`${origin}/api/backend/auth/logout`, { method: 'POST', headers: { cookie: doctorCookie, origin, 'x-surmed-request': '1' } });
      assert.equal(unavailableLogout.status, 503);
      assert.equal(unavailableLogout.headers.get('set-cookie'), null);
      passed('API outage during logout reports failure without falsely clearing session cookie');
    }
    console.log(`\n${checks} security checks passed with real PostgreSQL and HTTP.`);
  } finally {
    if (next) { next.kill(); await new Promise(resolve => { next.once('exit', resolve); setTimeout(resolve, 5000); }); }
    if (app) await app.close();
    await db.onModuleDestroy(); await db2.onModuleDestroy();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
