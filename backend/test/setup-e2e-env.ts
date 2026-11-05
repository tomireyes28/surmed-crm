import { assertDisposableTestDatabaseUrl } from '../src/setup-app';

const defaultTestDbUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://surmed_test:surmed_test@127.0.0.1:5432/surmed_crm_e2e_test?schema=test';

assertDisposableTestDatabaseUrl(defaultTestDbUrl);

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = defaultTestDbUrl;
process.env.DATABASE_URL = defaultTestDbUrl;
process.env.JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16
    ? process.env.JWT_SECRET
    : 'surmed_e2e_test_secret_key_with_at_least_32_characters_2026';
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://surmed-e2e-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'e2e_test_service_role_key';
process.env.CORS_ORIGINS =
  process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001';
