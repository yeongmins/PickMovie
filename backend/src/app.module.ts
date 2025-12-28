// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';

import { AiModule } from './ai/ai.module';
import { PickyModule } from './picky/picky.module';
import { TmdbModule } from './tmdb/tmdb.module';
import { MoviesModule } from './movies/movies.module';
import { PrismaModule } from './prisma/prisma.module';

import { TrendsModule } from './trends/trends.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    TmdbModule,
    AiModule,
    PickyModule,
    MoviesModule,
    PrismaModule,
    MailModule,
    AuthModule,

    TrendsModule,
  ],
})
export class AppModule {}
