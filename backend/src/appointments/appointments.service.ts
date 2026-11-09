import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Appointment, AppointmentStatus, Prisma } from '@prisma/client';
import { serializable } from '../common/utils/transaction.util';
import {
  idempotencyKey,
  fingerprint,
  assertReplay,
} from '../common/utils/idempotency.util';
import { parseClinicDateTime } from '../common/utils/timezone.util';

export const APPOINTMENT_DOCTOR_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

export const ALLOWED_APPOINTMENT_TRANSITIONS: Record<
  AppointmentStatus,
  readonly AppointmentStatus[]
> = {
  PENDING: ['CONFIRMED', 'IN_WAITING_ROOM', 'CANCELLED'],
  CONFIRMED: ['IN_WAITING_ROOM', 'ATTENDED', 'CANCELLED'],
  IN_WAITING_ROOM: ['ATTENDED', 'CANCELLED'],
  ATTENDED: [],
  CANCELLED: [],
};

const VALID_APPOINTMENT_STATUSES = new Set<AppointmentStatus>([
  'PENDING',
  'CONFIRMED',
  'IN_WAITING_ROOM',
  'ATTENDED',
  'CANCELLED',
]);

export interface AppointmentQueryFilters {
  from?: string;
  to?: string;
  doctorId?: string;
  patientId?: string;
  status?: AppointmentStatus;
}

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  private intervalsOverlap(
    startA: Date,
    durationMinutesA: number,
    startB: Date,
    durationMinutesB: number,
  ): boolean {
    const endA = startA.getTime() + durationMinutesA * 60_000;
    const endB = startB.getTime() + durationMinutesB * 60_000;
    return startA.getTime() < endB && endA > startB.getTime();
  }

  async create(
    dto: CreateAppointmentDto,
    idempotencyHeader?: string,
    actorId?: string,
  ): Promise<Appointment> {
    const date = parseClinicDateTime(dto.date);
    const duration = dto.duration ?? 30;
    if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
      throw new BadRequestException(
        'La duración debe ser un entero entre 15 y 240 minutos.',
      );
    }
    const key = idempotencyKey(dto.idempotencyKey, idempotencyHeader);
    const requestFingerprint = fingerprint('appointment.create', actorId, {
      patientId: dto.patientId,
      doctorId: dto.doctorId,
      specialtyId: dto.specialtyId,
      date: date.toISOString(),
      duration,
      notes: dto.notes?.trim() || '',
    });
    const include = {
      patient: true,
      doctor: { select: APPOINTMENT_DOCTOR_SELECT },
      specialty: true,
    };
    return serializable(
      this.prisma,
      async (tx) => {
        if (key) {
          const existing = await tx.appointment.findUnique({
            where: { idempotencyKey: key },
            include,
          });
          if (existing) {
            assertReplay(existing.requestFingerprint, requestFingerprint);
            return existing;
          }
        }
        const patient = await tx.patient.findUnique({
          where: { id: dto.patientId },
        });
        if (!patient || !patient.isActive)
          throw new NotFoundException('Paciente no encontrado o inactivo');
        const doctor = await tx.user.findUnique({
          where: { id: dto.doctorId },
          include: { specialties: true },
        });
        if (!doctor || !doctor.isActive || doctor.role !== 'MEDICO')
          throw new BadRequestException(
            'El médico no está activo o no posee rol MEDICO.',
          );
        if (!doctor.specialties.some((s) => s.id === dto.specialtyId))
          throw new BadRequestException(
            'El médico no atiende la especialidad indicada.',
          );
        const nearby = await tx.appointment.findMany({
          where: {
            status: { not: 'CANCELLED' },
            date: {
              gte: new Date(date.getTime() - 240 * 60000),
              lt: new Date(date.getTime() + duration * 60000),
            },
            OR: [{ doctorId: dto.doctorId }, { patientId: dto.patientId }],
          },
        });
        if (
          nearby.some((a) =>
            this.intervalsOverlap(date, duration, a.date, a.duration),
          )
        ) {
          throw new ConflictException(
            'El médico o paciente tiene un turno que se superpone con ese horario.',
          );
        }
        return tx.appointment.create({
          data: {
            patientId: dto.patientId,
            doctorId: dto.doctorId,
            specialtyId: dto.specialtyId,
            date,
            duration,
            notes: dto.notes?.trim() || undefined,
            ...(key ? { idempotencyKey: key, requestFingerprint } : {}),
          },
          include,
        });
      },
      Boolean(key),
    );
  }

  async findAll(filters?: AppointmentQueryFilters): Promise<Appointment[]> {
    if (!filters) {
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

    const where: Prisma.AppointmentWhereInput = {};
    if (filters.doctorId) {
      where.doctorId = filters.doctorId;
    }
    if (filters.patientId) {
      where.patientId = filters.patientId;
    }
    if (filters.status) {
      if (!VALID_APPOINTMENT_STATUSES.has(filters.status)) {
        throw new BadRequestException('El filtro de estado no es válido.');
      }
      where.status = filters.status;
    }
    if (filters.from || filters.to) {
      where.date = {
        ...(filters.from ? { gte: parseClinicDateTime(filters.from) } : {}),
        ...(filters.to ? { lte: parseClinicDateTime(filters.to) } : {}),
      };
    }

    return this.prisma.appointment.findMany({
      where,
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

  async updateStatus(
    id: string,
    status: AppointmentStatus,
    cancelReason?: string,
  ): Promise<Appointment> {
    if (!VALID_APPOINTMENT_STATUSES.has(status))
      throw new BadRequestException(
        'El estado de turno indicado no es válido.',
      );
    return serializable(this.prisma, async (tx) => {
      const existing = await tx.appointment.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Turno no encontrado');
      if (existing.status === status) return existing;
      if (!ALLOWED_APPOINTMENT_TRANSITIONS[existing.status].includes(status)) {
        throw new ConflictException('Transición de estado no permitida.');
      }
      return tx.appointment.update({
        where: { id },
        data: {
          status,
          ...(status === 'CANCELLED'
            ? { cancelReason: cancelReason?.trim() || null }
            : {}),
        },
      });
    });
  }
}
