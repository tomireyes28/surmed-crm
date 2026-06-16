import { IsString, IsOptional, IsInt, IsNumber, Min, IsEnum } from 'class-validator';

// Espejamos el enum de Prisma
export enum ProductCategory {
  INSUMO_MEDICO = 'INSUMO_MEDICO',
  OFICINA = 'OFICINA',
  ACTIVO_FIJO = 'ACTIVO_FIJO'
}

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  minStock!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  // Nuevo campo
  @IsEnum(ProductCategory)
  @IsOptional()
  category?: ProductCategory;
}