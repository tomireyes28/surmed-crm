import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateProductDto } from './dto/create-inventory.dto';
import { UpdateProductDto } from './dto/update-inventory.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/interfaces/auth.interface';
import {
  parseBooleanQuery,
  parsePositiveIntQuery,
} from '../common/utils/query.util';

@ApiTags('Inventario')
@ApiBearerAuth()
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
  async findAllProducts(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const parsedIncludeInactive = parseBooleanQuery(
      includeInactive,
      'includeInactive',
    );
    return await this.inventoryService.findAllProducts(
      search,
      category,
      parsedIncludeInactive,
    );
  }

  @Get('products/page')
  findProductPage(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.inventoryService.findProductPage(
      parsePositiveIntQuery(page, 'page', 1, { max: 10000 }),
      parsePositiveIntQuery(limit, 'limit', 25),
      search,
      category,
      parseBooleanQuery(includeInactive, 'includeInactive'),
    );
  }

  @Get('products/:id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.inventoryService.findOne(id);
  }

  @Patch('products/:id')
  async updateProduct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateData: UpdateProductDto,
  ) {
    return await this.inventoryService.updateProduct(id, updateData);
  }

  @Patch('products/:id/reactivate')
  async reactivateProduct(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.inventoryService.reactivateProduct(id);
  }

  @Delete('products/:id')
  async deactivateProduct(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.inventoryService.deactivateProduct(id);
  }

  @Post('movements')
  async registerMovement(
    @Body() stockMovementDto: StockMovementDto,
    @Request() req: RequestWithUser,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return await this.inventoryService.registerMovement(
      stockMovementDto,
      req.user!.id,
      idempotencyHeader,
    );
  }
}
