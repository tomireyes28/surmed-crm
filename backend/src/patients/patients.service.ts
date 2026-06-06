import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async create(createPatientDto: CreatePatientDto) {
    // 1. Verificar si ya existe un paciente con ese documento
    const existingPatient = await this.prisma.patient.findUnique({
      where: { documentId: createPatientDto.documentId },
    });

    if (existingPatient) {
      throw new ConflictException('Ya existe un paciente registrado con este documento');
    }

    // 2. Guardar en la base de datos
    return this.prisma.patient.create({
      data: {
        ...createPatientDto,
        birthDate: new Date(createPatientDto.birthDate), // Convertimos el string a formato Date para Prisma
      },
    });
  }

  async findAll() {
    return this.prisma.patient.findMany({
      orderBy: { lastName: 'asc' }, // Los devolvemos ordenados por apellido
    });
  }

  async findOne(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: {
        medicalRecords: true, // Cuando busquemos un paciente en detalle, traemos su historial
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