import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { rateStore } from './helpers/rate-store';
import { sessionStore } from './helpers/session-store';
import {
  assertDisposableTestDatabaseUrl,
  configureApp,
} from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  StorageService,
  UploadedClinicalFileResult,
} from '../src/storage/storage.service';

interface TestSpecialty {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TestUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'MEDICO' | 'RECEPCION';
  isActive: boolean;
  specialties: TestSpecialty[];
  createdAt: Date;
  updatedAt: Date;
}

interface TestPatient {
  id: string;
  documentId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: Date | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TestMedicalRecord {
  id: string;
  patientId: string;
  doctorId: string;
  parentRecordId: string | null;
  notes: string;
  attachments: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface TestAppointment {
  id: string;
  patientId: string;
  doctorId: string;
  specialtyId: string;
  date: Date;
  duration: number;
  status: 'PENDING' | 'CONFIRMED' | 'IN_WAITING_ROOM' | 'ATTENDED' | 'CANCELLED';
  notes: string | null;
  cancelReason: string | null;
  idempotencyKey: string | null;
  requestFingerprint?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestProduct {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  minStock: number;
  price: Prisma.Decimal | null;
  category: 'INSUMO_MEDICO' | 'EQUIPAMIENTO' | 'OTROS';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TestStockMovement {
  id: string;
  productId: string;
  userId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  notes: string | null;
  idempotencyKey: string | null;
  requestFingerprint?: string | null;
  createdAt: Date;
}

interface TestInvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  createdAt: Date;
}

interface TestInvoice {
  id: string;
  patientId: string;
  totalAmount: Prisma.Decimal;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  paidAt: Date | null;
  paidById: string | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancelReason: string | null;
  idempotencyKey: string | null;
  requestFingerprint?: string | null;
  items: TestInvoiceItem[];
  createdAt: Date;
  updatedAt: Date;
}

interface TestAuditLog {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  patientId: string | null;
  reason: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: Date;
}

/**
 * Arnés de base de datos descartable en memoria para pruebas E2E HTTP completas.
 * Replica fielmente las restricciones de unicidad, concurrencia, selects y relaciones
 * requeridas por los módulos de negocio de Surmed CRM.
 */
class DisposableInMemoryPrisma {
  readonly authSession = sessionStore().authSession;
  readonly authRateBucket = rateStore().authRateBucket;
  readonly recoveryToken = {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  readonly grants = new Map<
    string,
    { patientId: string; doctorId: string; revokedAt: Date | null }
  >();
  readonly clinicalAccess = {
    findUnique: jest.fn(
      ({
        where,
      }: {
        where: { patientId_doctorId: { patientId: string; doctorId: string } };
      }) =>
        Promise.resolve(
          this.grants.get(
            `${where.patientId_doctorId.patientId}:${where.patientId_doctorId.doctorId}`,
          ) ?? null,
        ),
    ),
    upsert: jest.fn(
      ({
        create,
      }: {
        create: { patientId: string; doctorId: string; revokedAt: Date | null };
      }) => {
        this.grants.set(`${create.patientId}:${create.doctorId}`, create);
        return Promise.resolve(create);
      },
    ),
  };
  readonly medicalAttachment = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn(() =>
      Promise.resolve(
        [...this.medicalRecords.values()].flatMap((record) =>
          record.attachments.map(() => ({
            id: record.id,
            medicalRecordId: record.id,
            isRevoked: false,
            scanStatus: 'CLEAN_MAGIC_VERIFIED',
          })),
        ),
      ),
    ),
  };
  readonly specialties = new Map<string, TestSpecialty>();
  readonly users = new Map<string, TestUser>();
  readonly patients = new Map<string, TestPatient>();
  readonly medicalRecords = new Map<string, TestMedicalRecord>();
  readonly appointments = new Map<string, TestAppointment>();
  readonly products = new Map<string, TestProduct>();
  readonly stockMovements = new Map<string, TestStockMovement>();
  readonly invoices = new Map<string, TestInvoice>();
  readonly auditLogs: TestAuditLog[] = [];

  failNextMedicalRecordCreate = false;
  simulateDbDown = false;

  clearAll() {
    this.specialties.clear();
    this.users.clear();
    this.patients.clear();
    this.medicalRecords.clear();
    this.appointments.clear();
    this.products.clear();
    this.stockMovements.clear();
    this.invoices.clear();
    this.auditLogs.length = 0;
    this.failNextMedicalRecordCreate = false;
    this.simulateDbDown = false;
  }

  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);

  $queryRaw = jest.fn().mockImplementation(() => {
    if (this.simulateDbDown) {
      return Promise.reject(new Error('Database connection refused'));
    }
    return Promise.resolve([{ '?column?': 1 }]);
  });

  $transaction = jest
    .fn()
    .mockImplementation(async <T>(cb: (tx: this) => Promise<T>): Promise<T> => {
      return await cb(this);
    });

  specialty = {
    findUnique: jest
      .fn()
      .mockImplementation(
        (args: { where: { id?: string; name?: string } }) => {
          if (args.where.id) {
            return Promise.resolve(this.specialties.get(args.where.id) ?? null);
          }
          if (args.where.name) {
            const found = [...this.specialties.values()].find(
              (s) => s.name.toLowerCase() === args.where.name?.toLowerCase(),
            );
            return Promise.resolve(found ?? null);
          }
          return Promise.resolve(null);
        },
      ),
    create: jest
      .fn()
      .mockImplementation(
        (args: { data: { name: string; description?: string } }) => {
          const now = new Date();
          const spec: TestSpecialty = {
            id: crypto.randomUUID(),
            name: args.data.name,
            description: args.data.description ?? null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          };
          this.specialties.set(spec.id, spec);
          return Promise.resolve(spec);
        },
      ),
    findMany: jest.fn().mockImplementation(() => {
      return Promise.resolve([...this.specialties.values()]);
    }),
  };

  user = {
    findUnique: jest
      .fn()
      .mockImplementation(
        (args: { where: { id?: string; email?: string } }) => {
          if (args.where.id) {
            return Promise.resolve(this.users.get(args.where.id) ?? null);
          }
          if (args.where.email) {
            const target = args.where.email.toLowerCase();
            const found = [...this.users.values()].find(
              (u) => u.email.toLowerCase() === target,
            );
            return Promise.resolve(found ?? null);
          }
          return Promise.resolve(null);
        },
      ),
    findMany: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: { isActive?: boolean; role?: TestUser['role'] };
        }) => {
          let list = [...this.users.values()];
          if (args?.where?.isActive !== undefined) {
            list = list.filter((u) => u.isActive === args.where?.isActive);
          }
          if (args?.where?.role) {
            list = list.filter((u) => u.role === args.where?.role);
          }
          return Promise.resolve(
            list.map(({ password: _password, ...publicUser }) => {
              void _password;
              return publicUser;
            }),
          );
        },
      ),
    count: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: { role?: TestUser['role']; isActive?: boolean };
        }) => {
          let list = [...this.users.values()];
          if (args?.where?.role) {
            list = list.filter((u) => u.role === args.where?.role);
          }
          if (args?.where?.isActive !== undefined) {
            list = list.filter((u) => u.isActive === args.where?.isActive);
          }
          return Promise.resolve(list.length);
        },
      ),
    create: jest
      .fn()
      .mockImplementation(
        (args: {
          data: {
            name: string;
            email: string;
            password: string;
            role: TestUser['role'];
            specialties?: { connect?: Array<{ id: string }> };
          };
        }) => {
          const now = new Date();
          const connectedSpecs =
            args.data.specialties?.connect
              ?.map((c) => this.specialties.get(c.id))
              .filter((s): s is TestSpecialty => Boolean(s)) ?? [];
          const created: TestUser = {
            id: crypto.randomUUID(),
            name: args.data.name,
            email: args.data.email.toLowerCase(),
            password: args.data.password,
            role: args.data.role,
            isActive: true,
            specialties: connectedSpecs,
            createdAt: now,
            updatedAt: now,
          };
          this.users.set(created.id, created);
          const { password: _password, ...publicUser } = created;
          void _password;
          return Promise.resolve(publicUser);
        },
      ),
    update: jest
      .fn()
      .mockImplementation(
        (args: {
          where: { id: string };
          data: {
            name?: string;
            email?: string;
            role?: TestUser['role'];
            password?: string;
            isActive?: boolean;
            specialties?: { set?: Array<{ id: string }> };
          };
        }) => {
          const existing = this.users.get(args.where.id);
          if (!existing) {
            throw new Error('User not found');
          }
          if (args.data.name !== undefined) existing.name = args.data.name;
          if (args.data.email !== undefined) existing.email = args.data.email;
          if (args.data.role !== undefined) existing.role = args.data.role;
          if (args.data.password !== undefined) {
            existing.password = args.data.password;
          }
          if (args.data.isActive !== undefined) {
            existing.isActive = args.data.isActive;
          }
          if (args.data.specialties?.set !== undefined) {
            existing.specialties = args.data.specialties.set
              .map((s) => this.specialties.get(s.id))
              .filter((s): s is TestSpecialty => Boolean(s));
          }
          existing.updatedAt = new Date();
          const { password: _password, ...publicUser } = existing;
          void _password;
          return Promise.resolve(publicUser);
        },
      ),
  };

  patient = {
    findUnique: jest
      .fn()
      .mockImplementation(
        (args: {
          where: { id?: string; documentId?: string };
          include?: { appointments?: unknown };
        }) => {
          let found: TestPatient | undefined;
          if (args.where.id) {
            found = this.patients.get(args.where.id);
          } else if (args.where.documentId) {
            found = [...this.patients.values()].find(
              (p) => p.documentId === args.where.documentId,
            );
          }
          if (!found) return Promise.resolve(null);
          if (args.include?.appointments) {
            const patientApps = [...this.appointments.values()]
              .filter((a) => a.patientId === found.id)
              .map((a) => {
                const doc = this.users.get(a.doctorId);
                const spec = this.specialties.get(a.specialtyId);
                return {
                  ...a,
                  doctor: doc ? { id: doc.id, name: doc.name } : null,
                  specialty: spec ? { id: spec.id, name: spec.name } : null,
                };
              });
            return Promise.resolve({
              ...found,
              appointments: patientApps,
            });
          }
          return Promise.resolve({ ...found });
        },
      ),
    findMany: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: {
            isActive?: boolean;
            OR?: Array<{
              firstName?: { contains: string };
              lastName?: { contains: string };
              documentId?: { contains: string };
            }>;
          };
          skip?: number;
          take?: number;
        }) => {
          let list = this.filterPatients(args?.where);
          list.sort((a, b) => a.lastName.localeCompare(b.lastName));
          const skip = args?.skip ?? 0;
          const take = args?.take ?? list.length;
          list = list.slice(skip, skip + take);
          return Promise.resolve(list);
        },
      ),
    count: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: {
            isActive?: boolean;
            OR?: Array<{
              firstName?: { contains: string };
              lastName?: { contains: string };
              documentId?: { contains: string };
            }>;
          };
        }) => {
          return Promise.resolve(this.filterPatients(args?.where).length);
        },
      ),
    create: jest
      .fn()
      .mockImplementation(
        (args: {
          data: {
            documentId: string;
            firstName: string;
            lastName: string;
            email?: string | null;
            phone?: string | null;
            birthDate?: Date | null;
            address?: string | null;
          };
        }) => {
          const now = new Date();
          const created: TestPatient = {
            id: crypto.randomUUID(),
            documentId: args.data.documentId,
            firstName: args.data.firstName,
            lastName: args.data.lastName,
            email: args.data.email ?? null,
            phone: args.data.phone ?? null,
            birthDate: args.data.birthDate ?? null,
            address: args.data.address ?? null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          };
          this.patients.set(created.id, created);
          return Promise.resolve({ ...created });
        },
      ),
    update: jest
      .fn()
      .mockImplementation(
        (args: {
          where: { id: string };
          data: Partial<Omit<TestPatient, 'id' | 'createdAt' | 'updatedAt'>>;
        }) => {
          const existing = this.patients.get(args.where.id);
          if (!existing) throw new Error('Patient not found');
          Object.assign(existing, args.data, { updatedAt: new Date() });
          return Promise.resolve({ ...existing });
        },
      ),
  };

  private filterPatients(where?: {
    isActive?: boolean;
    OR?: Array<{
      firstName?: { contains: string };
      lastName?: { contains: string };
      documentId?: { contains: string };
    }>;
  }): TestPatient[] {
    let list = [...this.patients.values()];
    if (where?.isActive !== undefined) {
      list = list.filter((p) => p.isActive === where.isActive);
    }
    if (where?.OR && where.OR.length > 0) {
      const term =
        where.OR[0]?.firstName?.contains?.toLowerCase() ??
        where.OR[0]?.lastName?.contains?.toLowerCase() ??
        where.OR[0]?.documentId?.contains?.toLowerCase() ??
        '';
      if (term) {
        list = list.filter(
          (p) =>
            p.firstName.toLowerCase().includes(term) ||
            p.lastName.toLowerCase().includes(term) ||
            p.documentId.toLowerCase().includes(term),
        );
      }
    }
    return list;
  }

  medicalRecord = {
    findUnique: jest
      .fn()
      .mockImplementation((args: { where: { id: string } }) => {
        return Promise.resolve(this.medicalRecords.get(args.where.id) ?? null);
      }),
    findMany: jest
      .fn()
      .mockImplementation((args: { where: { patientId: string } }) => {
        const list = [...this.medicalRecords.values()]
          .filter((r) => r.patientId === args.where.patientId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((r) => {
            const doc = this.users.get(r.doctorId);
            return {
              ...r,
              doctor: doc
                ? { id: doc.id, name: doc.name, email: doc.email }
                : null,
            };
          });
        return Promise.resolve(list);
      }),
    create: jest
      .fn()
      .mockImplementation(
        (args: {
          data: {
            patientId: string;
            doctorId: string;
            parentRecordId?: string;
            notes: string;
            attachments: string[];
          };
        }) => {
          if (this.failNextMedicalRecordCreate) {
            this.failNextMedicalRecordCreate = false;
            return Promise.reject(
              new Error('Simulated DB write failure during medicalRecord.create'),
            );
          }
          const now = new Date();
          const created: TestMedicalRecord = {
            id: crypto.randomUUID(),
            patientId: args.data.patientId,
            doctorId: args.data.doctorId,
            parentRecordId: args.data.parentRecordId ?? null,
            notes: args.data.notes,
            attachments: args.data.attachments ?? [],
            createdAt: now,
            updatedAt: now,
          };
          this.medicalRecords.set(created.id, created);
          const doc = this.users.get(created.doctorId);
          return Promise.resolve({
            ...created,
            doctor: doc
              ? { id: doc.id, name: doc.name, email: doc.email }
              : null,
          });
        },
      ),
  };

  appointment = {
    findUnique: jest
      .fn()
      .mockImplementation(
        (args: { where: { id?: string; idempotencyKey?: string } }) => {
          if (args.where.id) {
            return Promise.resolve(this.appointments.get(args.where.id) ?? null);
          }
          if (args.where.idempotencyKey) {
            const found = [...this.appointments.values()].find(
              (a) => a.idempotencyKey === args.where.idempotencyKey,
            );
            return Promise.resolve(found ? this.hydrateAppointment(found) : null);
          }
          return Promise.resolve(null);
        },
      ),
    findMany: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: {
            status?: TestAppointment['status'] | { not?: string };
            doctorId?: string;
            patientId?: string;
            date?: { gte?: Date; lte?: Date; lt?: Date };
            OR?: Array<{ doctorId?: string; patientId?: string }>;
          };
        }) => {
          let list = [...this.appointments.values()];
          const w = args?.where;
          if (w) {
            if (typeof w.status === 'string') {
              list = list.filter((a) => a.status === w.status);
            } else if (w.status && typeof w.status === 'object' && w.status.not) {
              list = list.filter((a) => a.status !== w.status?.not);
            }
            if (w.doctorId) {
              list = list.filter((a) => a.doctorId === w.doctorId);
            }
            if (w.patientId) {
              list = list.filter((a) => a.patientId === w.patientId);
            }
            if (w.date?.gte) {
              const gte = w.date.gte.getTime();
              list = list.filter((a) => a.date.getTime() >= gte);
            }
            if (w.date?.lte) {
              const lte = w.date.lte.getTime();
              list = list.filter((a) => a.date.getTime() <= lte);
            }
            if (w.date?.lt) {
              const lt = w.date.lt.getTime();
              list = list.filter((a) => a.date.getTime() < lt);
            }
            if (w.OR && w.OR.length > 0) {
              list = list.filter((a) =>
                w.OR?.some(
                  (cond) =>
                    (cond.doctorId && a.doctorId === cond.doctorId) ||
                    (cond.patientId && a.patientId === cond.patientId),
                ),
              );
            }
          }
          list.sort((a, b) => a.date.getTime() - b.date.getTime());
          return Promise.resolve(list.map((a) => this.hydrateAppointment(a)));
        },
      ),
    create: jest
      .fn()
      .mockImplementation(
        (args: {
          data: {
            patientId: string;
            doctorId: string;
            specialtyId: string;
            date: Date;
            duration: number;
            notes?: string;
            idempotencyKey?: string;
    requestFingerprint?: string;
          };
        }) => {
          const now = new Date();
          const created: TestAppointment = {
            id: crypto.randomUUID(),
            patientId: args.data.patientId,
            doctorId: args.data.doctorId,
            specialtyId: args.data.specialtyId,
            date: args.data.date,
            duration: args.data.duration,
            status: 'PENDING',
            notes: args.data.notes ?? null,
            cancelReason: null,
            idempotencyKey: args.data.idempotencyKey ?? null,
            requestFingerprint: args.data.requestFingerprint ?? null,
            createdAt: now,
            updatedAt: now,
          };
          this.appointments.set(created.id, created);
          return Promise.resolve(this.hydrateAppointment(created));
        },
      ),
    update: jest
      .fn()
      .mockImplementation(
        (args: {
          where: { id: string };
          data: {
            status?: TestAppointment['status'];
            cancelReason?: string;
          };
        }) => {
          const existing = this.appointments.get(args.where.id);
          if (!existing) throw new Error('Appointment not found');
          if (args.data.status) existing.status = args.data.status;
          if (args.data.cancelReason !== undefined) {
            existing.cancelReason = args.data.cancelReason;
          }
          existing.updatedAt = new Date();
          return Promise.resolve(this.hydrateAppointment(existing));
        },
      ),
  };

  private hydrateAppointment(app: TestAppointment) {
    const patient = this.patients.get(app.patientId) ?? null;
    const doc = this.users.get(app.doctorId);
    const specialty = this.specialties.get(app.specialtyId) ?? null;
    return {
      ...app,
      patient,
      doctor: doc
        ? { id: doc.id, name: doc.name, email: doc.email, role: doc.role }
        : null,
      specialty,
    };
  }

  product = {
    create: jest
      .fn()
      .mockImplementation(
        (args: {
          data: {
            name: string;
            description?: string;
            minStock: number;
            price?: Prisma.Decimal;
            category?: TestProduct['category'];
          };
        }) => {
          const now = new Date();
          const created: TestProduct = {
            id: crypto.randomUUID(),
            name: args.data.name,
            description: args.data.description ?? null,
            quantity: 0,
            minStock: args.data.minStock,
            price: args.data.price ?? null,
            category: args.data.category ?? 'INSUMO_MEDICO',
            isActive: true,
            createdAt: now,
            updatedAt: now,
          };
          this.products.set(created.id, created);
          return Promise.resolve({ ...created });
        },
      ),
    findUnique: jest
      .fn()
      .mockImplementation((args: { where: { id: string } }) => {
        const found = this.products.get(args.where.id);
        return Promise.resolve(found ? { ...found } : null);
      }),
    findMany: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: {
            isActive?: boolean;
            category?: TestProduct['category'];
          };
        }) => {
          let list = [...this.products.values()];
          if (args?.where?.isActive !== undefined) {
            list = list.filter((p) => p.isActive === args.where?.isActive);
          }
          if (args?.where?.category) {
            list = list.filter((p) => p.category === args.where?.category);
          }
          return Promise.resolve(list.map((p) => ({ ...p })));
        },
      ),
    update: jest
      .fn()
      .mockImplementation(
        (args: {
          where: { id: string };
          data: {
            name?: string;
            description?: string | null;
            minStock?: number;
            price?: Prisma.Decimal | null;
            category?: TestProduct['category'];
            isActive?: boolean;
            quantity?: { increment?: number; decrement?: number };
          };
        }) => {
          const existing = this.products.get(args.where.id);
          if (!existing) throw new Error('Product not found');
          if (args.data.name !== undefined) existing.name = args.data.name;
          if (args.data.description !== undefined) {
            existing.description = args.data.description;
          }
          if (args.data.minStock !== undefined) {
            existing.minStock = args.data.minStock;
          }
          if (args.data.price !== undefined) existing.price = args.data.price;
          if (args.data.category !== undefined) {
            existing.category = args.data.category;
          }
          if (args.data.isActive !== undefined) {
            existing.isActive = args.data.isActive;
          }
          if (args.data.quantity?.increment) {
            existing.quantity += args.data.quantity.increment;
          }
          if (args.data.quantity?.decrement) {
            existing.quantity -= args.data.quantity.decrement;
          }
          existing.updatedAt = new Date();
          return Promise.resolve({ ...existing });
        },
      ),
    updateMany: jest
      .fn()
      .mockImplementation(
        (args: {
          where: {
            id: string;
            isActive?: boolean;
            quantity?: { gte: number };
          };
          data: {
            quantity: { increment?: number; decrement?: number };
          };
        }) => {
          const existing = this.products.get(args.where.id);
          if (!existing) return Promise.resolve({ count: 0 });
          if (
            args.where.isActive !== undefined &&
            existing.isActive !== args.where.isActive
          ) {
            return Promise.resolve({ count: 0 });
          }
          if (
            args.where.quantity?.gte !== undefined &&
            existing.quantity < args.where.quantity.gte
          ) {
            return Promise.resolve({ count: 0 });
          }
          if (args.data.quantity.increment) {
            existing.quantity += args.data.quantity.increment;
          }
          if (args.data.quantity.decrement) {
            existing.quantity -= args.data.quantity.decrement;
          }
          existing.updatedAt = new Date();
          return Promise.resolve({ count: 1 });
        },
      ),
  };

  stockMovement = {
    findUnique: jest
      .fn()
      .mockImplementation(
        (args: { where: { id?: string; idempotencyKey?: string } }) => {
          if (args.where.idempotencyKey) {
            const found = [...this.stockMovements.values()].find(
              (m) => m.idempotencyKey === args.where.idempotencyKey,
            );
            return Promise.resolve(found ?? null);
          }
          if (args.where.id) {
            return Promise.resolve(this.stockMovements.get(args.where.id) ?? null);
          }
          return Promise.resolve(null);
        },
      ),
    create: jest
      .fn()
      .mockImplementation(
        (args: {
          data: {
            productId: string;
            userId: string;
            type: 'IN' | 'OUT';
            quantity: number;
            notes?: string;
            idempotencyKey?: string;
    requestFingerprint?: string;
          };
        }) => {
          const created: TestStockMovement = {
            id: crypto.randomUUID(),
            productId: args.data.productId,
            userId: args.data.userId,
            type: args.data.type,
            quantity: args.data.quantity,
            notes: args.data.notes ?? null,
            idempotencyKey: args.data.idempotencyKey ?? null,
            requestFingerprint: args.data.requestFingerprint ?? null,
            createdAt: new Date(),
          };
          this.stockMovements.set(created.id, created);
          return Promise.resolve(created);
        },
      ),
  };

  invoice = {
    findUnique: jest
      .fn()
      .mockImplementation(
        (args: { where: { id?: string; idempotencyKey?: string } }) => {
          let found: TestInvoice | undefined;
          if (args.where.id) {
            found = this.invoices.get(args.where.id);
          } else if (args.where.idempotencyKey) {
            found = [...this.invoices.values()].find(
              (inv) => inv.idempotencyKey === args.where.idempotencyKey,
            );
          }
          if (!found) return Promise.resolve(null);
          return Promise.resolve(this.hydrateInvoice(found));
        },
      ),
    findMany: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: {
            patientId?: string;
            status?: TestInvoice['status'] | { not?: string };
            createdAt?: { gte?: Date; lte?: Date };
          };
          skip?: number;
          take?: number;
        }) => {
          let list = this.filterInvoices(args?.where);
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          const skip = args?.skip ?? 0;
          const take = args?.take ?? list.length;
          list = list.slice(skip, skip + take);
          return Promise.resolve(list.map((inv) => this.hydrateInvoice(inv)));
        },
      ),
    count: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: {
            patientId?: string;
            status?: TestInvoice['status'] | { not?: string };
            createdAt?: { gte?: Date; lte?: Date };
          };
        }) => {
          return Promise.resolve(this.filterInvoices(args?.where).length);
        },
      ),
    create: jest
      .fn()
      .mockImplementation(
        (args: {
          data: {
            patientId: string;
            totalAmount: Prisma.Decimal;
            status: TestInvoice['status'];
            paidAt?: Date;
            paidById?: string;
            idempotencyKey?: string;
    requestFingerprint?: string;
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
          const invoiceId = crypto.randomUUID();
          const items: TestInvoiceItem[] = args.data.items.create.map((it) => ({
            id: crypto.randomUUID(),
            invoiceId,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal,
            createdAt: now,
          }));
          const created: TestInvoice = {
            id: invoiceId,
            patientId: args.data.patientId,
            totalAmount: args.data.totalAmount,
            status: args.data.status,
            paidAt: args.data.paidAt ?? null,
            paidById: args.data.paidById ?? null,
            cancelledAt: null,
            cancelledById: null,
            cancelReason: null,
            idempotencyKey: args.data.idempotencyKey ?? null,
            requestFingerprint: args.data.requestFingerprint ?? null,
            items,
            createdAt: now,
            updatedAt: now,
          };
          this.invoices.set(created.id, created);
          return Promise.resolve(this.hydrateInvoice(created));
        },
      ),
    update: jest
      .fn()
      .mockImplementation(
        (args: {
          where: { id: string };
          data: Partial<
            Pick<
              TestInvoice,
              | 'status'
              | 'paidAt'
              | 'paidById'
              | 'cancelledAt'
              | 'cancelledById'
              | 'cancelReason'
            >
          >;
        }) => {
          const existing = this.invoices.get(args.where.id);
          if (!existing) throw new Error('Invoice not found');
          Object.assign(existing, args.data, { updatedAt: new Date() });
          return Promise.resolve(this.hydrateInvoice(existing));
        },
      ),
  };

  private filterInvoices(where?: {
    patientId?: string;
    status?: TestInvoice['status'] | { not?: string };
    createdAt?: { gte?: Date; lte?: Date };
  }): TestInvoice[] {
    let list = [...this.invoices.values()];
    if (!where) return list;
    if (where.patientId) {
      list = list.filter((inv) => inv.patientId === where.patientId);
    }
    if (typeof where.status === 'string') {
      list = list.filter((inv) => inv.status === where.status);
    } else if (
      where.status &&
      typeof where.status === 'object' &&
      where.status.not
    ) {
      list = list.filter((inv) => inv.status !== where.status?.not);
    }
    if (where.createdAt?.gte) {
      const gte = where.createdAt.gte.getTime();
      list = list.filter((inv) => inv.createdAt.getTime() >= gte);
    }
    if (where.createdAt?.lte) {
      const lte = where.createdAt.lte.getTime();
      list = list.filter((inv) => inv.createdAt.getTime() <= lte);
    }
    return list;
  }

  private hydrateInvoice(inv: TestInvoice) {
    const p = this.patients.get(inv.patientId);
    return {
      ...inv,
      patient: p
        ? {
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            documentId: p.documentId,
          }
        : undefined,
    };
  }

  auditLog = {
    create: jest
      .fn()
      .mockImplementation(
        (args: {
          data: {
            actorId?: string;
            actorRole?: string;
            action: string;
            resource: string;
            resourceId?: string;
            patientId?: string;
            reason?: string;
            metadata?: unknown;
            ipAddress?: string;
          };
        }) => {
          const entry: TestAuditLog = {
            id: crypto.randomUUID(),
            actorId: args.data.actorId ?? null,
            actorRole: args.data.actorRole ?? null,
            action: args.data.action,
            resource: args.data.resource,
            resourceId: args.data.resourceId ?? null,
            patientId: args.data.patientId ?? null,
            reason: args.data.reason ?? null,
            metadata: args.data.metadata ?? null,
            ipAddress: args.data.ipAddress ?? null,
            createdAt: new Date(),
          };
          this.auditLogs.unshift(entry);
          return Promise.resolve(entry);
        },
      ),
    findMany: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: {
            patientId?: string;
            resource?: string;
            action?: string;
          };
          skip?: number;
          take?: number;
        }) => {
          let list = [...this.auditLogs];
          if (args?.where?.patientId) {
            list = list.filter((a) => a.patientId === args.where?.patientId);
          }
          if (args?.where?.resource) {
            list = list.filter((a) => a.resource === args.where?.resource);
          }
          if (args?.where?.action) {
            list = list.filter((a) => a.action === args.where?.action);
          }
          const skip = args?.skip ?? 0;
          const take = args?.take ?? list.length;
          return Promise.resolve(list.slice(skip, skip + take));
        },
      ),
    count: jest
      .fn()
      .mockImplementation(
        (args?: {
          where?: {
            patientId?: string;
            resource?: string;
            action?: string;
          };
        }) => {
          let list = [...this.auditLogs];
          if (args?.where?.patientId) {
            list = list.filter((a) => a.patientId === args.where?.patientId);
          }
          if (args?.where?.resource) {
            list = list.filter((a) => a.resource === args.where?.resource);
          }
          if (args?.where?.action) {
            list = list.filter((a) => a.action === args.where?.action);
          }
          return Promise.resolve(list.length);
        },
      ),
  };
}

