import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags } from '@nestjs/swagger';
import { Appointment, AppointmentStatus } from '@prisma/client'; // <-- Importamos el enum

@ApiTags('Turnos')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async create(@Body() createAppointmentDto: CreateAppointmentDto): Promise<Appointment> {
    return this.appointmentsService.create(createAppointmentDto);
  }

  @Get()
  async findAll(): Promise<Appointment[]> {
    return this.appointmentsService.findAll();
  }

  // --- NUEVO: Endpoint PATCH ---
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: AppointmentStatus,
  ): Promise<Appointment> {
    return this.appointmentsService.updateStatus(id, status);
  }
}