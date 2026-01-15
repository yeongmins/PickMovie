// backend/src/kobis/kobis.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { KobisService } from './kobis.service';

@Controller('kobis')
export class KobisController {
  constructor(private readonly kobis: KobisService) {}

  @Get('boxoffice/daily')
  async daily(@Query('targetDt') targetDt?: string) {
    const t = String(targetDt ?? '').trim();
    const data = await this.kobis.getDailyBoxOffice(t);
    return data;
  }
}
