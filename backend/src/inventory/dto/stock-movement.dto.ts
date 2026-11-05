import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MovementType } from '@prisma/client';

export class StockMovementDto {
  @IsUUID('4', { message: 'El ID del producto debe ser un UUID válido' })
  productId!: string;

  @IsEnum(MovementType, { message: 'El tipo debe ser IN o OUT' })
  type!: MovementType;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor a 0' })
  @Max(100000, { message: 'La cantidad excede el límite permitido por movimiento' })
  quantity!: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Las notas deben ser un texto válido' })
  @MaxLength(500, { message: 'Las notas no pueden superar los 500 caracteres' })
  notes?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}
