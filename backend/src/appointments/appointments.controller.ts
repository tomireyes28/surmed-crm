import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Appointment, AppointmentStatus } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/auth.interface';

@ApiTags('Turnos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MEDICO', 'RECEPCION')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async create(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @Headers('idempotency-key') idempotencyHeader?: string,
    @Request() req?: RequestWithUser,
  ): Promise<Appointment> {
    return this.appointmentsService.create(
      createAppointmentDto,
      idempotencyHeader,
      req?.user?.id,
    );
  }

  @Get()
  async findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('doctorId') doctorId?: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: AppointmentStatus,
  ): Promise<Appointment[]> {
    const hasFilters = Boolean(from || to || doctorId || patientId || status);
    return this.appointmentsService.findAll(
      hasFilters ? { from, to, doctorId, patientId, status } : undefined,
    );
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAppointmentStatusDto,
  ): Promise<Appointment> {
    return this.appointmentsService.updateStatus(
      id,
      body.status,
      body.cancelReason,
    );
  }
}
