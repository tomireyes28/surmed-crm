import { Role } from '@prisma/client';
import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsString({ message: 'El nombre debe ser un texto válido' })
  name!: string;

  @IsEmail({}, { message: 'Debe ser un email válido' })
  email!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsEnum(Role, { message: 'El rol no es válido' })
  role!: Role;

  @IsOptional()
  @IsString()
  specialtyId?: string;
}