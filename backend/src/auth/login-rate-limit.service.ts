import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../common/utils/transaction.util';

@Injectable()
export class LoginRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(email: string, ip?: string): Promise<void> {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const window = Math.floor(now / windowMs);
    const hash = (value: string) =>
      createHash('sha256').update(value).digest('hex');
    const keys = [
      { key: `account:${hash(email.trim().toLowerCase())}:${window}`, max: 5 },
    ];
    if (ip) keys.push({ key: `ip:${hash(ip)}:${window}`, max: 100 });
    await serializable(
      this.prisma,
      async (tx) => {
        await tx.authRateBucket.deleteMany({
          where: { expiresAt: { lte: new Date(now) } },
        });
        for (const { key, max } of keys) {
          const bucket = await tx.authRateBucket.upsert({
            where: { key },
            create: {
              key,
              count: 1,
              expiresAt: new Date((window + 1) * windowMs),
            },
            update: { count: { increment: 1 } },
          });
          if (bucket.count > max)
            throw new HttpException(
              'Demasiados intentos fallidos de inicio de sesión. Intente nuevamente más tarde.',
              HttpStatus.TOO_MANY_REQUESTS,
            );
        }
      },
      true,
    );
  }

  async reset(email: string): Promise<void> {
    const key = createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex');
    await this.prisma.authRateBucket.deleteMany({
      where: { key: { startsWith: `account:${key}:` } },
    });
  }
}
