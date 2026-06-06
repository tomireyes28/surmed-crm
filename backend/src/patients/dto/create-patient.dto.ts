import { IsString, IsEmail, IsOptional, IsDateString, MinLength } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @MinLength(5, { message: 'El documento debe tener al menos 5 caracteres' })
  documentId!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEmail({}, { message: 'El formato del email no es válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsDateString({}, { message: 'La fecha de nacimiento debe ser una fecha válida (YYYY-MM-DD)' })
  birthDate!: string;

  @IsString()
  @IsOptional()
  address?: string;
}