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

    return await this.prisma.patient.create({
      data: {
        ...createPatientDto,
        birthDate: new Date(createPatientDto.birthDate), 
      },
    });
  }

  async findAll() {
    return await this.prisma.patient.findMany({
      where: { isActive: true }, 
      orderBy: { lastName: 'asc' }, 
    });
  }

  async findOne(id: string) {
    return await this.prisma.patient.findUnique({
      where: { id },
      include: {
        medicalRecords: {
          orderBy: { createdAt: 'desc' }
        },
        appointments: {
          orderBy: { date: 'asc' },
          include: {
            doctor: { select: { name: true } },
            specialty: { select: { name: true } },
          }
        }
      },
    });
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
      data: { isActive: false }
    });
  }
}