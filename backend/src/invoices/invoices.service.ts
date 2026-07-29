import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

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

  async findAll(patientId?: string) {
    return await this.prisma.invoice.findMany({
      where: patientId ? { patientId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, documentId: true } },
        items: true,
      },
    });
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

  // --- NUEVO: Anulación de facturas ---
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