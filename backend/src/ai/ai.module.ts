import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { TmdbModule } from '../tmdb/tmdb.module';

@Module({
  imports: [TmdbModule],
  controllers: [AiController],
})
export class AiModule {}
