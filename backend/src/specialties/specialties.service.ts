import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';

@Injectable()
export class SpecialtiesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSpecialtyDto) {
    // Validamos que no exista otra con el mismo nombre
    const existing = await this.prisma.specialty.findUnique({
      where: { name: dto.name }
    });
    
    if (existing) {
      throw new ConflictException('La especialidad ya existe');
    }

    return await this.prisma.specialty.create({
      data: dto,
    });
  }

  async findAll() {
    return await this.prisma.specialty.findMany({
      orderBy: { name: 'asc' },
      // Traemos cuántos doctores tienen esta especialidad (útil para la UI)
      include: {
        _count: {
          select: { doctors: true }
        }
      }
    });
  }

  async findOne(id: string) {
    const specialty = await this.prisma.specialty.findUnique({ where: { id } });
    if (!specialty) throw new NotFoundException('Especialidad no encontrada');
    return specialty;
  }

  async update(id: string, dto: Partial<CreateSpecialtyDto>) {
    await this.findOne(id); // Validamos que exista
    return await this.prisma.specialty.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); 
    
    const specialtyWithDoctors = await this.prisma.specialty.findUnique({
      where: { id },
      include: { _count: { select: { doctors: true } } }
    });

    if ((specialtyWithDoctors?._count?.doctors ?? 0) > 0) {
      throw new ConflictException('No se puede borrar porque hay médicos asignados a esta especialidad.');
    }

    return await this.prisma.specialty.delete({
      where: { id },
    });
  }
}