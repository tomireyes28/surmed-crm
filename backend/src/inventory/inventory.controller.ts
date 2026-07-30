import { Controller, Get, Post, Body, UseGuards, Request, Param, Patch, Delete } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateProductDto } from './dto/create-inventory.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard'; 
import { Roles } from '../auth/decorators/roles.decorator'; 
import type { RequestWithUser } from '../auth/interfaces/auth.interface';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Inventario')
@UseGuards(JwtAuthGuard, RolesGuard) 
@Roles('ADMIN', 'RECEPCION') 
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('products')
  async createProduct(@Body() createProductDto: CreateProductDto) {
    return await this.inventoryService.createProduct(createProductDto);
  }

  @Get('products')
  async findAllProducts() {
    return await this.inventoryService.findAllProducts();
  }

  // --- NUEVOS ENDPOINTS PARA EL CRUD DEL INVENTARIO ---

  @Get('products/:id')
  async findOne(@Param('id') id: string) {
    return await this.inventoryService.findOne(id);
  }

  @Patch('products/:id')
  async updateProduct(
    @Param('id') id: string, 
    @Body() updateData: Partial<CreateProductDto>
  ) {
    return await this.inventoryService.updateProduct(id, updateData);
  }

  @Delete('products/:id')
  async deactivateProduct(@Param('id') id: string) {
    return await this.inventoryService.deactivateProduct(id);
  }

  // ----------------------------------------------------

  @Post('movements')
  async registerMovement(
    @Body() stockMovementDto: StockMovementDto,
    @Request() req: RequestWithUser
  ) {
    // Le pasamos el ID del usuario que hizo la petición desde el JWT
    return await this.inventoryService.registerMovement(stockMovementDto, req.user!.id);
  }
}