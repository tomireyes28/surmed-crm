import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateProductDto } from './dto/create-inventory.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../auth/interfaces/auth.interface';
import { ApiTags } from '@nestjs/swagger';


@ApiTags('Inventario')
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('products')
  createProduct(@Body() createProductDto: CreateProductDto) {
    return this.inventoryService.createProduct(createProductDto);
  }

  @Get('products')
  findAllProducts() {
    return this.inventoryService.findAllProducts();
  }

  @Post('movements')
  registerMovement(
    @Body() stockMovementDto: StockMovementDto,
    @Request() req: RequestWithUser
  ) {
    // Le pasamos el ID del usuario que hizo la petición desde el JWT
    return this.inventoryService.registerMovement(stockMovementDto, req.user!.id);
  }
}