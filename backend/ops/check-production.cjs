const fs = require('node:fs');
const dotenv = require('dotenv');
const { validateEnv } = require('../dist/config/env.validation');

function checkProduction(backend, frontend) {
  const reject = (message) => {
    throw Error(`Production preflight: ${message}`);
  };
  for (const env of [backend, frontend]) {
    if (env.NODE_ENV !== 'production') reject('NODE_ENV must be production.');
    if (
      Object.values(env).some((value) =>
        /REPLACE|PROJECT|example\.invalid|changeme/i.test(value),
      )
    )
      reject('replace all example placeholders.');
  }
  validateEnv(backend);
  if ((backend.JWT_SECRET || '').length < 48)
    reject('use a random JWT secret of at least 48 characters.');
  if (
    backend.MIGRATION_DATABASE_URL ||
    backend.BACKUP_ENCRYPTION_KEY ||
    backend.ADMIN_PASSWORD
  )
    reject(
      'privileged operational credentials cannot remain in backend runtime.',
    );
  const db = new URL(backend.DATABASE_URL);
  if (!/^surmed_app(?:\.|$)/.test(decodeURIComponent(db.username)))
    reject('DATABASE_URL must use surmed_app.');
  if (
    !['require', 'verify-full', 'verify-ca'].includes(
      db.searchParams.get('sslmode'),
    )
  )
    reject('require TLS for remote PostgreSQL.');
  const origin = new URL(frontend.APP_ORIGIN);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== frontend.APP_ORIGIN ||
    ['localhost', '127.0.0.1'].includes(origin.hostname)
  )
    reject('APP_ORIGIN must be the exact public HTTPS origin.');
  if (backend.CORS_ORIGINS !== frontend.APP_ORIGIN)
    reject('CORS_ORIGINS must match the web origin for this deployment.');
  const api = new URL(frontend.API_URL);
  if (
    api.protocol !== 'https:' &&
    !(
      api.protocol === 'http:' &&
      api.hostname === 'backend' &&
      api.port === '3000'
    )
  )
    reject('API_URL must use HTTPS or the private Compose backend.');
  if (
    Object.keys(frontend).some(
      (key) => !['NODE_ENV', 'API_URL', 'APP_ORIGIN'].includes(key),
    )
  )
    reject(
      'unexpected frontend variable; keep this file restricted to BFF configuration.',
    );
  const storage = new URL(backend.SUPABASE_URL);
  if (
    storage.protocol !== 'https:' ||
    !backend.SUPABASE_SERVICE_ROLE_KEY ||
    backend.SUPABASE_SERVICE_ROLE_KEY.length < 32
  )
    reject('HTTPS Storage and private server key required.');
  if (
    backend.SUPABASE_MEDICAL_BUCKET !== 'medical-records' ||
    backend.ENABLE_SWAGGER !== 'false' ||
    backend.PORT !== '3000'
  )
    reject('use the reviewed bucket, port and disabled Swagger configuration.');
  return true;
}
if (require.main === module) {
  try {
    if (
      !process.env.BACKEND_PRODUCTION_ENV ||
      !process.env.FRONTEND_PRODUCTION_ENV
    )
      throw Error(
        'Explicit BACKEND_PRODUCTION_ENV and FRONTEND_PRODUCTION_ENV file paths required.',
      );
    checkProduction(
      dotenv.parse(fs.readFileSync(process.env.BACKEND_PRODUCTION_ENV)),
      dotenv.parse(fs.readFileSync(process.env.FRONTEND_PRODUCTION_ENV)),
    );
    console.log(
      'PASS: static production configuration. This does not certify DNS/TLS, runtime database grants, backups, hosting or clinical acceptance.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { checkProduction };
