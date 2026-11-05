import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  StorageService,
  UploadedClinicalFileResult,
} from '../storage/storage.service';
import {
  CreateMedicalAddendumDto,
  CreateMedicalRecordDto,
} from './dto/create-medical-record.dto';
import { AuditService } from '../audit/audit.service';
import 'multer';

@Injectable()
export class MedicalRecordsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    @Optional() private auditService?: AuditService,
  ) {}

  async create(
    dto: CreateMedicalRecordDto,
    doctorId: string,
    file?: Express.Multer.File,
    actorRole: string = 'MEDICO',
  ) {
    if (!dto.notes || dto.notes.trim().length < 3) {
      throw new BadRequestException(
        'La evolución clínica no puede estar vacía.',
      );
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { id: true, isActive: true },
    });

    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado o inactivo');
    }

    let attachmentPath: string | null = null;
    let uploadedMetadata: UploadedClinicalFileResult | null = null;

    if (file) {
      // Validación previa de contenido real (magic bytes), MIME y tamaño (T11 / S07)
      if (typeof this.storage.uploadValidatedFile === 'function') {
        uploadedMetadata = await this.storage.uploadValidatedFile(
          file,
          dto.patientId,
        );
        attachmentPath = uploadedMetadata.storagePath;
      } else {
        if (typeof this.storage.validateClinicalFile === 'function') {
          this.storage.validateClinicalFile(file);
        }
        attachmentPath = await this.storage.uploadFile(file, dto.patientId);
      }
    }

    try {
      const created = await this.prisma.medicalRecord.create({
        data: {
          patientId: dto.patientId,
          doctorId,
          notes: dto.notes.trim(),
          attachments: attachmentPath ? [attachmentPath] : [],
          ...(dto.parentRecordId ? { parentRecordId: dto.parentRecordId } : {}),
          ...(uploadedMetadata
            ? {
                attachmentFiles: {
                  create: [
                    {
                      patientId: dto.patientId,
                      uploadedById: doctorId,
                      storagePath: uploadedMetadata.storagePath,
                      originalName: uploadedMetadata.originalName,
                      mimeType: uploadedMetadata.mimeType,
                      sizeBytes: uploadedMetadata.sizeBytes,
                      sha256: uploadedMetadata.sha256,
                      scanStatus: uploadedMetadata.scanStatus,
                    },
                  ],
                },
              }
            : {}),
        },
        include: {
          doctor: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await this.auditService?.record({
        actorId: doctorId,
        actorRole,
        action: dto.parentRecordId
          ? 'MEDICAL_RECORD_ADDENDUM'
          : 'MEDICAL_RECORD_CREATE',
        resource: 'MedicalRecord',
        resourceId: created.id,
        patientId: dto.patientId,
        metadata: {
          hasAttachment: Boolean(attachmentPath),
          ...(uploadedMetadata
            ? {
                attachmentMimeType: uploadedMetadata.mimeType,
                attachmentSizeBytes: uploadedMetadata.sizeBytes,
                attachmentSha256: uploadedMetadata.sha256,
              }
            : {}),
        },
      });

      return created;
    } catch (error) {
      // Compensación de subida: si falla la persistencia en base de datos, eliminar el objeto en Storage para no dejar huérfanos (T11 / S07)
      if (attachmentPath && typeof this.storage.removeFile === 'function') {
        await this.storage.removeFile(attachmentPath);
      }
      throw error;
    }
  }

  /**
   * Registra una adenda o aclaración vinculada a una evolución previa sin sobrescribir
   * el texto clínico original firmado (T12).
   */
  async createAddendum(
    parentRecordId: string,
    dto: CreateMedicalAddendumDto,
    doctorId: string,
    actorRole: string = 'MEDICO',
  ) {
    if (!dto.notes || dto.notes.trim().length < 3) {
      throw new BadRequestException('El texto de la adenda es obligatorio.');
    }

    const parentRecord = await this.prisma.medicalRecord.findUnique({
      where: { id: parentRecordId },
    });

    if (!parentRecord) {
      throw new NotFoundException(
        'La evolución clínica original no fue encontrada.',
      );
    }

    const addendum = await this.prisma.medicalRecord.create({
      data: {
        patientId: parentRecord.patientId,
        doctorId,
        parentRecordId,
        notes: dto.notes.trim(),
        attachments: [],
      },
      include: {
        doctor: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await this.auditService?.record({
      actorId: doctorId,
      actorRole,
      action: 'MEDICAL_RECORD_ADDENDUM',
      resource: 'MedicalRecord',
      resourceId: addendum.id,
      patientId: parentRecord.patientId,
      reason: dto.reason,
      metadata: {
        parentRecordId,
      },
    });

    return addendum;
  }

  async findByPatient(
    patientId: string,
    actorId?: string,
    actorRole?: string,
  ) {
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

    await this.auditService?.record({
      actorId,
      actorRole,
      action: 'MEDICAL_RECORD_READ',
      resource: 'MedicalRecord',
      patientId,
      metadata: {
        recordsCount: records.length,
      },
    });

    return Promise.all(
      records.map(async (record) => {
        const signedResults = await Promise.all(
          record.attachments.map(async (path) => {
            if (typeof this.storage.getSignedUrlSafe === 'function') {
              return await this.storage.getSignedUrlSafe(path);
            }
            try {
              return await this.storage.getSignedUrl(path);
            } catch {
              return null;
            }
          }),
        );

        const validAttachments = signedResults.filter(
          (url): url is string => typeof url === 'string' && url.length > 0,
        );
        const missingAttachmentsCount =
          record.attachments.length - validAttachments.length;

        return {
          ...record,
          attachments: validAttachments,
          ...(missingAttachmentsCount > 0 ? { missingAttachmentsCount } : {}),
        };
      }),
    );
  }
}
