const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { pipeline } = require('node:stream/promises');
const { Readable, Transform, Writable } = require('node:stream');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { tables } = require('./staging-env.cjs');
const MAGIC = Buffer.from('SURMED01');
const BUCKET = 'medical-records';
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const ident = (name) => `"${name.replaceAll('"', '""')}"`;

function encryptionKey(env = process.env) {
  if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY || ''))
    throw Error(
      'BACKUP_ENCRYPTION_KEY must contain 32 random bytes in hexadecimal.',
    );
  return Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'hex');
}

function storageClient(env = process.env) {
  const url = new URL(env.SUPABASE_URL);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== `${env.BACKUP_SOURCE_PROJECT_REF}.supabase.co`
  )
    throw Error('Explicit matching BACKUP_SOURCE_PROJECT_REF required.');
  return createClient(url.href, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function databaseClient(url) {
  return new Client({
    connectionString: url,
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
  });
}

// No URL/password in argv, stdout or thrown provider diagnostics. Optional Docker
// tools container is useful on Windows; native PostgreSQL binaries work on Linux.
function pgTool(tool, url, args, env = process.env) {
  const db = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(db.protocol))
    throw Error('PostgreSQL URL required.');
  let host = db.hostname;
  let port = db.port || '5432';
  if (env.PG_TOOLS_CONTAINER && ['127.0.0.1', 'localhost'].includes(host)) {
    host = '127.0.0.1';
    port = '5432'; // target is this tools container itself
  }
  const pgEnv = {
    PGHOST: host,
    PGPORT: port,
    PGDATABASE: decodeURIComponent(db.pathname.slice(1)),
    PGUSER: decodeURIComponent(db.username),
    PGPASSWORD: decodeURIComponent(db.password),
    PGSSLMODE:
      db.searchParams.get('sslmode') ||
      (host === '127.0.0.1' ? 'disable' : 'require'),
    PGCONNECT_TIMEOUT: '15',
    PGAPPNAME: 'surmed-backup',
  };
  const command = env.PG_TOOLS_CONTAINER ? 'docker' : tool;
  const argv = env.PG_TOOLS_CONTAINER
    ? [
        'exec',
        '-i',
        ...Object.keys(pgEnv).flatMap((key) => ['--env', key]),
        env.PG_TOOLS_CONTAINER,
        tool,
        ...args,
      ]
    : args;
  const child = spawn(command, argv, {
    env: { ...env, ...pgEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stderr.resume(); // diagnostics can contain credentials or clinical data
  const completion = new Promise((resolve, reject) => {
    child.once('error', () => reject(Error(`${tool} could not start.`)));
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(Error(`${tool} failed (exit ${code}); inspect privately.`)),
    );
  });
  // Avoid unhandled rejection while the caller is still consuming its streams.
  completion.catch(() => {});
  return { child, completion };
}

async function encryptStream(input, filename, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _, cb) {
      hash.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  const output = fs.createWriteStream(filename, { flags: 'wx', mode: 0o600 });
  try {
    output.write(Buffer.concat([MAGIC, iv]));
    await pipeline(input, meter, cipher, output, { end: false });
    output.end(cipher.getAuthTag());
    await once(output, 'finish');
    return { bytes, sha256: hash.digest('hex') };
  } catch (error) {
    output.destroy();
    throw error;
  }
}

function decryptedStream(filename, key) {
  const size = fs.statSync(filename).size;
  if (size < 36) throw Error('Invalid encrypted backup.');
  const fd = fs.openSync(filename, 'r');
  const header = Buffer.alloc(20),
    tag = Buffer.alloc(16);
  try {
    fs.readSync(fd, header, 0, 20, 0);
    fs.readSync(fd, tag, 0, 16, size - 16);
  } finally {
    fs.closeSync(fd);
  }
  if (!header.subarray(0, 8).equals(MAGIC))
    throw Error('Unsupported backup format.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    header.subarray(8),
  );
  decipher.setAuthTag(tag);
  return {
    input: fs.createReadStream(filename, { start: 20, end: size - 17 }),
    decipher,
  };
}

async function decryptTo(filename, key, output) {
  const { input, decipher } = decryptedStream(filename, key);
  await pipeline(input, decipher, output);
}

async function decryptBuffer(filename, key, maxBytes = 16 * 1024 * 1024) {
  let length = 0;
  const chunks = [];
  await decryptTo(
    filename,
    key,
    new Writable({
      write(chunk, _, cb) {
        length += chunk.length;
        if (length > maxBytes)
          return cb(Error('Backup entry exceeds memory limit.'));
        chunks.push(chunk);
        cb();
      },
    }),
  );
  return Buffer.concat(chunks);
}

async function verifyEncrypted(filename, key, expected) {
  let bytes = 0;
  const hash = crypto.createHash('sha256');
  await decryptTo(
    filename,
    key,
    new Writable({
      write(chunk, _, cb) {
        bytes += chunk.length;
        hash.update(chunk);
        cb();
      },
    }),
  );
  if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256)
    throw Error('Backup checksum mismatch.');
}

async function listObjects(storage, bucket = BUCKET, prefix = '') {
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error || !data)
      throw Error('Storage listing failed; refusing incomplete result.');
    for (const entry of data) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!entry.id) result.push(...(await listObjects(storage, bucket, name)));
      else result.push(name);
    }
    if (data.length < 100) break;
  }
  return result.sort();
}

