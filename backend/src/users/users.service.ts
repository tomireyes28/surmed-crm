import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto'; // Importamos el DTO

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role: role as Role } : undefined,
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

  async create(data: CreateUserDto) { // Reemplazamos 'any' por el DTO
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este email.');
    }

    return this.prisma.user.create({
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
}