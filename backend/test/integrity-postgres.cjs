// Uses real PostgreSQL with two independent Prisma pools. Never loads .env.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.INTEGRITY_TEST_DATABASE_URL || 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/surmed_integrity_test') throw Error('Only disposable local surmed_integrity_test is allowed.');
process.env.DATABASE_URL = url.href;
require('reflect-metadata');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { AppointmentsService } = require('../dist/appointments/appointments.service');
const { InventoryService } = require('../dist/inventory/inventory.service');
const { InvoicesService } = require('../dist/invoices/invoices.service');
const { MedicalRecordsService } = require('../dist/medical-records/medical-records.service');
const { DashboardService } = require('../dist/dashboard/dashboard.service');
const { AuditService } = require('../dist/audit/audit.service');
const { UsersService } = require('../dist/users/users.service');
const { AuthService } = require('../dist/auth/auth.service');
const { TokenRevocationService } = require('../dist/auth/token-revocation.service');
const { JwtService } = require('@nestjs/jwt');
const { getClinicMonthBounds, getClinicDateParts } = require('../dist/common/utils/timezone.util');
const bcrypt = require('bcrypt');

async function main() {
  const db = new PrismaService();
  const db2 = new PrismaService();
  await Promise.all([db.onModuleInit(), db2.onModuleInit()]);
  let checks = 0;
  const check = name => { checks++; console.log(`PASS ${checks}: ${name}`); };
  const conflict = promise => assert.rejects(promise, e => e.getStatus?.() === 409);
  async function oneWinner(tasks) {
    const results = await Promise.allSettled(tasks);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, tasks.length - 1);
    return results.find(r => r.status === 'fulfilled').value;
  }
  try {
    // This script explicitly owns this guarded disposable database.
    await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "users", "patients", "products", "specialties" CASCADE');
    const spec = await db.specialty.create({ data: { name: `Synthetic-${randomUUID()}` } });
    const password = await bcrypt.hash('SyntheticPass2026!', 4);
    const user = role => db.user.create({ data: { email: `${randomUUID()}@example.invalid`, password, name: 'Synthetic', role,
      ...(role === 'MEDICO' ? { specialties: { connect: { id: spec.id } } } : {}),
    } });
    const d1 = await user('MEDICO'), d2 = await user('MEDICO'), admin = await user('ADMIN'), admin2 = await user('ADMIN');
    const patient = () => db.patient.create({ data: { documentId: randomUUID(), firstName: 'Synthetic', lastName: 'Test', birthDate: new Date('1990-01-01T12:00:00Z') } });
    const p1 = await patient(), p2 = await patient();
    const a1 = new AppointmentsService(db), a2 = new AppointmentsService(db2);
    const base = { patientId: p1.id, doctorId: d1.id, specialtyId: spec.id, date: '2030-01-10T10:00:00-03:00', duration: 30 };
    await oneWinner([a1.create(base, undefined, admin.id), a2.create({ ...base, patientId: p2.id }, undefined, admin.id)]);
    await a1.create({ ...base, date: '2030-01-10T10:30:00-03:00' }, undefined, admin.id);
    check('same doctor concurrent overlap rejected; adjacent interval accepted');
    await oneWinner([a1.create({ ...base, date: '2030-01-11T10:00:00-03:00' }), a2.create({ ...base, doctorId: d2.id, date: '2030-01-11T10:00:00-03:00' })]);
    check('same patient with different doctors cannot double-book');
    const key = randomUUID();
    const dto = { ...base, date: '2030-01-12T10:00:00-03:00' };
    const replay = await Promise.all([a1.create(dto, key, admin.id), a2.create(dto, key, admin.id)]);
    assert.equal(replay[0].id, replay[1].id);
    await conflict(a1.create({ ...dto, duration: 45 }, key, admin.id));
    await conflict(a1.create(dto, key, admin2.id));
    check('appointment replay concurrent, content and actor isolation');
    await a1.updateStatus(replay[0].id, 'CONFIRMED');
    await oneWinner([a1.updateStatus(replay[0].id, 'ATTENDED'), a2.updateStatus(replay[0].id, 'CANCELLED')]);
    check('terminal appointment transitions cannot overwrite each other');

    const product = await db.product.create({ data: { name: 'Synthetic', quantity: 5 } });
    const i1 = new InventoryService(db), i2 = new InventoryService(db2);
    const movement = { productId: product.id, type: 'OUT', quantity: 4 };
    await oneWinner([i1.registerMovement(movement, admin.id), i2.registerMovement(movement, admin.id)]);
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).quantity, 1);
    check('stock 5 and concurrent OUT 4 commits one movement, final stock 1');
    const moveKey = randomUUID();
    const incoming = { productId: product.id, type: 'IN', quantity: 3 };
    const moves = await Promise.all([i1.registerMovement(incoming, admin.id, moveKey), i2.registerMovement(incoming, admin.id, moveKey)]);
    assert.equal(moves[0].movement.id, moves[1].movement.id);
    await conflict(i1.registerMovement({ ...incoming, quantity: 2 }, admin.id, moveKey));
    await conflict(i1.registerMovement(incoming, admin2.id, moveKey));
    check('movement replay does not duplicate stock; mismatched actor/content conflicts');

    const f1 = new InvoicesService(db), f2 = new InvoicesService(db2);
    const invoice = { patientId: p1.id, items: [{ description: 'Synthetic consultation', quantity: 1, unitPrice: 250 }] };
    const invoiceKey = randomUUID();
    const invoices = await Promise.all([f1.create(invoice, admin.id, invoiceKey), f2.create(invoice, admin.id, invoiceKey)]);
    assert.equal(invoices[0].id, invoices[1].id);
    await conflict(f1.create({ ...invoice, patientId: p2.id }, admin.id, invoiceKey));
    await conflict(f1.create(invoice, admin2.id, invoiceKey));
    check('invoice replay is atomic and validates patient/actor');
    const pending = invoices[0];
    await oneWinner([f1.payInvoice(pending.id, admin.id), f2.cancelInvoice(pending.id, admin2.id, 'Synthetic cancellation')]);
    assert.equal(await db.auditLog.count({ where: { resourceId: pending.id, action: { in: ['INVOICE_PAY', 'INVOICE_CANCEL'] } } }), 1);
    check('payment and cancellation race commits one terminal operation with one audit');
    const failAudit = { record: async () => { throw Error('injected audit failure'); } };
    const debt = await f1.create(invoice, admin.id);
    await assert.rejects(new InvoicesService(db, failAudit).payInvoice(debt.id, admin.id), /audit failure/);
    assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: debt.id } })).status, 'PENDING');
    check('audit failure rolls back payment');
    const paid = await f1.create({ ...invoice, payNow: true }, admin.id);
    assert.equal(await db.auditLog.count({ where: { resourceId: paid.id, action: 'INVOICE_PAY' } }), 1);
    await conflict(f1.cancelInvoice(paid.id, admin.id));
    check('immediate payment audited; paid invoice cannot be erased as pending debt');
    const { year, month } = getClinicDateParts();
    const { start } = getClinicMonthBounds(year, month);
    await db.invoice.update({ where: { id: debt.id }, data: { createdAt: new Date(start.getTime() - 86400000) } });
    const dashboard = new DashboardService(db);
    const before = await dashboard.getStats('ADMIN');
    await f1.payInvoice(debt.id, admin.id);
    const after = await dashboard.getStats('ADMIN');
    assert.equal(after.monthlyRevenue, before.monthlyRevenue + 250);
    assert.equal(after.monthlyIssued, before.monthlyIssued);
    assert.equal(after.monthlyPending, before.monthlyPending - 250);
    check('old debt collected this month increases paidAt KPI, not current-month issued');
    await assert.rejects(f1.create({ ...invoice, items: [{ description: 'Too large', quantity: 10000, unitPrice: 999999999.99 }] }, admin.id), e => e.getStatus?.() === 400);
    check('oversized subtotal rejected before database write');

    const objects = new Set();
    const storage = {
      uploadValidatedFile: async () => { const storagePath = `${randomUUID()}.pdf`; objects.add(storagePath); return { storagePath, originalName: 'synthetic.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'synthetic', scanStatus: 'CLEAN_MAGIC_VERIFIED' }; },
      removeFile: async path => { objects.delete(path); },
    };
    const note = { patientId: p1.id, notes: 'Synthetic clinical record' };
    const countBefore = await db.medicalRecord.count();
    await assert.rejects(new MedicalRecordsService(db, storage, failAudit).create(note, d1.id, {}), /audit failure/);
    assert.equal(await db.medicalRecord.count(), countBefore);
    assert.equal(objects.size, 0);
    check('clinical audit failure rolls back history and metadata and compensates upload');
    const clinical = new MedicalRecordsService(db, storage);
    await assert.rejects(clinical.create(note, randomUUID(), {}), e => e.code === 'P2003');
    assert.equal(objects.size, 0);
    check('real foreign-key failure rolls back history and compensates upload');
    const created = await clinical.create(note, d1.id, {});
    assert.equal(objects.size, 1);
    assert.equal(await db.auditLog.count({ where: { resourceId: created.id } }), 1);
    await assert.rejects(new MedicalRecordsService(db, storage, failAudit).createAddendum(created.id, { notes: 'Synthetic addendum' }, d1.id), /audit failure/);
    assert.equal(await db.medicalRecord.count({ where: { parentRecordId: created.id } }), 0);
    check('successful history retains object and audit; failed addendum rolls back');
    const originalTransaction = db.$transaction.bind(db);
    db.$transaction = async (...args) => { await originalTransaction(...args); throw Error('lost commit acknowledgement'); };
    await clinical.create(note, d1.id, {});
    db.$transaction = originalTransaction;
    assert.equal(objects.size, 2);
    check('ambiguous commit acknowledgement does not delete a committed attachment');

    const revocation = new TokenRevocationService(db);
    const jwt = new JwtService({ secret: 'synthetic_test_secret_for_integrity_checks', signOptions: { expiresIn: '8h' } });
    const auth = new AuthService(db, jwt, revocation);
    const login = await auth.login({ email: d1.email, password: 'SyntheticPass2026!' });
    const badRevocation = { revokeAllForUser: async () => { throw Error('injected revocation failure'); } };
    await assert.rejects(new AuthService(db, jwt, badRevocation).changePassword(d1.id, { currentPassword: 'SyntheticPass2026!', newPassword: 'NewSynthetic2026!' }), /revocation failure/);
    assert.equal(await bcrypt.compare('SyntheticPass2026!', (await db.user.findUniqueOrThrow({ where: { id: d1.id } })).password), true);
    await auth.changePassword(d1.id, { currentPassword: 'SyntheticPass2026!', newPassword: 'NewSynthetic2026!' });
    assert.equal(await revocation.isRevoked(jwt.verify(login.backendToken).jti, d1.id), true);
    check('password/revocation rollback together and successful change revokes session');
    const auth2 = new AuthService(db2, jwt, new TokenRevocationService(db2));
    const changing = await Promise.allSettled([
      auth.changePassword(d2.id, { currentPassword: 'SyntheticPass2026!', newPassword: 'AnotherSynthetic2026!' }),
      auth2.login({ email: d2.email, password: 'SyntheticPass2026!' }),
    ]);
    assert.equal(changing[0].status, 'fulfilled');
    if (changing[1].status === 'fulfilled') {
      assert.equal(await revocation.isRevoked(jwt.verify(changing[1].value.backendToken).jti, d2.id), true);
    }
    check('concurrent login cannot retain an old-credential session across password reset');
    const users1 = new UsersService(db), users2 = new UsersService(db2);
    await oneWinner([users1.remove(admin.id), users2.remove(admin2.id)]);
    assert.equal(await db.user.count({ where: { role: 'ADMIN', isActive: true } }), 1);
    check('concurrent deactivation preserves one active administrator');
    console.log(`\n${checks} real PostgreSQL integrity checks passed.`);
  } finally { await Promise.all([db.onModuleDestroy(), db2.onModuleDestroy()]); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
