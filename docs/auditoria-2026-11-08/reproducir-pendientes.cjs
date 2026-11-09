// Ejecutar desde la raíz tras compilar backend. No carga .env ni conecta servicios.
// Documenta defectos: estas observaciones deben dejar de cumplirse al corregirlos.
const { createRequire } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const req = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const { MedicalRecordsService } = req('./dist/medical-records/medical-records.service');
const { InvoicesService } = req('./dist/invoices/invoices.service');
const { AppointmentsService } = req('./dist/appointments/appointments.service');

async function main() {
  let persisted = 0;
  let removed = 0;
  const clinical = new MedicalRecordsService({
    patient: { findUnique: async () => ({ id: 'p', isActive: true }) },
    medicalRecord: { create: async () => { persisted++; return { id: 'r' }; } },
  }, {
    uploadValidatedFile: async () => ({ storagePath: 'synthetic.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'synthetic' }),
    removeFile: async () => { removed++; },
  }, { record: async () => { throw new Error('audit failed'); } });
  await assert.rejects(() => clinical.create({ patientId: 'p', notes: 'Sintético' }, 'doctor', {}), /audit failed/);
  assert.equal(persisted, 1);
  assert.equal(removed, 1);
  console.log('R01: fallo de auditoría elimina adjunto después de persistir la historia (dobles).');

  const invoices = new InvoicesService({ invoice: { findUnique: async () => ({ id: 'old', patientId: 'patient-A', totalAmount: 1, items: [] }) } });
  const replay = await invoices.create({ patientId: 'patient-B', items: [{ description: 'Otro concepto', quantity: 1, unitPrice: 10 }], idempotencyKey: 'same-key' });
  assert.equal(replay.patientId, 'patient-A');
  console.log('R03: misma clave con otro paciente/contenido devuelve operación anterior sin conflicto (dobles).');

  const rows = [];
  let reads = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const db = {
    patient: { findUnique: async () => ({ isActive: true }) },
    user: { findUnique: async () => ({ role: 'MEDICO', isActive: true, specialties: [{ id: 's' }] }) },
    appointment: {
      findMany: async () => { if (++reads === 2) release(); await barrier; return []; },
      create: async ({ data }) => { rows.push(data); return data; },
    },
    $transaction: async fn => fn(db),
  };
  const dto = { patientId: 'p', doctorId: 'd', specialtyId: 's', date: '2026-11-10T10:00:00-03:00', duration: 30 };
  await Promise.all([new AppointmentsService(db).create(dto), new AppointmentsService(db).create(dto)]);
  assert.equal(rows.length, 2);
  console.log('R02: dos instancias aceptan turnos superpuestos con un intercalado permitido (dobles, no prueba PostgreSQL).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
