import type { AuthSession } from '@prisma/client';

/** Shared database double; recreate services against it to simulate restart. */
export function sessionStore() {
  const rows = new Map<string, AuthSession>();
  return {
    rows,
    authSession: {
      create: jest.fn(
        async ({
          data,
        }: {
          data: { jti: string; userId: string; expiresAt: Date };
        }) => {
          if (rows.has(data.jti)) throw new Error('Duplicate session');
          const row = { ...data, createdAt: new Date(), revokedAt: null };
          rows.set(data.jti, row);
          return row;
        },
      ),
      findUnique: jest.fn(
        async ({ where }: { where: { jti: string } }) =>
          rows.get(where.jti) ?? null,
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { jti?: string; userId?: string; revokedAt: null };
          data: { revokedAt: Date };
        }) => {
          let count = 0;
          for (const row of rows.values()) {
            if (
              (!where.jti || row.jti === where.jti) &&
              (!where.userId || row.userId === where.userId) &&
              row.revokedAt === null
            ) {
              row.revokedAt = data.revokedAt;
              count++;
            }
          }
          return { count };
        },
      ),
    },
  };
}
