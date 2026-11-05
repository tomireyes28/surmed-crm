import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import 'multer';

@Injectable()
export class MedicalRecordsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async create(
    dto: CreateMedicalRecordDto,
    doctorId: string,
    file?: Express.Multer.File,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { id: true, isActive: true },
    });

    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado o inactivo');
    }

    let attachmentPath: string | null = null;

    if (file) {
      attachmentPath = await this.storage.uploadFile(file, dto.patientId);
    }

    return this.prisma.medicalRecord.create({
      data: {
        patientId: dto.patientId,
        doctorId: doctorId,
        notes: dto.notes,
        attachments: attachmentPath ? [attachmentPath] : [],
      },
      include: {
        doctor: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findByPatient(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const records = await this.prisma.medicalRecord.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        doctor: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return Promise.all(
      records.map(async (record) => {
        const signedAttachments = await Promise.all(
          record.attachments.map((path) => this.storage.getSignedUrl(path)),
        );
        return { ...record, attachments: signedAttachments };
      }),
    );
  }
}
