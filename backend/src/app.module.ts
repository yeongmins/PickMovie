// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';

import { AiModule } from './ai/ai.module';
import { SearchModule } from './search/search.module';
import { TmdbModule } from './tmdb/tmdb.module';
import { MoviesModule } from './movies/movies.module';
import { PrismaModule } from './prisma/prisma.module';

import { TrendsModule } from './trends/trends.module';
import { KobisModule } from './kobis/kobis.module';

import { AppCacheModule } from './cache/cache.module';
import { MetaModule } from './meta/meta.module';
import { HomeChartsModule } from './home-charts/home-charts.module';
import { AdminMetaModule } from './admin-meta/admin-meta.module';
import { HealthModule } from './health/health.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AppCacheModule,
    TmdbModule,
    AiModule,
    SearchModule,
    MoviesModule,
    PrismaModule,
    MailModule,
    AuthModule,
    TrendsModule,
    KobisModule,
    MetaModule,
    HomeChartsModule,
    AdminMetaModule,
    HealthModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
