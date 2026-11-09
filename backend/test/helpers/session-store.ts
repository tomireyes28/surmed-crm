import type { AuthSession } from '@prisma/client';

/** Shared database double; recreate services against it to simulate restart. */
export function sessionStore() {
  const rows = new Map<string, AuthSession>();
  return {
    rows,
    authSession: {
      create: jest.fn(
        ({
          data,
        }: {
          data: { jti: string; userId: string; expiresAt: Date };
        }) => {
          if (rows.has(data.jti))
            return Promise.reject(new Error('Duplicate session'));
          const row = {
            ...data,
            createdAt: new Date(),
            lastSeenAt: new Date(),
            revokedAt: null,
          };
          rows.set(data.jti, row);
          return Promise.resolve(row);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { jti: string } }) =>
        Promise.resolve(rows.get(where.jti) ?? null),
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: {
            jti?: string;
            userId?: string;
            revokedAt: null;
            expiresAt?: { gt: Date };
            lastSeenAt?: { gt: Date };
          };
          data: { revokedAt?: Date; lastSeenAt?: Date };
        }) => {
          let count = 0;
          for (const row of rows.values()) {
            if (
              (!where.jti || row.jti === where.jti) &&
              (!where.userId || row.userId === where.userId) &&
              row.revokedAt === null &&
              (!where.expiresAt || row.expiresAt > where.expiresAt.gt) &&
              (!where.lastSeenAt || row.lastSeenAt > where.lastSeenAt.gt)
            ) {
              Object.assign(row, data);
              count++;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };
}
