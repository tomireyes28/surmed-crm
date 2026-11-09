import { sessionStore } from './session-store';

/** Unit doubles implement the transaction boundary; concurrency guarantees are
 * verified separately against PostgreSQL, not inferred from this mutex. */
export function transactionalMock<T>(db: T): T {
  const target = db as T & {
    $transaction?: (
      work: (tx: unknown) => Promise<unknown>,
    ) => Promise<unknown>;
    auditLog?: unknown;
    medicalAttachment?: unknown;
    authSession?: unknown;
  };
  const prepare = (value: typeof target) => {
    value.auditLog ??= {
      create: jest.fn(async () => ({ id: 'synthetic-audit' })),
    };
    value.medicalAttachment ??= { findUnique: jest.fn(async () => null) };
    value.authSession ??= sessionStore().authSession;
    return value;
  };
  prepare(target);
  const original = target.$transaction?.bind(target);
  let tail = Promise.resolve();
  target.$transaction = async (work) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return original
        ? await original((tx) => work(prepare(tx as typeof target)))
        : await work(target);
    } finally {
      release();
    }
  };
  return db;
}
