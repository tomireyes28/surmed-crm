import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Dashboard (Métricas)')
@UseGuards(JwtAuthGuard)
@Controller('dashboard-stats') // Le pongo este nombre a la ruta para que no pise la vista del frontend
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  async getStats() {
    return await this.dashboardService.getStats();
  }

  @Get('today-appointments')
  async getTodayAppointments() {
    return await this.dashboardService.getTodayAppointments();
  }

  @Get('low-stock')
  async getLowStock() {
    return await this.dashboardService.getLowStock();
  }
}