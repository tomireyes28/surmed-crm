import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString({ message: 'El nombre debe ser un texto válido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  name!: string;

  @IsEmail({}, { message: 'Debe ser un email válido' })
  email!: string;

  @IsString({ message: 'La contraseña inicial es obligatoria' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres' })
  password!: string;

  @IsEnum(Role, { message: 'El rol no es válido' })
  role!: Role;

  @IsOptional()
  @IsString()
  specialtyId?: string;
}
