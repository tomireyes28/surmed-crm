import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { sessionStore } from '../../test/helpers/session-store';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TokenRevocationService } from './token-revocation.service';
import type { JwtPayload } from './interfaces/auth.interface';

describe('Persistent sessions across service restarts', () => {
  const secret = 'synthetic_test_secret_at_least_32_characters';
  async function fixture() {
    const store = sessionStore();
    const prisma = {
      ...store,
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user',
          email: 'test@example.invalid',
          name: 'Test',
          role: 'MEDICO',
          isActive: true,
          password: await bcrypt.hash('Password2026!', 4),
        }),
      },
    };
    const jwt = new JwtService({ secret, signOptions: { expiresIn: '8h' } });
    const restart = () => {
      const revocation = new TokenRevocationService(prisma as never);
      return {
        revocation,
        auth: new AuthService(prisma as never, jwt, revocation),
        strategy: new JwtStrategy(
          prisma as never,
          new ConfigService({ JWT_SECRET: secret }),
          revocation,
        ),
      };
    };
    const login = (auth: AuthService) =>
      auth.login({ email: 'test@example.invalid', password: 'Password2026!' });
    return { prisma, jwt, restart, login };
  }

  it('preserves an active login and its expiration after recreating services', async () => {
    const f = await fixture();
    const token = await f.login(f.restart().auth);
    const payload = f.jwt.verify<JwtPayload>(token.backendToken);
    expect(await f.restart().strategy.validate(payload)).toMatchObject({
      id: 'user',
    });
    expect(f.prisma.rows.get(payload.jti!)?.expiresAt.getTime()).toBe(
      payload.exp! * 1000,
    );
  });

  it('keeps logout revoked after restart and preserves a different session', async () => {
    const f = await fixture();
    const first = f.restart();
    const a = f.jwt.verify<JwtPayload>(
      (await f.login(first.auth)).backendToken,
    );
    const b = f.jwt.verify<JwtPayload>(
      (await f.login(first.auth)).backendToken,
    );
    await first.auth.logout('user', a.jti);
    const second = f.restart();
    await expect(second.strategy.validate(a)).rejects.toThrow('revocada');
    await expect(second.strategy.validate(b)).resolves.toMatchObject({
      id: 'user',
    });
    await second.auth.logout('user', a.jti); // Repeated revocation is harmless.
  });

  it('persists all-session revocation and permits immediate login after it', async () => {
    const f = await fixture();
    const first = f.restart();
    const old = f.jwt.verify<JwtPayload>(
      (await f.login(first.auth)).backendToken,
    );
    await first.revocation.revokeAllForUser('user');
    const second = f.restart();
    await expect(second.strategy.validate(old)).rejects.toThrow('revocada');
    const fresh = f.jwt.verify<JwtPayload>(
      (await f.login(second.auth)).backendToken,
    );
    await expect(f.restart().strategy.validate(fresh)).resolves.toMatchObject({
      id: 'user',
    });
  });

  it('rejects missing, expired, or mismatched sessions', async () => {
    const f = await fixture();
    const { revocation } = f.restart();
    expect(await revocation.isRevoked(undefined, 'user')).toBe(true);
    expect(await revocation.isRevoked('unknown', 'user')).toBe(true);
    await revocation.registerIssuedToken('user', 'expired', new Date(0));
    expect(await revocation.isRevoked('expired', 'user')).toBe(true);
    await revocation.registerIssuedToken(
      'user',
      'active',
      new Date(Date.now() + 10000),
    );
    expect(await revocation.isRevoked('active', 'someone-else')).toBe(true);
  });

  it('does not report login or logout success when persistence fails', async () => {
    const f = await fixture();
    f.prisma.authSession.create.mockRejectedValueOnce(
      new Error('database down'),
    );
    await expect(f.login(f.restart().auth)).rejects.toThrow('database down');
    f.prisma.authSession.updateMany.mockRejectedValueOnce(
      new Error('database down'),
    );
    await expect(f.restart().auth.logout('user', 'jti')).rejects.toThrow(
      'database down',
    );
    f.prisma.authSession.findUnique.mockRejectedValueOnce(
      new Error('database down'),
    );
    await expect(
      f.restart().revocation.isRevoked('jti', 'user'),
    ).rejects.toThrow('database down');
  });
});
