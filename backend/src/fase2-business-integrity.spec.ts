import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory/inventory.service';
import { UpdateProductDto } from './inventory/dto/update-inventory.dto';
import { AppointmentsService } from './appointments/appointments.service';
import { InvoicesService } from './invoices/invoices.service';
import { CreateInvoiceDto } from './invoices/dto/create-invoice.dto';
import { DashboardService } from './dashboard/dashboard.service';
import { PatientsService } from './patients/patients.service';
import { CreatePatientDto } from './patients/dto/create-patient.dto';
import { SpecialtiesService } from './specialties/specialties.service';
import { UsersService } from './users/users.service';
import { GlobalExceptionFilter } from './common/filters/prisma-exception.filter';
import {
  parseCivilDate,
  parseClinicDateTime,
} from './common/utils/timezone.util';
import { PrismaService } from './prisma/prisma.service';

describe('Fase 2 — Integridad del negocio (T07, T08, T09, T10)', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  describe('T07 · Validación, DTOs concretos, normalización y mapeo de errores (S05, F10, F11, F15, F16)', () => {
    it('UpdateProductDto y InventoryService.updateProduct rechazan quantity, isActive y relaciones no editables (S05)', async () => {
      await expect(
        validationPipe.transform(
          { name: 'Guantes', quantity: -999, isActive: false },
          { type: 'body', metatype: UpdateProductDto },
        ),
      ).rejects.toThrow(BadRequestException);

      const mockPrisma = {
        product: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'prod-1',
            name: 'Guantes',
            quantity: 10,
            minStock: 5,
            price: new Prisma.Decimal('15000.00'),
            category: 'INSUMO_MEDICO',
            isActive: true,
          }),
          update: jest.fn(),
        },
      } as unknown as PrismaService;

      const service = new InventoryService(mockPrisma);

      await expect(
        service.updateProduct('prod-1', {
          name: 'Guantes',
          quantity: 999,
        } as unknown as UpdateProductDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('CreatePatientDto y PatientsService normalizan email vacío ("") a null/undefined y rechazan fechas futuras (F11)', async () => {
      const transformed = (await validationPipe.transform(
        {
          documentId: '  4567890 ',
          firstName: '  María ',
          lastName: ' González ',
          email: '   ',
          birthDate: '1992-05-14',
        },
        { type: 'body', metatype: CreatePatientDto },
      )) as CreatePatientDto;

      expect(transformed.email).toBeUndefined();
      expect(transformed.documentId).toBe('4567890');
      expect(transformed.firstName).toBe('María');

      let persistedData: Record<string, unknown> | null = null;
      const mockPrisma = {
        patient: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            persistedData = data;
            return Promise.resolve({ id: 'pat-1', ...data });
          }),
        },
      } as unknown as PrismaService;

      const patientsService = new PatientsService(mockPrisma);
      await patientsService.create({
        documentId: '4567890',
        firstName: 'María',
        lastName: 'González',
        email: '',
        birthDate: '1992-05-14',
      });

      expect(persistedData).toMatchObject({
        documentId: '4567890',
        firstName: 'María',
        lastName: 'González',
        email: null,
      });

      // Fecha futura debe rechazarse con 400
      await expect(
        patientsService.create({
          documentId: '9999999',
          firstName: 'Juan',
          lastName: 'Pérez',
          birthDate: '2099-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('GlobalExceptionFilter mapea P2002 a 409 y P2025 a 404 sin exponer infraestructura (F15)', () => {
      const filter = new GlobalExceptionFilter();

      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`documentId`)',
        { code: 'P2002', clientVersion: '7.10.1' },
      );
      const mappedUnique = filter.mapPrismaError(uniqueError);
      expect(mappedUnique.statusCode).toBe(409);
      expect(mappedUnique.message).not.toContain('documentId');

      const notFoundError = new Prisma.PrismaClientKnownRequestError(
        'Record to update not found.',
        { code: 'P2025', clientVersion: '7.10.1' },
      );
      const mappedNotFound = filter.mapPrismaError(notFoundError);
      expect(mappedNotFound.statusCode).toBe(404);
    });

    it('SpecialtiesService impide borrar especialidad con turnos históricos y UsersService protege al último ADMIN activo (F16)', async () => {
      const mockSpecialtyPrisma = {
        specialty: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ id: 'spec-1', name: 'Clínica Médica' })
            .mockResolvedValueOnce({
              id: 'spec-1',
              _count: { doctors: 0, appointments: 3 },
            }),
          delete: jest.fn(),
        },
      } as unknown as PrismaService;

      const specialtiesService = new SpecialtiesService(mockSpecialtyPrisma);
      await expect(specialtiesService.remove('spec-1')).rejects.toThrow(
        ConflictException,
      );

      const mockUsersPrisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'admin-1',
            role: 'ADMIN',
            isActive: true,
          }),
          count: jest.fn().mockResolvedValue(1),
          update: jest.fn(),
        },
      } as unknown as PrismaService;

      const usersService = new UsersService(mockUsersPrisma);
      await expect(usersService.remove('admin-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('T08 · Stock concurrente, atómico, trazable e idempotente (F05, F16, F22)', () => {
    it('con saldo 5 y dos salidas simultáneas de 4, exactamente una se acepta, saldo final 1 y un solo movimiento efectivo (F05)', async () => {
      let currentStock = 5;
      const movements: Array<Record<string, unknown>> = [];

      const txMock = {
        stockMovement: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            await new Promise((r) => setTimeout(r, 10));
            const created = { id: `mov-${movements.length + 1}`, ...data };
            movements.push(created);
            return created;
          }),
        },
        product: {
          findUnique: jest.fn().mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 10));
            return {
              id: 'prod-1',
              name: 'Jeringas',
              quantity: currentStock,
              minStock: 2,
              price: new Prisma.Decimal('2500.00'),
              category: 'INSUMO_MEDICO',
              isActive: true,
            };
          }),
          updateMany: jest.fn().mockImplementation(
            ({
              where,
              data,
            }: {
              where: { quantity?: { gte: number } };
              data: { quantity: { decrement?: number; increment?: number } };
            }) => {
              const required = where.quantity?.gte ?? 0;
              if (currentStock < required) {
                return Promise.resolve({ count: 0 });
              }
              if (data.quantity.decrement) {
                currentStock -= data.quantity.decrement;
              } else if (data.quantity.increment) {
                currentStock += data.quantity.increment;
              }
              return Promise.resolve({ count: 1 });
            },
          ),
        },
      };

      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) =>
            cb(txMock),
          ),
      } as unknown as PrismaService;

      const inventoryService = new InventoryService(mockPrisma);

      const results = await Promise.allSettled([
        inventoryService.registerMovement(
          { productId: 'prod-1', type: 'OUT', quantity: 4 },
          'user-1',
        ),
        inventoryService.registerMovement(
          { productId: 'prod-1', type: 'OUT', quantity: 4 },
          'user-2',
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(currentStock).toBe(1);
      expect(movements).toHaveLength(1);
    });

    it('repetir una petición de movimiento con igual clave de idempotencia no descuenta otra vez y un producto inactivo se rechaza (F16, F22)', async () => {
      let currentStock = 10;
      const movementsByKey = new Map<string, Record<string, unknown>>();

      const txMock = {
        stockMovement: {
          findUnique: jest.fn().mockImplementation(({ where }: { where: { idempotencyKey: string } }) => {
            return Promise.resolve(movementsByKey.get(where.idempotencyKey) ?? null);
          }),
          create: jest.fn().mockImplementation(({ data }: { data: { idempotencyKey?: string } }) => {
            const rec = { id: 'mov-1', ...data };
            if (data.idempotencyKey) {
              movementsByKey.set(data.idempotencyKey, rec);
            }
            return Promise.resolve(rec);
          }),
        },
        product: {
          findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            if (where.id === 'prod-inactive') {
              return Promise.resolve({
                id: 'prod-inactive',
                name: 'Inactivo',
                quantity: 10,
                minStock: 1,
                price: null,
                category: 'INSUMO_MEDICO',
                isActive: false,
              });
            }
            return Promise.resolve({
              id: 'prod-1',
              name: 'Gasas',
              quantity: currentStock,
              minStock: 2,
              price: null,
              category: 'INSUMO_MEDICO',
              isActive: true,
            });
          }),
          updateMany: jest.fn().mockImplementation(
            ({ data }: { data: { quantity: { decrement?: number } } }) => {
              if (data.quantity.decrement) {
                currentStock -= data.quantity.decrement;
              }
              return Promise.resolve({ count: 1 });
            },
          ),
        },
      };

      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) =>
            cb(txMock),
          ),
      } as unknown as PrismaService;

      const inventoryService = new InventoryService(mockPrisma);

      const first = await inventoryService.registerMovement(
        {
          productId: 'prod-1',
          type: 'OUT',
          quantity: 3,
          idempotencyKey: 'key-abc-123',
        },
        'user-1',
      );
      const second = await inventoryService.registerMovement(
        {
          productId: 'prod-1',
          type: 'OUT',
          quantity: 3,
          idempotencyKey: 'key-abc-123',
        },
        'user-1',
      );

      expect(currentStock).toBe(7);
      expect(first.updatedProduct.quantity).toBe(7);
      expect(second.updatedProduct.quantity).toBe(7);

      // Producto desactivado no se puede consumir
      await expect(
        inventoryService.registerMovement(
          { productId: 'prod-inactive', type: 'OUT', quantity: 1 },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('T09 · Agenda, concurrencia, validaciones de médico/especialidad, estados y zona horaria (F06, F07, F08)', () => {
    it('dos reservas concurrentes superpuestas del mismo médico no se confirman ambas; intervalo contiguo sí funciona (F06)', async () => {
      const appointments: Array<{
        id: string;
        patientId: string;
        doctorId: string;
        specialtyId: string;
        date: Date;
        duration: number;
        status: string;
      }> = [];

      const txMock = {
        patient: {
          findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
            Promise.resolve({ id: where.id, isActive: true }),
          ),
        },
        user: {
          findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            if (where.id === 'user-recepcion') {
              return Promise.resolve({
                id: 'user-recepcion',
                role: 'RECEPCION',
                isActive: true,
                specialties: [],
              });
            }
            return Promise.resolve({
              id: where.id,
              role: 'MEDICO',
              isActive: true,
              specialties: [{ id: 'spec-cardio' }],
            });
          }),
        },
        appointment: {
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 10));
            return [...appointments];
          }),
          create: jest.fn().mockImplementation(
            async ({
              data,
            }: {
              data: {
                patientId: string;
                doctorId: string;
                specialtyId: string;
                date: Date;
                duration: number;
              };
            }) => {
              await new Promise((r) => setTimeout(r, 10));
              const created = {
                id: `apt-${appointments.length + 1}`,
                ...data,
                status: 'PENDING',
              };
              appointments.push(created);
              return created;
            },
          ),
        },
      };

      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) =>
            cb(txMock),
          ),
      } as unknown as PrismaService;

      const appointmentsService = new AppointmentsService(mockPrisma);

      // Dos reservas simultáneas superpuestas (10:00-10:30 y 10:15-10:45) para el mismo médico
      const concurrent = await Promise.allSettled([
        appointmentsService.create({
          patientId: 'pat-1',
          doctorId: 'doc-1',
          specialtyId: 'spec-cardio',
          date: '2026-11-10T10:00:00-03:00',
          duration: 30,
        }),
        appointmentsService.create({
          patientId: 'pat-2',
          doctorId: 'doc-1',
          specialtyId: 'spec-cardio',
          date: '2026-11-10T10:15:00-03:00',
          duration: 30,
        }),
      ]);

      expect(concurrent.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(concurrent.filter((r) => r.status === 'rejected')).toHaveLength(1);

      // Intervalo contiguo válido (10:30-11:00) sí se acepta
      const contiguous = await appointmentsService.create({
        patientId: 'pat-2',
        doctorId: 'doc-1',
        specialtyId: 'spec-cardio',
        date: '2026-11-10T10:30:00-03:00',
        duration: 30,
      });
      expect(contiguous.id).toBeDefined();

      // No se asigna especialidad ajena ni usuario de recepción como médico
      await expect(
        appointmentsService.create({
          patientId: 'pat-3',
          doctorId: 'doc-1',
          specialtyId: 'spec-otra',
          date: '2026-11-10T11:30:00-03:00',
          duration: 30,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        appointmentsService.create({
          patientId: 'pat-3',
          doctorId: 'user-recepcion',
          specialtyId: 'spec-cardio',
          date: '2026-11-10T11:30:00-03:00',
          duration: 30,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('conserva la hora del centro America/Asuncion y rechaza transiciones de estado prohibidas (F07, F08)', async () => {
      const fromNaive = parseClinicDateTime('2026-11-10T09:30');
      const fromExplicitOffset = parseClinicDateTime(
        '2026-11-10T09:30:00-03:00',
      );
      expect(fromNaive.toISOString()).toBe('2026-11-10T12:30:00.000Z');
      expect(fromExplicitOffset.toISOString()).toBe('2026-11-10T12:30:00.000Z');

      const civilBirth = parseCivilDate('1990-02-28');
      expect(civilBirth.toISOString()).toBe('1990-02-28T12:00:00.000Z');

      let storedStatus = 'CANCELLED';
      const mockPrisma = {
        appointment: {
          findUnique: jest.fn().mockImplementation(() =>
            Promise.resolve({ id: 'apt-1', status: storedStatus }),
          ),
          update: jest.fn().mockImplementation(({ data }: { data: { status: string } }) => {
            storedStatus = data.status;
            return Promise.resolve({ id: 'apt-1', status: storedStatus });
          }),
        },
      } as unknown as PrismaService;

      const appointmentsService = new AppointmentsService(mockPrisma);

      await expect(
        appointmentsService.updateStatus('apt-1', 'ATTENDED'),
      ).rejects.toThrow(ConflictException);
      expect(storedStatus).toBe('CANCELLED');
    });
  });

  describe('T10 · Importes en Decimal(12, 2), flujo de cobro y KPIs separados (F09, F10, F19, F22)', () => {
    it('rechaza factura vacía, calcula totales exactos y emitir una deuda PENDING no aumenta el KPI Cobrado hasta que se paga', async () => {
      await expect(
        validationPipe.transform(
          { patientId: '550e8400-e29b-41d4-a716-446655440000', items: [] },
          { type: 'body', metatype: CreateInvoiceDto },
        ),
      ).rejects.toThrow(BadRequestException);

      const invoicesStore: Array<{
        id: string;
        patientId: string;
        totalAmount: Prisma.Decimal;
        status: 'PENDING' | 'PAID' | 'CANCELLED';
        idempotencyKey?: string;
        createdAt: Date;
        updatedAt: Date;
        items: Array<{
          id: string;
          invoiceId: string;
          description: string;
          quantity: number;
          unitPrice: Prisma.Decimal;
          subtotal: Prisma.Decimal;
          createdAt: Date;
        }>;
      }> = [];

      const mockPrisma = {
        patient: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pat-1',
            firstName: 'Ana',
            lastName: 'Gómez',
            documentId: '1234567',
            isActive: true,
          }),
          count: jest.fn().mockResolvedValue(12),
        },
        invoice: {
          findUnique: jest.fn().mockImplementation(
            ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
              if (where.idempotencyKey) {
                return Promise.resolve(
                  invoicesStore.find(
                    (i) => i.idempotencyKey === where.idempotencyKey,
                  ) ?? null,
                );
              }
              return Promise.resolve(
                invoicesStore.find((i) => i.id === where.id) ?? null,
              );
            },
          ),
          create: jest.fn().mockImplementation(
            ({
              data,
            }: {
              data: {
                patientId: string;
                totalAmount: Prisma.Decimal;
                status: 'PENDING' | 'PAID';
                idempotencyKey?: string;
                items: {
                  create: Array<{
                    description: string;
                    quantity: number;
                    unitPrice: Prisma.Decimal;
                    subtotal: Prisma.Decimal;
                  }>;
                };
              };
            }) => {
              const now = new Date();
              const inv = {
                id: `inv-${invoicesStore.length + 1}`,
                patientId: data.patientId,
                totalAmount: data.totalAmount,
                status: data.status,
                idempotencyKey: data.idempotencyKey,
                createdAt: now,
                updatedAt: now,
                patient: {
                  id: 'pat-1',
                  firstName: 'Ana',
                  lastName: 'Gómez',
                  documentId: '1234567',
                },
                items: data.items.create.map((it, idx) => ({
                  id: `item-${idx + 1}`,
                  invoiceId: `inv-${invoicesStore.length + 1}`,
                  ...it,
                  createdAt: now,
                })),
              };
              invoicesStore.push(inv);
              return Promise.resolve(inv);
            },
          ),
          update: jest.fn().mockImplementation(
            ({
              where,
              data,
            }: {
              where: { id: string };
              data: { status: 'PAID' | 'CANCELLED' };
            }) => {
              const found = invoicesStore.find((i) => i.id === where.id);
              if (!found) throw new NotFoundException();
              found.status = data.status;
              return Promise.resolve(found);
            },
          ),
          findMany: jest.fn().mockImplementation(() =>
            Promise.resolve(
              invoicesStore.filter((i) => i.status !== 'CANCELLED'),
            ),
          ),
        },
      } as unknown as PrismaService;

      const invoicesService = new InvoicesService(mockPrisma);
      const dashboardService = new DashboardService(mockPrisma);

      // 1. Emitir comprobante pendiente (con idempotencia)
      const created = await invoicesService.create(
        {
          patientId: 'pat-1',
          items: [
            { description: 'Consulta médica', quantity: 1, unitPrice: 150000 },
            { description: 'Electrocardiograma', quantity: 1, unitPrice: 100000 },
          ],
          idempotencyKey: 'idem-inv-1',
        },
        'user-recep',
      );

      // Reintento con misma clave devuelve el mismo comprobante sin duplicar
      const replayed = await invoicesService.create(
        {
          patientId: 'pat-1',
          items: [
            { description: 'Consulta médica', quantity: 1, unitPrice: 150000 },
            { description: 'Electrocardiograma', quantity: 1, unitPrice: 100000 },
          ],
          idempotencyKey: 'idem-inv-1',
        },
        'user-recep',
      );
      expect(replayed.id).toBe(created.id);
      expect(invoicesStore).toHaveLength(1);
      expect(created.status).toBe('PENDING');
      expect(created.totalAmount).toBe(250000);

      // 2. KPI antes de cobrar: emitir deuda NO aumenta "Cobrado" (monthlyRevenue === 0)
      const kpisBeforePay = await dashboardService.getStats('ADMIN');
      expect(kpisBeforePay.monthlyRevenue).toBe(0);
      expect(kpisBeforePay.monthlyPending).toBe(250000);
      expect(kpisBeforePay.monthlyIssued).toBe(250000);

      // 3. Registrar cobro válido aumenta "Cobrado" una sola vez
      const paid = await invoicesService.payInvoice(created.id, 'user-recep');
      expect(paid.status).toBe('PAID');

      const kpisAfterPay = await dashboardService.getStats('ADMIN');
      expect(kpisAfterPay.monthlyRevenue).toBe(250000);
      expect(kpisAfterPay.monthlyPending).toBe(0);

      // 4. Intentar cobrar por segunda vez devuelve 409 Conflict
      await expect(
        invoicesService.payInvoice(created.id, 'user-recep'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
