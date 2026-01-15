// backend/src/home-charts/home-charts.controller.ts
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { HomeChartsService } from './home-charts.service';
import type { HomeChartsResponse } from './home-charts.types';
import { AdminTokenGuard } from '../common/guards/admin-token.guard';

@Controller('/home/charts')
export class HomeChartsController {
  constructor(private readonly service: HomeChartsService) {}

  @Get()
  getCharts(): Promise<HomeChartsResponse> {
    return this.service.getCharts();
  }

  // ✅ 운영에서 공개되면 위험(무한 호출로 TMDB rate-limit)
  // → 관리자 토큰 필수
  @UseGuards(AdminTokenGuard)
  @Post('/refresh')
  async refresh(): Promise<{ ok: true }> {
    await this.service.refreshAllCharts();
    return { ok: true };
  }
}
