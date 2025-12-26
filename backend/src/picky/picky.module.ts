import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { PickyService } from './picky.service';
import { PickyController } from './picky.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [HttpModule, ConfigModule, AiModule],
  providers: [PickyService],
  controllers: [PickyController],
  exports: [PickyService],
})
export class PickyModule {}
