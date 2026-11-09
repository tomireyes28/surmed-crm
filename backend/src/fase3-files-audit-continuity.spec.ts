import { transactionalMock } from '../test/helpers/transactional-mock';
import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StorageService, MAX_CLINICAL_FILE_SIZE_BYTES } from './storage/storage.service';
import { MedicalRecordsService } from './medical-records/medical-records.service';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { InvoicesService } from './invoices/invoices.service';
import { AppService } from './app.service';
import { RolesGuard } from './auth/guards/roles.guard';
import {
  formatStructuredLog,
  redactSensitiveData,
} from './common/logger/structured-logger';
import { PrismaService } from './prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('Fase 3 — Archivos clínicos, auditoría y continuidad operativa (T11, T12, T13)', () => {
  describe('T11 · Archivos clínicos: límites, magic bytes, compensación y resiliencia (S07)', () => {
    const storageService = new StorageService();

    it('acepta PDF y PNG legítimos verificando magic bytes y calculando SHA-256', () => {
      const pdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'utf8');
      const pdfFile = {
        originalname: 'informe-cardiologia.pdf',
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
        buffer: pdfBuffer,
      } as Express.Multer.File;

      const meta = storageService.validateClinicalFile(pdfFile);
      expect(meta.mimeType).toBe('application/pdf');
      expect(meta.canonicalExt).toBe('pdf');
      expect(meta.sizeBytes).toBe(pdfBuffer.length);
      expect(meta.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(meta.scanStatus).toBe('CLEAN_MAGIC_VERIFIED');
    });

    it('rechaza archivos excesivos (>10 MB), tipos no permitidos y archivos falsificados (magic bytes inválidos)', () => {
      // 1. Archivo que supera 10 MB -> 413 PayloadTooLargeException
      const hugeFile = {
        originalname: 'estudio.pdf',
        mimetype: 'application/pdf',
        size: MAX_CLINICAL_FILE_SIZE_BYTES + 1,
        buffer: Buffer.from('%PDF-1.7'),
      } as Express.Multer.File;

      expect(() => storageService.validateClinicalFile(hugeFile)).toThrow(
        PayloadTooLargeException,
      );

      // 2. Tipo no permitido (.html / .exe) -> 400 BadRequestException
      const htmlFile = {
        originalname: 'payload.html',
        mimetype: 'text/html',
        size: 32,
        buffer: Buffer.from('<script>alert(1)</script>'),
      } as Express.Multer.File;

      expect(() => storageService.validateClinicalFile(htmlFile)).toThrow(
        BadRequestException,
      );

      // 3. Archivo disfrazado de PDF pero con contenido ejecutable/HTML -> 400 BadRequestException
      const spoofedPdf = {
        originalname: 'falso.pdf',
        mimetype: 'application/pdf',
        size: 40,
        buffer: Buffer.from('MZ\x90\x00Executable disguised as PDF'),
      } as Express.Multer.File;

      expect(() => storageService.validateClinicalFile(spoofedPdf)).toThrow(
        BadRequestException,
      );
    });

    it('elimina el archivo subido (compensación) si falla la creación de la historia clínica en la base de datos', async () => {
      const removedPaths: string[] = [];
      const mockStorage = {
        uploadValidatedFile: jest.fn().mockResolvedValue({
          storagePath: 'pat-1/550e8400-e29b-41d4-a716-446655440000.pdf',
          originalName: 'estudio.pdf',
          mimeType: 'application/pdf',
          canonicalExt: 'pdf',
          sizeBytes: 128,
          sha256: 'a'.repeat(64),
          scanStatus: 'CLEAN_MAGIC_VERIFIED',
        }),
        removeFile: jest.fn().mockImplementation((path: string) => {
          removedPaths.push(path);
          return Promise.resolve();
        }),
      } as unknown as StorageService;

      const mockPrisma = {
        patient: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pat-1',
            isActive: true,
          }),
        },
        medicalRecord: {
          create: jest
            .fn()
            .mockRejectedValue(new Error('Simulated DB Failure')),
        },
      } as unknown as PrismaService;

      const service = new MedicalRecordsService(transactionalMock(mockPrisma), mockStorage);
      const validPdf = {
        originalname: 'estudio.pdf',
        mimetype: 'application/pdf',
        size: 16,
        buffer: Buffer.from('%PDF-1.7\n'),
      } as Express.Multer.File;

      await expect(
        service.create(
          { patientId: 'pat-1', notes: 'Evolución con adjunto' },
          'doc-1',
          validPdf,
        ),
      ).rejects.toThrow('Simulated DB Failure');

      // Verifica que el archivo no quedó huérfano en Storage
      expect(removedPaths).toEqual([
        'pat-1/550e8400-e29b-41d4-a716-446655440000.pdf',
      ]);
    });

    it('tolera adjuntos faltantes en Storage sin bloquear la consulta de la historia clínica', async () => {
      const mockStorage = {
        getSignedUrlSafe: jest
          .fn()
          .mockImplementation((path: string) =>
            Promise.resolve(
              path.includes('missing')
                ? null
                : `https://signed.example/${path}?token=temp`,
            ),
          ),
      } as unknown as StorageService;

      const mockPrisma = {
        patient: {
          findUnique: jest.fn().mockResolvedValue({ id: 'pat-1' }),
        },
        medicalRecord: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'rec-1',
              patientId: 'pat-1',
              doctorId: 'doc-1',
              notes: 'Paciente estable',
              attachments: ['pat-1/ok.pdf', 'pat-1/missing.pdf'],
              createdAt: new Date(),
              doctor: { id: 'doc-1', name: 'Dr. Gómez', email: 'gomez@surmed.py' },
            },
          ]),
        },
      } as unknown as PrismaService;

      const service = new MedicalRecordsService(transactionalMock(mockPrisma), mockStorage);
      const result = await service.findByPatient('pat-1', 'doc-1', 'MEDICO');

      expect(result).toHaveLength(1);
      expect(result[0].attachments).toEqual([
        'https://signed.example/pat-1/ok.pdf?token=temp',
      ]);
      expect(result[0].missingAttachmentsCount).toBe(1);
    });
  });

  describe('T12 · Auditoría clínica/administrativa, adendas, redacción de logs y readiness (S08, F15)', () => {
    it('registra en auditoría quién leyó una historia, quién firmó una adenda y quién anuló un comprobante; sin incluir notas ni secretos', async () => {
      const auditStore: Array<Record<string, unknown>> = [];
      const mockPrisma = {
        auditLog: {
          create: jest
            .fn()
            .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
              const entry = {
                id: `aud-${auditStore.length + 1}`,
                createdAt: new Date(),
                ...data,
              };
              auditStore.push(entry);
              return Promise.resolve(entry);
            }),
        },
        patient: {
          findUnique: jest.fn().mockResolvedValue({ id: 'pat-1', isActive: true }),
        },
        medicalRecord: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue({
            id: 'rec-orig-1',
            patientId: 'pat-1',
            doctorId: 'doc-1',
            notes: 'Diagnóstico inicial firmado',
          }),
          create: jest
            .fn()
            .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
              Promise.resolve({
                id: 'rec-addendum-1',
                ...data,
                doctor: { id: 'doc-1', name: 'Dra. López', email: 'lopez@surmed.py' },
              }),
            ),
        },
        invoice: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'inv-99',
            patientId: 'pat-1',
            totalAmount: new Prisma.Decimal('180000.00'),
            status: 'PENDING',
          }),
          update: jest.fn().mockResolvedValue({
            id: 'inv-99',
            patientId: 'pat-1',
            totalAmount: new Prisma.Decimal('180000.00'),
            status: 'CANCELLED',
            items: [],
          }),
        },
      } as unknown as PrismaService;

      const auditService = new AuditService(mockPrisma);
      const medicalRecordsService = new MedicalRecordsService(
        transactionalMock(mockPrisma),
        new StorageService(),
        auditService,
      );
      const invoicesService = new InvoicesService(transactionalMock(mockPrisma), auditService);

      // 1. Lectura de historia clínica
      await medicalRecordsService.findByPatient('pat-1', 'doc-1', 'MEDICO');

      // 2. Adenda vinculada sin sobrescribir la evolución original
      const addendum = await medicalRecordsService.createAddendum(
        'rec-orig-1',
        {
          notes: 'Aclaración: se ajusta dosis a 500mg cada 12hs',
          reason: 'Ajuste posológico',
        },
        'doc-1',
        'MEDICO',
      );
      expect(addendum.parentRecordId).toBe('rec-orig-1');

      // 3. Anulación de comprobante con actor y motivo
      await invoicesService.cancelInvoice(
        'inv-99',
        'admin-1',
        'Error de carga en ítem',
      );

      expect(auditStore).toHaveLength(3);
      expect(auditStore[0]).toMatchObject({
        actorId: 'doc-1',
        actorRole: 'MEDICO',
        action: 'MEDICAL_RECORD_READ',
        resource: 'MedicalRecord',
        patientId: 'pat-1',
      });
      expect(auditStore[1]).toMatchObject({
        actorId: 'doc-1',
        action: 'MEDICAL_RECORD_ADDENDUM',
        resourceId: 'rec-addendum-1',
        reason: 'Ajuste posológico',
      });
      expect(auditStore[2]).toMatchObject({
        actorId: 'admin-1',
        action: 'INVOICE_CANCEL',
        resourceId: 'inv-99',
        reason: 'Error de carga en ítem',
      });

      // Ningún registro de auditoría contiene notas clínicas ni contraseñas
      const serializedAudit = JSON.stringify(auditStore);
      expect(serializedAudit).not.toContain('se ajusta dosis a 500mg');
    });

    it('restringe la consulta de auditoría exclusivamente a ADMIN y redacta datos sensibles en logs estructurados', () => {
      const rolesGuard = new RolesGuard(new Reflector());
      const findAllHandler = Object.getOwnPropertyDescriptor(
        AuditController.prototype,
        'findAll',
      )?.value as (...args: unknown[]) => unknown;
      const buildCtx = (role: string) =>
        ({
          getHandler: () => findAllHandler,
          getClass: () => AuditController,
          switchToHttp: () => ({
            getRequest: () => ({ user: { id: 'u1', role } }),
          }),
        }) as never;

      expect(rolesGuard.canActivate(buildCtx('RECEPCION'))).toBe(false);
      expect(rolesGuard.canActivate(buildCtx('MEDICO'))).toBe(false);
      expect(rolesGuard.canActivate(buildCtx('ADMIN'))).toBe(true);

      const logLine = formatStructuredLog({
        level: 'INFO',
        event: 'CLINICAL_ACTION',
        requestId: 'req-123',
        actorId: 'doc-1',
        context: {
          password: 'PlainPassword123!',
          notes: 'Paciente presenta cuadro reservado',
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc1234567890',
          safeField: 'visible',
        },
      });

      expect(logLine).not.toContain('PlainPassword123!');
      expect(logLine).not.toContain('Paciente presenta cuadro reservado');
      expect(logLine).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(logLine).toContain('"safeField":"visible"');
      expect(redactSensitiveData({ password: '123' })).toEqual({
        password: '[REDACTED]',
      });
    });

    it('health/ready devuelve 503 ServiceUnavailableException cuando la base de datos cae', async () => {
      const healthyPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      } as unknown as PrismaService;
      const healthyApp = new AppService(healthyPrisma);
      const ready = await healthyApp.getReadiness();
      expect(ready.status).toBe('ready');
      expect(ready.database).toBe('up');

      const failingPrisma = {
        $queryRaw: jest.fn().mockRejectedValue(new Error('Connection refused')),
      } as unknown as PrismaService;
      const failingApp = new AppService(failingPrisma);
      await expect(failingApp.getReadiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
