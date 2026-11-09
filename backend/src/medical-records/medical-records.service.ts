import {
  BadRequestException,
  Injectable,
  Logger,
  ForbiddenException,
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
import { ClinicalAccessService } from './clinical-access.service';
import { serializable } from '../common/utils/transaction.util';
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
    await new ClinicalAccessService(this.prisma).assertAccess(
      dto.patientId,
      doctorId,
      actorRole,
    );
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

    // A foreign key alone does not ensure the parent belongs to this patient.
    if (dto.parentRecordId) {
      const parent = await this.prisma.medicalRecord.findUnique({
        where: { id: dto.parentRecordId },
        select: { id: true, patientId: true },
      });
      if (!parent || parent.patientId !== dto.patientId) {
        throw new BadRequestException(
          'La evolución original no pertenece al paciente indicado.',
        );
      }
    }

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
      return await this.prisma.$transaction(async (tx) => {
        await new ClinicalAccessService(this.prisma).assertAccess(
          dto.patientId,
          doctorId,
          actorRole,
          tx,
        );
        const created = await tx.medicalRecord.create({
          data: {
            patientId: dto.patientId,
            doctorId,
            notes: dto.notes.trim(),
            attachments: attachmentPath ? [attachmentPath] : [],
            ...(dto.parentRecordId
              ? { parentRecordId: dto.parentRecordId }
              : {}),
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

        await (this.auditService ?? new AuditService(this.prisma)).record(
          {
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
          },
          tx,
        );

        return created;
      });
    } catch (error) {
      // Compensación de subida: si falla la persistencia en base de datos, eliminar el objeto en Storage para no dejar huérfanos (T11 / S07)
      if (attachmentPath && typeof this.storage.removeFile === 'function') {
        try {
          // A commit acknowledgement can fail after PostgreSQL committed. Never delete
          // an object referenced by a committed record; preserve it if DB is unavailable.
          const committed = await this.prisma.medicalAttachment.findUnique({
            where: { storagePath: attachmentPath },
          });
          if (committed) {
            return await this.prisma.medicalRecord.findUniqueOrThrow({
              where: { id: committed.medicalRecordId },
              include: {
                doctor: { select: { id: true, name: true, email: true } },
              },
            });
          }
          await this.storage.removeFile(attachmentPath);
        } catch {
          Logger.error(
            'No se pudo confirmar o compensar un adjunto; requiere conciliación de almacenamiento.',
            'MedicalRecordsService',
          );
        }
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

    return this.prisma.$transaction(async (tx) => {
      const parentRecord = await tx.medicalRecord.findUnique({
        where: { id: parentRecordId },
      });

      if (!parentRecord) {
        throw new NotFoundException(
          'La evolución clínica original no fue encontrada.',
        );
      }

      await new ClinicalAccessService(this.prisma).assertAccess(
        parentRecord.patientId,
        doctorId,
        actorRole,
        tx,
      );
      const addendum = await tx.medicalRecord.create({
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

      await (this.auditService ?? new AuditService(this.prisma)).record(
        {
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
        },
        tx,
      );

      return addendum;
    });
  }

  async findByPatient(patientId: string, actorId?: string, actorRole?: string) {
    await new ClinicalAccessService(this.prisma).assertAccess(
      patientId,
      actorId,
      actorRole,
    );
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

    const files = await this.prisma.medicalAttachment.findMany({
      where: { patientId },
    });
    // Preserve old studies without trusting unverified legacy paths. Validate them
    // once under an authorized doctor's request; never recreate revoked metadata.
    const knownPaths = new Set(files.map((file) => file.storagePath));
    for (const record of records) {
      for (const path of record.attachments) {
        if (knownPaths.has(path)) continue;
        try {
          const buffer = await this.storage.downloadFile(path);
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const mime: Record<string, string> = {
            pdf: 'application/pdf',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
          };
          const checked = this.storage.validateClinicalFile({
            buffer,
            size: buffer.length,
            originalname: `adjunto.${ext}`,
            mimetype: mime[ext] || '',
          } as Express.Multer.File);
          const file = await this.prisma.medicalAttachment.upsert({
            where: { storagePath: path },
            create: {
              medicalRecordId: record.id,
              patientId,
              uploadedById: record.doctorId,
              storagePath: path,
              originalName: checked.originalName,
              mimeType: checked.mimeType,
              sizeBytes: checked.sizeBytes,
              sha256: checked.sha256,
              scanStatus: checked.scanStatus,
            },
            update: {},
          });
          if (
            file.patientId === patientId &&
            file.medicalRecordId === record.id
          )
            files.push(file);
          knownPaths.add(path);
        } catch {
          Logger.warn(
            'Adjunto histórico no disponible o no verificable; requiere conciliación.',
            'MedicalRecordsService',
          );
        }
      }
    }
    return records.map((record) => {
      const visible = files.filter(
        (file) =>
          file.medicalRecordId === record.id &&
          !file.isRevoked &&
          file.scanStatus === 'CLEAN_MAGIC_VERIFIED',
      );
      return {
        ...record,
        attachments: visible.map(
          (file) =>
            `/api/backend/medical-records/attachments/${file.id}/content`,
        ),
        attachmentFiles: visible.map((file) => ({ id: file.id })),
        missingAttachmentsCount: Math.max(
          0,
          record.attachments.length - visible.length,
        ),
      };
    });
  }

  async attachmentContent(id: string, actorId: string, role: string) {
    return serializable(this.prisma, async (tx) => {
      const file = await tx.medicalAttachment.findUnique({ where: { id } });
      if (!file) throw new NotFoundException('Adjunto no disponible.');
      await new ClinicalAccessService(this.prisma).assertAccess(
        file.patientId,
        actorId,
        role,
        tx,
      );
      if (file.isRevoked || file.scanStatus !== 'CLEAN_MAGIC_VERIFIED')
        throw new ForbiddenException(
          'Adjunto revocado o pendiente de verificación.',
        );
      const downloaded = await this.storage.downloadFile(file.storagePath);
      await new AuditService(this.prisma).record(
        {
          actorId,
          actorRole: role,
          action: 'MEDICAL_ATTACHMENT_READ',
          resource: 'MedicalAttachment',
          resourceId: id,
          patientId: file.patientId,
        },
        tx,
      );
      return { buffer: downloaded, mimeType: file.mimeType };
    });
  }

  async revokeAttachment(
    id: string,
    actorId: string,
    role: string,
    reason: string,
  ) {
    return serializable(this.prisma, async (tx) => {
      const file = await tx.medicalAttachment.findUnique({ where: { id } });
      if (!file) throw new NotFoundException('Adjunto no disponible.');
      await new ClinicalAccessService(this.prisma).assertAccess(
        file.patientId,
        actorId,
        role,
        tx,
      );
      await tx.medicalAttachment.update({
        where: { id },
        data: { isRevoked: true },
      });
      await new AuditService(this.prisma).record(
        {
          actorId,
          actorRole: role,
          action: 'MEDICAL_ATTACHMENT_REVOKE',
          resource: 'MedicalAttachment',
          resourceId: id,
          patientId: file.patientId,
          reason,
        },
        tx,
      );
      return { message: 'Adjunto revocado.' };
    });
  }
}
