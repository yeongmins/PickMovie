// backend/src/trends/trends.controller.ts
import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { TrendsService } from './trends.service';

type IngestKobisBody = {
  targetDt?: string; // "YYYYMMDD"
};

@Controller('trends')
export class TrendsController {
  constructor(private readonly trends: TrendsService) {}

  @Get('kr')
  getKrTrends(@Query('date') date?: string, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 20);
    return this.trends.getRankedTrends({
      date,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
    });
  }

  @Post('ingest/kobis')
  ingestKobis(
    @Headers('x-ingest-token') token?: string,
    @Body() body?: IngestKobisBody,
  ) {
    this.trends.assertIngestToken(token);
    // ✅ 기존 엔드포인트 유지, 내부는 “KOBIS + NAVER + YOUTUBE”까지 포함한 daily ingest로 수행
    return this.trends.ingestKobisDaily(body?.targetDt);
  }
}
