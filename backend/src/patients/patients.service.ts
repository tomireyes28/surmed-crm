import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { parseCivilDate } from '../common/utils/timezone.util';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  private normalizeOptionalText(
    value?: string | null,
  ): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  private normalizeOptionalEmail(
    value?: string | null,
  ): string | null | undefined {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) return normalized;
    const lower = normalized.toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lower)) {
      throw new BadRequestException('El formato del email no es válido');
    }
    return lower;
  }

  async create(createPatientDto: CreatePatientDto) {
    const normalizedDoc = createPatientDto.documentId?.trim();
    const normalizedFirstName = createPatientDto.firstName?.trim();
    const normalizedLastName = createPatientDto.lastName?.trim();

    if (!normalizedDoc || normalizedDoc.length < 5) {
      throw new BadRequestException(
        'El documento debe tener al menos 5 caracteres',
      );
    }
    if (!normalizedFirstName || !normalizedLastName) {
      throw new BadRequestException('El nombre y apellido son obligatorios');
    }

    const existingPatient = await this.prisma.patient.findUnique({
      where: { documentId: normalizedDoc },
    });

    if (existingPatient) {
      throw new ConflictException(
        'Ya existe un paciente registrado con este documento',
      );
    }

    const normalizedEmail = this.normalizeOptionalEmail(createPatientDto.email);
    const normalizedPhone = this.normalizeOptionalText(createPatientDto.phone);
    const normalizedAddress = this.normalizeOptionalText(
      createPatientDto.address,
    );
    const parsedBirthDate = parseCivilDate(createPatientDto.birthDate, false);

    return await this.prisma.patient.create({
      data: {
        documentId: normalizedDoc,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        email: normalizedEmail ?? null,
        phone: normalizedPhone ?? null,
        birthDate: parsedBirthDate,
        address: normalizedAddress ?? null,
      },
    });
  }

  async findAll(page: number = 1, limit: number = 10, search?: string) {
    const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const safeLimit =
      Number.isFinite(limit) && limit >= 1
        ? Math.min(50, Math.floor(limit))
        : 10;
    const skip = (safePage - 1) * safeLimit;
    const trimmedSearch = search?.trim();

    const whereClause: Prisma.PatientWhereInput = {
      isActive: true,
      ...(trimmedSearch
        ? {
            OR: [
              { firstName: { contains: trimmedSearch, mode: 'insensitive' } },
              { lastName: { contains: trimmedSearch, mode: 'insensitive' } },
              { documentId: { contains: trimmedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where: whereClause,
        orderBy: { lastName: 'asc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.patient.count({
        where: whereClause,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // Ficha administrativa del paciente: NUNCA incluye medicalRecords (S03 / T02)
  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          orderBy: { date: 'asc' },
          include: {
            doctor: { select: { id: true, name: true } },
            specialty: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return patient;
  }

  async update(id: string, updatePatientDto: UpdatePatientDto) {
    const existing = await this.prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const updateData: Prisma.PatientUpdateInput = {};

    if (updatePatientDto.documentId !== undefined) {
      const normalizedDoc = updatePatientDto.documentId.trim();
      if (normalizedDoc.length < 5) {
        throw new BadRequestException(
          'El documento debe tener al menos 5 caracteres',
        );
      }
      if (normalizedDoc !== existing.documentId) {
        const duplicate = await this.prisma.patient.findUnique({
          where: { documentId: normalizedDoc },
        });
        if (duplicate && duplicate.id !== id) {
          throw new ConflictException(
            'Ya existe otro paciente registrado con este documento',
          );
        }
      }
      updateData.documentId = normalizedDoc;
    }

    if (updatePatientDto.firstName !== undefined) {
      updateData.firstName = updatePatientDto.firstName.trim();
    }

    if (updatePatientDto.lastName !== undefined) {
      updateData.lastName = updatePatientDto.lastName.trim();
    }

    if (updatePatientDto.email !== undefined) {
      updateData.email = this.normalizeOptionalEmail(updatePatientDto.email);
    }

    if (updatePatientDto.phone !== undefined) {
      updateData.phone = this.normalizeOptionalText(updatePatientDto.phone);
    }

    if (updatePatientDto.address !== undefined) {
      updateData.address = this.normalizeOptionalText(updatePatientDto.address);
    }

    if (updatePatientDto.birthDate !== undefined) {
      updateData.birthDate = parseCivilDate(updatePatientDto.birthDate, false);
    }

    return await this.prisma.patient.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return await this.prisma.patient.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