async function fingerprints(db) {
  const result = {};
  for (const table of tables) {
    // Fixed table allowlist, sorted JSON text, UTC session; stream in bounded batches.
    const hash = crypto.createHash('sha256');
    let count = 0;
    await db.query(
      `DECLARE backup_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS row FROM public.${ident(table)} t ORDER BY row_to_json(t)::text`,
    );
    try {
      for (;;) {
        const { rows } = await db.query('FETCH 500 FROM backup_rows');
        for (const row of rows) {
          hash.update(row.row);
          hash.update('\n');
          count++;
        }
        if (rows.length < 500) break;
      }
    } finally {
      await db.query('CLOSE backup_rows');
    }
    result[table] = { count, sha256: hash.digest('hex') };
  }
  return result;
}

async function referenceRows(db) {
  const metadata = (
    await db.query(
      'SELECT "storagePath", "sha256", "sizeBytes", "mimeType", "isRevoked" FROM public.medical_attachments ORDER BY "storagePath"',
    )
  ).rows;
  const legacy = (
    await db.query(
      'SELECT unnest(attachments) AS path FROM public.medical_records',
    )
  ).rows
    .map((row) => row.path)
    .filter(Boolean);
  return {
    metadata,
    paths: [
      ...new Set([...metadata.map((row) => row.storagePath), ...legacy]),
    ].sort(),
  };
}

async function applyRestorePermissions(db) {
  if (
    !(await db.query("SELECT 1 FROM pg_roles WHERE rolname='surmed_app'"))
      .rowCount
  )
    await db.query(
      'CREATE ROLE surmed_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    );
  const role = (
    await db.query(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='surmed_app'",
    )
  ).rows[0];
  if (Object.values(role).some(Boolean))
    throw Error('Unsafe restore runtime role.');
  await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC, surmed_app');
  await db.query('GRANT USAGE ON SCHEMA public TO surmed_app');
  await db.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC',
  );
  for (const apiRole of ['anon', 'authenticated', 'service_role']) {
    if (
      (await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [apiRole]))
        .rowCount
    ) {
      await db.query(`REVOKE CREATE ON SCHEMA public FROM ${ident(apiRole)}`);
      await db.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${ident(apiRole)}`,
      );
    }
  }
  for (const table of tables) {
    await db.query(
      `ALTER TABLE public.${ident(table)} ENABLE ROW LEVEL SECURITY`,
    );
    await db.query(
      `REVOKE ALL ON public.${ident(table)} FROM PUBLIC, surmed_app`,
    );
    for (const apiRole of ['anon', 'authenticated', 'service_role']) {
      if (
        (await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [apiRole]))
          .rowCount
      )
        await db.query(
          `REVOKE ALL ON public.${ident(table)} FROM ${ident(apiRole)}`,
        );
    }
    if (table !== '_prisma_migrations')
      await db.query(
        `GRANT ${table === 'audit_logs' ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE, DELETE'} ON public.${ident(table)} TO surmed_app`,
      );
  }
}

module.exports = {
  BUCKET,
  encryptionKey,
  storageClient,
  databaseClient,
  pgTool,
  encryptStream,
  decryptTo,
  decryptBuffer,
  verifyEncrypted,
  listObjects,
  fingerprints,
  referenceRows,
  applyRestorePermissions,
  sha256,
  Readable,
  Writable,
};
