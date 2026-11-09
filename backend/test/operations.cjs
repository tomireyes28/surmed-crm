const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { checkProduction } = require('../ops/check-production.cjs');
const { listObjects } = require('../ops/backup-common.cjs');

function config() {
  return [
    {
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL:
        'postgresql://surmed_app.unit:synthetic@db.unit.invalid:5432/postgres?sslmode=verify-full',
      JWT_SECRET: randomBytes(48).toString('base64url'),
      CORS_ORIGINS: 'https://crm.unit.invalid',
      SUPABASE_URL: 'https://unit.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-private-key-at-least-32-characters',
      SUPABASE_MEDICAL_BUCKET: 'medical-records',
      ENABLE_SWAGGER: 'false',
    },
    {
      NODE_ENV: 'production',
      API_URL: 'http://backend:3000',
      APP_ORIGIN: 'https://crm.unit.invalid',
    },
  ];
}
test('reviewed production configuration passes static preflight', () =>
  assert.equal(checkProduction(...config()), true));
test('preflight denies admin DB role, plaintext remote DB and weak JWT', () => {
  for (const change of [
    {
      DATABASE_URL:
        'postgresql://postgres:synthetic@host:5432/postgres?sslmode=require',
    },
    { DATABASE_URL: 'postgresql://surmed_app:synthetic@host:5432/postgres' },
    { JWT_SECRET: 'synthetic-short-secret' },
  ]) {
    const [b, f] = config();
    assert.throws(() => checkProduction({ ...b, ...change }, f));
  }
});
test('preflight denies leftover migrator, backup key and initial ADMIN password', () => {
  for (const key of [
    'MIGRATION_DATABASE_URL',
    'BACKUP_ENCRYPTION_KEY',
    'ADMIN_PASSWORD',
  ]) {
    const [b, f] = config();
    assert.throws(() => checkProduction({ ...b, [key]: 'synthetic' }, f));
  }
});
test('preflight denies browser secrets and cross-origin/plaintext web settings', () => {
  for (const change of [
    { NEXT_PUBLIC_JWT_SECRET: 'synthetic' },
    { APP_ORIGIN: 'http://crm.unit.invalid' },
    { APP_ORIGIN: 'https://wrong.unit.invalid' },
    { API_URL: 'http://public.unit.invalid' },
  ]) {
    const [b, f] = config();
    assert.throws(() => checkProduction(b, { ...f, ...change }));
  }
});
test('preflight denies examples, exposed Swagger and unexpected clinical bucket', () => {
  for (const change of [
    { JWT_SECRET: 'REPLACE_WITH_48_RANDOM_BYTES' },
    { ENABLE_SWAGGER: 'true' },
    { SUPABASE_MEDICAL_BUCKET: 'surmed-restore-test-synthetic' },
  ]) {
    const [b, f] = config();
    assert.throws(() => checkProduction({ ...b, ...change }, f));
  }
});
test('Storage listing recursively paginates beyond 1000 objects without truncation', async () => {
  const pages = Array.from({ length: 1205 }, (_, i) => ({
    id: String(i),
    name: `file-${String(i).padStart(5, '0')}.pdf`,
  }));
  const api = {
    storage: {
      from: () => ({
        list: async (prefix, { limit, offset }) => ({
          data: (prefix ? pages : [{ id: null, name: 'patient' }]).slice(
            offset,
            offset + limit,
          ),
          error: null,
        }),
      }),
    },
  };
  const result = await listObjects(api);
  assert.equal(result.length, 1205);
  assert.equal(result.at(-1), 'patient/file-01204.pdf');
});
test('Storage listing fails closed on a provider error in a later page', async () => {
  const api = {
    storage: {
      from: () => ({
        list: async (_, { offset }) =>
          offset === 0
            ? {
                data: Array.from({ length: 100 }, (_, i) => ({
                  id: String(i),
                  name: `file-${i}`,
                })),
              }
            : { data: null, error: { message: 'synthetic failure' } },
      }),
    },
  };
  await assert.rejects(listObjects(api), /refusing incomplete/);
});
