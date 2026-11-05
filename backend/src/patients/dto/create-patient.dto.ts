import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreatePatientDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El documento debe ser un texto válido' })
  @MinLength(5, { message: 'El documento debe tener al menos 5 caracteres' })
  @MaxLength(30, { message: 'El documento no puede superar los 30 caracteres' })
  documentId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre debe ser un texto válido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres' })
  firstName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El apellido debe ser un texto válido' })
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(80, { message: 'El apellido no puede superar los 80 caracteres' })
  lastName!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  @ValidateIf(
    (o: CreatePatientDto) =>
      o.email !== undefined && o.email !== null && o.email !== '',
  )
  @IsEmail({}, { message: 'El formato del email no es válido' })
  @MaxLength(120, { message: 'El email no puede superar los 120 caracteres' })
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  @IsString({ message: 'El teléfono debe ser un texto válido' })
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres' })
  phone?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({
    message: 'La fecha de nacimiento debe ser una fecha válida (YYYY-MM-DD)',
  })
  @IsNotEmpty({ message: 'La fecha de nacimiento es obligatoria' })
  birthDate!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  @IsString({ message: 'La dirección debe ser un texto válido' })
  @MaxLength(255, {
    message: 'La dirección no puede superar los 255 caracteres',
  })
  address?: string;
}
