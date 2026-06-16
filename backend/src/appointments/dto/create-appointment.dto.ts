import { IsString, IsOptional, IsDateString, IsInt, Min } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  patientId!: string;

  @IsString()
  doctorId!: string;

  @IsString()
  specialtyId!: string;

  // Validamos que sea una fecha y hora válida (ISO 8601)
  @IsDateString()
  date!: string;

  @IsInt()
  @Min(15)
  @IsOptional()
  duration?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}