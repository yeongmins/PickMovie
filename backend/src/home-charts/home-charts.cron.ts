// backend/src/home-charts/home-charts.cron.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HomeChartsService } from './home-charts.service';

@Injectable()
export class HomeChartsCron {
  constructor(private readonly svc: HomeChartsService) {}

  // 6시간마다 갱신 (KST)
  @Cron('0 */6 * * *', { timeZone: 'Asia/Seoul' })
  async refresh() {
    await this.svc.refreshAllCharts();
  }
}
