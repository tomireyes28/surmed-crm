import {
  BadRequestException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';
import { assertNewPassword, assertPasswordByteLimit } from './password-policy';
import { serializable } from '../common/utils/transaction.util';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { TokenRevocationService } from './token-revocation.service';
import { AuditService } from '../audit/audit.service';
import { IssueRecoveryDto, RedeemRecoveryDto } from './dto/recovery.dto';
import { LoginRateLimitService } from './login-rate-limit.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private tokenRevocationService: TokenRevocationService,
    @Optional() private loginRateLimitService?: LoginRateLimitService,
  ) {}

  async login(loginDto: LoginDto, clientIp?: string) {
    const email = loginDto.email.trim().toLowerCase();
    const { password } = loginDto;
    assertPasswordByteLimit(password);

    await this.loginRateLimitService?.assertAllowed(email, clientIp);

    return serializable(this.prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { email },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException(
          'Credenciales incorrectas o usuario inactivo',
        );
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Credenciales incorrectas');
      }

      await this.loginRateLimitService?.reset(email);

      const jti = randomUUID();
      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        jti,
      };

      const backendToken = await this.jwtService.signAsync(payload);
      const { exp } = this.jwtService.decode<{ exp?: number }>(backendToken);
      if (typeof exp !== 'number' || !Number.isFinite(exp)) {
        throw new Error('El JWT debe tener una fecha de expiración.');
      }
      await this.tokenRevocationService.registerIssuedToken(
        user.id,
        jti,
        new Date(exp * 1000),
        tx,
      );

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        backendToken,
      };
    });
  }

  async issueRecovery(dto: IssueRecoveryDto, actorId: string) {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await serializable(this.prisma, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: dto.userId } });
      if (!user || !user.isActive)
        throw new BadRequestException(
          'Usuario no disponible para recuperación.',
        );
      await tx.recoveryToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.recoveryToken.create({
        data: { tokenHash, userId: user.id, expiresAt },
      });
      await new AuditService(this.prisma).record(
        {
          actorId,
          action: 'RECOVERY_ISSUE',
          resource: 'User',
          resourceId: user.id,
          reason: dto.reason,
        },
        tx,
      );
    });
    return { token: raw, expiresAt };
  }

  async redeemRecovery(dto: RedeemRecoveryDto, clientIp?: string) {
    assertNewPassword(dto.newPassword);
    await this.loginRateLimitService?.assertAllowed(
      `recovery:${clientIp ?? 'unknown'}`,
      clientIp,
    );
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const password = await bcrypt.hash(dto.newPassword, 10);
    await serializable(this.prisma, async (tx) => {
      const token = await tx.recoveryToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (
        !token ||
        token.usedAt ||
        token.expiresAt <= new Date() ||
        !token.user.isActive
      )
        throw new BadRequestException(
          'El enlace es inválido o venció. Solicite uno nuevo al administrador.',
        );
      await tx.recoveryToken.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      });
      await tx.user.update({ where: { id: token.userId }, data: { password } });
      await tx.recoveryToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.tokenRevocationService.revokeAllForUser(token.userId, tx);
      await new AuditService(this.prisma).record(
        {
          actorId: token.userId,
          action: 'RECOVERY_REDEEM',
          resource: 'User',
          resourceId: token.userId,
        },
        tx,
      );
    });
    return {
      message: 'Contraseña actualizada. Inicie sesión con su nueva clave.',
    };
  }

  async logout(userId: string, jti?: string) {
    if (jti) {
      await this.tokenRevocationService.revokeToken(jti);
    } else {
      await this.tokenRevocationService.revokeAllForUser(userId);
    }
    return { message: 'Sesión cerrada correctamente' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        specialties: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no válido o inactivo');
    }

    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    assertPasswordByteLimit(dto.currentPassword);
    assertNewPassword(dto.newPassword);
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente de la actual.',
      );
    }

    return serializable(this.prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Usuario no válido o inactivo');
      }

      const isCurrentValid = await bcrypt.compare(
        dto.currentPassword,
        user.password,
      );
      if (!isCurrentValid) {
        throw new UnauthorizedException('La contraseña actual es incorrecta');
      }

      const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

      await tx.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
        select: { id: true },
      });

      await tx.recoveryToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.tokenRevocationService.revokeAllForUser(userId, tx);

      return { message: 'Contraseña actualizada correctamente' };
    });
  }
}
