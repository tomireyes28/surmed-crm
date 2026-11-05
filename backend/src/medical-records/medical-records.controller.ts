import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MedicalRecordsService } from './medical-records.service';
import {
  CreateMedicalAddendumDto,
  CreateMedicalRecordDto,
} from './dto/create-medical-record.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/interfaces/auth.interface';
import { MAX_CLINICAL_FILE_SIZE_BYTES } from '../storage/storage.service';
import 'multer';

@ApiTags('Historias Clínicas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) {}

  @Post()
  @Roles('MEDICO')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_CLINICAL_FILE_SIZE_BYTES,
        files: 1,
        fields: 10,
      },
    }),
  )
  create(
    @Body() createMedicalRecordDto: CreateMedicalRecordDto,
    @Request() req: RequestWithUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.medicalRecordsService.create(
      createMedicalRecordDto,
      req.user!.id,
      file,
      req.user?.role,
    );
  }

  @Post(':id/addendum')
  @Roles('MEDICO')
  createAddendum(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateMedicalAddendumDto,
    @Request() req: RequestWithUser,
  ) {
    return this.medicalRecordsService.createAddendum(
      id,
      dto,
      req.user!.id,
      req.user?.role,
    );
  }

  @Get('patient/:patientId')
  @Roles('MEDICO', 'ADMIN')
  findByPatient(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Request() req?: RequestWithUser,
  ) {
    return this.medicalRecordsService.findByPatient(
      patientId,
      req?.user?.id,
      req?.user?.role,
    );
  }
}