/**
 * Arnés de Storage que utiliza la validación real de `StorageService.validateClinicalFile`
 * (magic bytes, MIME, tamaño <= 10 MB y SHA-256) y persiste objetos en un bucket en memoria
 * descartable para verificar subidas, URLs firmadas y compensación (`removeFile`).
 */
class DisposableInMemoryStorage extends StorageService {
  readonly objects = new Map<string, Buffer>();

  override uploadValidatedFile(
    file: Express.Multer.File,
    patientId: string,
  ): Promise<UploadedClinicalFileResult> {
    const metadata = this.validateClinicalFile(file);
    const storagePath = `${patientId}/${crypto.randomUUID()}.${metadata.canonicalExt}`;
    this.objects.set(storagePath, Buffer.from(file.buffer));
    return Promise.resolve({
      ...metadata,
      storagePath,
    });
  }

  override async uploadFile(
    file: Express.Multer.File,
    patientId: string,
  ): Promise<string> {
    const res = await this.uploadValidatedFile(file, patientId);
    return res.storagePath;
  }

  override removeFile(path: string): Promise<void> {
    this.objects.delete(path);
    return Promise.resolve();
  }

  override getSignedUrl(path: string, expiresInSeconds = 900): Promise<string> {
    if (!this.objects.has(path)) {
      return Promise.reject(new Error('Object not found in bucket'));
    }
    return Promise.resolve(
      `https://storage.surmed-test.local/medical-records/${path}?token=signed&exp=${expiresInSeconds}`,
    );
  }
}

