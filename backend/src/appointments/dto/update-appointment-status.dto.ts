import { Transform } from 'class-transformer';
import { AppointmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus, {
    message:
      'El estado del turno debe ser PENDING, CONFIRMED, IN_WAITING_ROOM, ATTENDED o CANCELLED',
  })
  status!: AppointmentStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El motivo de cancelación debe ser un texto válido' })
  @MaxLength(500, {
    message: 'El motivo de cancelación no puede superar los 500 caracteres',
  })
  cancelReason?: string;
}
