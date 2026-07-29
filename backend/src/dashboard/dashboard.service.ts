import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    // 1. Calculamos el primer día del mes actual para la facturación
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // 2. Pacientes totales activos
    const totalPatients = await this.prisma.patient.count({
      where: { isActive: true },
    });

    // 3. Facturación del mes (excluyendo las CANCELLED que hicimos en la Fase 4)
    const currentMonthInvoices = await this.prisma.invoice.findMany({
      where: {
        createdAt: { gte: firstDayOfMonth },
        status: { not: 'CANCELLED' },
      },
    });
    const monthlyRevenue = currentMonthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

    return { totalPatients, monthlyRevenue };
  }

  async getTodayAppointments() {
    // Rango de fechas: Desde las 00:00:00 de hoy hasta las 23:59:59
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
    
    // Filtramos los que están por debajo o igual a su stock mínimo
    return products.filter(p => p.quantity <= p.minStock);
  }
}