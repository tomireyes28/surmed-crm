import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

// 1. Configuramos el adaptador de Postgres
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('❌ No se encontró DATABASE_URL en el archivo .env');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando el sembrado de la base de datos Surmed...');

  // --- 1. ESPECIALIDADES, MÉDICOS Y PACIENTES ---
  const clinicaMedica = await prisma.specialty.upsert({
    where: { name: 'Clínica Médica' },
    update: {},
    create: { name: 'Clínica Médica', description: 'Atención primaria y preventiva' },
  });

  const cardiologia = await prisma.specialty.upsert({
    where: { name: 'Cardiología' },
    update: {},
    create: { name: 'Cardiología', description: 'Salud cardiovascular' },
  });

  const drMartinez = await prisma.user.upsert({
    where: { email: 'drmartinez@surmed.com' },
    update: {},
    create: {
      name: 'Diego Martínez',
      email: 'drmartinez@surmed.com',
      password: 'password123',
      role: 'MEDICO',
    },
  });

  const draGomez = await prisma.user.upsert({
    where: { email: 'dragomez@surmed.com' },
    update: {},
    create: {
      name: 'Laura Gómez',
      email: 'dragomez@surmed.com',
      password: 'password123',
      role: 'MEDICO',
    },
  });

  const paciente1 = await prisma.patient.upsert({
    where: { documentId: '35123456' },
    update: {},
    create: {
      firstName: 'Juan',
      lastName: 'Pérez',
      documentId: '35123456',
      email: 'juan.perez@gmail.com',
      phone: '+54 11 4321 5678',
      birthDate: new Date('1990-05-15'),
    },
  });

  const paciente2 = await prisma.patient.upsert({
    where: { documentId: '40987654' },
    update: {},
    create: {
      firstName: 'Sofía',
      lastName: 'Fernández',
      documentId: '40987654',
      email: 'sofia.fer@hotmail.com',
      phone: '+54 11 8765 4321',
      birthDate: new Date('1995-10-20'),
    },
  });

  console.log('✅ Especialidades, Médicos y Pacientes listos');

  // --- 2. AGENDA ---
  const hoy = new Date();
  hoy.setHours(10, 0, 0, 0); 
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);
  manana.setHours(14, 30, 0, 0); 

  await prisma.appointment.create({
    data: {
      patientId: paciente1.id,
      doctorId: drMartinez.id,
      specialtyId: clinicaMedica.id,
      date: hoy,
      duration: 30,
      status: 'CONFIRMED',
      notes: 'Control anual de rutina',
    },
  });

  await prisma.appointment.create({
    data: {
      patientId: paciente2.id,
      doctorId: draGomez.id,
      specialtyId: cardiologia.id,
      date: manana,
      duration: 45,
      status: 'PENDING',
      notes: 'Electrocardiograma preventivo',
    },
  });
  console.log('✅ Turnos de prueba agendados');

  // --- 3. INVENTARIO REAL DESDE EXCEL ---
  console.log('📦 Sembrando inventario desde archivos Excel...');
  const dataDir = path.join(process.cwd(), 'prisma', 'data');

  // Nombres exactos de tus archivos
  const files = [
    { filename: 'inv1.xlsx', category: 'ACTIVO_FIJO' },
    { filename: 'inv2.xlsx', category: 'OFICINA' },
    { filename: 'inv3.xlsx', category: 'INSUMO_MEDICO' },
    { filename: 'inv4.xlsx', category: 'INSUMO_MEDICO' },
    { filename: 'inv5.xlsx', category: 'INSUMO_MEDICO' },
  ];

  for (const file of files) {
    const filePath = path.join(dataDir, file.filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ No se encontró ${file.filename}, saltando...`);
      continue;
    }

    // Leemos el archivo Excel
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertimos la hoja a un array de arrays para poder saltar filas fácilmente
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    let count = 0;
    
    // Empezamos desde el índice 5 (fila 6 de Excel) para saltar la cabecera
    for (let i = 5; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      // Según la estructura típica: B=ID, C=Nombre, D=Desc, E=Precio, F=Cantidad
      const id = row[1]; 
      const name = row[2];
      const description = row[3];
      const price = row[4];
      const quantity = row[5];

      // Validamos que tenga un ID con guión (ej: 001-001) para asegurar que es un producto
      if (id && typeof id === 'string' && id.includes('-') && name) {
        const productName = String(name).trim();
        
        // Verificamos si ya existe
        const existing = await prisma.product.findFirst({ where: { name: productName } });

        if (!existing) {
          await prisma.product.create({
            data: {
              name: productName,
              description: description ? String(description).trim() : '',
              price: parseFloat(String(price)) || 0,
              quantity: parseInt(String(quantity)) || 0,
              minStock: file.category === 'INSUMO_MEDICO' ? 10 : 2,
              category: file.category as any,
            }
          });
          count++;
        }
      }
    }
    console.log(`✅ ${file.filename}: ${count} productos importados.`);
  }

  // --- 4. HISTORIAS CLÍNICAS (Test Data) ---
  console.log('📝 Sembrando historias clínicas de prueba...');
  await prisma.medicalRecord.create({
    data: {
      patientId: paciente1.id,
      doctorId: drMartinez.id,
      notes: 'Paciente acude a control anual. Refiere sentirse bien, sin dolores en el pecho ni fatiga. Se indica continuar con dieta baja en sodio y ejercicio moderado 3 veces por semana.',
    },
  });

  await prisma.medicalRecord.create({
    data: {
      patientId: paciente2.id,
      doctorId: draGomez.id,
      notes: 'Paciente presenta cuadro febril de 48hs de evolución acompañado de odinofagia. Al examen físico: amígdalas eritematosas. Se indica tratamiento con Amoxicilina 500mg cada 8hs por 7 días.',
    },
  });
  console.log('✅ Historias clínicas creadas');

  // --- 5. FACTURACIÓN (Test Data) ---
  console.log('💰 Sembrando facturación de prueba...');
  
  // Factura 1: Consulta básica (Pagada)
  const invoice1 = await prisma.invoice.create({
    data: {
      patientId: paciente1.id,
      totalAmount: 15000,
      status: 'PAID',
    },
  });

  await prisma.invoiceItem.create({
    data: {
      invoiceId: invoice1.id,
      description: 'Consulta Médica - Dr. Martínez',
      quantity: 1,
      unitPrice: 15000,
      subtotal: 15000,
    },
  });

  // Factura 2: Consulta + Prácticas (Pendiente)
  const invoice2 = await prisma.invoice.create({
    data: {
      patientId: paciente2.id,
      totalAmount: 45000,
      status: 'PENDING',
    },
  });

  await prisma.invoiceItem.create({
    data: {
      invoiceId: invoice2.id,
      description: 'Consulta Médica - Dra. Gómez',
      quantity: 1,
      unitPrice: 15000,
      subtotal: 15000,
    },
  });

  await prisma.invoiceItem.create({
    data: {
      invoiceId: invoice2.id,
      description: 'Electrocardiograma de reposo',
      quantity: 1,
      unitPrice: 30000,
      subtotal: 30000,
    },
  });
  console.log('✅ Facturas de prueba creadas');

  console.log('🎉 Sembrado finalizado con éxito!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });