import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../common/utils/transaction.util';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ClinicalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(
    patientId: string,
    actorId?: string,
    role?: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (!actorId || role !== 'MEDICO')
      throw new ForbiddenException(
        'Acceso exclusivo del equipo médico asignado.',
      );
    const doctor = await db.user.findUnique({
      where: { id: actorId },
      select: { role: true, isActive: true },
    });
    if (!doctor?.isActive || doctor.role !== 'MEDICO')
      throw new ForbiddenException('Profesional no autorizado.');
    const grant = await db.clinicalAccess.findUnique({
      where: { patientId_doctorId: { patientId, doctorId: actorId } },
    });
    if (grant) {
      if (grant.revokedAt)
        throw new ForbiddenException('El acceso clínico fue revocado.');
      return;
    }
    const appointment = await db.appointment.findFirst({
      where: { patientId, doctorId: actorId, status: { not: 'CANCELLED' } },
      select: { id: true },
    });
    if (!appointment)
      throw new ForbiddenException(
        'El paciente no está asignado y no tiene turnos con este médico.',
      );
  }

  async manage(
    patientId: string,
    doctorId: string,
    actorId: string,
    reason: string,
    revoke = false,
  ) {
    return serializable(this.prisma, async (tx) => {
      const doctor = await tx.user.findUnique({ where: { id: doctorId } });
      const patient = await tx.patient.findUnique({ where: { id: patientId } });
      if (!doctor || doctor.role !== 'MEDICO' || !doctor.isActive || !patient)
        throw new BadRequestException('Paciente o médico no disponible.');
      const data = {
        grantedById: actorId,
        reason: reason.trim(),
        revokedAt: revoke ? new Date() : null,
        grantedAt: new Date(),
      };
      const grant = await tx.clinicalAccess.upsert({
        where: { patientId_doctorId: { patientId, doctorId } },
        create: { patientId, doctorId, ...data },
        update: data,
      });
      await new AuditService(this.prisma).record(
        {
          actorId,
          actorRole: 'ADMIN',
          action: revoke ? 'CLINICAL_ACCESS_REVOKE' : 'CLINICAL_ACCESS_GRANT',
          resource: 'ClinicalAccess',
          resourceId: doctorId,
          patientId,
          reason,
        },
        tx,
      );
      return grant;
    });
  }
}
