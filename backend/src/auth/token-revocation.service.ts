import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenRevocationService {
  private readonly revokedJtis = new Map<string, number>();
  private readonly userRevokedBeforeSec = new Map<string, number>();
  private readonly postRevocationAllowedJtis = new Map<string, Set<string>>();

  /**
   * Registra un JTI recién emitido tras un login válido para evitar falsos positivos
   * cuando un usuario cambia su contraseña o es reactivado y vuelve a iniciar sesión
   * dentro del mismo segundo UNIX (`iat`).
   */
  registerIssuedToken(userId: string, jti: string): void {
    if (!userId || !jti) return;
    let allowedSet = this.postRevocationAllowedJtis.get(userId);
    if (!allowedSet) {
      allowedSet = new Set<string>();
      this.postRevocationAllowedJtis.set(userId, allowedSet);
    }
    allowedSet.add(jti);
  }

  revokeToken(jti?: string, ttlSeconds: number = 86400): void {
    if (!jti) return;
    this.cleanupExpired();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.revokedJtis.set(jti, expiresAt);
    for (const allowedSet of this.postRevocationAllowedJtis.values()) {
      allowedSet.delete(jti);
    }
  }

  revokeAllForUser(userId: string): void {
    if (!userId) return;
    // Guardamos el instante actual en segundos e invalidamos cualquier JTI previo de ese usuario
    this.userRevokedBeforeSec.set(userId, Math.floor(Date.now() / 1000));
    this.postRevocationAllowedJtis.delete(userId);
  }

  isRevoked(jti?: string, userId?: string, issuedAtSec?: number): boolean {
    this.cleanupExpired();

    if (jti && this.revokedJtis.has(jti)) {
      return true;
    }

    if (userId && jti && this.postRevocationAllowedJtis.get(userId)?.has(jti)) {
      return false;
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
