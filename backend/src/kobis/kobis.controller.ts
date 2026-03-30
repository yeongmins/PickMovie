// backend/src/kobis/kobis.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { KobisService } from './kobis.service';

@Controller()
export class KobisController {
  constructor(private readonly kobis: KobisService) {}

  /**
   * KOBIS 원본 일별 박스오피스 (디버그/직접 확인용)
   */
  @Get('/kobis/boxoffice/daily')
  async daily(@Query('targetDt') targetDt?: string) {
    const t = String(targetDt ?? '').trim();
    return await this.kobis.getDailyBoxOffice(t);
  }

  /**
   * 메인: 박스오피스 TOP 10
   * 프론트가 실제로 호출하는 경로
   */
  @Get('/boxoffice/top10')
  async boxOfficeTop10() {
    return await this.kobis.getBoxOfficeTop10ForFrontend();
  }

  /**
   * 프론트 fallback 경로 1
   */
  @Get('/charts/boxoffice/top10')
  async chartsBoxOfficeTop10() {
    return await this.kobis.getBoxOfficeTop10ForFrontend();
  }

  /**
   * 프론트 fallback 경로 2 (KR)
   */
  @Get('/charts/boxoffice/kr/top10')
  async chartsBoxOfficeKrTop10() {
    return await this.kobis.getBoxOfficeTop10ForFrontend();
  }
}
