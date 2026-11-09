// Disposable UI fixture. Never loads customer data or remote Storage.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.VISUAL_TEST_DATABASE_URL || 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/surmed_visual_test') throw Error('Only disposable local surmed_visual_test is allowed.');
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url.href, JWT_SECRET: 'synthetic_visual_only_secret_at_least_32', SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only' });
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/setup-app');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { StorageService } = require('../dist/storage/storage.service');
const bcrypt = require('bcrypt');
const { getClinicDateParts } = require('../dist/common/utils/timezone.util');

async function main() {
  const db = new PrismaService(); await db.onModuleInit();
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "users", "patients", "products", "specialties", "auth_rate_buckets" CASCADE');
  const password = 'VisualOnly2026!'; const hash = await bcrypt.hash(password, 4);
  const specialty = await db.specialty.create({ data: { name: 'Clínica de prueba visual' } });
  const users = {};
  for (const [key, role] of [['admin', 'ADMIN'], ['doctor', 'MEDICO'], ['reception', 'RECEPCION']]) users[key] = await db.user.create({ data: { name: `Prueba ${role}`, email: `${key}.visual@example.invalid`, role, password: hash, ...(role === 'MEDICO' ? { specialties: { connect: { id: specialty.id } } } : {}) } });
  const patient = await db.patient.create({ data: { documentId: 'VISUAL-0001', firstName: 'María José de los Ángeles (sintético)', lastName: 'Benítez Fernández de Villalba (prueba)', birthDate: new Date('1990-02-28T12:00:00Z'), phone: '+595 000 000000', address: 'Dirección sintética para pruebas', email: 'patient.visual@example.invalid' } });
  const unrelated = await db.patient.create({ data: { documentId: 'VISUAL-0002', firstName: 'Paciente sin asignación', lastName: 'Prueba', birthDate: new Date('2000-02-29T12:00:00Z') } });
  await db.clinicalAccess.create({ data: { patientId: patient.id, doctorId: users.doctor.id, grantedById: users.admin.id, reason: 'Asignación sintética de QA visual' } });
  await db.medicalRecord.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ patientId: patient.id, doctorId: users.doctor.id, notes: `PRUEBA VISUAL SIN INFORMACIÓN CLÍNICA REAL. Evolución sintética ${i + 1}. Texto extenso para comprobar lectura y ajuste de líneas en pantallas pequeñas.`, attachments: [] })) });
  await db.product.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ name: `Insumo sintético ${String(i + 1).padStart(2, '0')}`, category: 'INSUMO_MEDICO', quantity: i % 8, minStock: 3 })) });
  const { year, month, day } = getClinicDateParts(); const date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00-03:00`);
  await db.appointment.create({ data: { patientId: patient.id, doctorId: users.doctor.id, specialtyId: specialty.id, date, duration: 30, status: 'CONFIRMED' } });
  const invoices = [];
  for (const [status, size] of [['PENDING', 1], ['PAID', 70], ['CANCELLED', 2]]) {
    const items = Array.from({ length: size }, (_, i) => ({ description: `Concepto sintético ${i + 1}: consulta y procedimiento de prueba con descripción extensa para revisar saltos de línea y páginas.`, quantity: 2, unitPrice: 125000.5, subtotal: 250001 }));
    invoices.push(await db.invoice.create({ data: { patientId: patient.id, status, totalAmount: size * 250001, ...(status === 'PAID' ? { paidAt: new Date(), paidById: users.admin.id } : {}), ...(status === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: 'Prueba de anulación' } : {}), items: { create: items } }, include: { items: true, patient: true } }));
  }
  const objects = new Map(); const validator = new StorageService();
  const storage = {
    validateClinicalFile: file => validator.validateClinicalFile(file),
    uploadValidatedFile: async file => { const checked = validator.validateClinicalFile(file); const storagePath = `${randomUUID()}.${checked.canonicalExt}`; objects.set(storagePath, file.buffer); return { ...checked, storagePath }; },
    downloadFile: async key => { if (!objects.has(key)) throw Error('Missing synthetic object'); return objects.get(key); },
    removeFile: async key => { objects.delete(key); },
  };
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(StorageService).useValue(storage).compile();
  const app = module.createNestApplication(); configureApp(app); await app.listen(55601, '127.0.0.1');
  const tmp = path.resolve(__dirname, '../.tmp'); fs.mkdirSync(tmp, { recursive: true });
  const stopFile = path.join(tmp, 'visual-stop'); if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  fs.writeFileSync(path.join(tmp, 'visual-fixture.json'), JSON.stringify({ patient, unrelated, users, password, invoices }, null, 2));
  const next = spawn(process.execPath, [path.resolve(__dirname, '../../frontend/node_modules/next/dist/bin/next'), process.env.VISUAL_PRODUCTION === '1' ? 'start' : 'dev', '-p', '55602', '-H', '127.0.0.1'], { cwd: path.resolve(__dirname, '../../frontend'), windowsHide: true, env: { ...process.env, NODE_ENV: process.env.VISUAL_PRODUCTION === '1' ? 'production' : 'development', API_URL: 'http://127.0.0.1:55601', APP_ORIGIN: 'http://localhost:55602' }, stdio: 'inherit' });
  console.log('VISUAL FIXTURE READY at http://localhost:55602; synthetic users in backend/.tmp/visual-fixture.json');
  const interval = setInterval(async () => {
    if (!fs.existsSync(stopFile)) return;
    clearInterval(interval); next.kill(); await app.close(); await db.onModuleDestroy();
  }, 1000);
}
main().catch(error => { console.error(error); process.exit(1); });
