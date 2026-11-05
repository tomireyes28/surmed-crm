import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMedicalRecordDto {
  @IsUUID('4', { message: 'El ID del paciente debe ser un UUID válido' })
  @IsNotEmpty()
  patientId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'La evolución clínica debe ser un texto válido' })
  @MinLength(3, {
    message: 'La evolución clínica debe tener al menos 3 caracteres',
  })
  @MaxLength(20000, {
    message: 'La evolución clínica no puede superar los 20.000 caracteres',
  })
  notes!: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID del registro padre debe ser un UUID válido' })
  parentRecordId?: string;
}

export class CreateMedicalAddendumDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El texto de la adenda debe ser válido' })
  @MinLength(3, {
    message: 'La adenda debe contener al menos 3 caracteres',
  })
  @MaxLength(10000, {
    message: 'La adenda no puede superar los 10.000 caracteres',
  })
  notes!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(300)
  reason?: string;
}
