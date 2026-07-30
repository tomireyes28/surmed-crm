import { Controller, Get, Post, Body, Query, UseGuards, Param, Patch } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator'; 
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Facturas')
@UseGuards(JwtAuthGuard, RolesGuard) 
@Roles('ADMIN', 'RECEPCION') 
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  async create(@Body() createInvoiceDto: CreateInvoiceDto) {
    return await this.invoicesService.create(createInvoiceDto);
  }

  @Get()
  async findAll(
    @Query('patientId') patientId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    
    return await this.invoicesService.findAll(patientId, pageNumber, limitNumber, month, year);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.invoicesService.findOne(id);
  }

  // --- NUEVO: Ruta para anular factura ---
  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    return await this.invoicesService.cancelInvoice(id);
  }
}