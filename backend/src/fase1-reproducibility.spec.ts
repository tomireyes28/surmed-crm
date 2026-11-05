import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PatientsService } from './patients/patients.service';
import {
  importParsedInventoryItems,
  parseInventorySheetRows,
} from '../prisma/import-inventory';

describe('Fase 1 — Reproducibilidad, Contratos, Migraciones e Importador (T04, T05)', () => {
  describe('T04 · Búsqueda paginada de pacientes del lado servidor (F02)', () => {
    it('aplica filtro textual case-insensitive y límites de paginación seguros', async () => {
      let capturedWhere: Record<string, unknown> | undefined;
      let capturedSkip: number | undefined;
      let capturedTake: number | undefined;

      const prismaMock = {
        patient: {
          findMany: jest.fn(
            ({
              where,
              skip,
              take,
            }: {
              where: Record<string, unknown>;
              skip: number;
              take: number;
            }) => {
              capturedWhere = where;
              capturedSkip = skip;
              capturedTake = take;
              return Promise.resolve([
                {
                  id: 'pat-15',
                  firstName: 'Sofía',
                  lastName: 'Fernández',
                  documentId: '40987654',
                },
              ]);
            },
          ),
          count: jest.fn(() => Promise.resolve(25)),
        },
      };

      const service = new PatientsService(prismaMock as never);
      const response = await service.findAll(2, 10, '  Fernández ');

      expect(capturedSkip).toBe(10);
      expect(capturedTake).toBe(10);
      expect(capturedWhere).toEqual({
        isActive: true,
        OR: [
          { firstName: { contains: 'Fernández', mode: 'insensitive' } },
          { lastName: { contains: 'Fernández', mode: 'insensitive' } },
          { documentId: { contains: 'Fernández', mode: 'insensitive' } },
        ],
      });
      expect(response.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('T05 · Health check, migraciones e importación idempotente (F03, F04, F18)', () => {
    it('expone endpoint de health check operativo', () => {
      const controller = new AppController(new AppService());
      const health = controller.getHealth();

      expect(health.status).toBe('ok');
      expect(health.service).toBe('surmed-crm-backend');
      expect(typeof health.timestamp).toBe('string');
    });

    it('incluye la migración hacia adelante para Patient.isActive y Product.isActive', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../prisma/migrations/20261104210000_add_is_active_flags/migration.sql',
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('ALTER TABLE "patients"');
      expect(sql).toContain('ALTER TABLE "products"');
      expect(sql).toContain('"isActive" BOOLEAN NOT NULL DEFAULT true');
    });

    it('no mantiene clientes Prisma generados duplicados dentro de src/generated', () => {
      const obsoleteDir = path.resolve(__dirname, './generated/prisma');
      expect(fs.existsSync(obsoleteDir)).toBe(false);
    });

    it('importa productos de forma idempotente y soporta modo preview (dry-run) sin duplicar registros', async () => {
      const rawRows: unknown[][] = [
        [],
        [],
        [],
        [],
        ['', 'ID', 'Nombre', 'Descripción', 'Precio', 'Cantidad'],
        ['', '001-001', 'Guantes Quirúrgicos', 'Caja x 50', '45000', '12'],
        ['', '001-002', 'Gasas Estériles', 'Paquete x 10', '15000', '30'],
        ['', '001-003', 'Guantes Quirúrgicos', 'Duplicado en hoja', '45000', '5'],
        ['', 'SIN_GUION', 'Fila Inválida', '', '100', '1'],
      ];

      const { items, invalidRows } = parseInventorySheetRows(
        rawRows,
        'INSUMO_MEDICO',
        'inv3.xlsx',
      );

      expect(items).toHaveLength(2);
      expect(invalidRows).toHaveLength(2);

      const storedProducts: { id: string; name: string }[] = [];
      const dbMock = {
        product: {
          findFirst: jest.fn(({ where }: { where: { name: string } }) => {
            const found = storedProducts.find((p) => p.name === where.name);
            return Promise.resolve(found || null);
          }),
          create: jest.fn(({ data }: { data: { name: string } }) => {
            const created = { id: `prod-${storedProducts.length + 1}`, name: data.name };
            storedProducts.push(created);
            return Promise.resolve(created);
          }),
        },
      };

      // 1. Modo preview (dry-run) no persiste cambios
      const previewResult = await importParsedInventoryItems(dbMock, items, true);
      expect(previewResult).toEqual({ imported: 2, skippedExisting: 0 });
      expect(storedProducts).toHaveLength(0);

      // 2. Primera importación real inserta los 2 productos válidos
      const firstRun = await importParsedInventoryItems(dbMock, items, false);
      expect(firstRun).toEqual({ imported: 2, skippedExisting: 0 });
      expect(storedProducts).toHaveLength(2);

      // 3. Segunda importación del mismo archivo NO duplica productos
      const secondRun = await importParsedInventoryItems(dbMock, items, false);
      expect(secondRun).toEqual({ imported: 0, skippedExisting: 2 });
      expect(storedProducts).toHaveLength(2);
    });
  });
});
