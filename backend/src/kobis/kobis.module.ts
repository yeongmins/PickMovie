// backend/src/kobis/kobis.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KobisService } from './kobis.service';

@Module({
  imports: [
    HttpModule.register({
      baseURL: 'https://kobis.or.kr/kobisopenapi/webservice/rest',
      timeout: 12_000,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        Accept: 'application/json',
      },
    }),
  ],
  providers: [KobisService],
  exports: [KobisService],
})
export class KobisModule {}
