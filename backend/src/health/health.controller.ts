// backend/src/health/health.controller.ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type HealthOk = {
  ok: true;
  timestamp: string;
  uptimeSec: number;
};

type ReadyOk = HealthOk & {
  db: 'ok';
};

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/healthz')
  healthz(): HealthOk {
    return {
      ok: true,
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
    };
  }

  @Get('/readyz')
  async readyz(): Promise<ReadyOk> {
    // DB 연결 체크(운영 readiness 핵심)
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('DB is not ready');
    }

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      db: 'ok',
    };
  }
}
