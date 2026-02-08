// backend/src/search/search.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [SearchService],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}
