import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  parseBooleanQuery,
  parsePositiveIntQuery,
} from '../common/utils/query.util';

@ApiTags('Pacientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @Roles('ADMIN', 'MEDICO', 'RECEPCION')
  create(@Body() createPatientDto: CreatePatientDto) {
    return this.patientsService.create(createPatientDto);
  }

  @Get()
  @Roles('ADMIN', 'MEDICO', 'RECEPCION')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const parsedPage = parsePositiveIntQuery(page, 'page', 1, {
      min: 1,
      max: 10000,
    });
    const parsedLimit = parsePositiveIntQuery(limit, 'limit', 10, {
      min: 1,
      max: 50,
    });
    const parsedIncludeInactive = parseBooleanQuery(
      includeInactive,
      'includeInactive',
    );

    return this.patientsService.findAll(
      parsedPage,
      parsedLimit,
      search,
      parsedIncludeInactive,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'MEDICO', 'RECEPCION')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.patientsService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MEDICO', 'RECEPCION')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updatePatientDto: UpdatePatientDto,
  ) {
    return this.patientsService.update(id, updatePatientDto);
  }

  @Patch(':id/reactivate')
  @Roles('ADMIN', 'RECEPCION')
  reactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.patientsService.reactivate(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.patientsService.remove(id);
  }
}
