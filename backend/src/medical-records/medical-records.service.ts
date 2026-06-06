import { Injectable } from '@nestjs/common';
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

  async create(dto: CreateMedicalRecordDto, doctorId: string, file?: Express.Multer.File) {
    let attachmentPath: string | null = null;

    // Si el médico adjuntó una radiografía o PDF, lo subimos a Supabase
    if (file) {
      attachmentPath = await this.storage.uploadFile(file, dto.patientId);
    }

    return this.prisma.medicalRecord.create({
      data: {
        patientId: dto.patientId,
        doctorId: doctorId, // El ID viene del JWT del usuario logueado
        notes: dto.notes,
        attachments: attachmentPath ? [attachmentPath] : [],
      },
    });
  }

  async findByPatient(patientId: string) {
    const records = await this.prisma.medicalRecord.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        doctor: {
          select: { name: true, email: true }, // Solo traemos el nombre del médico, no su contraseña
        },
      },
    });

    // Si hay archivos adjuntos, convertimos sus rutas internas en URLs temporales legibles
    return Promise.all(
      records.map(async (record) => {
        const signedAttachments = await Promise.all(
          record.attachments.map((path) => this.storage.getSignedUrl(path))
        );
        return { ...record, attachments: signedAttachments };
      })
    );
  }
}