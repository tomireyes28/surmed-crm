import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { Prisma } from '@prisma/client'; // <-- 1. IMPORTAMOS EL TIPADO DE PRISMA

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateInvoiceDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const totalAmount = dto.items.reduce(
      (acc, item) => acc + (item.quantity * item.unitPrice),
      0
    );

    return await this.prisma.invoice.create({
      data: {
        patientId: dto.patientId,
        totalAmount,
        items: {
          create: dto.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        items: true, 
        patient: { select: { firstName: true, lastName: true, documentId: true } },
      },
    });
  }

  // Modificado con paginación y tipado estricto
  async findAll(patientId?: string, page: number = 1, limit: number = 10, month?: string, year?: string) {
    const skip = (page - 1) * limit;

    // 2. CHAU 'any'. Tipamos el objeto con la interfaz exacta de Prisma
    const whereClause: Prisma.InvoiceWhereInput = {};
    
    if (patientId) whereClause.patientId = patientId;

    if (month && year) {
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
      
      whereClause.createdAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, documentId: true } },
          items: true,
        },
      }),
      this.prisma.invoice.count({
        where: whereClause,
      })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  async findOne(id: string) {
    return await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, documentId: true } },
        items: true,
      },
    });
  }

  async cancelInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    return await this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, documentId: true } },
        items: true,
      }
    });
  }
}