import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/interfaces/auth.interface';
import { parseBooleanQuery } from '../common/utils/query.util';

@ApiTags('Usuarios / Staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN', 'MEDICO', 'RECEPCION')
  async findAll(
    @Query('role') role?: string,
    @Query('includeInactive') includeInactive?: string,
    @Request() req?: RequestWithUser,
  ) {
    const parsedIncludeInactive = parseBooleanQuery(
      includeInactive,
      'includeInactive',
    );
    return await this.usersService.findAll(
      role,
      req?.user?.role,
      parsedIncludeInactive,
    );
  }

  @Get(':id')
  @Roles('ADMIN')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() createData: CreateUserDto) {
    return await this.usersService.create(createData);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() updateData: UpdateUserDto) {
    return await this.usersService.update(id, updateData);
  }

  @Patch(':id/reactivate')
  @Roles('ADMIN')
  async reactivate(@Param('id') id: string) {
    return await this.usersService.reactivate(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(@Param('id') id: string) {
    return await this.usersService.remove(id);
  }
}
