// backend/src/home-charts/home-charts.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { MetaModule } from '../meta/meta.module';

import { HomeChartsController } from './home-charts.controller';
import { HomeChartsService } from './home-charts.service';
import { HomeChartsScheduler } from './home-charts.scheduler';
import { AdminTokenGuard } from '../common/guards/admin-token.guard';

@Module({
  imports: [ConfigModule, PrismaModule, MetaModule],
  controllers: [HomeChartsController],
  providers: [HomeChartsService, HomeChartsScheduler, AdminTokenGuard],
  exports: [HomeChartsService],
})
export class HomeChartsModule {}
