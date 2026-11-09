import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Explicit opt-in: local test commands that set DATABASE_URL must never silently
// use the remote migrator connection from .env.
if (!process.env.MIGRATION_DATABASE_URL) {
  throw new Error(
    'MIGRATION_DATABASE_URL is required for the migration config.',
  );
}
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MIGRATION_DATABASE_URL },
});
