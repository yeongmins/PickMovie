// backend/src/picky/picky.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { PickyService } from './picky.service';
import { PickyController } from './picky.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [PickyService],
  controllers: [PickyController],
  exports: [PickyService],
})
export class PickyModule {}
