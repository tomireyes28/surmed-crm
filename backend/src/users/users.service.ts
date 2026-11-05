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

const VALID_ROLES = new Set<string>(['ADMIN', 'MEDICO', 'RECEPCION']);

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    @Optional() private tokenRevocationService?: TokenRevocationService,
  ) {}

  async findAll(role?: string, requesterRole?: Role) {
    if (role !== undefined && role !== '' && !VALID_ROLES.has(role)) {
      throw new BadRequestException('El rol de filtro indicado no es válido.');
    }

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

    if (!VALID_ROLES.has(data.role)) {
      throw new BadRequestException('El rol indicado no es válido.');
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
    if (data.role !== undefined && !VALID_ROLES.has(data.role)) {
      throw new BadRequestException('El rol indicado no es válido.');
    }

    // Evitar dejar al centro sin ningún administrador activo (F16)
    if (
      data.role !== undefined &&
      data.role !== 'ADMIN' &&
      typeof this.prisma.user.count === 'function'
    ) {
      const targetUser = await this.prisma.user.findUnique({ where: { id } });
      if (targetUser?.role === 'ADMIN' && targetUser.isActive !== false) {
        const activeAdmins = await this.prisma.user.count({
          where: { role: 'ADMIN', isActive: true },
        });
        if (activeAdmins <= 1) {
          throw new ConflictException(
            'No se puede quitar el rol ADMIN al único administrador activo del centro.',
          );
        }
      }
    }

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
    // Evitar desactivar al último administrador activo del centro (F16)
    if (typeof this.prisma.user.count === 'function') {
      const targetUser = await this.prisma.user.findUnique({ where: { id } });
      if (targetUser?.role === 'ADMIN' && targetUser.isActive !== false) {
        const activeAdmins = await this.prisma.user.count({
          where: { role: 'ADMIN', isActive: true },
        });
        if (activeAdmins <= 1) {
          throw new ConflictException(
            'No se puede desactivar al único administrador activo del centro.',
          );
        }
      }
    }

    this.tokenRevocationService?.revokeAllForUser(id);
    return await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: PUBLIC_USER_SELECT,
    });
  }
}
