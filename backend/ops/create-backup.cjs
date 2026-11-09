const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { tables } = require('./staging-env.cjs');
const {
  BUCKET,
  encryptionKey,
  storageClient,
  databaseClient,
  pgTool,
  encryptStream,
  listObjects,
  fingerprints,
  referenceRows,
  Readable,
  sha256,
} = require('./backup-common.cjs');

async function createBackup(env = process.env) {
  if (env.BACKUP_MAINTENANCE_CONFIRMED !== 'writes-stopped')
    throw Error(
      'Stop ALL application writers and confirm BACKUP_MAINTENANCE_CONFIRMED=writes-stopped.',
    );
  const key = encryptionKey(env),
    storage = storageClient(env);
  if (!env.BACKUP_DATABASE_URL || !env.BACKUP_DIRECTORY)
    throw Error('Explicit BACKUP_DATABASE_URL and BACKUP_DIRECTORY required.');
  const source = new URL(env.BACKUP_DATABASE_URL);
  const ref = source.hostname.startsWith('db.')
    ? source.hostname.split('.')[1]
    : decodeURIComponent(source.username).split('.').at(-1);
  if (
    (!source.hostname.endsWith('.pooler.supabase.com') &&
      source.hostname !== `db.${env.BACKUP_SOURCE_PROJECT_REF}.supabase.co`) ||
    ref !== env.BACKUP_SOURCE_PROJECT_REF ||
    (source.port && source.port !== '5432') ||
    (source.searchParams.get('schema') || 'public') !== 'public'
  )
    throw Error(
      'Backup database and Storage project must match through direct/session PostgreSQL.',
    );
  const directory = path.resolve(
    env.BACKUP_DIRECTORY,
    `surmed-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
  );
  const db = databaseClient(env.BACKUP_DATABASE_URL);
  const started = Date.now();
  let dumpProcess;
  await db.connect();
  try {
    const { data: bucket, error } = await storage.storage.getBucket(BUCKET);
    if (error || !bucket || bucket.public)
      throw Error('Source bucket must exist and be private.');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    const actualTables = (
      await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((row) => row.tablename);
    if (JSON.stringify(actualTables) !== JSON.stringify([...tables].sort()))
      throw Error(
        'Unknown or missing application tables; update the reviewed backup scope before proceeding.',
      );
    const snapshot = (await db.query('SELECT pg_export_snapshot() AS snapshot'))
      .rows[0].snapshot;
    const serverVersion = (await db.query('SHOW server_version')).rows[0]
      .server_version;
    const tableFingerprints = await fingerprints(db);
    const refs = await referenceRows(db);
    const objects = await listObjects(storage);
    if (refs.paths.some((name) => !objects.includes(name)))
      throw Error(
        'Referenced clinical file is missing; backup cannot be marked complete.',
      );
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      serverVersion,
      scope:
        'Surmed public schema and full medical-records bucket; no managed auth/storage schema or secrets',
      tables: tableFingerprints,
      bucket: {
        public: false,
        fileSizeLimit: bucket.file_size_limit || 10485760,
        allowedMimeTypes: bucket.allowed_mime_types,
      },
      objects: [],
      orphanCount: objects.filter((name) => !refs.paths.includes(name)).length,
      revokedCount: refs.metadata.filter((row) => row.isRevoked).length,
    };
    dumpProcess = pgTool(
      'pg_dump',
      env.BACKUP_DATABASE_URL,
      [
        '--format=custom',
        '--schema=public',
        '--no-owner',
        '--no-privileges',
        `--snapshot=${snapshot}`,
      ],
      env,
    );
    dumpProcess.child.stdin.end();
    manifest.database = {
      file: 'database.enc',
      ...(await encryptStream(
        dumpProcess.child.stdout,
        path.join(directory, 'database.enc'),
        key,
      )),
    };
    await dumpProcess.completion;
    for (const [index, name] of objects.entries()) {
      const { data, error: downloadError } = await storage.storage
        .from(BUCKET)
        .download(name);
      if (downloadError || !data || data.size > 10485760)
        throw Error(
          'Clinical file download failed or exceeds supported limit.',
        );
      const bytes = Buffer.from(await data.arrayBuffer());
      const meta = refs.metadata.find((row) => row.storagePath === name);
      if (
        meta &&
        (sha256(bytes) !== meta.sha256 || bytes.length !== meta.sizeBytes)
      )
        throw Error('Clinical metadata/hash mismatch.');
      const file = `object-${String(index).padStart(8, '0')}.enc`;
      const summary = await encryptStream(
        Readable.from([bytes]),
        path.join(directory, file),
        key,
      );
      manifest.objects.push({
        path: name,
        file,
        mimeType: meta?.mimeType || data.type || 'application/octet-stream',
        ...summary,
      });
    }
    if (JSON.stringify(objects) !== JSON.stringify(await listObjects(storage)))
      throw Error(
        'Storage changed during backup; keep maintenance active and retry.',
      );
    await db.query('COMMIT');
    // Authenticated manifest is written LAST. Its absence means incomplete backup.
    manifest.elapsedMs = Date.now() - started;
    await encryptStream(
      Readable.from([Buffer.from(JSON.stringify(manifest))]),
      path.join(directory, 'manifest.enc'),
      key,
    );
    return { directory, manifest };
  } finally {
    dumpProcess?.child.kill();
    await db.query('ROLLBACK').catch(() => {});
    await db.end();
  }
}
if (require.main === module)
  createBackup()
    .then(({ directory, manifest }) =>
      console.log(
        JSON.stringify({
          event: 'BACKUP_COMPLETE',
          directory,
          tables: Object.keys(manifest.tables).length,
          objects: manifest.objects.length,
          revoked: manifest.revokedCount,
          orphans: manifest.orphanCount,
          elapsedMs: manifest.elapsedMs,
        }),
      ),
    )
    .catch((error) => {
      console.error(error.code || error.message);
      process.exitCode = 1;
    });
module.exports = { createBackup };
