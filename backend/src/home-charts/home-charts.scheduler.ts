// backend/src/home-charts/home-charts.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HomeChartsService } from './home-charts.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HomeChartsScheduler {
  private readonly logger = new Logger(HomeChartsScheduler.name);

  // 고정 락 키(임의 값, 프로젝트에서 유일하면 됨)
  private readonly lockId = 913_001;

  constructor(
    private readonly service: HomeChartsService,
    private readonly prisma: PrismaService,
  ) {
    const enabled = String(process.env.HOME_CHARTS_CRON_ENABLED ?? 'true');
    const expr = String(process.env.HOME_CHARTS_CRON ?? '5 */6 * * *');
    const tz = String(process.env.HOME_CHARTS_TZ ?? 'Asia/Seoul');

    this.logger.log(
      `home charts cron: enabled=${enabled} expr="${expr}" tz=${tz}`,
    );
  }

  @Cron(String(process.env.HOME_CHARTS_CRON ?? '5 */6 * * *'), {
    timeZone: String(process.env.HOME_CHARTS_TZ ?? 'Asia/Seoul'),
  })
  async handleCron(): Promise<void> {
    const enabled = String(process.env.HOME_CHARTS_CRON_ENABLED ?? 'true')
      .trim()
      .toLowerCase();

    if (enabled === 'false' || enabled === '0') return;

    const gotLock = await this.tryLock();
    if (!gotLock) {
      this.logger.warn('skip: another instance is running refresh');
      return;
    }

    try {
      this.logger.log('cron refresh start');
      await this.service.refreshAllCharts();
      this.logger.log('cron refresh done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`cron refresh failed: ${msg}`);
    } finally {
      await this.unlock();
    }
  }

  private async tryLock(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_lock(${this.lockId}) AS locked
      `;
      return rows[0]?.locked === true;
    } catch {
      // 락 실패하면 그냥 실행하지 않게(안전)
      return false;
    }
  }

  private async unlock(): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT pg_advisory_unlock(${this.lockId})
      `;
    } catch {
      // unlock 실패는 로그만(치명적이지 않음)
    }
  }
}
