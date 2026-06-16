import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SpecialtiesService } from './specialties.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags } from '@nestjs/swagger';
import { Specialty } from '@prisma/client'; // <-- Importamos el tipo de Prisma

@ApiTags('Especialidades')
@UseGuards(JwtAuthGuard)
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Post()
  async create(@Body() createSpecialtyDto: CreateSpecialtyDto): Promise<Specialty> {
    return this.specialtiesService.create(createSpecialtyDto);
  }

  @Get()
  async findAll(): Promise<Specialty[]> {
    return this.specialtiesService.findAll();
  }
}