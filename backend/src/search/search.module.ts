// backend/src/search/search.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';

import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchPolicyService } from './search-policy.service';

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule],
  providers: [SearchService, SearchPolicyService],
  controllers: [SearchController],
  exports: [SearchService, SearchPolicyService],
})
export class SearchModule {}