describe('Fase 5 — Matriz de Aceptación E2E (Bootstrap Real)', () => {
  let app: INestApplication<App>;
  let db: DisposableInMemoryPrisma;
  let storage: DisposableInMemoryStorage;

  let adminToken: string;
  let doctorToken: string;
  let recepcionToken: string;

  let specialtyCardioId: string;
  let specialtyDermaId: string;
  let doctorId: string;
  let recepcionId: string;
  let patientId: string;

  const TEST_DB_URL =
    process.env.TEST_DATABASE_URL ??
    'postgresql://surmed_test:surmed_test@127.0.0.1:5432/surmed_crm_e2e_test?schema=test';

  beforeAll(async () => {
    // 1. Verificar que la base de datos esté explícitamente identificada como `test`
    assertDisposableTestDatabaseUrl(TEST_DB_URL);

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.JWT_SECRET =
      'surmed_e2e_test_secret_key_with_at_least_32_characters_2026';
    process.env.SUPABASE_URL = 'https://surmed-e2e-test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'e2e_test_service_role_key';
    process.env.CORS_ORIGINS = 'http://localhost:3000';

    db = new DisposableInMemoryPrisma();
    storage = new DisposableInMemoryStorage();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();

    app = moduleFixture.createNestApplication();
    // 2. Aplicar exactamente el mismo bootstrap que `src/main.ts`
    configureApp(app);
    await app.init();

    // Sembrar administrador inicial en la base descartable
    const adminPasswordHash = await bcrypt.hash('AdminPass2026!', 10);
    const now = new Date();
    const adminId = crypto.randomUUID();
    db.users.set(adminId, {
      id: adminId,
      name: 'Directora Admin',
      email: 'admin@surmed.test',
      password: adminPasswordHash,
      role: 'ADMIN',
      isActive: true,
      specialties: [],
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    db.clearAll();
    storage.objects.clear();
    if (app) {
      await app.close();
    }
  });

  describe('0. Guardia de base descartable y Salud / Cabeceras (Entrega)', () => {
    it('rechaza explícitamente ejecutar E2E contra una URL que no sea de prueba', () => {
      expect(() =>
        assertDisposableTestDatabaseUrl(
          'postgresql://postgres:secret@db.prod.surmed.py:5432/surmed_production',
        ),
      ).toThrow(/no está identificada explícitamente como entorno descartable/i);
    });

    it('propaga X-Request-Id, cabeceras de seguridad y responde /health y /health/ready', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .set('X-Request-Id', 'e2e-correlation-001')
        .expect(200);

      expect(res.headers['x-request-id']).toBe('e2e-correlation-001');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({
        status: 'ready',
        database: 'up',
      });

      const livenessRes = await request(app.getHttpServer())
        .get('/health')
        .expect(200);
      expect(livenessRes.body).toMatchObject({ status: 'ok' });

      // Si la base cae, /health/ready devuelve 503 Service Unavailable
      db.simulateDbDown = true;
      await request(app.getHttpServer()).get('/health/ready').expect(503);
      db.simulateDbDown = false;
    });
  });

  describe('1. Autenticación (Alta -> Login -> Sesión -> Logout | Negativos)', () => {
    it('permite login de ADMIN, creación de especialidades y provisión de MEDICO y RECEPCION', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@surmed.test',
          password: 'AdminPass2026!',
        })
        .expect(200);

      const loginBody = loginRes.body as {
        backendToken: string;
        user: { role: string };
      };
      expect(loginBody.backendToken).toBeDefined();
      expect(loginBody.user.role).toBe('ADMIN');
      adminToken = loginBody.backendToken;

      // Crear 2 especialidades para las pruebas de turnos
      const cardioRes = await request(app.getHttpServer())
        .post('/specialties')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Cardiología Clínica',
          description: 'Atención cardiovascular',
        })
        .expect(201);
      specialtyCardioId = (cardioRes.body as { id: string }).id;

      const dermaRes = await request(app.getHttpServer())
        .post('/specialties')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dermatología',
          description: 'Cuidado de la piel',
        })
        .expect(201);
      specialtyDermaId = (dermaRes.body as { id: string }).id;

      // Alta de MEDICO con contraseña inicial válida
      const docRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dr. Carlos Gómez',
          email: 'medico@surmed.test',
          password: 'MedicoPass2026!',
          role: 'MEDICO',
          specialtyId: specialtyCardioId,
        })
        .expect(201);
      const docBody = docRes.body as { id: string; password?: string };
      expect(docBody.password).toBeUndefined();
      doctorId = docBody.id;

      // Alta de RECEPCION
      const recRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Laura Recepción',
          email: 'recepcion@surmed.test',
          password: 'RecepPass2026!',
          role: 'RECEPCION',
        })
        .expect(201);
      recepcionId = (recRes.body as { id: string }).id;

      // Login de MEDICO y RECEPCION
      const docLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'medico@surmed.test', password: 'MedicoPass2026!' })
        .expect(200);
      doctorToken = (docLogin.body as { backendToken: string }).backendToken;

      const recLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'recepcion@surmed.test', password: 'RecepPass2026!' })
        .expect(200);
      recepcionToken = (recLogin.body as { backendToken: string }).backendToken;
    });

    it('rechaza clave inválida (401), revoca token en logout (401) y aplica rate-limit (429)', async () => {
      // Login temporal para probar logout y revocación inmediata del JWT (jti)
      const tempLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'recepcion@surmed.test', password: 'RecepPass2026!' })
        .expect(200);
      const tempToken = (tempLogin.body as { backendToken: string })
        .backendToken;

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(200);

      // El token cerrado ya no es aceptado por JwtStrategy
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(401);

      // 5 intentos fallidos consecutivos activan el bloqueo 429 Too Many Requests
      const bruteEmail = 'ataque-fuerza-bruta@surmed.test';
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: bruteEmail, password: 'WrongPassword123' })
          .expect(401);
      }

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: bruteEmail, password: 'WrongPassword123' })
        .expect(429);

      // Desactivar usuario revoca su sesión activa e impide nuevo login (401), y reactivarlo restablece el acceso
      await request(app.getHttpServer())
        .delete(`/users/${recepcionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'recepcion@surmed.test', password: 'RecepPass2026!' })
        .expect(401);

      await request(app.getHttpServer())
        .patch(`/users/${recepcionId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const reLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'recepcion@surmed.test', password: 'RecepPass2026!' })
        .expect(200);
      recepcionToken = (reLogin.body as { backendToken: string }).backendToken;
    });
  });

  describe('2. Autorización y RBAC por Rol', () => {
    it('impide a RECEPCION acceder a historia clínica y a MEDICO operar inventario o facturación', async () => {
      // RECEPCION no puede crear ni leer evoluciones clínicas (403)
      await request(app.getHttpServer())
        .post('/medical-records')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({ patientId: crypto.randomUUID(), notes: 'Intento no autorizado' })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/medical-records/patient/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(403);

      // ADMIN puede auditar lectura clínica pero NO puede firmar evoluciones como médico (403)
      await request(app.getHttpServer())
        .post('/medical-records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patientId: crypto.randomUUID(), notes: 'Intento admin' })
        .expect(403);

      // MEDICO no puede crear productos de inventario ni emitir facturas (403)
      await request(app.getHttpServer())
        .post('/inventory/products')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ name: 'Insumo X', minStock: 5 })
        .expect(403);

      await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId: crypto.randomUUID(),
          items: [{ description: 'Consulta', quantity: 1, unitPrice: 100000 }],
        })
        .expect(403);

      // KPIs financieros ocultos (null) para MEDICO y RECEPCION
      const kpiDoc = await request(app.getHttpServer())
        .get('/dashboard-stats/kpis')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(kpiDoc.body).toMatchObject({
        monthlyRevenue: null,
        monthlyPending: null,
        monthlyIssued: null,
      });
    });
  });

  describe('3. Pacientes (Alta sin email, búsqueda, archivo y no exposición clínica)', () => {
    it('crea paciente con email vacío normalizado a null, rechaza duplicados y fechas futuras, y filtra/pagina correctamente', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({
          documentId: '4589123',
          firstName: 'María',
          lastName: 'Benítez',
          email: '',
          phone: '+595981112233',
          birthDate: '1990-05-15',
          address: 'Av. Mcal. López 1234',
        })
        .expect(201);

      const createdPatient = createRes.body as {
        id: string;
        email: string | null;
      };
      expect(createdPatient.email).toBeNull();
      patientId = createdPatient.id;
      await request(app.getHttpServer())
        .post('/medical-records/access/grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId,
          doctorId,
          reason: 'Asignación verificada para prueba clínica',
        })
        .expect(201);

      // Segundo paciente sin email para confirmar que no colisiona UNIQUE(email)
      await request(app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({
          documentId: '5123999',
          firstName: 'Jorge',
          lastName: 'Villalba',
          email: '   ',
          birthDate: '1985-10-20',
        })
        .expect(201);

      // Documento duplicado -> 409 Conflict
      await request(app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({
          documentId: '4589123',
          firstName: 'Clon',
          lastName: 'Duplicado',
          birthDate: '1992-03-10',
        })
        .expect(409);

      // Fecha de nacimiento futura -> 400 Bad Request
      await request(app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({
          documentId: '9988776',
          firstName: 'Futuro',
          lastName: 'Invalido',
          birthDate: '2099-01-01',
        })
        .expect(400);

      // Búsqueda paginada en servidor y rechazo de query malformada (page=10abc)
      await request(app.getHttpServer())
        .get('/patients?page=10abc')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(400);

      const searchRes = await request(app.getHttpServer())
        .get('/patients?search=Benítez&page=1&limit=1')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(200);

      const searchBody = searchRes.body as {
        data: Array<{ id: string }>;
        meta: { total: number };
      };
      expect(searchBody.meta.total).toBe(1);
      expect(searchBody.data[0]?.id).toBe(patientId);

      // Ficha administrativa GET /patients/:id NUNCA incluye medicalRecords
      const detailRes = await request(app.getHttpServer())
        .get(`/patients/${patientId}`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(200);
      expect(detailRes.body).not.toHaveProperty('medicalRecords');

      // Edición de paciente, archivo lógico (exclusivo ADMIN), reactivación y paciente inexistente (404)
      await request(app.getHttpServer())
        .patch(`/patients/${patientId}`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({ address: 'Av. España 456' })
        .expect(200);

      // RECEPCION no puede archivar pacientes (403); ADMIN sí puede archivar y reactivar (200)
      await request(app.getHttpServer())
        .delete(`/patients/${patientId}`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/patients/${patientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/patients/${patientId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/patients/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(404);
    });
  });

  describe('4. Historia Clínica, Archivos y Auditoría (T11 / T12)', () => {
    let mainRecordId: string;

    it('permite a MEDICO crear evolución con PDF válido (%PDF-), crear adenda inmutable y auditar accesos', async () => {
      const validPdfBuffer = Buffer.from(
        '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
        'utf-8',
      );

      const createRec = await request(app.getHttpServer())
        .post('/medical-records')
        .set('Authorization', `Bearer ${doctorToken}`)
        .field('patientId', patientId)
        .field(
          'notes',
          'Paciente acude a control cardiológico. PA 120/80 mmHg.',
        )
        .attach('file', validPdfBuffer, {
          filename: 'electrocardiograma.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const recBody = createRec.body as {
        id: string;
        attachments: string[];
      };
      expect(recBody.attachments).toHaveLength(1);
      expect(storage.objects.size).toBe(1);
      mainRecordId = recBody.id;

      // Crear adenda vinculada sin sobrescribir la evolución original
      const addendumRes = await request(app.getHttpServer())
        .post(`/medical-records/${mainRecordId}/addendum`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          notes: 'Aclaración: se adjunta informe de ECG basal normal.',
          reason: 'Complemento de lectura de estudio',
        })
        .expect(201);

      expect(
        (addendumRes.body as { parentRecordId: string }).parentRecordId,
      ).toBe(mainRecordId);

      // Lectura de historia clínica devuelve URL firmada temporal y registra auditoría
      const listRes = await request(app.getHttpServer())
        .get(`/medical-records/patient/${patientId}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const records = listRes.body as Array<{
        id: string;
        attachments: string[];
      }>;
      expect(records.length).toBe(2);
      const original = records.find((r) => r.id === mainRecordId);
      expect(original?.attachments[0]).toContain('/api/backend/medical-records/attachments/');

      // ADMIN consulta la bitácora de auditoría y verifica eventos sin filtración de notas clínicas
      const auditRes = await request(app.getHttpServer())
        .get(`/audit-logs?patientId=${patientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const auditBody = auditRes.body as {
        data: Array<{ action: string; metadata: unknown }>;
      };
      const actions = auditBody.data.map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'MEDICAL_RECORD_CREATE',
          'MEDICAL_RECORD_ADDENDUM',
          'MEDICAL_RECORD_READ',
        ]),
      );
      expect(JSON.stringify(auditBody.data)).not.toContain('PA 120/80 mmHg');
    });

    it('rechaza archivo falso con extensión .pdf pero firma binaria ejecutable MZ (400) y compensa Storage si falla la DB', async () => {
      const fakePdfExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00FakeExecutable');

      await request(app.getHttpServer())
        .post('/medical-records')
        .set('Authorization', `Bearer ${doctorToken}`)
        .field('patientId', patientId)
        .field('notes', 'Intento con archivo malicioso camuflado')
        .attach('file', fakePdfExe, {
          filename: 'malware.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      // Simular fallo de base de datos tras subir un PDF válido: el objeto no debe quedar huérfano en Storage
      const objectsBefore = storage.objects.size;
      db.failNextMedicalRecordCreate = true;

      const validPdfBuffer = Buffer.from('%PDF-1.4\nContenido limpio\n%%EOF');
      await request(app.getHttpServer())
        .post('/medical-records')
        .set('Authorization', `Bearer ${doctorToken}`)
        .field('patientId', patientId)
        .field('notes', 'Evolución que fallará en DB')
        .attach('file', validPdfBuffer, {
          filename: 'estudio-compensado.pdf',
          contentType: 'application/pdf',
        })
        .expect(500);

      expect(storage.objects.size).toBe(objectsBefore);
    });
  });

  describe('5. Turnos (Zona horaria Asunción, solapamientos, especialidad y máquina de estados)', () => {
    let appointmentId: string;

    it('agenda turno en zona America/Asuncion (-03:00), bloquea solapamientos (409), valida especialidad/rol y controla estados', async () => {
      // 1. Alta de turno con hora local naive "2026-11-10T09:00" -> 12:00:00.000Z (-03:00)
      const createRes = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .set('Idempotency-Key', 'idem-turno-001')
        .send({
          patientId,
          doctorId,
          specialtyId: specialtyCardioId,
          date: '2026-11-10T09:00',
          duration: 30,
          notes: 'Control anual',
        })
        .expect(201);

      const createdApp = createRes.body as {
        id: string;
        date: string;
        status: string;
      };
      expect(createdApp.date).toBe('2026-11-10T12:00:00.000Z');
      expect(createdApp.status).toBe('PENDING');
      appointmentId = createdApp.id;

      // Reintento con la misma Idempotency-Key devuelve el mismo turno sin error de solapamiento
      const retryRes = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .set('Idempotency-Key', 'idem-turno-001')
        .send({
          patientId,
          doctorId,
          specialtyId: specialtyCardioId,
          date: '2026-11-10T09:00',
          duration: 30,
          notes: 'Control anual',
        })
        .expect(201);
      expect((retryRes.body as { id: string }).id).toBe(appointmentId);

      // 2. Superposición de intervalo (09:15 a 09:45 choca con 09:00 a 09:30) -> 409 Conflict
      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({
          patientId,
          doctorId,
          specialtyId: specialtyCardioId,
          date: '2026-11-10T09:15',
          duration: 30,
        })
        .expect(409);

      // 3. Especialidad que el médico no atiende -> 400 Bad Request
      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({
          patientId,
          doctorId,
          specialtyId: specialtyDermaId,
          date: '2026-11-10T11:00',
          duration: 30,
        })
        .expect(400);

      // 4. Usuario que no tiene rol MEDICO (ej. recepcionId) -> 400 Bad Request
      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({
          patientId,
          doctorId: recepcionId,
          specialtyId: specialtyCardioId,
          date: '2026-11-10T11:00',
          duration: 30,
        })
        .expect(400);

      // 5. Transiciones válidas: PENDING -> CONFIRMED -> ATTENDED
      await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/status`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({ status: 'CONFIRMED' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'ATTENDED' })
        .expect(200);

      // 6. Transición inválida desde estado terminal ATTENDED -> PENDING (409 Conflict)
      await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/status`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({ status: 'PENDING' })
        .expect(409);
    });
  });

  describe('6. Inventario (Entrada -> Salida -> Concurrencia, Idempotencia y Bloqueo de PATCH directo)', () => {
    let productId: string;

    it('ejecuta ciclo IN/OUT atómico, evita doble descuento bajo concurrencia, rechaza PATCH de quantity y bloquea productos inactivos', async () => {
      const prodRes = await request(app.getHttpServer())
        .post('/inventory/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Guantes de Nitrilo Caja x100',
          minStock: 5,
          price: 45000,
          category: 'INSUMO_MEDICO',
        })
        .expect(201);

      productId = (prodRes.body as { id: string }).id;

      // 1. Intento de alterar `quantity` por PATCH directo -> 400 Bad Request (ValidationPipe forbidNonWhitelisted)
      await request(app.getHttpServer())
        .patch(`/inventory/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 9999 })
        .expect(400);

      // 2. Ingreso de 10 unidades con Idempotency-Key (y reintento idempotente)
      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'idem-stock-in-10')
        .send({
          productId,
          type: 'IN',
          quantity: 10,
          notes: 'Compra lote inicial',
        })
        .expect(201);

      const replayRes = await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'idem-stock-in-10')
        .send({
          productId,
          type: 'IN',
          quantity: 10,
          notes: 'Compra lote inicial',
        })
        .expect(201);

      expect(
        (replayRes.body as { updatedProduct: { quantity: number } })
          .updatedProduct.quantity,
      ).toBe(10);

      // 3. Dos salidas simultáneas de 8 unidades sobre saldo 10 -> exactamente 1 éxito (201) y 1 rechazo por saldo insuficiente (400)
      const [outA, outB] = await Promise.all([
        request(app.getHttpServer())
          .post('/inventory/movements')
          .set('Authorization', `Bearer ${recepcionToken}`)
          .send({ productId, type: 'OUT', quantity: 8, notes: 'Consumo A' }),
        request(app.getHttpServer())
          .post('/inventory/movements')
          .set('Authorization', `Bearer ${recepcionToken}`)
          .send({ productId, type: 'OUT', quantity: 8, notes: 'Consumo B' }),
      ]);

      const statuses = [outA.status, outB.status].sort();
      expect(statuses).toEqual([201, 400]);

      const checkProd = await request(app.getHttpServer())
        .get(`/inventory/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((checkProd.body as { quantity: number }).quantity).toBe(2);

      // 4. Desactivar producto e intentar registrar movimiento -> 400 Bad Request
      await request(app.getHttpServer())
        .delete(`/inventory/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId, type: 'IN', quantity: 5 })
        .expect(400);

      // Reactivar producto (F16)
      await request(app.getHttpServer())
        .patch(`/inventory/products/${productId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('7. Cobros y Caja (Emisión PENDING -> Pago -> KPI Cobrado vs Pendiente -> Anulación)', () => {
    let invoiceId: string;

    it('separa Emitido/Pendiente de Cobrado en KPIs, valida ítems y audita cobro y anulación', async () => {
      // 1. Factura sin ítems o con monto negativo -> 400 Bad Request
      await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({ patientId, items: [] })
        .expect(400);

      await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .send({
          patientId,
          items: [{ description: 'Ítem inválido', quantity: 1, unitPrice: -50 }],
        })
        .expect(400);

      // 2. Emitir comprobante en estado PENDING (Gs. 250.000) con Idempotency-Key
      const emitRes = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${recepcionToken}`)
        .set('Idempotency-Key', 'idem-inv-001')
        .send({
          patientId,
          items: [
            {
              description: 'Consulta Cardiológica',
              quantity: 1,
              unitPrice: 200000,
            },
            {
              description: 'Electrocardiograma',
              quantity: 1,
              unitPrice: 50000,
            },
          ],
        })
        .expect(201);

      const emitted = emitRes.body as {
        id: string;
        status: string;
        totalAmount: number;
      };
      expect(emitted.status).toBe('PENDING');
      expect(emitted.totalAmount).toBe(250000);
      invoiceId = emitted.id;

      // Mientras está PENDING, `monthlyRevenue` (Cobrado) es 0 y `monthlyPending` es 250000
      const kpiBeforePay = await request(app.getHttpServer())
        .get('/dashboard-stats/kpis')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(kpiBeforePay.body).toMatchObject({
        monthlyRevenue: 0,
        monthlyPending: 250000,
        monthlyIssued: 250000,
      });

      // 3. Registrar cobro (`PATCH /invoices/:id/pay`) -> pasa a PAID e impacta en `monthlyRevenue`
      const payRes = await request(app.getHttpServer())
        .patch(`/invoices/${invoiceId}/pay`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(200);
      expect((payRes.body as { status: string }).status).toBe('PAID');

      // Doble cobro sobre factura ya pagada -> 409 Conflict
      await request(app.getHttpServer())
        .patch(`/invoices/${invoiceId}/pay`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(409);

      const kpiAfterPay = await request(app.getHttpServer())
        .get('/dashboard-stats/kpis')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(kpiAfterPay.body).toMatchObject({
        monthlyRevenue: 250000,
        monthlyPending: 0,
        monthlyIssued: 250000,
      });

      // Paid receipts require a separate refund process, not cancellation.
      await request(app.getHttpServer())
        .patch(`/invoices/${invoiceId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'No debe borrar un pago' }).expect(409);
      const pendingForCancel = await request(app.getHttpServer())
        .post('/invoices').set('Authorization', `Bearer ${recepcionToken}`)
        .send({ patientId, items: [{ description: 'Consulta pendiente', quantity: 1, unitPrice: 100 }] }).expect(201);
      const cancelledId = (pendingForCancel.body as { id: string }).id;
      const cancelRes = await request(app.getHttpServer())
        .patch(`/invoices/${cancelledId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Error de carga en recepción' }).expect(200);
      expect((cancelRes.body as { status: string }).status).toBe('CANCELLED');

      // Intentar cobrar una factura anulada -> 409 Conflict
      await request(app.getHttpServer())
        .patch(`/invoices/${cancelledId}/pay`)
        .set('Authorization', `Bearer ${recepcionToken}`)
        .expect(409);

      const kpiAfterCancel = await request(app.getHttpServer())
        .get('/dashboard-stats/kpis')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(kpiAfterCancel.body).toMatchObject({
        monthlyRevenue: 250000,
        monthlyPending: 0,
        monthlyIssued: 250000,
      });
    });
  });
});
