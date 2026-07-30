import { Controller, Get, Post, Body, Query, Param, Patch, Delete, UseGuards } from '@nestjs/common'; // <-- SUMAR UseGuards
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto'; 
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // <-- IMPORTAR
import { RolesGuard } from '../auth/guards/roles.guard'; // <-- IMPORTAR
import { Roles } from '../auth/decorators/roles.decorator'; // <-- IMPORTAR

@UseGuards(JwtAuthGuard, RolesGuard) // <-- 1. PROTEGER TODA LA CLASE
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Query('role') role?: string) {
    return await this.usersService.findAll(role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOne(id);
  }

  @Post()
  @Roles('ADMIN') // <-- 2. BLOQUEO ESTRICTO
  async create(@Body() createData: CreateUserDto) { 
    return await this.usersService.create(createData);
  }

  @Patch(':id')
  @Roles('ADMIN') // <-- 3. BLOQUEO ESTRICTO
  async update(@Param('id') id: string, @Body() updateData: Partial<CreateUserDto>) {
    return await this.usersService.update(id, updateData);
  }

  @Delete(':id')
  @Roles('ADMIN') // <-- 4. BLOQUEO ESTRICTO
  async remove(@Param('id') id: string) {
    return await this.usersService.remove(id);
  }
}