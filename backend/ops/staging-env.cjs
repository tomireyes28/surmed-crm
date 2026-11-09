const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..');
const tables = [
  '_DoctorSpecialties',
  '_prisma_migrations',
  'appointments',
  'audit_logs',
  'auth_rate_buckets',
  'auth_sessions',
  'clinical_access',
  'invoice_items',
  'invoices',
  'medical_attachments',
  'medical_records',
  'patients',
  'products',
  'recovery_tokens',
  'specialties',
  'stock_movements',
  'users',
];

function loadStaging() {
  const env = {
    ...dotenv.parse(fs.readFileSync(path.join(root, '.env'))),
    ...process.env,
  };
  const storageUrl = new URL(env.SUPABASE_URL);
  const ref = storageUrl.hostname.split('.')[0];
  if (
    storageUrl.protocol !== 'https:' ||
    storageUrl.hostname !== `${ref}.supabase.co` ||
    !/^[a-z0-9]+$/.test(ref) ||
    env.SURMED_STAGING_PROJECT_REF !== ref
  )
    throw Error('Explicit matching SURMED_STAGING_PROJECT_REF required.');
  for (const value of [
    env.DATABASE_URL,
    env.MIGRATION_DATABASE_URL || env.DATABASE_URL,
  ]) {
    const db = new URL(value);
    const dbRef = db.hostname.startsWith('db.')
      ? db.hostname.split('.')[1]
      : decodeURIComponent(db.username).split('.').at(-1);
    if (
      (!db.hostname.endsWith('.supabase.com') &&
        db.hostname !== `db.${ref}.supabase.co`) ||
      dbRef !== ref ||
      (db.searchParams.get('schema') || 'public') !== 'public' ||
      db.port !== '5432'
    )
      throw Error(
        'Only the matching Supabase public schema via direct/session port 5432 is allowed.',
      );
  }
  const storage = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const client = (url) =>
    new Client({
      connectionString: url,
      connectionTimeoutMillis: 15000,
      statement_timeout: 30000,
    });
  return {
    root,
    env,
    ref,
    storage,
    migrationUrl: env.MIGRATION_DATABASE_URL || env.DATABASE_URL,
    client,
  };
}
module.exports = { loadStaging, tables };
