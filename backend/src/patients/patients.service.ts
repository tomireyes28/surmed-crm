import { Injectable, ConflictException } from '@nestjs/common';
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
      throw new ConflictException('Ya existe un paciente registrado con este documento');
    }

    return this.prisma.patient.create({
      data: {
        ...createPatientDto,
        birthDate: new Date(createPatientDto.birthDate), 
      },
    });
  }

  async findAll() {
    return this.prisma.patient.findMany({
      orderBy: { lastName: 'asc' }, 
    });
  }

  async findOne(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: {
        medicalRecords: {
          orderBy: { createdAt: 'desc' } // Ya que estamos, ordenamos las notas de más nuevas a más viejas
        },
        // --- NUEVO: Traemos los turnos del paciente ---
        appointments: {
          orderBy: { date: 'asc' }, // Orden cronológico
          include: {
            doctor: { select: { name: true } },
            specialty: { select: { name: true } },
          }
        }
      },
    });
  }

  update(id: string, updatePatientDto: UpdatePatientDto) {
    return this.prisma.patient.update({
      where: { id },
      data: updatePatientDto,
    });
  }

  remove(id: string) {
    return this.prisma.patient.delete({
      where: { id },
    });
  }
}