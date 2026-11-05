/*
 * Reproducciones aisladas de la auditoría. No carga .env ni abre conexiones.
 * Ejecutar después de compilar backend:
 *   node docs/auditoria-2026-11-04/verificar-hallazgos.cjs
 * Estas aserciones documentan defectos presentes, no son tests de aceptación:
 * deberán cambiar o fallar cuando se corrijan los problemas.
 */
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const fromBackend = createRequire(path.resolve(__dirname, '../../backend/package.json'));
fromBackend('reflect-metadata');
const { ValidationPipe } = fromBackend('@nestjs/common');
const { GUARDS_METADATA } = fromBackend('@nestjs/common/constants');
const { UsersService } = fromBackend('./dist/src/users/users.service');
const { AuthService } = fromBackend('./dist/src/auth/auth.service');
const { InventoryService } = fromBackend('./dist/src/inventory/inventory.service');
const { InventoryController } = fromBackend('./dist/src/inventory/inventory.controller');
const { MedicalRecordsController } = fromBackend('./dist/src/medical-records/medical-records.controller');
const { PatientsController } = fromBackend('./dist/src/patients/patients.controller');
const { AppointmentsService } = fromBackend('./dist/src/appointments/appointments.service');
const { CreateInvoiceDto } = fromBackend('./dist/src/invoices/dto/create-invoice.dto');
const { CreatePatientDto } = fromBackend('./dist/src/patients/dto/create-patient.dto');
const { ROLES_KEY } = fromBackend('./dist/src/auth/decorators/roles.decorator');

async function main() {
  let checks = 0;
  function observed(message) { checks++; console.log(`CONFIRMADO ${checks}: ${message}`); }

  let storedUser;
  const userDb = { user: {
    findUnique: async () => storedUser || null,
    create: async ({ data }) => (storedUser = { id: 'synthetic-user', isActive: true, ...data }),
  } };
  const users = new UsersService(userDb);
  const result = await users.create({ name: 'Sintético', email: 'synthetic@example.invalid', role: 'RECEPCION', password: 'only-synthetic-password' });
  assert.equal(storedUser.password, 'only-synthetic-password');
  assert.equal(result.password, storedUser.password);
  observed('UsersService persiste la contraseña sin hash y la devuelve en la respuesta.');
  const auth = new AuthService(userDb, { signAsync: async () => 'never-used' });
  await assert.rejects(() => auth.login({ email: storedUser.email, password: 'only-synthetic-password' }), /Credenciales incorrectas/);
  observed('La cuenta recién creada no supera bcrypt.compare durante el login.');

  const pipe = new ValidationPipe({ whitelist: true });
  const updateTypes = Reflect.getMetadata('design:paramtypes', InventoryController.prototype, 'updateProduct');
  assert.equal(updateTypes[1], Object);
  const untrusted = { quantity: -999, isActive: false };
  const passed = await pipe.transform(untrusted, { type: 'body', metatype: updateTypes[1] });
  assert.deepEqual(passed, untrusted);
  let written;
  const inventory = new InventoryService({ product: { update: async args => (written = args) } });
  await inventory.updateProduct('synthetic-product', passed);
  assert.deepEqual(written.data, untrusted);
  observed('PATCH de inventario conserva y pasa a Prisma campos fuera del DTO, incluso quantity negativo.');

  const emptyInvoice = await pipe.transform({ patientId: 'synthetic-patient', items: [] }, { type: 'body', metatype: CreateInvoiceDto });
  assert.deepEqual(emptyInvoice.items, []);
  observed('CreateInvoiceDto acepta una factura sin ítems.');
  await assert.rejects(() => pipe.transform({ documentId: 'SYNTHETIC', firstName: 'Prueba', lastName: 'Prueba', birthDate: '2000-01-01', email: '' }, { type: 'body', metatype: CreatePatientDto }), /Bad Request/);
  observed('El backend rechaza email vacío aunque el formulario de alta lo envía como valor opcional.');

  let quantity = 5;
  let reads = 0;
  let release;
  const bothRead = new Promise(resolve => { release = resolve; });
  const stockDb = {
    product: { findUnique: async () => {
      const snapshot = { id: 'synthetic-product', quantity };
      if (++reads === 2) release();
      await bothRead;
      return snapshot;
    } },
    $transaction: async callback => callback({
      stockMovement: { create: async ({ data }) => data },
      product: { update: async ({ data }) => {
        quantity -= data.quantity.decrement;
        return { quantity };
      } },
    }),
  };
  const stock = new InventoryService(stockDb);
  await Promise.all([1, 2].map(() => stock.registerMovement({ productId: 'synthetic-product', type: 'OUT', quantity: 4 }, 'synthetic-user')));
  assert.equal(quantity, -3);
  observed('Un intercalado concurrente permitido por el servicio deja stock -3 partiendo de 5 (doble simulado, sin PostgreSQL).');

  let appointmentInput;
  const appointments = new AppointmentsService({ appointment: { create: async args => { appointmentInput = args; return args; } } });
  await appointments.create({ patientId: 'synthetic-patient', doctorId: 'synthetic-doctor', specialtyId: 'synthetic-specialty', date: '2026-11-05T10:00:00Z' });
  assert.equal(appointmentInput.include.doctor, true);
  observed('La creación de turno pide a Prisma todos los campos del médico, incluido password.');

  for (const controller of [MedicalRecordsController, PatientsController]) {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller).map(guard => guard.name);
    assert.deepEqual(guards, ['JwtAuthGuard']);
    assert.equal(Reflect.getMetadata(ROLES_KEY, controller), undefined);
    for (const name of Object.getOwnPropertyNames(controller.prototype).filter(name => name !== 'constructor')) {
      assert.equal(Reflect.getMetadata(ROLES_KEY, controller.prototype[name]), undefined);
    }
  }
  observed('Pacientes e historias clínicas tienen autenticación JWT sin guard ni metadatos de roles.');
  console.log(`\n${checks} observaciones verificadas con datos sintéticos; ninguna conexión externa.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
