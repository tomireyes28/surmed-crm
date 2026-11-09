import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  calculateItemSubtotal,
  centsToDecimal,
  toDecimal,
  toMoneyNumber,
} from '../common/utils/money.util';
import { getClinicMonthBounds } from '../common/utils/timezone.util';
import { serializable } from '../common/utils/transaction.util';
import {
  idempotencyKey,
  fingerprint,
  assertReplay,
} from '../common/utils/idempotency.util';
import { AuditService } from '../audit/audit.service';

type RawInvoiceWithRelations = {
  id: string;
  patientId: string;
  totalAmount: Prisma.Decimal | number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  paidAt?: Date | null;
  paidById?: string | null;
  cancelledAt?: Date | null;
  cancelledById?: string | null;
  cancelReason?: string | null;
  idempotencyKey?: string | null;
  requestFingerprint?: string | null;
  createdAt: Date;
  updatedAt: Date;
  patient?: {
    id?: string;
    firstName: string;
    lastName: string;
    documentId: string;
  };
  items?: Array<{
    id: string;
    invoiceId: string;
    description: string;
    quantity: number;
    unitPrice: Prisma.Decimal | number;
    subtotal: Prisma.Decimal | number;
    createdAt: Date;
  }>;
};

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    @Optional() private auditService?: AuditService,
  ) {}

  private serializeInvoice(invoice: RawInvoiceWithRelations) {
    return {
      ...invoice,
      totalAmount: toMoneyNumber(invoice.totalAmount),
      items: Array.isArray(invoice.items)
        ? invoice.items.map((item) => ({
            ...item,
            unitPrice: toMoneyNumber(item.unitPrice),
            subtotal: toMoneyNumber(item.subtotal),
          }))
        : [],
    };
  }

  async create(
    dto: CreateInvoiceDto,
    actorId?: string,
    idempotencyHeader?: string,
  ) {
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException(
        'La factura debe contener al menos un ítem.',
      );
    }

    for (const item of dto.items) {
      if (
        !item.description ||
        typeof item.description !== 'string' ||
        item.description.trim().length === 0
      ) {
        throw new BadRequestException(
          'Todos los ítems de la factura deben tener una descripción válida.',
        );
      }
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 10000
      ) {
        throw new BadRequestException(
          'La cantidad de cada ítem debe ser un entero entre 1 y 10000.',
        );
      }
      if (
        typeof item.unitPrice !== 'number' ||
        !Number.isFinite(item.unitPrice) ||
        item.unitPrice <= 0 ||
        item.unitPrice > 999999999.99
      ) {
        throw new BadRequestException(
          'El precio unitario de cada ítem debe ser un monto positivo válido.',
        );
      }
    }

    const effectiveKey = idempotencyKey(dto.idempotencyKey, idempotencyHeader);
    const requestFingerprint = fingerprint('invoice.create', actorId, {
      patientId: dto.patientId,
      payNow: dto.payNow === true,
      items: dto.items.map((item) => ({
        description: item.description.trim(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
    return serializable(
      this.prisma,
      async (tx) => {
        if (effectiveKey) {
          const existingByKey = (await tx.invoice.findUnique({
            where: { idempotencyKey: effectiveKey },
            include: {
              items: true,
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  documentId: true,
                },
              },
            },
          })) as RawInvoiceWithRelations | null;

          if (existingByKey) {
            assertReplay(existingByKey.requestFingerprint, requestFingerprint);
            return this.serializeInvoice(existingByKey);
          }
        }

        const patient = await tx.patient.findUnique({
          where: { id: dto.patientId },
        });

        if (!patient) {
          throw new NotFoundException('Paciente no encontrado');
        }

        if (patient.isActive === false) {
          throw new BadRequestException(
            'No se puede emitir una factura para un paciente archivado/inactivo.',
          );
        }

        let totalCents = 0;
        const preparedItems = dto.items.map((item) => {
          const { decimal: subtotalDecimal, cents } = calculateItemSubtotal(
            item.quantity,
            item.unitPrice,
          );
          if (cents > 999999999999)
            throw new BadRequestException(
              'El subtotal excede el máximo permitido.',
            );
          totalCents += cents;
          return {
            description: item.description.trim(),
            quantity: item.quantity,
            unitPrice: toDecimal(item.unitPrice),
            subtotal: subtotalDecimal,
          };
        });

        if (!Number.isSafeInteger(totalCents) || totalCents > 999999999999)
          throw new BadRequestException('El total excede el máximo permitido.');
        const totalAmountDecimal = centsToDecimal(totalCents);
        const isPaidNow = dto.payNow === true;

        const created = (await tx.invoice.create({
          data: {
            patientId: dto.patientId,
            totalAmount: totalAmountDecimal,
            status: isPaidNow ? 'PAID' : 'PENDING',
            ...(isPaidNow
              ? {
                  paidAt: new Date(),
                  paidById: actorId,
                }
              : {}),
            ...(effectiveKey
              ? { idempotencyKey: effectiveKey, requestFingerprint }
              : {}),
            items: {
              create: preparedItems,
            },
          },
          include: {
            items: true,
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                documentId: true,
              },
            },
          },
        })) as unknown as RawInvoiceWithRelations;

        await (this.auditService ?? new AuditService(this.prisma)).record(
          {
            actorId,
            action: isPaidNow ? 'INVOICE_PAY' : 'INVOICE_CREATE',
            resource: 'Invoice',
            resourceId: created.id,
            patientId: dto.patientId,
            metadata: {
              totalAmount: toMoneyNumber(created.totalAmount),
              paidOnIssue: isPaidNow,
            },
          },
          tx,
        );
        return this.serializeInvoice(created);
      },
      Boolean(effectiveKey),
    );
  }

  async findAll(
    patientId?: string,
    page: number = 1,
    limit: number = 10,
    month?: string,
    year?: string,
    search?: string,
    status?: string,
  ) {
    const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const safeLimit =
      Number.isFinite(limit) && limit >= 1
        ? Math.min(50, Math.floor(limit))
        : 10;
    const skip = (safePage - 1) * safeLimit;

    const whereClause: Prisma.InvoiceWhereInput = {};

    if (patientId) {
      whereClause.patientId = patientId;
    }

    if (status && status.trim()) {
      const normalizedStatus = status.trim().toUpperCase();
      if (
        normalizedStatus !== 'PENDING' &&
        normalizedStatus !== 'PAID' &&
        normalizedStatus !== 'CANCELLED'
      ) {
        throw new BadRequestException(
          'El filtro de estado de comprobante no es válido.',
        );
      }
      whereClause.status = normalizedStatus;
    }

    if (month && year) {
      if (!/^\d+$/.test(month.trim()) || !/^\d+$/.test(year.trim())) {
        throw new BadRequestException(
          'Los parámetros de mes y año deben ser enteros válidos.',
        );
      }
      const monthNum = Number.parseInt(month.trim(), 10);
      const yearNum = Number.parseInt(year.trim(), 10);
      if (monthNum < 1 || monthNum > 12 || yearNum < 2000 || yearNum > 2100) {
        throw new BadRequestException(
          'Mes (1..12) o año (2000..2100) fuera de rango permitido.',
        );
      }
      const { start, end } = getClinicMonthBounds(yearNum, monthNum);

      whereClause.createdAt = {
        gte: start,
        lte: end,
      };
    } else if (year && year.trim()) {
      if (!/^\d+$/.test(year.trim())) {
        throw new BadRequestException(
          'El parámetro año debe ser un entero válido.',
        );
      }
      const yearNum = Number.parseInt(year.trim(), 10);
      if (yearNum < 2000 || yearNum > 2100) {
        throw new BadRequestException('El año debe estar entre 2000 y 2100.');
      }
      const { start } = getClinicMonthBounds(yearNum, 1);
      const { end } = getClinicMonthBounds(yearNum, 12);
      whereClause.createdAt = {
        gte: start,
        lte: end,
      };
    }

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      whereClause.patient = {
        OR: [
          { firstName: { contains: trimmedSearch, mode: 'insensitive' } },
          { lastName: { contains: trimmedSearch, mode: 'insensitive' } },
          { documentId: { contains: trimmedSearch, mode: 'insensitive' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              documentId: true,
            },
          },
          items: true,
        },
      }),
      this.prisma.invoice.count({
        where: whereClause,
      }),
    ]);

    return {
      data: (data as unknown as RawInvoiceWithRelations[]).map((inv) =>
        this.serializeInvoice(inv),
      ),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findOne(id: string) {
    const invoice = (await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentId: true,
          },
        },
        items: true,
      },
    })) as unknown as RawInvoiceWithRelations | null;

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    return this.serializeInvoice(invoice);
  }

  async payInvoice(id: string, actorId?: string) {
    return serializable(this.prisma, async (tx) => {
      const invoice = (await tx.invoice.findUnique({
        where: { id },
      })) as RawInvoiceWithRelations | null;

      if (!invoice) {
        throw new NotFoundException('Factura no encontrada');
      }

      if (invoice.status === 'CANCELLED') {
        throw new ConflictException(
          'No se puede registrar el cobro de una factura anulada.',
        );
      }

      if (invoice.status === 'PAID') {
        throw new ConflictException(
          'La factura ya se encuentra registrada como pagada.',
        );
      }

      const updated = (await tx.invoice.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidById: actorId,
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              documentId: true,
            },
          },
          items: true,
        },
      })) as unknown as RawInvoiceWithRelations;

      await (this.auditService ?? new AuditService(this.prisma)).record(
        {
          actorId,
          action: 'INVOICE_PAY',
          resource: 'Invoice',
          resourceId: id,
          patientId: invoice.patientId,
          metadata: {
            totalAmount: toMoneyNumber(updated.totalAmount),
          },
        },
        tx,
      );

      return this.serializeInvoice(updated);
    });
  }

  async cancelInvoice(id: string, actorId?: string, reason?: string) {
    return serializable(this.prisma, async (tx) => {
      const invoice = (await tx.invoice.findUnique({
        where: { id },
      })) as RawInvoiceWithRelations | null;

      if (!invoice) {
        throw new NotFoundException('Factura no encontrada');
      }

      if (invoice.status === 'CANCELLED') {
        throw new ConflictException('La factura ya se encuentra anulada.');
      }

      if (invoice.status === 'PAID')
        throw new ConflictException(
          'Un comprobante pagado requiere un procedimiento de devolución; no puede anularse como deuda pendiente.',
        );

      const updated = (await tx.invoice.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: actorId,
          cancelReason: reason?.trim() || undefined,
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              documentId: true,
            },
          },
          items: true,
        },
      })) as unknown as RawInvoiceWithRelations;

      await (this.auditService ?? new AuditService(this.prisma)).record(
        {
          actorId,
          action: 'INVOICE_CANCEL',
          resource: 'Invoice',
          resourceId: id,
          patientId: invoice.patientId,
          reason: reason?.trim() || undefined,
          metadata: {
            previousStatus: invoice.status,
            totalAmount: toMoneyNumber(invoice.totalAmount),
          },
        },
        tx,
      );

      return this.serializeInvoice(updated);
    });
  }
}
