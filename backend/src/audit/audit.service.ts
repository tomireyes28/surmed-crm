import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { redactSensitiveData } from '../common/logger/structured-logger';

export interface CreateAuditLogInput {
  actorId?: string;
  actorRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  patientId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Registra un evento de auditoría clínica o administrativa aplicando redacción
   * automática de cualquier campo sensible (notas clínicas, claves, tokens).
   * No expone métodos de borrado ni edición (inmutabilidad operativa T12).
   */
  async record(
    input: CreateAuditLogInput,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const sanitizedMetadata = input.metadata
      ? (redactSensitiveData(input.metadata) as Prisma.InputJsonValue)
      : undefined;

    return await db.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        patientId: input.patientId,
        reason: input.reason?.trim() || undefined,
        metadata: sanitizedMetadata,
        ipAddress: input.ipAddress,
      },
    });
  }

  async findAll(filters?: {
    patientId?: string;
    resource?: string;
    resourceId?: string;
    actorId?: string;
    action?: string;
    page?: number;
    limit?: number;
  }) {
    const page =
      filters?.page && Number.isFinite(filters.page) && filters.page >= 1
        ? Math.floor(filters.page)
        : 1;
    const limit =
      filters?.limit && Number.isFinite(filters.limit) && filters.limit >= 1
        ? Math.min(100, Math.floor(filters.limit))
        : 25;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(filters?.patientId ? { patientId: filters.patientId } : {}),
      ...(filters?.resource ? { resource: filters.resource } : {}),
      ...(filters?.resourceId ? { resourceId: filters.resourceId } : {}),
      ...(filters?.actorId ? { actorId: filters.actorId } : {}),
      ...(filters?.action ? { action: filters.action } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
