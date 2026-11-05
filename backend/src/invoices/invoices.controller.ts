import {
  Body,
  Controller,
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
import { InvoicesService } from './invoices.service';
import { CancelInvoiceDto, CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/interfaces/auth.interface';
import { parsePositiveIntQuery } from '../common/utils/query.util';

@ApiTags('Facturas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RECEPCION')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  async create(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @Request() req?: RequestWithUser,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return await this.invoicesService.create(
      createInvoiceDto,
      req?.user?.id,
      idempotencyHeader,
    );
  }

  @Get()
  async findAll(
    @Query('patientId') patientId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const pageNumber = parsePositiveIntQuery(page, 'page', 1, {
      min: 1,
      max: 10000,
    });
    const limitNumber = parsePositiveIntQuery(limit, 'limit', 10, {
      min: 1,
      max: 50,
    });
    if (month !== undefined && month !== '') {
      parsePositiveIntQuery(month, 'month', 1, { min: 1, max: 12 });
    }
    if (year !== undefined && year !== '') {
      parsePositiveIntQuery(year, 'year', 2026, { min: 2000, max: 2100 });
    }

    return await this.invoicesService.findAll(
      patientId,
      pageNumber,
      limitNumber,
      month,
      year,
      search,
      status,
    );
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.invoicesService.findOne(id);
  }

  @Patch(':id/pay')
  async pay(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req?: RequestWithUser,
  ) {
    return await this.invoicesService.payInvoice(id, req?.user?.id);
  }

  @Patch(':id/cancel')
  async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body?: CancelInvoiceDto,
    @Request() req?: RequestWithUser,
  ) {
    return await this.invoicesService.cancelInvoice(
      id,
      req?.user?.id,
      body?.reason,
    );
  }
}
