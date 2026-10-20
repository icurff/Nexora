import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Process liveness only; dependency readiness belongs to each adapter.
  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'notification-service' };
  }
}
