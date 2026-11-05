import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/interfaces/auth.interface';

@ApiTags('Dashboard (Métricas)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard-stats')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @Roles('ADMIN', 'MEDICO', 'RECEPCION')
  async getStats(@Request() req: RequestWithUser) {
    return await this.dashboardService.getStats(req.user?.role);
  }

  @Get('today-appointments')
  @Roles('ADMIN', 'MEDICO', 'RECEPCION')
  async getTodayAppointments() {
    return await this.dashboardService.getTodayAppointments();
  }

  @Get('low-stock')
  @Roles('ADMIN', 'RECEPCION')
  async getLowStock() {
    return await this.dashboardService.getLowStock();
  }
}
