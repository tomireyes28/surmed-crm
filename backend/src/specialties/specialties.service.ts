import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';

@Injectable()
export class SpecialtiesService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateSpecialtyDto) {
    return this.prisma.specialty.create({
      data: dto,
    });
  }

  findAll() {
    return this.prisma.specialty.findMany({
      orderBy: { name: 'asc' },
    });
  }
}