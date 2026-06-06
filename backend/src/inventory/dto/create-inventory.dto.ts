import { IsString, IsInt, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  minStock!: number;

  @IsNumber()
  @IsOptional()
  price?: number;
}