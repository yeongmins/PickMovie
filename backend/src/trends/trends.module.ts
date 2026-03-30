// backend/src/trends/trends.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { PrismaModule } from '../prisma/prisma.module';
import { TmdbModule } from '../tmdb/tmdb.module';

import { TrendsController } from './trends.controller';
import { TrendsService } from './trends.service';

@Module({
  imports: [HttpModule, PrismaModule, TmdbModule],
  controllers: [TrendsController],
  providers: [TrendsService],
  exports: [TrendsService],
})
export class TrendsModule {}
