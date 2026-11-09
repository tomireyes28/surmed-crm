import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TokenRevocationService {
  constructor(private readonly prisma: PrismaService) {}

  async registerIssuedToken(
    userId: string,
    jti: string,
    expiresAt: Date,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.authSession.create({ data: { userId, jti, expiresAt } });
  }

  async revokeToken(jti?: string): Promise<void> {
    if (!jti) return;
    await this.prisma.authSession.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(
    userId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async isRevoked(jti?: string, userId?: string): Promise<boolean> {
    // Tokens antiguos o sin sesión registrada exigen iniciar sesión otra vez.
    if (!jti || !userId) return true;
    const session = await this.prisma.authSession.findUnique({
      where: { jti },
    });
    return (
      !session ||
      session.userId !== userId ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    );
  }
}
