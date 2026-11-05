import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async create(createPatientDto: CreatePatientDto) {
    const existingPatient = await this.prisma.patient.findUnique({
      where: { documentId: createPatientDto.documentId },
    });

    if (existingPatient) {
      throw new ConflictException(
        'Ya existe un paciente registrado con este documento',
      );
    }

    return await this.prisma.patient.create({
      data: {
        ...createPatientDto,
        birthDate: new Date(createPatientDto.birthDate),
      },
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
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
    return await this.prisma.patient.update({
      where: { id },
      data: updatePatientDto,
    });
  }

  async remove(id: string) {
    return await this.prisma.patient.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
