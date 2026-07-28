import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto'; 

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(role?: string) {
    return await this.prisma.user.findMany({
      where: {
        isActive: true, // <-- FIX: Solo activos
        ...(role && { role: role as Role }) // Mantenemos el filtro por rol si existe
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        specialties: true, 
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        specialties: true,
      }
    });
  }

  async create(data: CreateUserDto) { 
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este email.');
    }

    return await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: data.password || '123456', 
        role: data.role,
        ...(data.role === 'MEDICO' && data.specialtyId ? {
          specialties: {
            connect: [{ id: data.specialtyId }]
          }
        } : {})
      },
    });
  }

  async update(id: string, data: Partial<CreateUserDto>) {
    return await this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
      },
    });
  }

  async remove(id: string) {
    return await this.prisma.user.update({
      where: { id },
      data: { isActive: false }, // <-- FIX: Borrado lógico
    });
  }
}