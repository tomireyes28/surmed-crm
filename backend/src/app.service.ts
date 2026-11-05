import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
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
}
