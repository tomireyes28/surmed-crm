// Starts only the named local test project with prebuilt stage4-check images.
// Explicit ignored env files are prepared by the operator; no public deployment.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const dotenv = require('dotenv');
const { databaseClient, sha256 } = require('../ops/backup-common.cjs');
const root = path.resolve(__dirname, '../..');
const tmp = path.join(root, 'backend/.tmp');
for (const name of ['BACKEND_ENV_FILE', 'FRONTEND_ENV_FILE']) {
  const target = path.resolve(process.env[name] || '');
  if (path.dirname(target) !== tmp)
    throw Error('Explicit ignored backend/.tmp env files required.');
}
if (
  process.env.RELEASE_TAG !== 'stage4-check' ||
  process.env.WEB_PORT !== '55443'
)
  throw Error('Only local stage4-check images and port 55443 are allowed.');
const targetDb = new URL(
  process.env.RESTORE_TEST_DATABASE_URL || 'about:blank',
);
const runtimeDb = new URL(
  dotenv.parse(fs.readFileSync(process.env.BACKEND_ENV_FILE)).DATABASE_URL,
);
if (
  !['127.0.0.1', 'localhost'].includes(targetDb.hostname) ||
  targetDb.pathname !== '/surmed_restore_test' ||
  runtimeDb.hostname !== 'host.docker.internal' ||
  runtimeDb.pathname !== '/surmed_restore_test'
)
  throw Error('Only the local restored synthetic database is allowed.');
const composeArgs = [
  'compose',
  '-p',
  'surmed-stage4-test',
  '-f',
  path.join(root, 'deploy/compose.yml'),
];
function docker(args) {
  return execFileSync('docker', args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}
async function main() {
  let checks = 0;
  const pass = (text) => console.log(`PASS ${++checks}: ${text}`);
  try {
    docker([
      ...composeArgs,
      'up',
      '-d',
      '--no-build',
      '--wait',
      '--wait-timeout',
      '100',
    ]);
    for (const service of ['backend', 'frontend']) {
      const id = docker([...composeArgs, 'ps', '-q', service]);
      const shape = JSON.parse(
        docker(['inspect', '--format', '{{json .HostConfig}}', id]),
      );
      assert.equal(shape.ReadonlyRootfs, true);
      assert.ok(shape.CapDrop.includes('ALL'));
      assert.equal(
        docker(['inspect', '--format', '{{.Config.User}}', id]),
        'node',
      );
      if (service === 'backend') assert.deepEqual(shape.PortBindings, {});
      assert.equal(
        docker([
          'exec',
          id,
          'node',
          '-e',
          "const f=require('node:fs');console.log(f.existsSync('/app/.env')||f.existsSync('/app/.env.local')||f.existsSync('/app/.env.production'))",
        ]),
        'false',
      );
      if (service === 'backend')
        assert.equal(
          docker([
            'exec',
            id,
            'node',
            '-e',
            "fetch('http://127.0.0.1:3000/api/docs').then(r=>console.log(r.status))",
          ]),
          '404',
        );
    }
    pass(
      'production containers healthy, non-root/read-only, secrets excluded, backend unexposed and Swagger disabled',
    );
    const frontend = dotenv.parse(
      fs.readFileSync(process.env.FRONTEND_ENV_FILE),
    );
    const base = 'http://127.0.0.1:55443';
    const request = (endpoint, cookie, body, origin = frontend.APP_ORIGIN) =>
      fetch(`${base}/api/backend/${endpoint}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body
            ? {
                'content-type': 'application/json',
                'x-surmed-request': '1',
                origin,
              }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await request('auth/me')).status, 401);
    assert.equal(
      (await request('auth/login', null, {}, 'https://foreign.invalid')).status,
      403,
    );
    pass(
      'standalone Next serves login and enforces session and mutation origin',
    );
    const access = JSON.parse(
      fs.readFileSync(path.join(tmp, 'staging-access.json')),
    );
    const cookies = {};
    for (const role of ['ADMIN', 'MEDICO', 'RECEPCION']) {
      const person = access.users.find((user) => user.role === role);
      const response = await request('auth/login', null, {
        email: person.email,
        password: person.password,
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).backendToken, undefined);
      const cookie = response.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /Secure/i);
      assert.match(cookie, /SameSite=Strict/i);
      cookies[role] = cookie.split(';')[0];
      assert.equal((await request('auth/me', cookies[role])).status, 200);
    }
    pass(
      'all three roles authenticate through production standalone BFF with secure HttpOnly cookies',
    );
    const db = databaseClient(process.env.RESTORE_TEST_DATABASE_URL);
    await db.connect();
    let attachment;
    try {
      const doctor = access.users.find((user) => user.role === 'MEDICO');
      attachment = (
        await db.query(
          'SELECT a.* FROM medical_attachments a JOIN medical_records r ON r.id=a."medicalRecordId" WHERE NOT a."isRevoked" AND r."doctorId"=$1 LIMIT 1',
          [doctor.id],
        )
      ).rows[0];
    } finally {
      await db.end();
    }
    assert.ok(attachment);
    const response = await request(
      `medical-records/attachments/${attachment.id}/content`,
      cookies.MEDICO,
    );
    assert.equal(response.status, 200);
    assert.equal(
      sha256(Buffer.from(await response.arrayBuffer())),
      attachment.sha256,
    );
    assert.equal(
      (
        await request(
          `medical-records/attachments/${attachment.id}/content`,
          cookies.ADMIN,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `medical-records/attachments/${attachment.id}/content`,
          cookies.RECEPCION,
        )
      ).status,
      403,
    );
    pass(
      'real Supabase attachment crosses standalone BFF with matching hash and clinical permission checks',
    );
    assert.equal(
      (await request('auth/logout', cookies.MEDICO, {})).status,
      200,
    );
    assert.equal((await request('auth/me', cookies.MEDICO)).status, 401);
    pass('confirmed production-container logout invalidates copied cookie');
    fs.writeFileSync(
      path.join(
        root,
        'docs/auditoria-2026-11-09/evidencia/etapa-4-contenedores.json',
      ),
      JSON.stringify(
        {
          date: new Date().toISOString().slice(0, 10),
          checksPassed: checks,
          backendImageId: docker([
            'image',
            'inspect',
            '--format',
            '{{.Id}}',
            'surmed-backend:stage4-check',
          ]),
          frontendImageId: docker([
            'image',
            'inspect',
            '--format',
            '{{.Id}}',
            'surmed-frontend:stage4-check',
          ]),
          environment:
            'local Docker Compose; restored synthetic PostgreSQL; real test Storage',
          publicDeployment: false,
          tlsAndPilotValidated: false,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    docker([...composeArgs, 'down', '--remove-orphans']);
  }
}
main().catch((error) => {
  console.error(error.code || error.message.split('\n')[0]);
  process.exitCode = 1;
});
