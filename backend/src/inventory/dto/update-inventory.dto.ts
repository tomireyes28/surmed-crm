import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-inventory.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {}