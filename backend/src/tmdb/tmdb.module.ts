// backend/src/tmdb/tmdb.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TmdbService } from './tmdb.service';
import { TmdbController } from './tmdb.controller';
import { ReviewsController } from './reviews.controller';

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
  ],
  controllers: [TmdbController, ReviewsController],
  providers: [TmdbService],
  exports: [TmdbService],
})
export class TmdbModule {}
