import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TmdbModule } from './tmdb/tmdb.module';
import { MoviesModule } from './movies/movies.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TmdbModule,
    MoviesModule,
    AiModule, // ✅ /ai/search 404 해결
  ],
})
export class AppModule {}
