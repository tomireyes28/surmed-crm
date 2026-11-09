// Real remote integration. Creates synthetic data, never resets existing data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { loadStaging, tables } = require('./staging-env.cjs');
const ctx = loadStaging();
Object.assign(process.env, ctx.env, {
  NODE_ENV: 'test',
  DATABASE_URL: ctx.env.DATABASE_URL,
});
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/setup-app');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { StorageService } = require('../dist/storage/storage.service');
const {
  MedicalRecordsService,
} = require('../dist/medical-records/medical-records.service');
const {
  TokenRevocationService,
} = require('../dist/auth/token-revocation.service');
const bcrypt = require('bcrypt');

async function main() {
  const adminDb = ctx.client(ctx.migrationUrl);
  await adminDb.connect();
  let app, next;
  let checks = 0;
  const pass = (message) => console.log(`PASS ${++checks}: ${message}`);
  const tag = randomUUID().slice(0, 8);
  const credentials = [];
  const freshPassword = () =>
    `Staging!${randomBytes(18).toString('base64url')}`;
  try {
    const schema = await adminDb.query(
      "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    assert.deepEqual(
      schema.rows.map((row) => row.tablename).sort(),
      [...tables].sort(),
    );
    assert.ok(schema.rows.every((row) => row.rowsecurity));
    const migrations = await adminDb.query(
      'SELECT count(*)::int AS count FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    assert.equal(
      migrations.rows[0].count,
      fs
        .readdirSync(path.join(ctx.root, 'prisma/migrations'), {
          withFileTypes: true,
        })
        .filter((entry) => entry.isDirectory()).length,
    );
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(
        (
          await adminDb.query(
            "SELECT has_schema_privilege($1,'public','CREATE') AS allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
      for (const table of tables) {
        const allowed = await adminDb.query(
          'SELECT has_table_privilege($1, $2, $3) AS allowed',
          [
            role,
            `public."${table}"`,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER',
          ],
        );
        assert.equal(
          allowed.rows[0].allowed,
          false,
          `${role} has privileges on ${table}`,
        );
      }
    }
    const rest = await fetch(
      `${ctx.env.SUPABASE_URL}/rest/v1/users?select=id&limit=1`,
      {
        headers: {
          apikey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${ctx.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    assert.ok(
      [401, 403, 404].includes(rest.status),
      'Storage service key must not read app users through Data API',
    );
    pass(
      'all migrations applied; RLS/private grants and Data API denial even for the Storage service key',
    );
    const role = (
      await adminDb.query(
        "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='surmed_app'",
      )
    ).rows[0];
    assert.ok(Object.values(role).every((value) => value === false));
    const runtime = ctx.client(ctx.env.DATABASE_URL);
    await runtime.connect();
    try {
      assert.equal(
        (await runtime.query('SELECT current_user')).rows[0].current_user,
        'surmed_app',
      );
      await runtime.query('SELECT count(*) FROM public.users');
      for (const sql of [
        'UPDATE public.audit_logs SET reason=reason WHERE false',
        'DELETE FROM public.audit_logs WHERE false',
        'TRUNCATE public.audit_logs',
        'SELECT * FROM public._prisma_migrations',
        'ALTER TABLE public.users ADD COLUMN surmed_forbidden_test text',
      ]) {
        await runtime.query('BEGIN');
        await assert.rejects(
          runtime.query(sql),
          (error) => error.code === '42501',
        );
        await runtime.query('ROLLBACK');
      }
    } finally {
      await runtime.end();
    }
    pass(
      'runtime is non-administrative surmed_app; audit mutation, migration history and DDL denied',
    );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const backend = await app.getUrl();
    const db = app.get(PrismaService),
      storage = app.get(StorageService);
    async function request(endpoint, method = 'GET', body, token, key) {
      const headers = {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
      };
      if (body && !(body instanceof FormData))
        headers['content-type'] = 'application/json';
      return fetch(`${backend}/${endpoint}`, {
        method,
        headers,
        body: body
          ? body instanceof FormData
            ? body
            : JSON.stringify(body)
          : undefined,
        signal: AbortSignal.timeout(30000),
      });
    }
    async function expect(endpoint, status, method = 'GET', body, token, key) {
      const response = await request(endpoint, method, body, token, key);
      assert.equal(
        response.status,
        status,
        `${endpoint}: ${await response.clone().text()}`,
      );
      return response;
    }
    async function login(actor, password = actor.password) {
      const response = await expect('auth/login', 200, 'POST', {
        email: actor.email,
        password,
      });
      return (await response.json()).backendToken;
    }
    const admin = {
      email: `admin.staging.${tag}@example.invalid`,
      password: freshPassword(),
    };
    const adminUser = await db.user.create({
      data: {
        email: admin.email,
        password: await bcrypt.hash(admin.password, 10),
        name: 'ADMIN - PRUEBA SUPABASE',
        role: 'ADMIN',
      },
    });
    admin.id = adminUser.id;
    credentials.push({ ...admin, role: 'ADMIN' });
    const a = await login(admin);
    const specialty = await (
      await expect(
        'specialties',
        201,
        'POST',
        { name: `Clínica de prueba ${tag}` },
        a,
      )
    ).json();
    async function actor(key, role) {
      const person = {
        email: `${key}.staging.${tag}@example.invalid`,
        password: freshPassword(),
      };
      const created = await (
        await expect(
          'users',
          201,
          'POST',
          {
            ...person,
            name: `${key.toUpperCase()} - PRUEBA SUPABASE`,
            role,
            ...(role === 'MEDICO' ? { specialtyId: specialty.id } : {}),
          },
          a,
        )
      ).json();
      person.id = created.id;
      credentials.push({ ...person, role });
      return person;
    }
    await actor('admin-respaldo', 'ADMIN');
    const doctor = await actor('medico', 'MEDICO'),
      doctor2 = await actor('medico-sin-asignacion', 'MEDICO'),
      reception = await actor('recepcion', 'RECEPCION');
    let d = await login(doctor);
    const d2 = await login(doctor2),
      r = await login(reception);
    await expect('auth/login', 401, 'POST', {
      email: doctor.email,
      password: 'IncorrectSynthetic!',
    });
    assert.equal(
      (await (await expect('auth/me', 200, 'GET', undefined, d)).json()).role,
      'MEDICO',
    );
    await expect('health/ready', 200);
    pass(
      'real Nest bootstraps with limited DB role; ADMIN provisions users and all three roles log in',
    );
    const patient = await (
      await expect(
        'patients',
        201,
        'POST',
        {
          documentId: `STAGING-${tag}`,
          firstName: 'Paciente sintético',
          lastName: 'SUPABASE REAL - PRUEBA',
          birthDate: '2000-02-29',
          email: '',
        },
        r,
      )
    ).json();
    assert.equal(patient.birthDate, '2000-02-29T12:00:00.000Z');
    assert.equal(patient.email, null);
    const unrelated = await (
      await expect(
        'patients',
        201,
        'POST',
        {
          documentId: `SIN-ACCESO-${tag}`,
          firstName: 'Sin asignación',
          lastName: 'PRUEBA',
          birthDate: '1990-01-01',
        },
        r,
      )
    ).json();
    const clinical = `medical-records/patient/${patient.id}/page`;
    for (const token of [a, r, d, d2])
      await expect(clinical, 403, 'GET', undefined, token);
    await expect(
      'medical-records/access/grant',
      201,
      'POST',
      {
        patientId: patient.id,
        doctorId: doctor.id,
        reason: 'Asignación sintética para integración real',
      },
      a,
    );
    await expect(clinical, 200, 'GET', undefined, d);
    await expect(
      `medical-records/patient/${unrelated.id}/page`,
      403,
      'GET',
      undefined,
      d,
    );
    pass(
      'patient dates persist; administrative/clinical separation and patient relationship enforced',
    );
    const form = (name, bytes, mime = 'application/pdf') => {
      const f = new FormData();
      f.append('patientId', patient.id);
      f.append(
        'notes',
        'PRUEBA SINTÉTICA DE SUPABASE. Sin información clínica real.',
      );
      f.append('file', new Blob([bytes], { type: mime }), name);
      return f;
    };
    const objectCount = async () =>
      (
        await adminDb.query(
          "SELECT count(*)::int AS count FROM storage.objects WHERE bucket_id='medical-records'",
        )
      ).rows[0].count;
    const beforeInvalid = await objectCount();
    await expect(
      'medical-records',
      400,
      'POST',
      form('falso.pdf', Buffer.from('MZ-SYNTHETIC')),
      d,
    );
    await expect(
      'medical-records',
      413,
      'POST',
      form('demasiado.pdf', Buffer.alloc(10 * 1024 * 1024 + 1)),
      d,
    );
    assert.equal(await objectCount(), beforeInvalid);
    const { jsPDF } = require('../../frontend/node_modules/jspdf');
    const pdf = new jsPDF();
    pdf.text('PRUEBA SINTETICA - SURMED - SIN DATOS REALES', 14, 20);
    const bytes = Buffer.from(pdf.output('arraybuffer'));
    const record = await (
      await expect(
        'medical-records',
        201,
        'POST',
        form('prueba-supabase.pdf', bytes),
        d,
      )
    ).json();
    const history = await (
      await expect(clinical, 200, 'GET', undefined, d)
    ).json();
    const fileId = history.data.find((row) => row.id === record.id)
      .attachmentFiles[0].id;
    const download = await expect(
      `medical-records/attachments/${fileId}/content`,
      200,
      'GET',
      undefined,
      d,
    );
    assert.equal(
      createHash('sha256')
        .update(Buffer.from(await download.arrayBuffer()))
        .digest('hex'),
      createHash('sha256').update(bytes).digest('hex'),
    );
    await expect(
      `medical-records/attachments/${fileId}/content`,
      403,
      'GET',
      undefined,
      a,
    );
    await expect(
      `medical-records/attachments/${fileId}/content`,
      403,
      'GET',
      undefined,
      r,
    );
    await expect(
      `medical-records/attachments/${fileId}/content`,
      403,
      'GET',
      undefined,
      d2,
    );
    pass(
      'invalid/oversized files rejected; PDF uploaded and retrieved byte-identically from real Storage',
    );
    const metadata = await db.medicalAttachment.findUniqueOrThrow({
      where: { id: fileId },
    });
    const direct = await fetch(
      ctx.storage.storage
        .from('medical-records')
        .getPublicUrl(metadata.storagePath).data.publicUrl,
    );
    assert.notEqual(direct.status, 200);
    for (const roleName of ['anon', 'authenticated']) {
      await adminDb.query('BEGIN');
      try {
        await adminDb.query(`SET LOCAL ROLE ${roleName}`);
        await assert.rejects(
          adminDb.query('SELECT id FROM public.users LIMIT 1'),
          (error) => error.code === '42501',
        );
      } finally {
        await adminDb.query('ROLLBACK');
      }
      await adminDb.query('BEGIN');
      try {
        await adminDb.query(`SET LOCAL ROLE ${roleName}`);
        const rows = await adminDb.query(
          "SELECT id FROM storage.objects WHERE bucket_id='medical-records'",
        );
        assert.equal(rows.rowCount, 0);
      } finally {
        await adminDb.query('ROLLBACK');
      }
    }
    pass(
      'public object URL fails; anon/authenticated cannot read user tables or clinical Storage rows',
    );
    await expect(
      `medical-records/attachments/${fileId}/revoke`,
      201,
      'POST',
      { reason: 'Revocación sintética de archivo de prueba' },
      d,
    );
    await expect(
      `medical-records/attachments/${fileId}/content`,
      403,
      'GET',
      undefined,
      d,
    );
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
      'base64',
    );
    const imageRecord = await (
      await expect(
        'medical-records',
        201,
        'POST',
        form('imagen-sintetica.png', png, 'image/png'),
        d,
      )
    ).json();
    await expect(
      `medical-records/${record.id}/addendum`,
      201,
      'POST',
      {
        notes: 'ADENDA SINTÉTICA: el texto original se conserva.',
        reason: 'Prueba real de adenda',
      },
      d,
    );
    const reread = await (
      await expect(clinical, 200, 'GET', undefined, d)
    ).json();
    assert.deepEqual(
      reread.data.find((row) => row.id === record.id).attachments,
      [],
    );
    const imageId = reread.data.find((row) => row.id === imageRecord.id)
      .attachmentFiles[0].id;
    assert.deepEqual(
      Buffer.from(
        await (
          await expect(
            `medical-records/attachments/${imageId}/content`,
            200,
            'GET',
            undefined,
            d,
          )
        ).arrayBuffer(),
      ),
      png,
    );
    pass(
      'revocation immediately rejects reused application URL; real PNG and immutable addendum work',
    );
    const beforeCompensation = await objectCount();
    const beforeRecords = await db.medicalRecord.count();
    const failAudit = {
      record: async () => {
        throw Error('synthetic audit failure');
      },
    };
    await assert.rejects(
      new MedicalRecordsService(db, storage, failAudit).create(
        { patientId: patient.id, notes: 'PRUEBA DE ROLLBACK REAL' },
        doctor.id,
        {
          buffer: bytes,
          size: bytes.length,
          originalname: 'rollback.pdf',
          mimetype: 'application/pdf',
        },
        'MEDICO',
      ),
      /synthetic audit failure/,
    );
    assert.equal(await objectCount(), beforeCompensation);
    assert.equal(await db.medicalRecord.count(), beforeRecords);
    pass(
      'real Storage upload is compensated when PostgreSQL/audit transaction rolls back',
    );
    const product = await (
      await expect(
        'inventory/products',
        201,
        'POST',
        {
          name: `Insumo sintético ${tag}`,
          minStock: 2,
          category: 'INSUMO_MEDICO',
          price: 12500,
        },
        r,
      )
    ).json();
    const incoming = {
        productId: product.id,
        type: 'IN',
        quantity: 5,
        notes: 'Apertura sintética',
      },
      moveKey = randomUUID();
    const first = await (
      await expect('inventory/movements', 201, 'POST', incoming, r, moveKey)
    ).json();
    const replay = await (
      await expect('inventory/movements', 201, 'POST', incoming, r, moveKey)
    ).json();
    assert.equal(first.movement.id, replay.movement.id);
    const races = await Promise.all([
      request(
        'inventory/movements',
        'POST',
        { productId: product.id, type: 'OUT', quantity: 4 },
        r,
      ),
      request(
        'inventory/movements',
        'POST',
        { productId: product.id, type: 'OUT', quantity: 4 },
        r,
      ),
    ]);
    assert.equal(races.filter((response) => response.status === 201).length, 1);
    assert.equal(
      (
        await (
          await expect(
            `inventory/products/${product.id}`,
            200,
            'GET',
            undefined,
            r,
          )
        ).json()
      ).quantity,
      1,
    );
    await expect('inventory/products/page', 403, 'GET', undefined, d);
    pass(
      'stock and idempotency work with real concurrent transactions through restricted runtime role',
    );
    const statsBefore = await (
      await expect('dashboard-stats/kpis', 200, 'GET', undefined, a)
    ).json();
    const invoiceDto = {
        patientId: patient.id,
        items: [
          {
            description: 'Consulta SINTÉTICA',
            quantity: 1,
            unitPrice: 250000.5,
          },
        ],
      },
      invoiceKey = randomUUID();
    const invoice = await (
      await expect('invoices', 201, 'POST', invoiceDto, r, invoiceKey)
    ).json();
    assert.equal(
      (
        await (
          await expect('invoices', 201, 'POST', invoiceDto, r, invoiceKey)
        ).json()
      ).id,
      invoice.id,
    );
    await expect(`invoices/${invoice.id}/pay`, 200, 'PATCH', {}, r);
    await expect(
      `invoices/${invoice.id}/cancel`,
      409,
      'PATCH',
      { reason: 'No anular un pago' },
      a,
    );
    const pending = await (
      await expect('invoices', 201, 'POST', invoiceDto, r)
    ).json();
    await expect(
      `invoices/${pending.id}/cancel`,
      200,
      'PATCH',
      { reason: 'Anulación sintética de pendiente' },
      a,
    );
    const stats = await (
      await expect('dashboard-stats/kpis', 200, 'GET', undefined, a)
    ).json();
    assert.equal(stats.monthlyRevenue, statsBefore.monthlyRevenue + 250000.5);
    assert.equal(stats.monthlyPending, statsBefore.monthlyPending);
    assert.equal(
      (
        await (
          await expect('dashboard-stats/kpis', 200, 'GET', undefined, r)
        ).json()
      ).monthlyRevenue,
      null,
    );
    pass(
      'invoice replay, payment/cancellation and collection indicators work on real Supabase',
    );
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(13, 0, 0, 0);
    const appointment = {
        patientId: patient.id,
        doctorId: doctor2.id,
        specialtyId: specialty.id,
        date: tomorrow.toISOString(),
        duration: 30,
      },
      appointmentKey = randomUUID();
    const turn = await (
      await expect('appointments', 201, 'POST', appointment, r, appointmentKey)
    ).json();
    assert.equal(
      (
        await (
          await expect(
            'appointments',
            201,
            'POST',
            appointment,
            r,
            appointmentKey,
          )
        ).json()
      ).id,
      turn.id,
    );
    await expect(
      'appointments',
      409,
      'POST',
      { ...appointment, patientId: unrelated.id },
      r,
    );
    await expect(clinical, 200, 'GET', undefined, d2);
    await expect(
      'medical-records/access/revoke',
      201,
      'POST',
      {
        patientId: patient.id,
        doctorId: doctor2.id,
        reason: 'Revocación sintética prevalece sobre turnos',
      },
      a,
    );
    await expect(clinical, 403, 'GET', undefined, d2);
    await expect(
      `appointments/${turn.id}/status`,
      200,
      'PATCH',
      { status: 'CONFIRMED' },
      r,
    );
    await expect(
      `appointments/${turn.id}/status`,
      200,
      'PATCH',
      { status: 'ATTENDED' },
      r,
    );
    pass(
      'appointment conflicts, replay, transitions and explicit clinical revocation work',
    );
    await expect(
      'auth/recovery/issue',
      403,
      'POST',
      { userId: doctor.id, reason: 'Identidad sintética verificada' },
      r,
    );
    const recovery = await (
      await expect(
        'auth/recovery/issue',
        201,
        'POST',
        {
          userId: doctor.id,
          reason: 'Identidad sintética verificada por ADMIN',
        },
        a,
      )
    ).json();
    const newPassword = freshPassword();
    await expect('auth/recovery/redeem', 201, 'POST', {
      token: recovery.token,
      newPassword,
    });
    await expect('auth/recovery/redeem', 400, 'POST', {
      token: recovery.token,
      newPassword,
    });
    await expect('auth/me', 401, 'GET', undefined, d);
    doctor.password = newPassword;
    credentials.find((person) => person.id === doctor.id).password =
      newPassword;
    d = await login(doctor);
    await expect('auth/logout', 200, 'POST', {}, d);
    const jti = JSON.parse(Buffer.from(d.split('.')[1], 'base64url')).jti;
    assert.equal(
      await new TokenRevocationService(db).isRevoked(jti, doctor.id),
      true,
    );
    await expect('auth/me', 401, 'GET', undefined, d);
    const idle = await login(doctor);
    const idleJti = JSON.parse(
      Buffer.from(idle.split('.')[1], 'base64url'),
    ).jti;
    await db.authSession.update({
      where: { jti: idleJti },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60000) },
    });
    await expect('auth/me', 401, 'GET', undefined, idle);
    pass(
      'one-use recovery, old-session invalidation, persistent logout and backend inactivity work',
    );
    await expect(`users/${doctor2.id}`, 200, 'DELETE', undefined, a);
    await expect('auth/me', 401, 'GET', undefined, d2);
    await expect(`users/${doctor2.id}/reactivate`, 200, 'PATCH', {}, a);
    await login(doctor2);
    const audit = await (
      await expect(
        `audit-logs?patientId=${patient.id}&limit=100`,
        200,
        'GET',
        undefined,
        a,
      )
    ).json();
    const actions = audit.data.map((row) => row.action);
    assert.ok(actions.includes('MEDICAL_ATTACHMENT_READ'));
    assert.ok(actions.includes('MEDICAL_RECORD_CREATE'));
    assert.equal(
      JSON.stringify(audit).includes('Sin información clínica real.'),
      false,
    );
    pass(
      'deactivation/re-activation revokes old sessions; clinical audit stays redacted and append-only',
    );
    if (process.env.TEST_BFF === '1') {
      const origin = 'http://127.0.0.1:55602';
      let log = '';
      next = spawn(
        process.execPath,
        [
          path.resolve(ctx.root, '../frontend/node_modules/next/dist/bin/next'),
          'start',
          '-p',
          '55602',
          '-H',
          '127.0.0.1',
        ],
        {
          cwd: path.resolve(ctx.root, '../frontend'),
          windowsHide: true,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            API_URL: backend,
            APP_ORIGIN: origin,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      next.stdout.on('data', (data) => {
        log = (log + data).slice(-2000);
      });
      next.stderr.on('data', (data) => {
        log = (log + data).slice(-2000);
      });
      let ready = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        try {
          await fetch(origin);
          ready = true;
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      assert.equal(ready, true, log);
      const webLogin = await fetch(`${origin}/api/backend/auth/login`, {
        method: 'POST',
        headers: {
          origin,
          'x-surmed-request': '1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: doctor.email,
          password: doctor.password,
        }),
      });
      assert.equal(webLogin.status, 200);
      assert.equal('backendToken' in (await webLogin.json()), false);
      const rawCookie = webLogin.headers
        .getSetCookie()
        .find((value) => value.startsWith('surmed-session='));
      assert.match(rawCookie, /HttpOnly/);
      assert.match(rawCookie, /Secure/);
      assert.match(rawCookie, /SameSite=strict/i);
      const cookie = rawCookie.split(';')[0];
      const image = await fetch(
        `${origin}/api/backend/medical-records/attachments/${imageId}/content`,
        { headers: { cookie } },
      );
      assert.equal(image.status, 200);
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
      const webLogout = await fetch(`${origin}/api/backend/auth/logout`, {
        method: 'POST',
        headers: { cookie, origin, 'x-surmed-request': '1' },
      });
      assert.equal(webLogout.status, 200);
      assert.equal(
        (await fetch(`${origin}/api/backend/auth/me`, { headers: { cookie } }))
          .status,
        401,
      );
      pass(
        'production Next BFF authenticates via HttpOnly cookie and serves real Supabase attachment',
      );
    }
    const tmp = path.join(ctx.root, '.tmp');
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'staging-access.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          purpose: 'Synthetic staging only',
          users: credentials,
          patientId: patient.id,
          unrelatedPatientId: unrelated.id,
          productId: product.id,
          invoiceId: invoice.id,
          appointmentId: turn.id,
        },
        null,
        2,
      ),
    );
    console.log(
      `\n${checks} real Supabase checks passed. Synthetic access saved in ignored backend/.tmp/staging-access.json (no passwords logged).`,
    );
  } finally {
    if (next) {
      next.kill();
      await new Promise((resolve) => {
        next.once('exit', resolve);
        setTimeout(resolve, 5000);
      });
    }
    if (app) await app.close();
    await adminDb.end();
  }
}
main().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
