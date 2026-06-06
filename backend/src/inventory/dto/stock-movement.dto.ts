import { IsString, IsInt, IsEnum, IsOptional, Min } from 'class-validator';
import { MovementType } from '@prisma/client';

export class StockMovementDto {
  @IsString()
  productId!: string;

  @IsEnum(MovementType, { message: 'El tipo debe ser IN o OUT' })
  type!: MovementType;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser mayor a 0' })
  quantity!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}