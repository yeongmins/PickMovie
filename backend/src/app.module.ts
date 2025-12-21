import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { PickyModule } from './picky/picky.module';
import { TmdbModule } from './tmdb/tmdb.module';
import { MoviesModule } from './movies/movies.module';

@Module({
  imports: [TmdbModule, AiModule, PickyModule, MoviesModule],
})
export class AppModule {}
