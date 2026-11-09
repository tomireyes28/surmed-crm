// Explicitly authorized disposable staging ONLY. Drops named app tables, never
// the public/auth/storage schemas, extensions, or unknown tables. No backups.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { loadStaging, tables } = require('./staging-env.cjs');

async function main() {
  const ctx = loadStaging();
  if (ctx.env.SURMED_RESET_TEST_DATA !== 'discard-test-data')
    throw Error('SURMED_RESET_TEST_DATA=discard-test-data required.');
  const db = ctx.client(ctx.migrationUrl);
  await db.connect();
  try {
    const bucket = await ctx.storage.storage.getBucket('medical-records');
    if (bucket.error) throw Error('Storage preflight failed.');
    const resume = process.argv.includes('--resume');
    if (resume) {
      const finished = new Set(
        (
          await db.query(
            'SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
          )
        ).rows.map((row) => row.migration_name),
      );
      const expected = fs
        .readdirSync(path.join(ctx.root, 'prisma/migrations'), {
          withFileTypes: true,
        })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      if (!expected.every((name) => finished.has(name)))
        throw Error('No fully migrated staging reset to resume.');
      for (const table of tables.filter(
        (name) => name !== '_prisma_migrations',
      )) {
        const count = (
          await db.query(`SELECT count(*)::int AS count FROM public."${table}"`)
        ).rows[0].count;
        if (count !== 0)
          throw Error(
            'Staging contains application data; refusing reset resume.',
          );
      }
    } else {
      await db.query('BEGIN');
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtext('surmed_staging_reset'))",
      );
      const actual = (
        await db.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public'",
        )
      ).rows.map((row) => row.tablename);
      if (actual.some((table) => !tables.includes(table)))
        throw Error('Unknown public tables found. Refusing reset.');
      // No CASCADE: external dependencies cause a rollback instead of being removed.
      if (actual.length)
        await db.query(
          `DROP TABLE ${actual.map((table) => `public."${table}"`).join(', ')}`,
        );
      for (const type of [
        'Role',
        'ProductCategory',
        'MovementType',
        'InvoiceStatus',
        'AppointmentStatus',
      ])
        await db.query(`DROP TYPE IF EXISTS public."${type}"`);
      await db.query('COMMIT');
      console.log(
        'Named Surmed test tables/types removed; managed schemas preserved.',
      );
      const migrated = spawnSync(
        process.execPath,
        [
          require.resolve('prisma/build/index.js'),
          'migrate',
          'deploy',
          '--config',
          'prisma.migrate.config.ts',
        ],
        {
          cwd: ctx.root,
          env: { ...ctx.env, MIGRATION_DATABASE_URL: ctx.migrationUrl },
          encoding: 'utf8',
          windowsHide: true,
        },
      );
      if (migrated.status !== 0) {
        console.error(
          (migrated.stderr || '').replace(
            /postgres(?:ql)?:\/\/\S+/g,
            '[DATABASE_URL]',
          ),
        );
        throw Error('Migration deploy failed.');
      }
      console.log('All versioned migrations deployed.');
    }
    await db.query(
      fs.readFileSync(
        path.join(__dirname, 'supabase-storage-hardening.sql'),
        'utf8',
      ),
    );
    const empty = await ctx.storage.storage.emptyBucket('medical-records');
    if (empty.error)
      throw Error('Could not empty the authorized disposable clinical bucket.');
    let remaining = 1;
    for (let attempt = 0; attempt < 20; attempt++) {
      remaining = (
        await db.query(
          "SELECT count(*)::int AS count FROM storage.objects WHERE bucket_id='medical-records'",
        )
      ).rows[0].count;
      if (remaining === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (remaining !== 0)
      throw Error(
        'Storage cleanup is still queued; use --resume after inspection.',
      );
    const password = randomBytes(32).toString('base64url');
    const alter = await db.query(
      "SELECT format('ALTER ROLE surmed_app WITH LOGIN PASSWORD %L', $1::text) AS sql",
      [password],
    );
    await db.query(alter.rows[0].sql);
    const runtime = new URL(ctx.migrationUrl);
    runtime.username = runtime.hostname.startsWith('db.')
      ? 'surmed_app'
      : `surmed_app.${ctx.ref}`;
    runtime.password = password;
    let text = fs.readFileSync(path.join(ctx.root, '.env'), 'utf8');
    for (const [key, value] of Object.entries({
      DATABASE_URL: runtime.href,
      MIGRATION_DATABASE_URL: ctx.migrationUrl,
      JWT_SECRET: randomBytes(48).toString('base64url'),
    })) {
      const line = `${key}=${JSON.stringify(value)}`;
      const pattern = new RegExp(`^${key}=.*$`, 'm');
      text = pattern.test(text)
        ? text.replace(pattern, () => line)
        : `${text.trimEnd()}\n${line}\n`;
    }
    fs.writeFileSync(path.join(ctx.root, '.env'), text);
    // Keep the new credential even if the session pool has not refreshed its
    // authentication cache yet; never strand a rotated password only in memory.
    for (let attempt = 0; attempt < 5; attempt++) {
      const probe = ctx.client(runtime.href);
      try {
        await probe.connect();
        const identity = (await probe.query('SELECT current_user')).rows[0];
        if (identity.current_user !== 'surmed_app')
          throw Error('Unexpected runtime role.');
        await probe.query('SELECT count(*) FROM public.users');
        break;
      } catch (error) {
        if (error.code !== '28P01' || attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } finally {
        await probe.end();
      }
    }
    console.log(
      'Private bucket hardened/emptied; runtime uses surmed_app; JWT secret renewed; migrator kept separately in ignored .env.',
    );
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
