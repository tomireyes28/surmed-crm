import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProductCategory } from './create-inventory.dto';

/**
 * DTO concreto para actualización parcial de productos (S05 / T07).
 * Solo expone campos administrativos editables: nunca permite modificar `quantity`
 * (el stock solo cambia mediante movimientos) ni relaciones internas.
 */
export class UpdateProductDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre del producto debe ser un texto válido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(120, { message: 'El nombre no puede superar los 120 caracteres' })
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  @IsString({ message: 'La descripción debe ser un texto válido' })
  @MaxLength(500, {
    message: 'La descripción no puede superar los 500 caracteres',
  })
  description?: string | null;

  @IsOptional()
  @IsInt({ message: 'El stock mínimo debe ser un número entero' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  @Max(100000, { message: 'El stock mínimo excede el límite permitido' })
  minStock?: number;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número válido con hasta 2 decimales' },
  )
  @Min(0, { message: 'El precio no puede ser negativo' })
  @Max(999999999.99, { message: 'El precio excede el límite permitido' })
  price?: number | null;

  @IsOptional()
  @IsEnum(ProductCategory, { message: 'La categoría de producto no es válida' })
  category?: ProductCategory;
}
