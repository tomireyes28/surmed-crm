import { Controller, Get, Post, Body, UseGuards, Patch, Param, Delete } from '@nestjs/common';
import { SpecialtiesService } from './specialties.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Especialidades')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  // SOLO ADMIN puede crear
  @Post()
  @Roles('ADMIN')
  async create(@Body() createSpecialtyDto: CreateSpecialtyDto) {
    return await this.specialtiesService.create(createSpecialtyDto);
  }

  // TODOS pueden ver la lista (para agendar turnos)
  @Get()
  async findAll() {
    return await this.specialtiesService.findAll();
  } 

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.specialtiesService.findOne(id);
  }

  // SOLO ADMIN puede editar
  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() updateData: Partial<CreateSpecialtyDto>) {
    return await this.specialtiesService.update(id, updateData);
  }

  // SOLO ADMIN puede borrar
  @Delete(':id')
  @Roles('ADMIN')
  async remove(@Param('id') id: string) {
    return await this.specialtiesService.remove(id);
  }
}