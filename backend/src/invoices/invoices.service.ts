import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateInvoiceDto) {
    // 1. Verificamos que el paciente exista
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    // 2. Calculamos el total absoluto sumando (cantidad * precio) de cada ítem
    const totalAmount = dto.items.reduce(
      (acc, item) => acc + (item.quantity * item.unitPrice),
      0
    );

    // 3. Creamos la factura y los ítems en cascada
    return this.prisma.invoice.create({
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
        items: true, // Devolvemos la factura creada con sus ítems
        patient: { select: { firstName: true, lastName: true, documentId: true } },
      },
    });
  }

  // Permite traer todas las facturas, o filtrarlas por paciente si pasamos el patientId
  findAll(patientId?: string) {
    return this.prisma.invoice.findMany({
      where: patientId ? { patientId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        items: true,
      },
    });
  }

  findOne(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: true,
        items: true,
      },
    });
  }
}