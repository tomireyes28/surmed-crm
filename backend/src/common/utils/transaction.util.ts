import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Serializable transactions coordinate independent processes; retry the whole unit. */
export async function serializable<T>(
  db: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  retryUnique = false,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'P2034' && !(retryUnique && code === 'P2002')) throw error;
      if (attempt === 4)
        throw new ConflictException(
          'La operación tuvo un conflicto concurrente. Reintente con la misma clave.',
        );
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable transaction retry');
}
