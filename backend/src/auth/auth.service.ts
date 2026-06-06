import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // 1. Buscar usuario por email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales incorrectas o usuario inactivo');
    }

    // 2. Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 3. Generar el payload del JWT (Guardamos id, email y el ROL para el RBAC)
    const payload = { sub: user.id, email: user.email, role: user.role };

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      backendToken: await this.jwtService.signAsync(payload),
    };
  }

  // BORRAR ESTO DESPUÉS DE USARLO
  async seedAdmin() {
    // Verificamos si ya existe para no duplicarlo
    const exists = await this.prisma.user.findUnique({
      where: { email: 'admin@surmed.com' },
    });

    if (exists) {
      return { message: 'El administrador ya existe' };
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);

    const admin = await this.prisma.user.create({
      data: {
        email: 'admin@surmed.com',
        password: hashedPassword,
        name: 'Administrador Surmed',
        role: 'ADMIN',
      },
    });

    return { message: 'Administrador creado con éxito', user: admin };
  }
}