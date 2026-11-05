import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface AttemptBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class LoginRateLimitService {
  private readonly attempts = new Map<string, AttemptBucket>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutos

  private buildKeys(email: string, ip?: string): string[] {
    const normalizedEmail = email.trim().toLowerCase();
    const keys = [`email:${normalizedEmail}`];
    if (ip) {
      keys.push(`ip:${ip}:${normalizedEmail}`);
    }
    return keys;
  }

  assertAllowed(email: string, ip?: string): void {
    const now = Date.now();
    for (const key of this.buildKeys(email, ip)) {
      const bucket = this.attempts.get(key);
      if (!bucket) continue;

      if (bucket.resetAt <= now) {
        this.attempts.delete(key);
        continue;
      }

      if (bucket.count >= this.maxAttempts) {
        throw new HttpException(
          'Demasiados intentos fallidos de inicio de sesión. Intente nuevamente más tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  recordFailure(email: string, ip?: string): void {
    const now = Date.now();
    for (const key of this.buildKeys(email, ip)) {
      const existing = this.attempts.get(key);
      if (!existing || existing.resetAt <= now) {
        this.attempts.set(key, {
          count: 1,
          resetAt: now + this.windowMs,
        });
      } else {
        existing.count += 1;
      }
    }
  }

  reset(email: string, ip?: string): void {
    for (const key of this.buildKeys(email, ip)) {
      this.attempts.delete(key);
    }
  }
}
