export function rateStore() {
  const rows = new Map<
    string,
    { key: string; count: number; expiresAt: Date }
  >();
  return {
    authRateBucket: {
      upsert: jest.fn(
        ({
          where,
          create,
        }: {
          where: { key: string };
          create: { key: string; count: number; expiresAt: Date };
        }) => {
          const row = rows.get(where.key);
          if (row) {
            row.count++;
            return Promise.resolve(row);
          }
          rows.set(where.key, { ...create });
          return Promise.resolve(create);
        },
      ),
      deleteMany: jest.fn(
        ({
          where,
        }: {
          where: { expiresAt?: { lte: Date }; key?: { startsWith: string } };
        }) => {
          let count = 0;
          for (const [key, row] of rows) {
            if (
              (where.expiresAt && row.expiresAt <= where.expiresAt.lte) ||
              (where.key && key.startsWith(where.key.startsWith))
            ) {
              rows.delete(key);
              count++;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };
}
