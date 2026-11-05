import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID('4', { message: 'El ID del paciente debe ser un UUID válido' })
  patientId!: string;

  @IsUUID('4', { message: 'El ID del médico debe ser un UUID válido' })
  doctorId!: string;

  @IsUUID('4', { message: 'El ID de la especialidad debe ser un UUID válido' })
  specialtyId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'La fecha y hora del turno son obligatorias' })
  @IsNotEmpty({ message: 'La fecha y hora del turno no pueden estar vacías' })
  date!: string;

  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número entero en minutos' })
  @Min(15, { message: 'La duración mínima del turno es de 15 minutos' })
  @Max(240, { message: 'La duración máxima del turno es de 240 minutos' })
  duration?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Las notas deben ser un texto válido' })
  @MaxLength(1000, { message: 'Las notas no pueden superar los 1000 caracteres' })
  notes?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}
