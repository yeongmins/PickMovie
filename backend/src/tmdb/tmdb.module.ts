// backend/src/tmdb/tmdb.module.ts

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TmdbService } from './tmdb.service';

@Module({
  imports: [HttpModule],
  providers: [TmdbService],
  exports: [TmdbService], // MoviesModule에서 사용하니까 export
})
export class TmdbModule {}
