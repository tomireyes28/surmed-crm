import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Appointment } from '@prisma/client';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    return this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        specialtyId: dto.specialtyId,
        date: new Date(dto.date),
        duration: dto.duration || 30, // 30 minutos por defecto
        notes: dto.notes,
      },
      include: {
        patient: true,
        doctor: true,
        specialty: true,
      }
    });
  }

  // Traemos todos los turnos ordenados por fecha
  async findAll(): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      orderBy: { date: 'asc' },
      include: {
        patient: true,
        doctor: {
          select: { id: true, name: true } // Del doctor solo traemos ID y Nombre por seguridad
        },
        specialty: true,
      },
    });
  }
}