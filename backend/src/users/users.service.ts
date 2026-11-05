import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { TokenRevocationService } from '../auth/token-revocation.service';

export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  specialties: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    @Optional() private tokenRevocationService?: TokenRevocationService,
  ) {}

  async findAll(role?: string, requesterRole?: Role) {
    // Si quien consulta no es ADMIN (ej. RECEPCION o MEDICO), solo puede listar médicos activos
    const effectiveRole: Role | undefined =
      requesterRole && requesterRole !== 'ADMIN'
        ? 'MEDICO'
        : (role as Role | undefined);

    return await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(effectiveRole && { role: effectiveRole }),
      },
      select: PUBLIC_USER_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async create(data: CreateUserDto) {
    const normalizedEmail = data.email.trim().toLowerCase();

    if (!data.password || data.password.trim().length < 8) {
      throw new BadRequestException(
        'La contraseña inicial es obligatoria y debe tener al menos 8 caracteres.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este email.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return await this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: data.role,
        ...(data.role === 'MEDICO' && data.specialtyId
          ? {
              specialties: {
                connect: [{ id: data.specialtyId }],
              },
            }
          : {}),
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  async update(id: string, data: UpdateUserDto) {
    const updatePayload: {
      name?: string;
      email?: string;
      role?: Role;
      password?: string;
    } = {};

    if (data.name !== undefined) {
      updatePayload.name = data.name.trim();
    }

    if (data.email !== undefined) {
      updatePayload.email = data.email.trim().toLowerCase();
    }

    if (data.role !== undefined) {
      updatePayload.role = data.role;
    }

    if (data.password !== undefined) {
      if (data.password.trim().length < 8) {
        throw new BadRequestException(
          'La contraseña debe tener al menos 8 caracteres.',
        );
      }
      updatePayload.password = await bcrypt.hash(data.password, 10);
      this.tokenRevocationService?.revokeAllForUser(id);
    }

    return await this.prisma.user.update({
      where: { id },
      data: updatePayload,
      select: PUBLIC_USER_SELECT,
    });
  }

  async remove(id: string) {
    this.tokenRevocationService?.revokeAllForUser(id);
    return await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: PUBLIC_USER_SELECT,
    });
  }
}
