// Owns only the exact disposable local database named below. Never loads .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DELIVERY_TEST_DATABASE_URL || 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/surmed_delivery_test') throw Error('Only disposable local surmed_delivery_test is allowed.');
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url.href, JWT_SECRET: 'synthetic_delivery_secret_at_least_32_characters', SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only' });
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/setup-app');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { StorageService } = require('../dist/storage/storage.service');
const bcrypt = require('bcrypt');

async function main() {
  const root = path.resolve(__dirname, '..');
  const staging = fs.mkdtempSync(path.join(__dirname, '.migration-upgrade-'));
  const migrate = config => execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--config', config], { cwd: root, env: process.env, stdio: 'pipe' });
  const db = new PrismaService();
  let app;
  let checks = 0;
  const pass = text => console.log(`PASS ${++checks}: ${text}`);
  try {
    await db.onModuleInit();
    // The URL guard above is mandatory: reset this owned disposable schema so
    // reruns really exercise an upgrade from the previous migration set.
    await db.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await db.$executeRawUnsafe('CREATE SCHEMA public');
    const migrations = path.join(root, 'prisma/migrations');
    fs.mkdirSync(path.join(staging, 'migrations'));
    for (const name of fs.readdirSync(migrations)) {
      if (name !== 'migration_lock.toml' && name >= '20261108030000_bounded_queries') continue;
      fs.cpSync(path.join(migrations, name), path.join(staging, 'migrations', name), { recursive: true });
    }
    const config = path.join(staging, 'prisma.config.ts');
    fs.writeFileSync(config, `import { defineConfig } from 'prisma/config'; export default defineConfig(${JSON.stringify({ schema: path.join(root, 'prisma/schema.prisma'), migrations: { path: path.join(staging, 'migrations') }, datasource: { url: url.href } })});`);
    migrate(config);
    await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "users", "patients", "products", "specialties", "auth_rate_buckets" CASCADE');
    const password = 'Synthetic2026!';
    const hash = await bcrypt.hash(password, 4);
    const user = role => db.user.create({ data: { name: 'Synthetic', email: `${randomUUID()}@example.invalid`, password: hash, role } });
    const doctor = await user('MEDICO'), admin = await user('ADMIN'), reception = await user('RECEPCION');
    const patient = await db.patient.create({ data: { documentId: randomUUID(), firstName: 'Synthetic', lastName: 'Delivery', birthDate: new Date('2000-02-29T12:00:00Z') } });
    const record = await db.medicalRecord.create({ data: { patientId: patient.id, doctorId: doctor.id, notes: 'Migration sentinel', attachments: [] } });
    await db.authSession.create({ data: { jti: randomUUID(), userId: doctor.id, expiresAt: new Date(Date.now() + 3600000) } });
    migrate(path.join(root, 'prisma.config.ts'));
    assert.deepEqual(await db.medicalRecord.findUnique({ where: { id: record.id } }), record);
    assert.deepEqual(await db.patient.findUnique({ where: { id: patient.id } }), patient);
    assert.equal(await db.authSession.count({ where: { userId: doctor.id } }), 1);
    const indexes = await db.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE indexname IN ('appointments_date_id_idx', 'products_isActive_category_name_id_idx', 'medical_records_patientId_createdAt_id_idx')");
    assert.equal(indexes.length, 3);
    pass('upgrade from stage 2 preserves patient, clinical record and session; new indexes exist');
    await db.clinicalAccess.create({ data: { patientId: patient.id, doctorId: doctor.id, grantedById: admin.id, reason: 'Synthetic assignment' } });
    const timestamp = new Date('2026-01-01T12:00:00Z');
    await db.medicalRecord.createMany({ data: Array.from({ length: 60 }, (_, i) => ({ patientId: patient.id, doctorId: doctor.id, notes: `Synthetic note ${i}`, attachments: [], createdAt: timestamp })) });
    await db.product.createMany({ data: Array.from({ length: 130 }, (_, i) => ({ name: 'Synthetic same name', description: i === 129 ? 'Unique needle' : 'Synthetic', category: i % 2 ? 'OFICINA' : 'INSUMO_MEDICO', isActive: i !== 129 })) });
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(StorageService).useValue({ downloadFile: () => { throw Error('No files expected'); } }).compile();
    app = module.createNestApplication(); configureApp(app); await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = (endpoint, token, method = 'GET', body) => fetch(`${base}/${endpoint}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    async function login(user) { const response = await request('auth/login', null, 'POST', { email: user.email, password }); assert.equal(response.status, 200); return (await response.json()).backendToken; }
    const d = await login(doctor), a = await login(admin), r = await login(reception);
    async function collect(endpoint, token) {
      const ids = [];
      for (let page = 1; page <= 10; page++) {
        const response = await request(`${endpoint}?page=${page}&limit=25`, token);
        assert.equal(response.status, 200, await response.clone().text());
        const result = await response.json();
        assert.equal(result.meta.page, page); assert.ok(result.data.length <= 25);
        ids.push(...result.data.map(row => row.id));
        if (!result.meta.hasMore) return ids;
      }
      throw Error('Pagination did not terminate');
    }
    const clinicalIds = await collect(`medical-records/patient/${patient.id}/page`, d);
    assert.equal(clinicalIds.length, 61); assert.equal(new Set(clinicalIds).size, 61);
    assert.equal((await request(`medical-records/patient/${patient.id}`, d)).status, 400);
    assert.equal((await request(`medical-records/patient/${patient.id}/page`, a)).status, 403);
    assert.equal((await request(`medical-records/patient/${patient.id}/page`, r)).status, 403);
    pass('clinical pagination has no duplicates or omissions for tied timestamps; permissions still enforced');
    const productIds = await collect('inventory/products/page', a);
    assert.equal(productIds.length, 129); assert.equal(new Set(productIds).size, 129);
    assert.equal((await request('inventory/products', a)).status, 400);
    const search = await (await request('inventory/products/page?search=needle&category=OFICINA&includeInactive=true', r)).json();
    assert.equal(search.data.length, 1); assert.equal(search.data[0].isActive, false);
    assert.equal((await request('inventory/products/page', d)).status, 403);
    pass('inventory pagination, server search/category and archive filters preserve all matching products');
    for (const suffix of ['page=0', 'page=1abc', 'limit=101', 'limit=-1']) {
      assert.equal((await request(`inventory/products/page?${suffix}`, a)).status, 400);
      assert.equal((await request(`medical-records/patient/${patient.id}/page?${suffix}`, d)).status, 400);
    }
    assert.equal((await request('inventory/products/page?category=BAD', a)).status, 400);
    pass('invalid pagination and category filters return 400');
    const specialty = await db.specialty.create({ data: { name: randomUUID() } });
    await db.appointment.createMany({ data: ['2030-11-08T03:00:00Z', '2030-11-09T02:59:59.999Z', '2030-11-09T03:00:00Z'].map(date => ({ patientId: patient.id, doctorId: doctor.id, specialtyId: specialty.id, date: new Date(date), duration: 30 })) });
    const ranged = await (await request('appointments?from=2030-11-08T00:00&to=2030-11-08T23:59:59.999', a)).json();
    assert.equal(ranged.length, 2);
    assert.equal((await (await request('appointments', a)).json()).length, 0);
    assert.equal((await request('appointments?from=2030-02-30T09:00&to=2030-03-01T10:00', a)).status, 400);
    pass('agenda honors clinic midnight boundaries and defaults to current month rather than all dates');
    const civil = await request(`patients/${patient.id}`, a, 'PATCH', { birthDate: '2000-02-29' });
    assert.equal(civil.status, 200); assert.equal((await civil.json()).birthDate, '2000-02-29T12:00:00.000Z');
    pass('civil birth date survives real PostgreSQL and HTTP update without moving day');
    console.log(`\n${checks} delivery checks passed with real PostgreSQL and HTTP.`);
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    if (!fs.realpathSync(staging).startsWith(fs.realpathSync(__dirname) + path.sep)) throw Error('Unexpected staging cleanup path');
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
