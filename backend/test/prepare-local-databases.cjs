const { Client } = require('pg');
const url = new URL(process.env.DATABASE_URL || 'about:blank');
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  url.pathname !== '/surmed_integrity_test'
)
  throw Error('Only disposable local surmed_integrity_test is allowed.');
async function main() {
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      if (
        !(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
          .rowCount
      )
        await db.query(`CREATE ROLE ${role}`);
    }
    // Reproduce old platform grants so migrations must actually revoke them.
    await db.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role',
    );
    for (const name of ['surmed_security_test', 'surmed_delivery_test']) {
      if (
        !(await db.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]))
          .rowCount
      )
        await db.query(`CREATE DATABASE ${name}`);
    }
    console.log(
      'Disposable test databases and simulated platform roles prepared.',
    );
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
