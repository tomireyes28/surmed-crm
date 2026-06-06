import { IsString, IsInt, IsNumber, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

// 1. Definimos cómo debe ser cada ítem individual
export class CreateInvoiceItemDto {
  @IsString()
  description!: string;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  quantity!: number;

  @IsNumber()
  @Min(0, { message: 'El precio no puede ser negativo' })
  unitPrice!: number;
}

// 2. Definimos la factura completa
export class CreateInvoiceDto {
  @IsString()
  patientId!: string;

  @IsArray()
  @ValidateNested({ each: true }) // Le dice a class-validator que valide cada objeto de este array
  @Type(() => CreateInvoiceItemDto) // Convierte los objetos crudos a nuestra clase
  items!: CreateInvoiceItemDto[];
}