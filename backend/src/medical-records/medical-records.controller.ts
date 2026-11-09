import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
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
import { ClinicalAccessService } from './clinical-access.service';
import {
  ClinicalAccessDto,
  RevokeAttachmentDto,
} from './dto/clinical-access.dto';
import { PrismaService } from '../prisma/prisma.service';
import { parsePositiveIntQuery } from '../common/utils/query.util';

@ApiTags('Historias Clínicas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(
    private readonly medicalRecordsService: MedicalRecordsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('access/grant')
  @Roles('ADMIN')
  grant(@Body() dto: ClinicalAccessDto, @Request() req: RequestWithUser) {
    return new ClinicalAccessService(this.prisma).manage(
      dto.patientId,
      dto.doctorId,
      req.user!.id,
      dto.reason,
    );
  }

  @Post('access/revoke')
  @Roles('ADMIN')
  revoke(@Body() dto: ClinicalAccessDto, @Request() req: RequestWithUser) {
    return new ClinicalAccessService(this.prisma).manage(
      dto.patientId,
      dto.doctorId,
      req.user!.id,
      dto.reason,
      true,
    );
  }

  @Get('attachments/:id/content')
  @Roles('MEDICO')
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: RequestWithUser,
  ) {
    const result = await this.medicalRecordsService.attachmentContent(
      id,
      req.user!.id,
      req.user!.role,
    );
    return new StreamableFile(result.buffer, {
      type: result.mimeType,
      disposition: 'attachment; filename="estudio-clinico"',
    });
  }

  @Post('attachments/:id/revoke')
  @Roles('MEDICO')
  revokeFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevokeAttachmentDto,
    @Request() req: RequestWithUser,
  ) {
    return this.medicalRecordsService.revokeAttachment(
      id,
      req.user!.id,
      req.user!.role,
      dto.reason,
    );
  }

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

  @Get('patient/:patientId/page')
  @Roles('MEDICO')
  findPageByPatient(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Request() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.medicalRecordsService.findPageByPatient(
      patientId,
      req.user!.id,
      req.user!.role,
      parsePositiveIntQuery(page, 'page', 1, { max: 10000 }),
      parsePositiveIntQuery(limit, 'limit', 25),
    );
  }

  @Get('patient/:patientId')
  @Roles('MEDICO')
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
