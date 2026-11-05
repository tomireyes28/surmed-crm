import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(role?: Role) {
    const totalPatients = await this.prisma.patient.count({
      where: { isActive: true },
    });

    // Solo ADMIN tiene permiso para recibir información financiera / ingresos mensuales (S08 / T02)
    if (role !== 'ADMIN') {
      return { totalPatients, monthlyRevenue: null };
    }

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const currentMonthInvoices = await this.prisma.invoice.findMany({
      where: {
        createdAt: { gte: firstDayOfMonth },
        status: { not: 'CANCELLED' },
      },
    });
    const monthlyRevenue = currentMonthInvoices.reduce(
      (sum, inv) => sum + inv.totalAmount,
      0,
    );

    return { totalPatients, monthlyRevenue };
  }

  async getTodayAppointments() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    return await this.prisma.appointment.findMany({
      where: {
        date: {
          gte: todayStart,
          lt: todayEnd,
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
      where: { isActive: true },
    });

    return products.filter((p) => p.quantity <= p.minStock);
  }
}
