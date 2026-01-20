// backend/src/meta/meta.warmup.job.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import type { MetaMediaType as DbMediaType } from '../generated/prisma';

import { MetaService } from './meta.service';
import type { ResolveRequest } from './meta.types';

@Injectable()
export class MetaWarmupJob implements OnModuleInit {
  private readonly logger = new Logger(MetaWarmupJob.name);

  // ✅ HomeChartsScheduler처럼 advisory lock 사용 (서버 여러 개 떠도 1개만 실행)
  private readonly lockId = 913_101;

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaService,
  ) {}

  onModuleInit() {
    // 부팅 직후 1회 웜업(초기 No Image 줄이기)
    setTimeout(() => {
      this.runWarmup('boot').catch(() => void 0);
    }, 3_000);
  }

  /**
   * ✅ 10분마다 “스냅샷” 갱신
   * - env로 꺼둘 수 있게
   */
  @Cron('*/10 * * * *', { timeZone: 'Asia/Seoul' })
  async cronWarmup() {
    await this.runWarmup('cron');
  }

  private isEnabled(): boolean {
    const v = String(process.env.META_WARMUP_ENABLED ?? 'true')
      .trim()
      .toLowerCase();
    return !(v === 'false' || v === '0');
  }

  private async runWarmup(tag: 'boot' | 'cron'): Promise<void> {
    if (!this.isEnabled()) return;

    const gotLock = await this.tryLock();
    if (!gotLock) {
      this.logger.warn(`[${tag}] skip: another instance is running warmup`);
      return;
    }

    try {
      const batch = Number(process.env.META_WARMUP_BATCH ?? 80);
      const reqs = await this.pickTargets(batch);

      if (reqs.length === 0) {
        this.logger.log(`[${tag}] warmup: nothing to do`);
        return;
      }

      this.logger.log(
        `[${tag}] warmup start: targets=${reqs.length} (batch=${batch})`,
      );

      // ✅ 핵심: resolveBatch가 캐시 없으면 computeAndUpsert로 DB를 채움
      await this.meta.resolveBatch(reqs);

      this.logger.log(`[${tag}] warmup done`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[${tag}] warmup failed: ${msg}`);
    } finally {
      await this.unlock();
    }
  }

  /**
   * ✅ “No Image”를 줄이려면
   * 1) 이미 존재하는 캐시 중에서
   *    - expiresAt 임박/지남
   *    - metaVersion 낮음
   *    - computed.contentCardPosterPath 없는 애
   * 를 우선적으로 재계산해두면 됨
   *
   * (DB에 아예 없는 신규 ID까지 모두 커버하려면
   *  홈 화면 리스트의 tmdbId 소스를 추가로 끌어와야 함.
   *  일단 이건 ‘현재 로딩이 생기는 주된 원인(캐시 미충분/만료)’부터 잡는 버전.)
   */
  private async pickTargets(limit: number): Promise<ResolveRequest[]> {
    // “지금부터 24시간 내 만료”거나 “포스터 계산값 없음”이거나 “버전 낮음”
    const rows = await this.prisma.contentMetaResolved.findMany({
      take: limit,
      orderBy: [{ expiresAt: 'asc' }, { resolvedAt: 'asc' }],
      select: {
        mediaType: true,
        tmdbId: true,
        metaVersion: true,
        sourcesUsed: true,
        expiresAt: true,
      },
      where: {
        OR: [
          // 만료 임박/만료
          { expiresAt: { lte: new Date(Date.now() + 1000 * 60 * 60 * 24) } },
          // 버전 낮은 캐시
          { metaVersion: { lt: 5 } }, // ✅ MetaService의 TARGET_META_VERSION(=5)와 맞춰줘
          // computed.contentCardPosterPath 누락 (sourcesUsed JSON)
          // Prisma JSON 필터는 프로젝트 설정마다 문법이 달라서 “raw”로 안전하게 처리
        ],
      },
    });

    // sourcesUsed 안의 computed.contentCardPosterPath 누락을 raw로 보완
    // (findMany에서 JSON path 조건을 못 쓰는 스키마/버전 대비)
    const missingPosterRows = await this.prisma.$queryRaw<
      { mediaType: DbMediaType; tmdbId: number }[]
    >`
      SELECT "mediaType", "tmdbId"
      FROM "ContentMetaResolved"
      WHERE (
        ("sourcesUsed" IS NULL)
        OR (("sourcesUsed"->'computed'->>'contentCardPosterPath') IS NULL)
        OR (("sourcesUsed"->'computed'->>'contentCardPosterPath') = '')
      )
      ORDER BY "resolvedAt" ASC
      LIMIT ${limit}
    `;

    const merged = new Map<string, ResolveRequest>();

    for (const r of rows) {
      merged.set(`${r.mediaType}:${r.tmdbId}`, {
        mediaType: r.mediaType as unknown as ResolveRequest['mediaType'],
        tmdbId: r.tmdbId,
      });
    }

    for (const r of missingPosterRows) {
      merged.set(`${r.mediaType}:${r.tmdbId}`, {
        mediaType: r.mediaType as unknown as ResolveRequest['mediaType'],
        tmdbId: r.tmdbId,
      });
    }

    return Array.from(merged.values()).slice(0, limit);
  }

  private async tryLock(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_lock(${this.lockId}) AS locked
      `;
      return rows[0]?.locked === true;
    } catch {
      return false;
    }
  }

  private async unlock(): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT pg_advisory_unlock(${this.lockId})
      `;
    } catch {
      // noop
    }
  }
}
