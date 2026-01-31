// backend/src/kobis/kobis.boxoffice.cron.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KobisService } from './kobis.service';

@Injectable()
export class KobisBoxOfficeCron {
  constructor(private readonly kobis: KobisService) {}

  // ✅ 매일 01:20 (KST 기준으로 운용하려면 서버 TZ도 KST 권장)
  // - 스냅샷 DB를 미리 채워두는 용도(프론트 요청 시에도 on-demand로 채움)
  @Cron('0 20 1 * * *')
  async run() {
    await this.kobis.refreshYesterdayBoxOfficeSnapshot();
  }
}
