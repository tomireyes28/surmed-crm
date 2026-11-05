import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateInvoiceItemDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'La descripción del ítem es obligatoria' })
  @MinLength(1, { message: 'La descripción del ítem no puede estar vacía' })
  @MaxLength(255, {
    message: 'La descripción del ítem no puede superar los 255 caracteres',
  })
  description!: string;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  @Max(10000, { message: 'La cantidad excede el máximo permitido por ítem' })
  quantity!: number;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio unitario debe ser un número válido con hasta 2 decimales' },
  )
  @Min(0.01, { message: 'El precio unitario debe ser mayor a 0' })
  @Max(999999999.99, { message: 'El precio unitario excede el límite permitido' })
  unitPrice!: number;
}

export class CreateInvoiceDto {
  @IsUUID('4', { message: 'El ID del paciente debe ser un UUID válido' })
  patientId!: string;

  @IsArray({ message: 'Los ítems deben enviarse como una lista' })
  @ArrayMinSize(1, { message: 'La factura debe incluir al menos un ítem' })
  @ArrayMaxSize(100, { message: 'La factura no puede superar los 100 ítems' })
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items!: CreateInvoiceItemDto[];

  @IsOptional()
  @IsBoolean({ message: 'El indicador payNow debe ser booleano' })
  payNow?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}

export class CancelInvoiceDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El motivo de anulación debe ser un texto válido' })
  @MaxLength(500, {
    message: 'El motivo de anulación no puede superar los 500 caracteres',
  })
  reason?: string;
}
