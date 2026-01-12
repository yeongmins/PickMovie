// backend/src/tmdb/tmdb.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TmdbService } from './tmdb.service';
import { TmdbController } from './tmdb.controller';
import { ReviewsController } from './reviews.controller';
import { KobisModule } from '../kobis/kobis.module';
import { ScreeningService } from './screening.service';

@Module({
  imports: [
    HttpModule.register({
      baseURL: process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3',
      timeout: 12_000,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        Accept: 'application/json',
      },
    }),
    KobisModule,
  ],
  controllers: [TmdbController, ReviewsController],
  providers: [TmdbService, ScreeningService],
  exports: [TmdbService, ScreeningService],
})
export class TmdbModule {}
