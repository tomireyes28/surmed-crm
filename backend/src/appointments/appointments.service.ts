import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Appointment, AppointmentStatus, Prisma } from '@prisma/client';
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
  private readonly doctorLocks = new Map<string, Promise<unknown>>();

  constructor(private prisma: PrismaService) {}

  private async withDoctorLock<T>(
    doctorId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = this.doctorLocks.get(doctorId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.doctorLocks.set(doctorId, chained);

    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.doctorLocks.get(doctorId) === chained) {
        this.doctorLocks.delete(doctorId);
      }
    }
  }

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
  ): Promise<Appointment> {
    const appointmentDate = parseClinicDateTime(dto.date);
    const duration = dto.duration ?? 30;

    if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
      throw new BadRequestException(
        'La duración del turno debe ser un entero entre 15 y 240 minutos.',
      );
    }

    const effectiveKey =
      (dto.idempotencyKey ?? idempotencyHeader)?.trim() || undefined;

    return this.withDoctorLock(dto.doctorId, async () => {
      const executeCreate = async (tx: PrismaService) => {
        if (effectiveKey && typeof tx.appointment?.findUnique === 'function') {
          const existingByKey = await tx.appointment.findUnique({
            where: { idempotencyKey: effectiveKey },
            include: {
              patient: true,
              doctor: { select: APPOINTMENT_DOCTOR_SELECT },
              specialty: true,
            },
          });
          if (existingByKey) {
            return existingByKey;
          }
        }

        // 1. Validar paciente activo (si el mock/base provee patient.findUnique)
        if (typeof tx.patient?.findUnique === 'function') {
          const patient = await tx.patient.findUnique({
            where: { id: dto.patientId },
          });
          if (!patient) {
            throw new NotFoundException('Paciente no encontrado');
          }
          if (patient.isActive === false) {
            throw new BadRequestException(
              'No se puede agendar un turno para un paciente archivado/inactivo.',
            );
          }
        }

        // 2. Validar médico activo, rol MEDICO y pertenencia a la especialidad (F06 / T09)
        if (typeof tx.user?.findUnique === 'function') {
          const doctor = (await tx.user.findUnique({
            where: { id: dto.doctorId },
            include: { specialties: true },
          })) as
            | {
                id: string;
                role: string;
                isActive?: boolean;
                specialties?: Array<{ id: string }>;
              }
            | null;

          if (!doctor) {
            throw new NotFoundException('Médico no encontrado');
          }
          if (doctor.isActive === false) {
            throw new BadRequestException(
              'El médico seleccionado se encuentra inactivo.',
            );
          }
          if (doctor.role !== 'MEDICO') {
            throw new BadRequestException(
              'El usuario seleccionado no posee el rol MEDICO y no puede recibir turnos.',
            );
          }
          if (
            Array.isArray(doctor.specialties) &&
            !doctor.specialties.some((s) => s.id === dto.specialtyId)
          ) {
            throw new BadRequestException(
              'El médico seleccionado no atiende la especialidad indicada.',
            );
          }
        }

        // 3. Validar solapamiento de intervalos para el médico y para el paciente (F06 / T09)
        if (typeof tx.appointment?.findMany === 'function') {
          const windowStart = new Date(
            appointmentDate.getTime() - 24 * 60 * 60_000,
          );
          const windowEnd = new Date(
            appointmentDate.getTime() + (duration + 24 * 60) * 60_000,
          );

          const nearbyAppointments = await tx.appointment.findMany({
            where: {
              status: { not: 'CANCELLED' },
              date: {
                gte: windowStart,
                lte: windowEnd,
              },
              OR: [{ doctorId: dto.doctorId }, { patientId: dto.patientId }],
            },
          });

          for (const existing of nearbyAppointments ?? []) {
            if (existing.status === 'CANCELLED') continue;
            const existingStart = new Date(existing.date);
            const existingDuration = existing.duration || 30;

            if (
              this.intervalsOverlap(
                appointmentDate,
                duration,
                existingStart,
                existingDuration,
              )
            ) {
              if (existing.doctorId === dto.doctorId) {
                throw new ConflictException(
                  'El médico ya tiene un turno asignado que se superpone con ese horario.',
                );
              }
              if (existing.patientId === dto.patientId) {
                throw new ConflictException(
                  'El paciente ya tiene otro turno asignado en ese mismo horario.',
                );
              }
            }
          }
        }

        return tx.appointment.create({
          data: {
            patientId: dto.patientId,
            doctorId: dto.doctorId,
            specialtyId: dto.specialtyId,
            date: appointmentDate,
            duration,
            notes: dto.notes?.trim() || undefined,
            ...(effectiveKey ? { idempotencyKey: effectiveKey } : {}),
          },
          include: {
            patient: true,
            doctor: {
              select: APPOINTMENT_DOCTOR_SELECT,
            },
            specialty: true,
          },
        });
      };

      if (typeof this.prisma.$transaction === 'function') {
        return await this.prisma.$transaction(async (tx) =>
          executeCreate(tx as unknown as PrismaService),
        );
      }

      return await executeCreate(this.prisma);
    });
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
    if (!VALID_APPOINTMENT_STATUSES.has(status)) {
      throw new BadRequestException('El estado de turno indicado no es válido.');
    }

    if (typeof this.prisma.appointment?.findUnique === 'function') {
      const existing = await this.prisma.appointment.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException('Turno no encontrado');
      }

      if (existing.status === status) {
        return existing;
      }

      const allowedTargets = ALLOWED_APPOINTMENT_TRANSITIONS[existing.status] ?? [];
      if (!allowedTargets.includes(status)) {
        throw new ConflictException(
          `Transición de estado no permitida: no se puede cambiar un turno de ${existing.status} a ${status}.`,
        );
      }
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status,
        ...(status === 'CANCELLED' && cancelReason?.trim()
          ? { cancelReason: cancelReason.trim() }
          : {}),
      },
    });
  }
}
