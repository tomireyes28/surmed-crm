const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  BUCKET,
  encryptionKey,
  storageClient,
  databaseClient,
  pgTool,
  decryptTo,
  decryptBuffer,
  verifyEncrypted,
  listObjects,
  fingerprints,
  applyRestorePermissions,
  sha256,
} = require('./backup-common.cjs');

async function restoreBackupTest(env = process.env) {
  const key = encryptionKey(env),
    storage = storageClient(env);
  const target = new URL(env.RESTORE_TEST_DATABASE_URL || 'about:blank');
  const bucket = env.RESTORE_TEST_BUCKET;
  if (
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.pathname !== '/surmed_restore_test'
  )
    throw Error('Restore is restricted to EMPTY local surmed_restore_test.');
  if (
    !/^surmed-restore-test-[a-f0-9-]{8,40}$/.test(bucket || '') ||
    bucket === BUCKET
  )
    throw Error('A NEW surmed-restore-test-<uuid> private bucket is required.');
  const directory = path.resolve(env.RESTORE_BACKUP_DIRECTORY || '');
  const manifest = JSON.parse(
    (await decryptBuffer(path.join(directory, 'manifest.enc'), key)).toString(),
  );
  if (
    manifest.format !== 1 ||
    manifest.database?.file !== 'database.enc' ||
    !Array.isArray(manifest.objects)
  )
    throw Error('Invalid backup manifest.');
  const entries = [manifest.database, ...manifest.objects];
  const names = new Set();
  for (const entry of entries) {
    if (
      !/^(database|object-\d{8})\.enc$/.test(entry.file) ||
      names.has(entry.file)
    )
      throw Error('Unsafe/duplicate backup entry.');
    names.add(entry.file);
    await verifyEncrypted(path.join(directory, entry.file), key, entry);
  }
  // NO target modifications until every entry passes authentication and checksum.
  const db = databaseClient(target.href);
  await db.connect();
  let created = false;
  const started = Date.now();
  try {
    const existing = (
      await db.query(
        "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')",
      )
    ).rows[0].count;
    if (existing !== 0)
      throw Error('Restore target is not empty; refusing overwrite.');
    // Policies reference this role even though ACLs are intentionally excluded.
    if (
      !(await db.query("SELECT 1 FROM pg_roles WHERE rolname='surmed_app'"))
        .rowCount
    )
      await db.query(
        'CREATE ROLE surmed_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
      );
    const made = await storage.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: manifest.bucket.fileSizeLimit,
      allowedMimeTypes: manifest.bucket.allowedMimeTypes || [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
      ],
    });
    if (made.error)
      throw Error(
        'Could not create a NEW isolated bucket; existing buckets are never reused.',
      );
    created = true;
    // pg_dump includes CREATE SCHEMA public. PostgreSQL creates an empty public
    // schema in new databases; remove only that EMPTY schema, never CASCADE.
    await db.query('DROP SCHEMA IF EXISTS public');
    const restore = pgTool(
      'pg_restore',
      target.href,
      [
        '--dbname',
        decodeURIComponent(target.pathname.slice(1)),
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--single-transaction',
      ],
      env,
    );
    restore.child.stdout.resume();
    try {
      await decryptTo(
        path.join(directory, 'database.enc'),
        key,
        restore.child.stdin,
      );
      await restore.completion;
    } finally {
      restore.child.kill();
    }
    await db.query('BEGIN');
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    assert.deepEqual(
      await fingerprints(db),
      manifest.tables,
      'Restored row counts and SHA-256 fingerprints must match ALL original rows.',
    );
    await applyRestorePermissions(db);
    await db.query('COMMIT');
    for (const entry of manifest.objects) {
      const bytes = await decryptBuffer(
        path.join(directory, entry.file),
        key,
        10485760,
      );
      const uploaded = await storage.storage
        .from(bucket)
        .upload(entry.path, bytes, {
          contentType: entry.mimeType,
          upsert: false,
        });
      if (uploaded.error)
        throw Error('Isolated Storage restore upload failed.');
      const { data, error } = await storage.storage
        .from(bucket)
        .download(entry.path);
      if (
        error ||
        !data ||
        sha256(Buffer.from(await data.arrayBuffer())) !== entry.sha256
      )
        throw Error('Restored Storage download checksum mismatch.');
    }
    assert.deepEqual(
      await listObjects(storage, bucket),
      manifest.objects.map((entry) => entry.path).sort(),
    );
    const privateBucket = await storage.storage.getBucket(bucket);
    assert.equal(privateBucket.data?.public, false);
    return { manifest, bucket, created, elapsedMs: Date.now() - started };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    // Preserve failed target for private diagnosis; never delete a caller's data.
    if (created)
      console.error(
        'Restore failed; isolated test bucket retained for inspection.',
      );
    throw error;
  } finally {
    await db.end();
  }
}
if (require.main === module)
  restoreBackupTest()
    .then((result) =>
      console.log(
        JSON.stringify({
          event: 'RESTORE_TEST_COMPLETE',
          tables: Object.keys(result.manifest.tables).length,
          objects: result.manifest.objects.length,
          elapsedMs: result.elapsedMs,
          target: 'isolated local PostgreSQL and new private test bucket',
        }),
      ),
    )
    .catch((error) => {
      console.error(error.code || error.message);
      process.exitCode = 1;
    });
module.exports = { restoreBackupTest };
