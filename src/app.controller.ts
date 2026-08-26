import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Version(VERSION_NEUTRAL)
  @Get()
  getStatus() {
    return {
      status: 'ok',
      service: 'Karayeban Backend',
      timestamp: new Date().toISOString(),
    };
  }
}
