// Reads synthetic staging. Restores only to EMPTY localhost surmed_restore_test
// and a NEW private test bucket. Never resets or mutates source rows/objects.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { loadStaging } = require('../ops/staging-env.cjs');
const { createBackup } = require('../ops/create-backup.cjs');
const { restoreBackupTest } = require('../ops/restore-backup-test.cjs');
const {
  databaseClient,
  storageClient,
  decryptBuffer,
  listObjects,
  sha256,
} = require('../ops/backup-common.cjs');

async function main() {
  const ctx = loadStaging();
  const tmp = path.join(ctx.root, '.tmp');
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  const keyFile = path.join(tmp, 'backup-drill-key.txt');
  if (!fs.existsSync(keyFile))
    fs.writeFileSync(keyFile, randomBytes(32).toString('hex'), {
      flag: 'wx',
      mode: 0o600,
    });
  const env = {
    ...ctx.env,
    BACKUP_DATABASE_URL: ctx.migrationUrl,
    BACKUP_SOURCE_PROJECT_REF: ctx.ref,
    BACKUP_ENCRYPTION_KEY: fs.readFileSync(keyFile, 'utf8').trim(),
    BACKUP_MAINTENANCE_CONFIRMED: 'writes-stopped',
    BACKUP_DIRECTORY: path.join(tmp, 'backups'),
    RESTORE_TEST_BUCKET: `surmed-restore-test-${randomUUID()}`,
  };
  const local = databaseClient(env.RESTORE_TEST_DATABASE_URL);
  await local.connect();
  assert.equal(
    (
      await local.query(
        "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'",
      )
    ).rows[0].n,
    0,
    'Use a fresh disposable database.',
  );
  let checks = 0;
  const pass = (text) => console.log(`PASS ${++checks}: ${text}`);
  const storage = storageClient(env);
  let app, restored;
  try {
    await assert.rejects(
      createBackup({ ...env, BACKUP_MAINTENANCE_CONFIRMED: '' }),
      /Stop ALL/,
    );
    pass('backup refuses to run without explicit maintenance confirmation');
    const backup = await createBackup(env);
    env.RESTORE_BACKUP_DIRECTORY = backup.directory;
    pass(
      'encrypted PostgreSQL snapshot and all real private Storage files exported',
    );
    await assert.rejects(
      decryptBuffer(
        path.join(backup.directory, 'manifest.enc'),
        randomBytes(32),
      ),
    );
    pass('wrong encryption key is rejected');
    const archive = path.join(backup.directory, 'database.enc');
    const original = fs.readFileSync(archive);
    const corrupt = Buffer.from(original);
    corrupt[30] ^= 1;
    fs.writeFileSync(archive, corrupt);
    try {
      await assert.rejects(restoreBackupTest(env));
    } finally {
      fs.writeFileSync(archive, original);
    }
    assert.equal(
      (
        await local.query(
          "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'",
        )
      ).rows[0].n,
      0,
    );
    pass('tampered backup rejected before creating tables or restoring files');
    await assert.rejects(
      restoreBackupTest({
        ...env,
        RESTORE_TEST_DATABASE_URL: ctx.migrationUrl,
      }),
      /restricted to EMPTY local/,
    );
    await assert.rejects(
      restoreBackupTest({ ...env, RESTORE_TEST_BUCKET: 'medical-records' }),
      /NEW/,
    );
    pass('restore refuses remote PostgreSQL and the live clinical bucket');
    restored = await restoreBackupTest(env);
    pass(
      'all 17 tables, every row fingerprint and actual restored file hash match',
    );
    await assert.rejects(restoreBackupTest(env), /not empty/);
    pass('restore refuses to overwrite a populated target');
    assert.ok(restored.manifest.revokedCount > 0);
    assert.ok(
      (
        await local.query(
          'SELECT count(*)::int AS n FROM medical_attachments WHERE "isRevoked"',
        )
      ).rows[0].n > 0,
    );
    const rls = await local.query(
      "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'",
    );
    assert.equal(rls.rows.length, 17);
    assert.ok(rls.rows.every((row) => row.rowsecurity));
    await local.query('BEGIN');
    await local.query('SET LOCAL ROLE surmed_app');
    await local.query('SELECT count(*) FROM public.users');
    await assert.rejects(
      local.query('DELETE FROM public.audit_logs WHERE false'),
      (error) => error.code === '42501',
    );
    await local.query('ROLLBACK');
    pass(
      'revoked metadata, RLS and limited runtime audit privileges preserved',
    );
    const localPassword = randomBytes(24).toString('base64url');
    const alter = await local.query(
      "SELECT format('ALTER ROLE surmed_app WITH LOGIN PASSWORD %L', $1::text) AS sql",
      [localPassword],
    );
    await local.query(alter.rows[0].sql);
    const runtime = new URL(env.RESTORE_TEST_DATABASE_URL);
    runtime.username = 'surmed_app';
    runtime.password = localPassword;
    Object.assign(process.env, ctx.env, {
      NODE_ENV: 'test',
      DATABASE_URL: runtime.href,
      JWT_SECRET: randomBytes(48).toString('base64url'),
      SUPABASE_MEDICAL_BUCKET: env.RESTORE_TEST_BUCKET,
    });
    require('reflect-metadata');
    const { Test } = require('@nestjs/testing');
    const { AppModule } = require('../dist/app.module');
    const { configureApp } = require('../dist/setup-app');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = (endpoint, token, body) =>
      fetch(`${base}/${endpoint}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    assert.equal((await request('health/ready')).status, 200);
    const access = JSON.parse(
      fs.readFileSync(path.join(tmp, 'staging-access.json'), 'utf8'),
    );
    const tokens = {};
    for (const role of ['ADMIN', 'MEDICO', 'RECEPCION']) {
      const person = access.users.find((user) => user.role === role);
      const login = await request('auth/login', null, {
        email: person.email,
        password: person.password,
      });
      assert.equal(login.status, 200);
      tokens[role] = (await login.json()).backendToken;
      assert.equal((await request('auth/me', tokens[role])).status, 200);
    }
    pass(
      'actual Nest readiness and restored ADMIN/MEDICO/RECEPCION login succeed with limited SQL role',
    );
    const doctor = access.users.find((user) => user.role === 'MEDICO');
    const attachment = (
      await local.query(
        'SELECT a.* FROM medical_attachments a JOIN medical_records r ON r.id=a."medicalRecordId" WHERE a."isRevoked"=false AND r."doctorId"=$1 LIMIT 1',
        [doctor.id],
      )
    ).rows[0];
    assert.ok(attachment);
    const download = await request(
      `medical-records/attachments/${attachment.id}/content`,
      tokens.MEDICO,
    );
    assert.equal(download.status, 200);
    assert.equal(
      sha256(Buffer.from(await download.arrayBuffer())),
      attachment.sha256,
    );
    for (const role of ['ADMIN', 'RECEPCION'])
      assert.equal(
        (
          await request(
            `medical-records/attachments/${attachment.id}/content`,
            tokens[role],
          )
        ).status,
        403,
      );
    const revoked = (
      await local.query(
        'SELECT id FROM medical_attachments WHERE "isRevoked" LIMIT 1',
      )
    ).rows[0];
    assert.equal(
      (
        await request(
          `medical-records/attachments/${revoked.id}/content`,
          tokens.MEDICO,
        )
      ).status,
      403,
    );
    pass(
      'restored attachment downloaded through real Nest and real isolated Storage; forbidden roles/revocation denied',
    );
    const logout = await request('auth/logout', tokens.MEDICO, {});
    assert.equal(logout.status, 200);
    assert.equal((await request('auth/me', tokens.MEDICO)).status, 401);
    pass('logout revokes the restored session without breaking login');
    const source = databaseClient(ctx.migrationUrl);
    await source.connect();
    try {
      const actual = (
        await source.query('SELECT count(*)::int AS n FROM users')
      ).rows[0].n;
      assert.equal(actual, backup.manifest.tables.users.count);
      assert.deepEqual(
        await listObjects(storage),
        backup.manifest.objects.map((row) => row.path).sort(),
      );
    } finally {
      await source.end();
    }
    pass(
      'source database and original bucket retained after the isolated drill',
    );
    const evidence = {
      date: new Date().toISOString().slice(0, 10),
      checksPassed: checks,
      source: 'synthetic Supabase staging; read only',
      target:
        'isolated PostgreSQL 17 and new private temporary Supabase bucket',
      encrypted: 'AES-256-GCM; manifest and all payload entries authenticated',
      tables: Object.keys(backup.manifest.tables).length,
      rows: Object.values(backup.manifest.tables).reduce(
        (sum, table) => sum + table.count,
        0,
      ),
      storageObjects: backup.manifest.objects.length,
      revokedObjects: backup.manifest.revokedCount,
      orphanObjects: backup.manifest.orphanCount,
      backupElapsedMs: backup.manifest.elapsedMs,
      restoreElapsedMs: restored.elapsedMs,
      scope: 'technical test only; not production RPO/RTO or pilot acceptance',
    };
    fs.writeFileSync(
      path.join(
        ctx.root,
        '../docs/auditoria-2026-11-09/evidencia/etapa-4-restauracion.json',
      ),
      JSON.stringify(evidence, null, 2) + '\n',
    );
    console.log(
      `${checks} backup/restore checks passed; encrypted archive retained under ignored backend/.tmp/backups. No credentials logged.`,
    );
  } finally {
    if (app) await app.close();
    await local.end();
    if (restored?.created) {
      const names = await listObjects(storage, env.RESTORE_TEST_BUCKET);
      if (names.length) {
        const removed = await storage.storage
          .from(env.RESTORE_TEST_BUCKET)
          .remove(names);
        if (removed.error)
          throw Error('Temporary restore bucket cleanup failed.');
      }
      const deleted = await storage.storage.deleteBucket(
        env.RESTORE_TEST_BUCKET,
      );
      if (deleted.error)
        throw Error('Temporary restore bucket removal failed.');
      console.log(
        'Temporary restore bucket removed; original clinical bucket preserved.',
      );
    }
  }
}
main().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
