import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    return {
      status: 'ok',
      service: 'surmed-crm-backend',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    try {
      if (this.prisma && typeof this.prisma.$queryRaw === 'function') {
        await this.prisma.$queryRaw`SELECT 1`;
      }
      return {
        status: 'ready',
        database: 'up',
        service: 'surmed-crm-backend',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        database: 'down',
        service: 'surmed-crm-backend',
        message: 'La base de datos no responde en este momento.',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
