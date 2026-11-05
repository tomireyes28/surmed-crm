import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenRevocationService {
  private readonly revokedJtis = new Map<string, number>();
  private readonly userRevokedBeforeSec = new Map<string, number>();

  revokeToken(jti?: string, ttlSeconds: number = 86400): void {
    if (!jti) return;
    this.cleanupExpired();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.revokedJtis.set(jti, expiresAt);
  }

  revokeAllForUser(userId: string): void {
    if (!userId) return;
    // Guardamos el instante actual en segundos para invalidar tokens emitidos antes o en este segundo
    this.userRevokedBeforeSec.set(userId, Math.floor(Date.now() / 1000));
  }

  isRevoked(jti?: string, userId?: string, issuedAtSec?: number): boolean {
    this.cleanupExpired();

    if (jti && this.revokedJtis.has(jti)) {
      return true;
    }

    if (userId && issuedAtSec !== undefined) {
      const revokedBefore = this.userRevokedBeforeSec.get(userId);
      if (revokedBefore !== undefined && issuedAtSec <= revokedBefore) {
        return true;
      }
    }

    return false;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [jti, expiresAt] of this.revokedJtis.entries()) {
      if (expiresAt <= now) {
        this.revokedJtis.delete(jti);
      }
    }
  }
}
