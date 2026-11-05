import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
  constructor(private prisma: PrismaService) {}

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

    const effectiveKey =
      (dto.idempotencyKey ?? idempotencyHeader)?.trim() || undefined;

    if (effectiveKey && typeof this.prisma.invoice?.findUnique === 'function') {
      const existingByKey = (await this.prisma.invoice.findUnique({
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
        return this.serializeInvoice(existingByKey);
      }
    }

    const patient = await this.prisma.patient.findUnique({
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
      totalCents += cents;
      return {
        description: item.description.trim(),
        quantity: item.quantity,
        unitPrice: toDecimal(item.unitPrice),
        subtotal: subtotalDecimal,
      };
    });

    const totalAmountDecimal = centsToDecimal(totalCents);
    const isPaidNow = dto.payNow === true;

    const created = (await this.prisma.invoice.create({
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
        ...(effectiveKey ? { idempotencyKey: effectiveKey } : {}),
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

    return this.serializeInvoice(created);
  }

  async findAll(
    patientId?: string,
    page: number = 1,
    limit: number = 10,
    month?: string,
    year?: string,
    search?: string,
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

    if (month && year) {
      const monthNum = Number.parseInt(month, 10);
      const yearNum = Number.parseInt(year, 10);
      const { start, end } = getClinicMonthBounds(yearNum, monthNum);

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
    const invoice = (await this.prisma.invoice.findUnique({
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

    const updated = (await this.prisma.invoice.update({
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

    return this.serializeInvoice(updated);
  }

  async cancelInvoice(id: string, actorId?: string, reason?: string) {
    const invoice = (await this.prisma.invoice.findUnique({
      where: { id },
    })) as RawInvoiceWithRelations | null;

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    if (invoice.status === 'CANCELLED') {
      throw new ConflictException('La factura ya se encuentra anulada.');
    }

    const updated = (await this.prisma.invoice.update({
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

    return this.serializeInvoice(updated);
  }
}
