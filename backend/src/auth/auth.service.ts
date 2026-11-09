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
import { randomUUID } from 'node:crypto';
import { TokenRevocationService } from './token-revocation.service';
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

    this.loginRateLimitService?.assertAllowed(email, clientIp);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      this.loginRateLimitService?.recordFailure(email, clientIp);
      throw new UnauthorizedException(
        'Credenciales incorrectas o usuario inactivo',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.loginRateLimitService?.recordFailure(email, clientIp);
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    this.loginRateLimitService?.reset(email, clientIp);

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

    const user = await this.prisma.user.findUnique({
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

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
      select: { id: true },
    });

    await this.tokenRevocationService.revokeAllForUser(userId);

    return { message: 'Contraseña actualizada correctamente' };
  }
}
