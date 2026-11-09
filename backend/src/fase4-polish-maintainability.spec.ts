import { transactionalMock } from '../test/helpers/transactional-mock';
import { BadRequestException } from '@nestjs/common';
import {
  parseBooleanQuery,
  parsePositiveIntQuery,
} from './common/utils/query.util';
import { PatientsService } from './patients/patients.service';
import { InventoryService } from './inventory/inventory.service';
import { UsersService } from './users/users.service';
import { InvoicesService } from './invoices/invoices.service';
import { PrismaService } from './prisma/prisma.service';
import {
  calculateCivilAge,
  formatCivilBirthDateInput,
} from './common/utils/timezone.util';

describe('Fase 4 — Pulido, Validación de Consultas, Reactivación y Edad Civil (T14, T15)', () => {
  describe('F13 · Validación estricta de parámetros de paginación y filtros', () => {
    it('rechaza cadenas parciales como "10abc", negativos o valores fuera de rango en parsePositiveIntQuery', () => {
      expect(parsePositiveIntQuery(undefined, 'page', 1)).toBe(1);
      expect(parsePositiveIntQuery('3', 'page', 1)).toBe(3);

      expect(() => parsePositiveIntQuery('10abc', 'limit', 10)).toThrow(
        BadRequestException,
      );
      expect(() => parsePositiveIntQuery('0', 'page', 1)).toThrow(
        BadRequestException,
      );
      expect(() => parsePositiveIntQuery('-5', 'page', 1)).toThrow(
        BadRequestException,
      );
      expect(() =>
        parsePositiveIntQuery('100', 'limit', 10, { min: 1, max: 50 }),
      ).toThrow(BadRequestException);
    });

    it('valida booleanos de query string en parseBooleanQuery', () => {
      expect(parseBooleanQuery(undefined)).toBe(false);
      expect(parseBooleanQuery('true')).toBe(true);
      expect(parseBooleanQuery('false')).toBe(false);
      expect(() => parseBooleanQuery('invalid', 'includeInactive')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('F16 · Política de archivado y reactivación en Pacientes, Inventario y Staff', () => {
    it('permite listar pacientes archivados y reactivarlos explícitamente', async () => {
      let activeFlag = false;
      const prismaMock = {
        patient: {
          findMany: jest.fn(() =>
            Promise.resolve([{ id: 'pat-1', isActive: activeFlag }]),
          ),
          count: jest.fn(() => Promise.resolve(1)),
          findUnique: jest.fn(() =>
            Promise.resolve({ id: 'pat-1', isActive: activeFlag }),
          ),
          update: jest.fn(({ data }: { data: { isActive: boolean } }) => {
            activeFlag = data.isActive;
            return Promise.resolve({ id: 'pat-1', isActive: activeFlag });
          }),
        },
      };

      const service = new PatientsService(
        prismaMock as unknown as PrismaService,
      );

      await service.findAll(1, 10, undefined, true);
      expect(prismaMock.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );

      const reactivated = await service.reactivate('pat-1');
      expect(reactivated.isActive).toBe(true);
    });

    it('permite reactivar productos archivados en Inventario y empleados en Staff', async () => {
      const prismaMock = {
        product: {
          findUnique: jest.fn(() =>
            Promise.resolve({
              id: 'prod-1',
              name: 'Guantes',
              quantity: 5,
              minStock: 10,
              price: null,
              category: 'INSUMO_MEDICO',
              isActive: false,
            }),
          ),
          update: jest.fn(() =>
            Promise.resolve({
              id: 'prod-1',
              name: 'Guantes',
              quantity: 5,
              minStock: 10,
              price: null,
              category: 'INSUMO_MEDICO',
              isActive: true,
            }),
          ),
        },
        user: {
          findUnique: jest.fn(() =>
            Promise.resolve({
              id: 'u-1',
              name: 'Dra. Gómez',
              email: 'gomez@surmed.com',
              role: 'MEDICO',
              isActive: false,
              specialties: [],
            }),
          ),
          update: jest.fn(() =>
            Promise.resolve({
              id: 'u-1',
              name: 'Dra. Gómez',
              email: 'gomez@surmed.com',
              role: 'MEDICO',
              isActive: true,
              specialties: [{ id: 'spec-1', name: 'Clínica' }],
            }),
          ),
        },
      };

      const inventoryService = new InventoryService(
        prismaMock as unknown as PrismaService,
      );
      const usersService = new UsersService(
        transactionalMock(prismaMock as unknown as PrismaService),
      );

      const reactivatedProduct =
        await inventoryService.reactivateProduct('prod-1');
      expect(reactivatedProduct.isActive).toBe(true);

      const reactivatedUser = await usersService.reactivate('u-1');
      expect(reactivatedUser.isActive).toBe(true);

      await usersService.update('u-1', {
        role: 'MEDICO',
        specialtyId: 'spec-1',
      });
      const updateCalls = prismaMock.user.update.mock.calls as unknown as Array<
        [{ where: { id: string }; data: Record<string, unknown> }]
      >;
      const lastUpdateCall = updateCalls[updateCalls.length - 1]?.[0];
      expect(lastUpdateCall?.where).toEqual({ id: 'u-1' });
      expect(lastUpdateCall?.data).toMatchObject({
        role: 'MEDICO',
        specialties: { set: [{ id: 'spec-1' }] },
      });
    });
  });

  describe('T14 · Filtros de comprobantes por año, mes y estado', () => {
    it('filtra comprobantes por año completo o mes+año y valida estado', async () => {
      const findManyMock = jest.fn(() => Promise.resolve([]));
      const prismaMock = {
        invoice: {
          findMany: findManyMock,
          count: jest.fn(() => Promise.resolve(0)),
        },
      };

      const service = new InvoicesService(
        transactionalMock(prismaMock as unknown as PrismaService),
      );

      await service.findAll(undefined, 1, 10, undefined, '2026', '', 'PAID');
      const findManyCalls = findManyMock.mock.calls as unknown as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(findManyCalls[0]?.[0]?.where).toMatchObject({
        status: 'PAID',
        createdAt: {
          gte: new Date('2026-01-01T00:00:00.000-03:00'),
          lte: new Date('2026-12-31T23:59:59.999-03:00'),
        },
      });

      await expect(
        service.findAll(
          undefined,
          1,
          10,
          undefined,
          '2026',
          '',
          'ESTADO_INVALIDO',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('F20 · Cálculo exacto de edad civil en America/Asuncion', () => {
    it('no sobreestima la edad antes del cumpleaños y maneja nacidos el 29 de febrero', () => {
      const refDate = new Date('2026-11-05T12:00:00-03:00');

      // Cumplió años ayer (04/11/1990) -> 36 años
      expect(calculateCivilAge('1990-11-04', refDate)).toBe(36);
      // Cumple años hoy (05/11/1990) -> 36 años
      expect(calculateCivilAge('1990-11-05', refDate)).toBe(36);
      // Cumple años mañana (06/11/1990) -> todavía tiene 35 años
      expect(calculateCivilAge('1990-11-06', refDate)).toBe(35);

      // Nacido en año bisiesto (29/02/2000) evaluado el 28/02/2026 -> 25 años; el 01/03/2026 -> 26 años
      expect(
        calculateCivilAge(
          '2000-02-29',
          new Date('2026-02-28T12:00:00-03:00'),
        ),
      ).toBe(25);
      expect(
        calculateCivilAge(
          '2000-02-29',
          new Date('2026-03-01T12:00:00-03:00'),
        ),
      ).toBe(26);

      expect(formatCivilBirthDateInput('1990-11-05T00:00:00.000Z')).toBe(
        '1990-11-05',
      );
    });
  });
});
