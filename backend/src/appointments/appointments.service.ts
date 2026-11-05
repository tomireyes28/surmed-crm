import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Appointment, AppointmentStatus } from '@prisma/client';

const APPOINTMENT_DOCTOR_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

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
        duration: dto.duration || 30,
        notes: dto.notes,
      },
      include: {
        patient: true,
        doctor: {
          select: APPOINTMENT_DOCTOR_SELECT,
        },
        specialty: true,
      },
    });
  }

  async findAll(): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      orderBy: { date: 'asc' },
      include: {
        patient: true,
        doctor: {
          select: { id: true, name: true },
        },
        specialty: true,
      },
    });
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
    return this.prisma.appointment.update({
      where: { id },
      data: { status },
    });
  }
}
