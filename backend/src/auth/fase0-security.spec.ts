import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Type,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { TokenRevocationService } from './token-revocation.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { UsersService } from '../users/users.service';
import { UsersController } from '../users/users.controller';
import { MedicalRecordsController } from '../medical-records/medical-records.controller';
import { PatientsService } from '../patients/patients.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { InventoryController } from '../inventory/inventory.controller';
import { validateEnv } from '../config/env.validation';

function buildExecutionContext(
  controllerClass: Type<unknown>,
  handlerName: string,
  role?: 'ADMIN' | 'MEDICO' | 'RECEPCION',
): ExecutionContext {
  const proto = controllerClass.prototype as Record<string, unknown>;
  const handler = proto[handlerName];
  return {
    getHandler: () => handler,
    getClass: () => controllerClass,
    switchToHttp: () => ({
      getRequest: () => ({
        user: role
          ? { id: 'user-1', email: 'test@surmed.com', role }
          : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('Fase 0 — Seguridad, Credenciales, Autorización y Sesión (T01, T02, T03)', () => {
  describe('T01 · Aprovisionamiento y credenciales (S01, S02, S04)', () => {
    it('elimina la ruta pública GET /auth/seed y seedAdmin()', () => {
      expect(
        (AuthController.prototype as unknown as Record<string, unknown>).seed,
      ).toBeUndefined();
      expect(
        (AuthService.prototype as unknown as Record<string, unknown>).seedAdmin,
      ).toBeUndefined();
    });

    it('hashea la contraseña al crear usuario, permite login con bcrypt y nunca expone password en respuestas', async () => {
      let persistedRecord: Record<string, unknown> | null = null;
      let createSelectUsed: Record<string, boolean> | undefined;

      const prismaMock = {
        user: {
          findUnique: jest.fn(
            ({ where }: { where: { email?: string; id?: string } }) => {
              if (!persistedRecord) return Promise.resolve(null);
              if (where.email && persistedRecord.email === where.email) {
                return Promise.resolve(persistedRecord);
              }
              if (where.id && persistedRecord.id === where.id) {
                return Promise.resolve(persistedRecord);
              }
              return Promise.resolve(null);
            },
          ),
          create: jest.fn(
            ({
              data,
              select,
            }: {
              data: Record<string, unknown>;
              select: Record<string, boolean>;
            }) => {
              createSelectUsed = select;
              persistedRecord = {
                id: 'user-medico-1',
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                specialties: [],
                ...data,
              };
              const publicResult: Record<string, unknown> = {};
              for (const key of Object.keys(select)) {
                if (select[key]) {
                  publicResult[key] = persistedRecord[key];
                }
              }
              return Promise.resolve(publicResult);
            },
          ),
          update: jest.fn(
            ({
              data,
              select,
            }: {
              data: Record<string, unknown>;
              select: Record<string, boolean>;
            }) => {
              persistedRecord = { ...persistedRecord, ...data };
              const publicResult: Record<string, unknown> = {};
              for (const key of Object.keys(select)) {
                if (select[key]) {
                  publicResult[key] = persistedRecord[key];
                }
              }
              return Promise.resolve(publicResult);
            },
          ),
        },
      };

      const revocation = new TokenRevocationService();
      const rateLimit = new LoginRateLimitService();
      const usersService = new UsersService(prismaMock as never, revocation);
      const jwtService = new JwtService({
        secret: 'test_secret_with_at_least_16_chars',
      });
      const authService = new AuthService(
        prismaMock as never,
        jwtService,
        revocation,
        rateLimit,
      );

      const created = await usersService.create({
        name: 'Dra. Ana Torres',
        email: 'ANA@SURMED.COM',
        password: 'ClaveSegura2026!',
        role: 'MEDICO',
      });

      // 1. La base guarda un hash bcrypt, jamás el texto plano
      expect(persistedRecord).not.toBeNull();
      expect(persistedRecord!.password).not.toBe('ClaveSegura2026!');
      expect(String(persistedRecord!.password)).toMatch(/^\$2[aby]\$/);

      // 2. La respuesta de creación usa select explícito y no contiene password
      expect(createSelectUsed?.password).toBeUndefined();
      expect((created as Record<string, unknown>).password).toBeUndefined();

      // 3. El usuario recién creado puede iniciar sesión con su clave
      const loginResult = await authService.login({
        email: 'ana@surmed.com',
        password: 'ClaveSegura2026!',
      });
      expect(loginResult.user.email).toBe('ana@surmed.com');
      expect(
        (loginResult.user as Record<string, unknown>).password,
      ).toBeUndefined();
      expect(typeof loginResult.backendToken).toBe('string');

      // 4. Editar y desactivar tampoco devuelven password
      const updated = await usersService.update('user-medico-1', {
        name: 'Dra. Ana María Torres',
      });
      expect((updated as Record<string, unknown>).password).toBeUndefined();

      const deactivated = await usersService.remove('user-medico-1');
      expect((deactivated as Record<string, unknown>).password).toBeUndefined();
      expect(deactivated.isActive).toBe(false);

      // 5. Usuario desactivado no puede iniciar sesión ni validar JWT
      await expect(
        authService.login({
          email: 'ana@surmed.com',
          password: 'ClaveSegura2026!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza contraseñas cortas, vacías o emails duplicados al crear usuario', async () => {
      const prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        },
      };
      const usersService = new UsersService(prismaMock as never);

      await expect(
        usersService.create({
          name: 'Test',
          email: 'test@surmed.com',
          password: '123',
          role: 'RECEPCION',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        usersService.create({
          name: 'Test',
          email: 'test@surmed.com',
          password: 'ClaveValida123!',
          role: 'RECEPCION',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('AppointmentsService.create selecciona solo campos públicos del médico (sin password)', async () => {
      let capturedArgs: Record<string, unknown> | null = null;
      const appointmentsService = new AppointmentsService({
        appointment: {
          create: jest.fn((args: Record<string, unknown>) => {
            capturedArgs = args;
            return Promise.resolve(args);
          }),
        },
      } as never);

      await appointmentsService.create({
        patientId: 'pat-1',
        doctorId: 'doc-1',
        specialtyId: 'spec-1',
        date: '2026-11-05T10:00:00Z',
      });

      const include = capturedArgs?.include as Record<string, unknown>;
      expect(include.doctor).not.toBe(true);
      expect(include.doctor).toEqual({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });
    });
  });

  describe('T02 · Autorización clínica y administrativa (S03, S08)', () => {
    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);

    it('bloquea a RECEPCION para leer o crear historias clínicas y exige MEDICO para crear evoluciones', () => {
      // Crear evolución: solo MEDICO
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(
            MedicalRecordsController,
            'create',
            'RECEPCION',
          ),
        ),
      ).toBe(false);
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(MedicalRecordsController, 'create', 'ADMIN'),
        ),
      ).toBe(false);
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(MedicalRecordsController, 'create', 'MEDICO'),
        ),
      ).toBe(true);

      // Consultar historia clínica: MEDICO y ADMIN permitidos, RECEPCION bloqueado (403)
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(
            MedicalRecordsController,
            'findByPatient',
            'RECEPCION',
          ),
        ),
      ).toBe(false);
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(
            MedicalRecordsController,
            'findByPatient',
            'MEDICO',
          ),
        ),
      ).toBe(true);
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(
            MedicalRecordsController,
            'findByPatient',
            'ADMIN',
          ),
        ),
      ).toBe(true);
    });

    it('la ficha administrativa GET /patients/:id no incluye medicalRecords', async () => {
      let queryArgs: Record<string, unknown> | null = null;
      const patientsService = new PatientsService({
        patient: {
          findUnique: jest.fn((args: Record<string, unknown>) => {
            queryArgs = args;
            return Promise.resolve({
              id: 'patient-1',
              firstName: 'Juan',
              lastName: 'Pérez',
              appointments: [],
            });
          }),
        },
      } as never);

      const patient = await patientsService.findOne('patient-1');
      const include = queryArgs?.include as Record<string, unknown>;

      expect(include.medicalRecords).toBeUndefined();
      expect(
        (patient as Record<string, unknown>).medicalRecords,
      ).toBeUndefined();
    });

    it('restringe métricas de ingresos a ADMIN y alertas de stock a ADMIN y RECEPCION', async () => {
      const prismaMock = {
        patient: { count: jest.fn().mockResolvedValue(42) },
        invoice: {
          findMany: jest.fn().mockResolvedValue([{ totalAmount: 150000 }]),
        },
      };
      const dashboardService = new DashboardService(prismaMock as never);

      const medicoStats = await dashboardService.getStats('MEDICO');
      expect(medicoStats).toEqual({ totalPatients: 42, monthlyRevenue: null });
      expect(prismaMock.invoice.findMany).not.toHaveBeenCalled();

      const recepcionStats = await dashboardService.getStats('RECEPCION');
      expect(recepcionStats).toEqual({
        totalPatients: 42,
        monthlyRevenue: null,
      });

      const adminStats = await dashboardService.getStats('ADMIN');
      expect(adminStats).toEqual({
        totalPatients: 42,
        monthlyRevenue: 150000,
      });

      // Endpoint de low-stock bloqueado para MEDICO
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(DashboardController, 'getLowStock', 'MEDICO'),
        ),
      ).toBe(false);
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(
            DashboardController,
            'getLowStock',
            'RECEPCION',
          ),
        ),
      ).toBe(true);
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(
            InventoryController,
            'findAllProducts',
            'MEDICO',
          ),
        ),
      ).toBe(false);
    });

    it('restringe listado completo y detalle de usuarios para roles no ADMIN', async () => {
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(UsersController, 'findOne', 'RECEPCION'),
        ),
      ).toBe(false);
      expect(
        rolesGuard.canActivate(
          buildExecutionContext(UsersController, 'findOne', 'ADMIN'),
        ),
      ).toBe(true);

      let whereUsed: Record<string, unknown> | undefined;
      const usersService = new UsersService({
        user: {
          findMany: jest.fn(({ where }: { where: Record<string, unknown> }) => {
            whereUsed = where;
            return Promise.resolve([]);
          }),
        },
      } as never);

      await usersService.findAll('ADMIN', 'RECEPCION');
      expect(whereUsed).toEqual({ isActive: true, role: 'MEDICO' });
    });
  });

  describe('T03 · Configuración, sesión, revocación y rate-limiting (S06, S08)', () => {
    it('falla al arrancar si falta JWT_SECRET, es débil o usa el fallback conocido', () => {
      expect(() =>
        validateEnv({ DATABASE_URL: 'postgresql://localhost:5432/db' }),
      ).toThrow(/JWT_SECRET/);

      expect(() =>
        validateEnv({
          DATABASE_URL: 'postgresql://localhost:5432/db',
          JWT_SECRET: 'SUPER_SECRET_KEY_SURMED',
        }),
      ).toThrow(/JWT_SECRET/);

      expect(() =>
        validateEnv({
          DATABASE_URL: 'postgresql://localhost:5432/db',
          JWT_SECRET: 'corto',
        }),
      ).toThrow(/JWT_SECRET/);

      const valid = validateEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
        JWT_SECRET: 'clave_produccion_segura_2026_surmed',
      });
      expect(valid.JWT_SECRET).toBe('clave_produccion_segura_2026_surmed');
    });

    it('revoca el JWT al hacer logout y rechaza peticiones posteriores en JwtStrategy', async () => {
      const revocation = new TokenRevocationService();
      const configService = new ConfigService({
        JWT_SECRET: 'clave_produccion_segura_2026_surmed',
      });
      const prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-1',
            name: 'Admin',
            email: 'admin@surmed.com',
            role: 'ADMIN',
            isActive: true,
          }),
        },
      };

      const strategy = new JwtStrategy(
        prismaMock as never,
        configService,
        revocation,
      );

      const payload = {
        sub: 'user-1',
        email: 'admin@surmed.com',
        role: 'ADMIN' as const,
        jti: 'token-jti-123',
        iat: Math.floor(Date.now() / 1000),
      };

      // Antes del logout es válido
      const validated = await strategy.validate(payload);
      expect(validated.id).toBe('user-1');

      // Al cerrar sesión se revoca el jti
      revocation.revokeToken('token-jti-123');

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('limita intentos fallidos de login con 429 Too Many Requests', async () => {
      const rateLimit = new LoginRateLimitService();
      const prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const authService = new AuthService(
        prismaMock as never,
        new JwtService({ secret: 'clave_produccion_segura_2026_surmed' }),
        new TokenRevocationService(),
        rateLimit,
      );

      for (let i = 0; i < 5; i++) {
        await expect(
          authService.login(
            { email: 'ataque@surmed.com', password: 'wrongpassword' },
            '10.0.0.1',
          ),
        ).rejects.toThrow(UnauthorizedException);
      }

      await expect(
        authService.login(
          { email: 'ataque@surmed.com', password: 'wrongpassword' },
          '10.0.0.1',
        ),
      ).rejects.toThrow(
        new HttpException(
          'Demasiados intentos fallidos de inicio de sesión. Intente nuevamente más tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });
});
