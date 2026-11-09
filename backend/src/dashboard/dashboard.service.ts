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

    const now = new Date();
    // Paid uses collection date; issued uses issue date; pending is outstanding now.
    const invoices = await this.prisma.invoice.findMany({
      where: {
        OR: [
          { paidAt: { gte: firstDayOfMonth, lte: lastDayOfMonth } },
          {
            createdAt: { gte: firstDayOfMonth, lte: lastDayOfMonth },
            status: { not: 'CANCELLED' },
          },
          { status: 'PENDING', createdAt: { lte: now } },
        ],
      },
    });
    let paidCents = 0;
    let pendingCents = 0;
    let issuedCents = 0;
    const inMonth = (date: Date | null) =>
      date !== null && date >= firstDayOfMonth && date <= lastDayOfMonth;
    for (const invoice of invoices) {
      const cents = toCents(invoice.totalAmount);
      if (inMonth(invoice.paidAt)) paidCents += cents;
      if (invoice.status === 'PENDING' && invoice.createdAt <= now)
        pendingCents += cents;
      if (invoice.status !== 'CANCELLED' && inMonth(invoice.createdAt))
        issuedCents += cents;
    }
    const monthlyRevenue = paidCents / 100;
    const monthlyPending = pendingCents / 100;
    const monthlyIssued = issuedCents / 100;

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
