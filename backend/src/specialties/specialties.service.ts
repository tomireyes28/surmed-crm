import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';

@Injectable()
export class SpecialtiesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSpecialtyDto) {
    const normalizedName = dto.name.trim();
    const existing = await this.prisma.specialty.findUnique({
      where: { name: normalizedName },
    });

    if (existing) {
      throw new ConflictException('La especialidad ya existe');
    }

    return await this.prisma.specialty.create({
      data: {
        name: normalizedName,
        description: dto.description?.trim() || undefined,
      },
    });
  }

  async findAll() {
    return await this.prisma.specialty.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            doctors: { where: { isActive: true } },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const specialty = await this.prisma.specialty.findUnique({ where: { id } });
    if (!specialty) {
      throw new NotFoundException('Especialidad no encontrada');
    }
    return specialty;
  }

  async update(id: string, dto: UpdateSpecialtyDto) {
    const raw = dto as Record<string, unknown>;
    if (raw.doctors !== undefined || raw.appointments !== undefined) {
      throw new BadRequestException(
        'No se permite modificar relaciones directamente en la edición de especialidad.',
      );
    }

    await this.findOne(id);

    const updateData: Prisma.SpecialtyUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      updateData.description = dto.description ? dto.description.trim() : null;
    }

    return await this.prisma.specialty.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const specialtyWithCounts = await this.prisma.specialty.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            doctors: true,
            appointments: true,
          },
        },
      },
    });

    if ((specialtyWithCounts?._count?.doctors ?? 0) > 0) {
      throw new ConflictException(
        'No se puede borrar porque hay médicos asignados a esta especialidad.',
      );
    }

    if ((specialtyWithCounts?._count?.appointments ?? 0) > 0) {
      throw new ConflictException(
        'No se puede borrar la especialidad porque tiene turnos asociados en el historial.',
      );
    }

    return await this.prisma.specialty.delete({
      where: { id },
    });
  }
}
