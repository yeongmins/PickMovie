// backend/src/kobis/kobis.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KobisService } from './kobis.service';
import { PrismaModule } from '../prisma/prisma.module';
import { KobisController } from './kobis.controller';
import { KobisBoxOfficeCron } from './kobis.boxoffice.cron';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      baseURL: 'https://kobis.or.kr/kobisopenapi/webservice/rest',
      timeout: 12_000,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        Accept: 'application/json',
      },
    }),
  ],
  controllers: [KobisController],
  providers: [KobisService, KobisBoxOfficeCron],
  exports: [KobisService],
})
export class KobisModule {}
