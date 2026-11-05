import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toCents } from '../common/utils/money.util';
import {
  getClinicDateParts,
  getClinicDayBounds,
  getClinicMonthBounds,
} from '../common/utils/timezone.util';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(role?: Role) {
    const totalPatients = await this.prisma.patient.count({
      where: { isActive: true },
    });

    // Solo ADMIN tiene permiso para recibir información financiera / ingresos mensuales (S08 / T02)
    if (role !== 'ADMIN') {
      return {
        totalPatients,
        monthlyRevenue: null,
        monthlyPending: null,
        monthlyIssued: null,
      };
    }

    const { year, month } = getClinicDateParts(new Date());
    const { start: firstDayOfMonth, end: lastDayOfMonth } =
      getClinicMonthBounds(year, month);

    const currentMonthInvoices = await this.prisma.invoice.findMany({
      where: {
        createdAt: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
        status: { not: 'CANCELLED' },
      },
    });

    // Separación estricta de Cobrado (PAID) vs Pendiente (PENDING) vs Emitido (T10 / F09):
    // Emitir una factura en estado PENDING NO incrementa `monthlyRevenue` ("Cobrado").
    let paidCents = 0;
    let pendingCents = 0;

    for (const inv of currentMonthInvoices) {
      const amountCents = toCents(inv.totalAmount);
      if (inv.status === 'PAID') {
        paidCents += amountCents;
      } else if (inv.status === 'PENDING') {
        pendingCents += amountCents;
      }
    }

    const monthlyRevenue = Math.round(paidCents) / 100;
    const monthlyPending = Math.round(pendingCents) / 100;
    const monthlyIssued = Math.round(paidCents + pendingCents) / 100;

    return {
      totalPatients,
      monthlyRevenue,
      monthlyPending,
      monthlyIssued,
    };
  }

  async getTodayAppointments() {
    const { start: todayStart, end: todayEnd } = getClinicDayBounds(new Date());

    return await this.prisma.appointment.findMany({
      where: {
        date: {
          gte: todayStart,
          lt: todayEnd,
        },
        status: {
          not: 'CANCELLED',
        },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { name: true } },
        specialty: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    });
  }

  async getLowStock() {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        category: 'INSUMO_MEDICO',
      },
    });

    return products.filter(
      (p) =>
        (p.category === undefined || p.category === 'INSUMO_MEDICO') &&
        p.quantity <= p.minStock,
    );
  }
}
