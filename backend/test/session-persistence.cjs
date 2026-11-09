// Build first. Requires SESSION_TEST_DATABASE_URL pointing to a disposable local database.
// Every operation runs in a separate Node process; no in-memory service state is shared.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const url = new URL(process.env.SESSION_TEST_DATABASE_URL || 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/surmed_sessions_test') {
  throw new Error('Only the disposable local surmed_sessions_test database is allowed.');
}
process.env.DATABASE_URL = url.href;

async function worker() {
  require('reflect-metadata');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { TokenRevocationService } = require('../dist/auth/token-revocation.service');
  const { AuthService } = require('../dist/auth/auth.service');
  const { JwtStrategy } = require('../dist/auth/jwt.strategy');
  const { JwtService } = require('@nestjs/jwt');
  const { ConfigService } = require('@nestjs/config');
  const bcrypt = require('bcrypt');
  const prisma = new PrismaService();
  const revocation = new TokenRevocationService(prisma);
  const secret = 'only_synthetic_local_test_secret_for_sessions_2026';
  const jwt = new JwtService({ secret, signOptions: { expiresIn: '8h' } });
  const auth = new AuthService(prisma, jwt, revocation);
  const strategy = new JwtStrategy(prisma, new ConfigService({ JWT_SECRET: secret }), revocation);
  const email = 'session-test@example.invalid';
  await prisma.onModuleInit();
  try {
    const mode = process.argv[3];
    let result;
    if (mode === 'setup') {
      await prisma.user.upsert({ where: { email }, update: {}, create: {
        email, name: 'Synthetic session test', password: await bcrypt.hash('TestPassword2026!', 4), role: 'MEDICO',
      } });
      result = true;
    } else if (mode === 'login') {
      result = (await auth.login({ email, password: 'TestPassword2026!' })).backendToken;
    } else {
      const token = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
      const payload = jwt.verify(token);
      if (mode === 'logout') result = await auth.logout(payload.sub, payload.jti);
      else if (mode === 'all') { await revocation.revokeAllForUser(payload.sub); result = true; }
      else {
        try { await strategy.validate(payload); result = true; }
        catch (e) { if (e.getStatus?.() !== 401) throw e; result = false; }
      }
    }
    process.stdout.write(JSON.stringify(result));
  } finally { await prisma.onModuleDestroy(); }
}

if (process.argv[2] === 'worker') {
  worker().catch(error => { console.error(error.message); process.exitCode = 1; });
} else {
  function operation(mode, token) {
    const child = spawnSync(process.execPath, [__filename, 'worker', mode], {
      env: process.env, encoding: 'utf8', input: JSON.stringify(token ?? null), timeout: 30000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    return JSON.parse(child.stdout);
  }
  operation('setup');
  const a = operation('login');
  const b = operation('login');
  assert.equal(operation('validate', a), true);
  operation('logout', a);
  assert.equal(operation('validate', a), false);
  assert.equal(operation('validate', b), true);
  operation('all', b);
  assert.equal(operation('validate', b), false);
  const fresh = operation('login');
  assert.equal(operation('validate', fresh), true);
  console.log('PASS: PostgreSQL real y procesos separados: login, persistencia, logout selectivo, revocación global y nuevo login.');
}
