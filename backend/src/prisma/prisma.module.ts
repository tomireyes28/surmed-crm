import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Lo hacemos global para no tener que importarlo en cada módulo
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}