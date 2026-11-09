const assert = require('node:assert/strict');
const { Client } = require('pg');
const { tables } = require('../ops/staging-env.cjs');
const url = new URL(process.env.INTEGRITY_TEST_DATABASE_URL || 'about:blank');
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  url.pathname !== '/surmed_integrity_test'
)
  throw Error('Only local disposable surmed_integrity_test is allowed.');

async function main() {
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    const rows = (
      await db.query(
        "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'",
      )
    ).rows;
    assert.ok(
      tables.every((table) =>
        rows.some((row) => row.tablename === table && row.rowsecurity),
      ),
    );
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const exists =
        (await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
          .rowCount > 0;
      if (process.env.TEST_PLATFORM_ROLES === '1')
        assert.ok(exists, `Missing simulated platform role ${role}`);
      if (!exists) continue;
      for (const table of tables)
        assert.equal(
          (
            await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [
              role,
              `public."${table}"`,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER',
            ])
          ).rows[0].allowed,
          false,
        );
    }
    const role = (
      await db.query(
        "SELECT rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='surmed_app'",
      )
    ).rows[0];
    assert.ok(Object.values(role).every((value) => value === false));
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE surmed_app');
    await db.query('SELECT count(*) FROM public.users');
    await db.query('ROLLBACK');
    for (const sql of [
      'UPDATE public.audit_logs SET reason=reason WHERE false',
      'DELETE FROM public.audit_logs WHERE false',
      'TRUNCATE public.audit_logs',
      'SELECT * FROM public._prisma_migrations',
      'ALTER TABLE public.users ADD COLUMN forbidden_test text',
    ]) {
      await db.query('BEGIN');
      await db.query('SET LOCAL ROLE surmed_app');
      await assert.rejects(db.query(sql), (error) => error.code === '42501');
      await db.query('ROLLBACK');
    }
    console.log(
      'PASS: private tables/RLS, limited runtime role and append-only audit verified on real PostgreSQL.',
    );
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
