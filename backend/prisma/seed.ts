import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

/**
 * Seed exclusivamente de DEMOSTRACIÓN (datos sintéticos e idempotentes).
 * - Para aprovisionar el administrador real usar: npm run provision:admin
 * - Para importar el inventario comercial desde Excel usar: npm run import:inventory
 */
async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'El seed de demostración está bloqueado en producción. Use provision:admin o import:inventory.',
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL es obligatorio en el archivo .env');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('🌱 Sembrando datos sintéticos de demostración (idempotente)...');

    const demoRawPassword = process.env.SEED_DEMO_PASSWORD || 'DemoSurmed2026!';
    if (demoRawPassword.length < 8) {
      throw new Error('SEED_DEMO_PASSWORD debe tener al menos 8 caracteres.');
    }
    const hashedDemoPassword = await bcrypt.hash(demoRawPassword, 10);

    // 1. Especialidades
    const clinicaMedica = await prisma.specialty.upsert({
      where: { name: 'Clínica Médica' },
      update: { description: 'Atención primaria y preventiva' },
      create: {
        name: 'Clínica Médica',
        description: 'Atención primaria y preventiva',
      },
    });

    const cardiologia = await prisma.specialty.upsert({
      where: { name: 'Cardiología' },
      update: { description: 'Salud cardiovascular' },
      create: {
        name: 'Cardiología',
        description: 'Salud cardiovascular',
      },
    });

    // 2. Médicos de demo conectados con sus especialidades (F18 / S02)
    const drMartinez = await prisma.user.upsert({
      where: { email: 'drmartinez@surmed.demo' },
      update: {
        name: 'Diego Martínez (Demo)',
        password: hashedDemoPassword,
        role: 'MEDICO',
        isActive: true,
        specialties: {
          set: [{ id: clinicaMedica.id }],
        },
      },
      create: {
        name: 'Diego Martínez (Demo)',
        email: 'drmartinez@surmed.demo',
        password: hashedDemoPassword,
        role: 'MEDICO',
        isActive: true,
        specialties: {
          connect: [{ id: clinicaMedica.id }],
        },
      },
    });

    const draGomez = await prisma.user.upsert({
      where: { email: 'dragomez@surmed.demo' },
      update: {
        name: 'Laura Gómez (Demo)',
        password: hashedDemoPassword,
        role: 'MEDICO',
        isActive: true,
        specialties: {
          set: [{ id: cardiologia.id }],
        },
      },
      create: {
        name: 'Laura Gómez (Demo)',
        email: 'dragomez@surmed.demo',
        password: hashedDemoPassword,
        role: 'MEDICO',
        isActive: true,
        specialties: {
          connect: [{ id: cardiologia.id }],
        },
      },
    });

    // 3. Pacientes sintéticos
    const paciente1 = await prisma.patient.upsert({
      where: { documentId: 'DEMO-4500111' },
      update: { isActive: true },
      create: {
        firstName: 'Juan',
        lastName: 'Pérez (Demo)',
        documentId: 'DEMO-4500111',
        email: 'juan.perez@demo.invalid',
        phone: '+595 981 100200',
        birthDate: new Date('1990-05-15'),
        isActive: true,
      },
    });

    const paciente2 = await prisma.patient.upsert({
      where: { documentId: 'DEMO-4800222' },
      update: { isActive: true },
      create: {
        firstName: 'Sofía',
        lastName: 'Fernández (Demo)',
        documentId: 'DEMO-4800222',
        email: 'sofia.fernandez@demo.invalid',
        phone: '+595 981 300400',
        birthDate: new Date('1995-10-20'),
        isActive: true,
      },
    });

    // 4. Productos sintéticos de demo (idempotentes, sin mezclar Excel comercial)
    const demoProducts = [
      {
        name: 'Guantes de Nitrilo (Demo)',
        description: 'Caja x 100 unidades sintética de prueba',
        price: 45000,
        quantity: 25,
        minStock: 10,
        category: 'INSUMO_MEDICO' as const,
      },
      {
        name: 'Jeringas Descartables 5ml (Demo)',
        description: 'Insumo de demostración con bajo stock',
        price: 2500,
        quantity: 4,
        minStock: 10,
        category: 'INSUMO_MEDICO' as const,
      },
    ];

    for (const prod of demoProducts) {
      const existing = await prisma.product.findFirst({
        where: { name: prod.name },
      });
      if (!existing) {
        await prisma.product.create({ data: prod });
      }
    }

    // 5. Turnos, Historias y Facturas de demo (solo si el paciente demo aún no los tiene, evitando duplicar en re-ejecución)
    const existingAppointments = await prisma.appointment.count({
      where: { patientId: { in: [paciente1.id, paciente2.id] } },
    });

    if (existingAppointments === 0) {
      const hoy = new Date();
      hoy.setHours(10, 0, 0, 0);
      const manana = new Date(hoy);
      manana.setDate(manana.getDate() + 1);
      manana.setHours(14, 30, 0, 0);

      await prisma.appointment.createMany({
        data: [
          {
            patientId: paciente1.id,
            doctorId: drMartinez.id,
            specialtyId: clinicaMedica.id,
            date: hoy,
            duration: 30,
            status: 'CONFIRMED',
            notes: 'Control anual de rutina (Demo)',
          },
          {
            patientId: paciente2.id,
            doctorId: draGomez.id,
            specialtyId: cardiologia.id,
            date: manana,
            duration: 45,
            status: 'PENDING',
            notes: 'Electrocardiograma preventivo (Demo)',
          },
        ],
      });
    }

    const existingRecords = await prisma.medicalRecord.count({
      where: { patientId: { in: [paciente1.id, paciente2.id] } },
    });

    if (existingRecords === 0) {
      await prisma.medicalRecord.createMany({
        data: [
          {
            patientId: paciente1.id,
            doctorId: drMartinez.id,
            notes: 'Evolución sintética de prueba: control clínico normal.',
            attachments: [],
          },
          {
            patientId: paciente2.id,
            doctorId: draGomez.id,
            notes: 'Evolución sintética de prueba: seguimiento cardiológico.',
            attachments: [],
          },
        ],
      });
    }

    const existingInvoices = await prisma.invoice.count({
      where: { patientId: { in: [paciente1.id, paciente2.id] } },
    });

    if (existingInvoices === 0) {
      await prisma.invoice.create({
        data: {
          patientId: paciente1.id,
          totalAmount: 150000,
          status: 'PAID',
          items: {
            create: [
              {
                description: 'Consulta Médica - Clínica Médica (Demo)',
                quantity: 1,
                unitPrice: 150000,
                subtotal: 150000,
              },
            ],
          },
        },
      });
    }

    console.log('✅ Sembrado sintético de demostración finalizado sin duplicados.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
