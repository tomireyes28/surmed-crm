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
  ) {
    const pageNumber = page ? Number.parseInt(page, 10) : 1;
    const limitNumber = limit ? Number.parseInt(limit, 10) : 10;

    return await this.invoicesService.findAll(
      patientId,
      pageNumber,
      limitNumber,
      month,
      year,
      search,
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
