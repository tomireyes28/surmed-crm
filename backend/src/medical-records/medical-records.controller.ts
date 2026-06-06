import { Controller, Post, Body, UseInterceptors, UploadedFile, UseGuards, Request, Get, Param } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MedicalRecordsService } from './medical-records.service';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../auth/interfaces/auth.interface';
import 'multer';

@UseGuards(JwtAuthGuard)
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file')) // Atrapa el archivo si viene en el campo 'file'
  create(
    @Body() createMedicalRecordDto: CreateMedicalRecordDto,
    @Request() req: RequestWithUser,
    @UploadedFile() file?: Express.Multer.File, // El archivo es opcional
  ) {
    // req.user existe gracias al JWT
    return this.medicalRecordsService.create(createMedicalRecordDto, req.user!.id, file);
  }

  // Endpoint para traer toda la historia clínica de un paciente específico
  @Get('patient/:patientId')
  findByPatient(@Param('patientId') patientId: string) {
    return this.medicalRecordsService.findByPatient(patientId);
  }
}