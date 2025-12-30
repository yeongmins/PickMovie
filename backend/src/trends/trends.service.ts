// backend/src/trends/trends.service.ts

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';

import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma';
import { TmdbService } from '../tmdb/tmdb.service';
import type { TmdbMovieResult } from '../tmdb/tmdb.types';

type TrendSource = 'kobis' | 'youtube' | 'naver' | 'netflix';
type TrendMediaType = 'movie' | 'tv' | 'anime' | 'unknown';

type RankedTrendItem = {
  id: number;
  keyword: string;
  source: TrendSource;
  mediaType: TrendMediaType;
  rank: number;
  score: number;
  tmdbId: number | null;
  year: number | null;

  // ✅ v2(Topic) 정보는 “옵션”으로만 내려줌 (UI에 100% 강제 반영 X)
  topicId: number | null;
  topicTitle: string | null;
};

type RankedTrendsResponse = {
  date: string; // YYYYMMDD
  items: RankedTrendItem[];
};

type GetRankedTrendsArgs = {
  date?: string;
  limit?: number;
};

type KobisDailyBoxOfficeItem = {
  rank: string;
  movieNm: string;
  movieCd: string;
  openDt: string;
  audiAcc: string;
};

type KobisDailyBoxOfficeResponse = {
  boxOfficeResult?: { dailyBoxOfficeList?: KobisDailyBoxOfficeItem[] };
};

type NaverSearchResponse = { total?: number };

type NaverDataLabPoint = { period: string; ratio: number };
type NaverDataLabResult = { title: string; data: NaverDataLabPoint[] };
type NaverDataLabResponse = { results?: NaverDataLabResult[] };

type YoutubeSearchResponse = {
  pageInfo?: { totalResults?: number };
  items?: unknown[];
};

function isYmd8(v: string): boolean {
  return /^\d{8}$/.test(v);
}

function kstYmdOffset(offsetDays: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function logScore(x: number): number {
  return Math.log10(Math.max(0, x) + 1);
}

function zParams(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  const std = Math.sqrt(variance) || 1;
  return { mean, std };
}

function zScore(value: number, mean: number, std: number): number {
  return (value - mean) / (std || 1);
}

// ✅ ESLint no-unsafe-assignment 방지: new Array<R>()
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await mapper(items[cur]);
    }
  });

  await Promise.all(workers);
  return results;
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[~`!@#$%^&*()_+\-={}[\]|\\:;"'<>,.?/·•…：]/g, '');
}

function yearFromReleaseDate(v?: string): number | null {
  if (!v) return null;
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(v);
  return m ? Number(m[1]) : null;
}

type SeedRow = {
  id: number;
  keyword: string;
  year: number | null;
  tmdbId: number | null;
  kobisRank: number;
  audiAcc: number;
  movieCd: string;
  topicId: number | null;
};

@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name);

  private readonly REGION = 'KR';
  private readonly ALGO_VERSION = 'kr.daily.v1';

  /**
   * ✅ “후보군(유니크) 50개”를 만들기 위해 windowDays를 늘림
   * - KOBIS가 실제로 일별 Top10만 내려오는 케이스를 커버
   * - 유니크 후보가 50개 채워지면 windowDays를 다 돌기 전에 조기 종료
   */
  private readonly KOBIS_WINDOW_DAYS = 21; // 필요하면 30으로 변경
  private readonly KOBIS_DAILY_TOP = 10; // 스냅샷상 실제로 10개씩 내려옴
  private readonly KOBIS_CANDIDATE_LIMIT = 50;

  /**
   * ✅ 비용(외부 API 호출) 고정:
   * - 후보군이 50이어도 네이버/유튜브/데이터랩은 상위 N개만 호출
   * - 나머지는 외부 신호 0으로 처리(점수는 KOBIS 중심)
   */
  private readonly EXTERNAL_KEYWORD_LIMIT = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly tmdb: TmdbService,
  ) {}

  assertIngestToken(token?: string): void {
    const required = this.config.get<string>('TRENDS_INGEST_TOKEN') ?? '';
    if (!required) return; // 토큰 미설정이면 개발 편의상 패스
    if (!token || token !== required) {
      throw new UnauthorizedException('Invalid ingest token');
    }
  }

  // ✅ KST 04:20 자동 실행(어제 기준)
  @Cron('0 20 4 * * *', { timeZone: 'Asia/Seoul' })
  async cronDailyIngest(): Promise<void> {
    try {
      await this.ingestDailyKrTrends(undefined);
    } catch (e) {
      this.logger.error(`cronDailyIngest failed: ${String(e)}`);
    }
  }

  async getRankedTrends(
    args: GetRankedTrendsArgs,
  ): Promise<RankedTrendsResponse> {
    const limit = clamp(args.limit ?? 20, 1, 100);
    const date =
      args.date && isYmd8(args.date)
        ? args.date
        : await this.getLatestRankDateOrYesterday();

    type Row = Prisma.TrendRankGetPayload<{
      include: {
        seed: {
          include: {
            topic: { select: { id: true; canonicalTitle: true } };
          };
        };
      };
    }>;

    const rows = await this.prisma.trendRank.findMany({
      where: { date, seed: { source: 'kobis', mediaType: 'movie' } },
      orderBy: [{ score: 'desc' }, { rank: 'asc' }],
      take: limit,
      include: {
        seed: {
          include: {
            topic: { select: { id: true, canonicalTitle: true } },
          },
        },
      },
    });

    return {
      date,
      items: (rows as Row[]).map((r) => ({
        id: r.seed.id,
        keyword: r.seed.keyword,
        source: r.seed.source as TrendSource,
        mediaType: r.seed.mediaType as TrendMediaType,
        rank: r.rank,
        score: r.score,
        tmdbId: r.seed.tmdbId ?? null,
        year: r.seed.year ?? null,

        // ✅ Topic은 “보조 정보”로만
        topicId: r.seed.topicId ?? null,
        topicTitle: r.seed.topic?.canonicalTitle ?? null,
      })),
    };
  }

  // ✅ 기존 컨트롤러 엔드포인트 유지용 래퍼
  async ingestKobisDaily(
    targetDt?: string,
  ): Promise<{ date: string; total: number }> {
    return this.ingestDailyKrTrends(targetDt);
  }

  /**
   * ✅ v1(기존) 기능 유지 + v2(고도화) 저장(Topic/Metric/Score)
   *
   * 변경 포인트:
   * - KOBIS 후보군: windowDays(21) 동안 daily top10을 합쳐 유니크 50개까지 확장
   * - 외부 API: 상위 20개만 호출 (비용/쿼터 고정)
   */
  async ingestDailyKrTrends(
    targetDt?: string,
  ): Promise<{ date: string; total: number }> {
    const date = targetDt && isYmd8(targetDt) ? targetDt : kstYmdOffset(-1);

    const run = await this.ensureRun(date);

    try {
      // 0) window 기반 후보군 수집(유니크 50까지)
      const kobisWindow = await this.fetchKobisWindow(date);
      const kobisList = kobisWindow.items;

      if (kobisList.length === 0) {
        throw new ServiceUnavailableException(
          `KOBIS returned empty list for ${date}`,
        );
      }

      await this.storeSnapshot(run.id, {
        source: 'kobis',
        endpoint:
          'kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json',
        request: {
          date,
          windowDays: this.KOBIS_WINDOW_DAYS,
          dailyTop: this.KOBIS_DAILY_TOP,
          candidateLimit: this.KOBIS_CANDIDATE_LIMIT,
        },
        response: {
          uniqueCount: kobisWindow.uniqueCount,
          perDayCounts: kobisWindow.perDayCounts,
          selectedCount: kobisWindow.selectedCount,
        },
      });

      const source: TrendSource = 'kobis';
      const mediaType: TrendMediaType = 'movie';

      // 1) seed upsert
      const seeds = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const created: Array<SeedRow> = [];

          for (const item of kobisList) {
            const keyword = item.movieNm.trim();
            if (!keyword) continue;

            const year =
              item.openDt && /^\d{4}-\d{2}-\d{2}$/.test(item.openDt)
                ? safeNumber(item.openDt.slice(0, 4), 0) || null
                : null;

            const kobisRank = safeNumber(item.rank, 999);
            const audiAcc = safeNumber(item.audiAcc, 0);

            const raw: Prisma.InputJsonValue = {
              movieCd: item.movieCd,
              openDt: item.openDt,
              audiAcc,
              kobisRank,
              window: {
                target: date,
                windowDays: this.KOBIS_WINDOW_DAYS,
              },
            };

            const seed = await tx.trendSeed.upsert({
              where: {
                keyword_source_mediaType: { keyword, source, mediaType },
              },
              create: { keyword, source, mediaType, year, raw },
              update: { year, raw },
            });

            created.push({
              id: seed.id,
              keyword,
              year: seed.year ?? null,
              tmdbId: seed.tmdbId ?? null,
              kobisRank,
              audiAcc,
              movieCd: item.movieCd,
              topicId: seed.topicId ?? null,
            });
          }

          return created;
        },
      );

      // 2) tmdbId 매칭(없는 것만) + 로컬 seeds 반영
      const matchedMap = await this.matchAndStoreTmdbIds(seeds);
      for (const s of seeds) {
        const tmdbId = matchedMap.get(s.id);
        if (tmdbId) s.tmdbId = tmdbId;
      }

      // 3) Topic 통합 + Seed.topicId 연결
      const topicMap = await this.ensureTopicsForSeeds(
        source,
        mediaType,
        seeds,
      );
      for (const s of seeds) {
        const tid = topicMap.get(s.id) ?? null;
        s.topicId = tid;
      }

      // 4) 외부 트렌드 수집: ✅ 비용 고정(상위 N개만)
      const externalSeeds = seeds
        .slice()
        .sort((a, b) => a.kobisRank - b.kobisRank)
        .slice(0, this.EXTERNAL_KEYWORD_LIMIT);

      const externalKeywords = externalSeeds.map((s) => s.keyword);

      const naverSearch = await this.collectNaverSearch(externalKeywords);
      await this.storeSnapshot(run.id, {
        source: 'naver',
        endpoint: 'openapi.naver.com/v1/search/{blog|cafearticle|news}.json',
        request: {
          keywords: externalKeywords,
          display: 1,
          start: 1,
          sort: 'sim',
        },
        response: { count: externalKeywords.length },
      });

      const naverDatalab = await this.collectNaverDatalab(
        date,
        externalKeywords,
      );
      await this.storeSnapshot(run.id, {
        source: 'naver',
        endpoint: 'openapi.naver.com/v1/datalab/search',
        request: { date, keywords: externalKeywords, timeUnit: 'date' },
        response: { count: externalKeywords.length },
      });

      const youtube = await this.collectYoutube(externalKeywords);
      await this.storeSnapshot(run.id, {
        source: 'youtube',
        endpoint: 'www.googleapis.com/youtube/v3/search',
        request: { keywords: externalKeywords, qTemplate: '{keyword} 예고편' },
        response: { count: externalKeywords.length },
      });

      // 5) Seed -> Topic 단위로 메트릭 집계
      const topicAgg = new Map<
        number,
        {
          topicId: number;
          seeds: Array<{ seedId: number; keyword: string }>;
          kobisRankBest: number; // 낮을수록 좋음
          audiAccBest: number;

          naverBlogBest: number;
          naverCafeBest: number;
          naverNewsBest: number;
          datalabRatioBest: number;

          youtubeTotalBest: number;
          youtubeItemsBest: number;
        }
      >();

      for (const s of seeds) {
        if (!s.topicId) continue;

        // ✅ 외부 대상이 아니면 맵에서 못 찾음 → 0 처리(비용 고정)
        const ns = naverSearch.get(s.keyword) ?? { blog: 0, cafe: 0, news: 0 };
        const dl = naverDatalab.get(s.keyword) ?? 0;
        const yt = youtube.get(s.keyword) ?? { totalResults: 0, itemsCount: 0 };

        const existing = topicAgg.get(s.topicId);
        if (!existing) {
          topicAgg.set(s.topicId, {
            topicId: s.topicId,
            seeds: [{ seedId: s.id, keyword: s.keyword }],
            kobisRankBest: s.kobisRank,
            audiAccBest: s.audiAcc,

            naverBlogBest: ns.blog,
            naverCafeBest: ns.cafe,
            naverNewsBest: ns.news,
            datalabRatioBest: dl,

            youtubeTotalBest: yt.totalResults,
            youtubeItemsBest: yt.itemsCount,
          });
          continue;
        }

        topicAgg.set(s.topicId, {
          ...existing,
          seeds: [...existing.seeds, { seedId: s.id, keyword: s.keyword }],

          kobisRankBest: Math.min(existing.kobisRankBest, s.kobisRank),
          audiAccBest: Math.max(existing.audiAccBest, s.audiAcc),

          naverBlogBest: Math.max(existing.naverBlogBest, ns.blog),
          naverCafeBest: Math.max(existing.naverCafeBest, ns.cafe),
          naverNewsBest: Math.max(existing.naverNewsBest, ns.news),
          datalabRatioBest: Math.max(existing.datalabRatioBest, dl),

          youtubeTotalBest: Math.max(
            existing.youtubeTotalBest,
            yt.totalResults,
          ),
          youtubeItemsBest: Math.max(existing.youtubeItemsBest, yt.itemsCount),
        });
      }

      if (topicAgg.size === 0) {
        const fallbackTotal = await this.persistSeedOnlyRank(date, seeds);
        await this.finishRunSuccess(run.id, {
          date,
          total: fallbackTotal,
          fallback: true,
        });
        this.logger.log(
          `KR Trends ingest done (seed-only): ${date} (${fallbackTotal})`,
        );
        return { date, total: fallbackTotal };
      }

      const topics = Array.from(topicAgg.values());

      // ✅ “외부 신호 커버리지”에 따라 KOBIS 비중 자동 하향
      const externalCoveredCount = topics.filter((t) => {
        const naverTotal = t.naverBlogBest + t.naverCafeBest + t.naverNewsBest;
        return (
          t.datalabRatioBest > 0 || t.youtubeTotalBest > 0 || naverTotal > 0
        );
      }).length;

      const coverage = topics.length ? externalCoveredCount / topics.length : 0;
      const kobisWeight = coverage >= 0.6 ? 0.12 : 0.18;

      const extBase = { datalab: 0.3, naver: 0.3, youtube: 0.25 } as const;
      const extSum = extBase.datalab + extBase.naver + extBase.youtube; // 0.85
      const extScale = (1 - kobisWeight) / extSum;

      const W = {
        kobis: kobisWeight,
        datalab: extBase.datalab * extScale,
        naver: extBase.naver * extScale,
        youtube: extBase.youtube * extScale,
      } as const;

      // 6) z-score 파라미터(Topic 기준)
      const m_kobis = topics.map(
        (t) => 1 / Math.sqrt(Math.max(1, t.kobisRankBest)),
      );
      const m_dl = topics.map((t) => t.datalabRatioBest);

      const m_naver = topics.map((t) => {
        const total = t.naverBlogBest + t.naverCafeBest + t.naverNewsBest;
        return logScore(total);
      });

      const m_yt = topics.map((t) => logScore(t.youtubeTotalBest));

      const p_kobis = zParams(m_kobis);
      const p_dl = zParams(m_dl);
      const p_naver = zParams(m_naver);
      const p_yt = zParams(m_yt);

      // 7) Topic 점수 계산 + breakdown
      const topicScored = topics.map((t) => {
        const kobisInvRank = 1 / Math.max(1, t.kobisRankBest);
        const kobisInvSqrtRank = 1 / Math.sqrt(Math.max(1, t.kobisRankBest));

        const dlVal = t.datalabRatioBest;

        const naverTotal = t.naverBlogBest + t.naverCafeBest + t.naverNewsBest;
        const naverLog = logScore(naverTotal);

        const ytLog = logScore(t.youtubeTotalBest);

        const zKobisRaw = zScore(kobisInvSqrtRank, p_kobis.mean, p_kobis.std);
        const zKobisUsed = clamp(zKobisRaw, -0.7, 0.7);
        const zDl = zScore(dlVal, p_dl.mean, p_dl.std);
        const zNaver = zScore(naverLog, p_naver.mean, p_naver.std);
        const zYt = zScore(ytLog, p_yt.mean, p_yt.std);

        const score =
          W.kobis * zKobisUsed +
          W.datalab * zDl +
          W.naver * zNaver +
          W.youtube * zYt;

        const breakdown: Prisma.InputJsonValue = {
          algoVersion: this.ALGO_VERSION,
          coverage,
          weights: W,
          seeds: t.seeds,
          metrics: {
            kobis: {
              rank: t.kobisRankBest,
              invRank: kobisInvRank,
              invSqrtRank: kobisInvSqrtRank,
              zRaw: zKobisRaw,
              zUsed: zKobisUsed,
              audiAcc: t.audiAccBest,
            },
            naver: {
              blogTotal: t.naverBlogBest,
              cafeTotal: t.naverCafeBest,
              newsTotal: t.naverNewsBest,
              totalMentions: naverTotal,
              totalMentionsLog: { value: naverLog, z: zNaver },
              datalabRatio: { value: dlVal, z: zDl },
            },
            youtube: {
              totalResults: { value: t.youtubeTotalBest, log: ytLog, z: zYt },
              itemsCount: t.youtubeItemsBest,
            },
          },
        };

        return {
          topicId: t.topicId,
          seeds: t.seeds,
          score,
          breakdown,
          metric: {
            kobisRank: t.kobisRankBest,
            kobisInvRank,
            kobisInvSqrtRank,
            zKobisRaw,
            zKobisUsed,

            dlVal,
            zDl,

            naverBlog: t.naverBlogBest,
            naverCafe: t.naverCafeBest,
            naverNews: t.naverNewsBest,
            naverTotal,
            naverLog,
            zNaver,

            ytTotal: t.youtubeTotalBest,
            ytItems: t.youtubeItemsBest,
            ytLog,
            zYt,

            // ✅ TS2339 방지(존재 보장)
            audiAcc: t.audiAccBest,
          },
        };
      });

      topicScored.sort((a, b) => b.score - a.score);

      // 8) 저장(dual-write)
      const result = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // TopicScore map (SeedRank 업데이트용)
          const scoreMap = new Map<
            number,
            { rank: number; score: number; breakdown: Prisma.InputJsonValue }
          >();

          for (let i = 0; i < topicScored.length; i++) {
            scoreMap.set(topicScored[i].topicId, {
              rank: i + 1,
              score: topicScored[i].score,
              breakdown: topicScored[i].breakdown,
            });
          }

          // 8-1) TrendScore (Topic)
          for (let i = 0; i < topicScored.length; i++) {
            const it = topicScored[i];
            await tx.trendScore.upsert({
              where: {
                topicId_date_algoVersion: {
                  topicId: it.topicId,
                  date,
                  algoVersion: this.ALGO_VERSION,
                },
              },
              create: {
                topicId: it.topicId,
                date,
                algoVersion: this.ALGO_VERSION,
                rank: i + 1,
                score: it.score,
                breakdown: it.breakdown,
              },
              update: { rank: i + 1, score: it.score, breakdown: it.breakdown },
            });
          }

          // 8-2) TrendMetric (Topic)
          for (const it of topicScored) {
            const rawSeeds: Prisma.InputJsonValue = { seeds: it.seeds };

            // kobis.invRank (참고용)
            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'kobis',
                  metric: 'kobis.invRank',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'kobis',
                metric: 'kobis.invRank',
                value: it.metric.kobisInvRank,
                raw: rawSeeds,
              },
              update: { value: it.metric.kobisInvRank, raw: rawSeeds },
            });

            // kobis.invSqrtRank (점수에 사용)
            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'kobis',
                  metric: 'kobis.invSqrtRank',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'kobis',
                metric: 'kobis.invSqrtRank',
                value: it.metric.kobisInvSqrtRank,
                z: it.metric.zKobisUsed,
                raw: {
                  ...rawSeeds,
                  zRaw: it.metric.zKobisRaw,
                  zUsed: it.metric.zKobisUsed,
                } as Prisma.InputJsonValue,
              },
              update: {
                value: it.metric.kobisInvSqrtRank,
                z: it.metric.zKobisUsed,
                raw: {
                  ...rawSeeds,
                  zRaw: it.metric.zKobisRaw,
                  zUsed: it.metric.zKobisUsed,
                } as Prisma.InputJsonValue,
              },
            });

            // kobis.audiAcc
            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'kobis',
                  metric: 'kobis.audiAcc',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'kobis',
                metric: 'kobis.audiAcc',
                value: it.metric.audiAcc,
                raw: rawSeeds,
              },
              update: { value: it.metric.audiAcc, raw: rawSeeds },
            });

            // naver.datalabRatio (점수에 사용)
            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'naver',
                  metric: 'naver.datalabRatio',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'naver',
                metric: 'naver.datalabRatio',
                value: it.metric.dlVal,
                z: it.metric.zDl,
                raw: rawSeeds,
              },
              update: {
                value: it.metric.dlVal,
                z: it.metric.zDl,
                raw: rawSeeds,
              },
            });

            // naver.totalMentionsLog (점수에 사용)
            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'naver',
                  metric: 'naver.totalMentionsLog',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'naver',
                metric: 'naver.totalMentionsLog',
                value: it.metric.naverLog,
                z: it.metric.zNaver,
                raw: {
                  ...rawSeeds,
                  totalMentions: it.metric.naverTotal,
                } as Prisma.InputJsonValue,
              },
              update: {
                value: it.metric.naverLog,
                z: it.metric.zNaver,
                raw: {
                  ...rawSeeds,
                  totalMentions: it.metric.naverTotal,
                } as Prisma.InputJsonValue,
              },
            });

            // naver.blogTotal/cafeTotal/newsTotal (분석용)
            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'naver',
                  metric: 'naver.blogTotal',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'naver',
                metric: 'naver.blogTotal',
                value: it.metric.naverBlog,
                valueLog: logScore(it.metric.naverBlog),
                raw: rawSeeds,
              },
              update: {
                value: it.metric.naverBlog,
                valueLog: logScore(it.metric.naverBlog),
                raw: rawSeeds,
              },
            });

            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'naver',
                  metric: 'naver.cafeTotal',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'naver',
                metric: 'naver.cafeTotal',
                value: it.metric.naverCafe,
                valueLog: logScore(it.metric.naverCafe),
                raw: rawSeeds,
              },
              update: {
                value: it.metric.naverCafe,
                valueLog: logScore(it.metric.naverCafe),
                raw: rawSeeds,
              },
            });

            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'naver',
                  metric: 'naver.newsTotal',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'naver',
                metric: 'naver.newsTotal',
                value: it.metric.naverNews,
                valueLog: logScore(it.metric.naverNews),
                raw: rawSeeds,
              },
              update: {
                value: it.metric.naverNews,
                valueLog: logScore(it.metric.naverNews),
                raw: rawSeeds,
              },
            });

            // yt.totalResults (점수에 사용)
            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'youtube',
                  metric: 'yt.totalResults',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'youtube',
                metric: 'yt.totalResults',
                value: it.metric.ytTotal,
                valueLog: it.metric.ytLog,
                z: it.metric.zYt,
                raw: rawSeeds,
              },
              update: {
                value: it.metric.ytTotal,
                valueLog: it.metric.ytLog,
                z: it.metric.zYt,
                raw: rawSeeds,
              },
            });

            // yt.itemsCount
            await tx.trendMetric.upsert({
              where: {
                topicId_date_source_metric: {
                  topicId: it.topicId,
                  date,
                  source: 'youtube',
                  metric: 'yt.itemsCount',
                },
              },
              create: {
                topicId: it.topicId,
                date,
                source: 'youtube',
                metric: 'yt.itemsCount',
                value: it.metric.ytItems,
                raw: rawSeeds,
              },
              update: { value: it.metric.ytItems, raw: rawSeeds },
            });
          }

          // 8-3) 기존 TrendRank(Seed) 업데이트 (TopicScore를 seed에 내려줌)
          const seedRankList = seeds
            .map((s) => {
              if (!s.topicId) return null;
              const sc = scoreMap.get(s.topicId);
              if (!sc) return null;
              return {
                seedId: s.id,
                date,
                score: sc.score,
                breakdown: sc.breakdown,
              };
            })
            .filter(Boolean) as Array<{
            seedId: number;
            date: string;
            score: number;
            breakdown: Prisma.InputJsonValue;
          }>;

          seedRankList.sort((a, b) => b.score - a.score);

          let total = 0;
          for (let i = 0; i < seedRankList.length; i++) {
            const it = seedRankList[i];
            await tx.trendRank.upsert({
              where: { seedId_date: { seedId: it.seedId, date } },
              create: {
                seedId: it.seedId,
                date,
                rank: i + 1,
                score: it.score,
                breakdown: it.breakdown,
              },
              update: { rank: i + 1, score: it.score, breakdown: it.breakdown },
            });
            total += 1;
          }

          return { date, total };
        },
      );

      await this.finishRunSuccess(run.id, {
        date: result.date,
        total: result.total,
        algoVersion: this.ALGO_VERSION,
        windowDays: this.KOBIS_WINDOW_DAYS,
        dailyTop: this.KOBIS_DAILY_TOP,
        candidateLimit: this.KOBIS_CANDIDATE_LIMIT,
        externalKeywordLimit: this.EXTERNAL_KEYWORD_LIMIT,
        coverage,
        weights: W,
      });

      this.logger.log(
        `KR Trends ingest done: ${result.date} (${result.total})`,
      );
      return result;
    } catch (e) {
      await this.finishRunFailed(run.id, String(e));
      throw e;
    }
  }

  // -----------------------------
  // v2 helpers: Run/Snapshot
  // -----------------------------

  private ensureRun(date: string) {
    return this.prisma.trendIngestRun.upsert({
      where: { date_region: { date, region: this.REGION } },
      create: { date, region: this.REGION, status: 'running' },
      update: { status: 'running', error: null, finishedAt: null },
    });
  }

  private async finishRunSuccess(
    runId: number,
    meta?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.trendIngestRun.update({
      where: { id: runId },
      data: {
        status: 'success',
        finishedAt: new Date(),
        error: null,
        meta: meta ?? undefined,
      },
    });
  }

  private async finishRunFailed(runId: number, error: string): Promise<void> {
    await this.prisma.trendIngestRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        error: error.slice(0, 4000),
      },
    });
  }

  private async storeSnapshot(
    runId: number,
    args: {
      source: TrendSource;
      endpoint?: string;
      request?: Prisma.InputJsonValue;
      response?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    try {
      await this.prisma.trendSnapshot.create({
        data: {
          runId,
          source: args.source,
          endpoint: args.endpoint,
          request: args.request,
          response: args.response,
        },
      });
    } catch (e) {
      // snapshot 실패는 ingest 전체를 깨지 않게
      this.logger.warn(`storeSnapshot failed: ${String(e)}`);
    }
  }

  // -----------------------------
  // v2 helpers: Topic/Alias
  // -----------------------------

  private async ensureTopicsForSeeds(
    seedSource: TrendSource,
    mediaType: TrendMediaType,
    seeds: Array<{
      id: number;
      keyword: string;
      year: number | null;
      tmdbId: number | null;
      topicId: number | null;
    }>,
  ): Promise<Map<number, number>> {
    const out = new Map<number, number>();

    const results = await mapLimit(seeds, 4, async (s) => {
      const topicId = await this.ensureTopicForSeed(seedSource, mediaType, s);
      return { seedId: s.id, topicId };
    });

    for (const r of results) {
      if (r.topicId) out.set(r.seedId, r.topicId);
    }
    return out;
  }

  private async ensureTopicForSeed(
    seedSource: TrendSource,
    mediaType: TrendMediaType,
    seed: {
      id: number;
      keyword: string;
      year: number | null;
      tmdbId: number | null;
      topicId?: number | null;
    },
  ): Promise<number | null> {
    const title = seed.keyword.trim();
    if (!title) return null;
    const n = normTitle(title);

    if (seed.tmdbId) {
      const byTmdb = await this.prisma.trendTopic.findFirst({
        where: { tmdbId: seed.tmdbId, mediaType },
        select: { id: true },
      });
      if (byTmdb) {
        await this.linkSeedToTopicAndAlias(
          seed.id,
          byTmdb.id,
          title,
          n,
          seedSource,
        );
        return byTmdb.id;
      }
    }

    const topic = await this.prisma.trendTopic.upsert({
      where: { mediaType_normTitle: { mediaType, normTitle: n } },
      create: {
        mediaType,
        tmdbId: seed.tmdbId ?? undefined,
        year: seed.year ?? undefined,
        canonicalTitle: title,
        normTitle: n,
      },
      update: {
        tmdbId: seed.tmdbId ?? undefined,
        year: seed.year ?? undefined,
        canonicalTitle: title,
      },
      select: { id: true },
    });

    await this.linkSeedToTopicAndAlias(seed.id, topic.id, title, n, seedSource);
    return topic.id;
  }

  private async linkSeedToTopicAndAlias(
    seedId: number,
    topicId: number,
    alias: string,
    normAlias: string,
    source: TrendSource,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.trendSeed.update({
        where: { id: seedId },
        data: { topicId },
      });

      await tx.trendTopicAlias.upsert({
        where: { topicId_normAlias: { topicId, normAlias } },
        create: {
          topicId,
          alias,
          normAlias,
          source,
          confidence: 0.7,
        },
        update: {
          alias,
          source,
          confidence: 0.7,
        },
      });
    });
  }

  // -----------------------------
  // TMDB match (returns map)
  // -----------------------------

  private async matchAndStoreTmdbIds(
    seeds: Array<{
      id: number;
      keyword: string;
      year: number | null;
      tmdbId: number | null;
    }>,
  ): Promise<Map<number, number>> {
    const out = new Map<number, number>();

    const targets = seeds.filter((s) => !s.tmdbId);
    if (targets.length === 0) return out;

    const matched = await mapLimit(targets, 2, async (s) => {
      const found = await this.findBestTmdbMovie(s.keyword, s.year);
      return { seedId: s.id, tmdbId: found?.id ?? null };
    });

    const toUpdate = matched.filter((m) => m.tmdbId !== null) as Array<{
      seedId: number;
      tmdbId: number;
    }>;
    if (toUpdate.length === 0) return out;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const m of toUpdate) {
        await tx.trendSeed.update({
          where: { id: m.seedId },
          data: { tmdbId: m.tmdbId },
        });
        out.set(m.seedId, m.tmdbId);
      }
    });

    return out;
  }

  private async findBestTmdbMovie(
    keyword: string,
    year: number | null,
  ): Promise<TmdbMovieResult | null> {
    const q = keyword.trim();
    if (!q) return null;

    const lang = process.env.TMDB_LANGUAGE ?? 'ko-KR';
    const region = process.env.TMDB_REGION ?? 'KR';

    const try1 = await this.safeSearchMovie(q, lang, region, year);
    const best1 = this.pickBestMovie(q, year, try1);
    if (best1) return best1;

    const try2 = await this.safeSearchMovie(q, lang, region, null);
    return this.pickBestMovie(q, year, try2);
  }

  private async safeSearchMovie(
    query: string,
    language: string,
    region: string,
    year: number | null,
  ): Promise<TmdbMovieResult[]> {
    try {
      const res = await this.tmdb.searchMovie({
        query,
        page: 1,
        language,
        region,
        includeAdult: false,
        year: year ?? undefined,
        primaryReleaseYear: year ?? undefined,
      });
      return Array.isArray(res.results) ? res.results : [];
    } catch {
      return [];
    }
  }

  private pickBestMovie(
    keyword: string,
    year: number | null,
    candidates: TmdbMovieResult[],
  ): TmdbMovieResult | null {
    if (candidates.length === 0) return null;

    const nk = normTitle(keyword);

    let best: { item: TmdbMovieResult; score: number } | null = null;

    for (const c of candidates) {
      const title = c.title ?? '';
      const org = c.original_title ?? '';
      const nt = normTitle(title);
      const no = normTitle(org);

      let score = 0;

      if (nt === nk) score += 120;
      else if (nt.includes(nk) || nk.includes(nt)) score += 70;

      if (no && (no === nk || no.includes(nk) || nk.includes(no))) score += 40;

      if (year) {
        const cy = yearFromReleaseDate(c.release_date) ?? null;
        if (cy !== null) {
          const diff = Math.abs(cy - year);
          if (diff === 0) score += 35;
          else if (diff === 1) score += 15;
          else if (diff >= 3) score -= 15;
        }
      }

      score += (c.popularity ?? 0) * 0.05;
      score += Math.log10((c.vote_count ?? 0) + 1) * 3;

      if (!best || score > best.score) best = { item: c, score };
    }

    if (!best) return null;
    if (best.score < 60) return null;

    return best.item;
  }

  // -----------------------------
  // KOBIS window fetch (유니크 후보 확장)
  // -----------------------------

  private ymdMinusDays(ymd: string, days: number): string {
    const y = Number(ymd.slice(0, 4));
    const m = Number(ymd.slice(4, 6));
    const d = Number(ymd.slice(6, 8));
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() - days);
    const yy = base.getUTCFullYear();
    const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(base.getUTCDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  private async fetchKobisWindow(targetYmd: string): Promise<{
    items: KobisDailyBoxOfficeItem[];
    perDayCounts: Record<string, number>;
    uniqueCount: number;
    selectedCount: number;
  }> {
    const perDayCounts: Record<string, number> = {};

    // movieCd 기준 유니크
    const byMovieCd = new Map<
      string,
      KobisDailyBoxOfficeItem & { _rankNum: number; _audiAccNum: number }
    >();

    for (let offset = 0; offset < this.KOBIS_WINDOW_DAYS; offset++) {
      const day = this.ymdMinusDays(targetYmd, offset);
      const list = await this.fetchKobisDaily(day, this.KOBIS_DAILY_TOP);
      perDayCounts[day] = list.length;

      for (const it of list) {
        if (!it?.movieCd) continue;

        const rankNum = safeNumber(it.rank, 999);
        const audiAccNum = safeNumber(it.audiAcc, 0);

        const prev = byMovieCd.get(it.movieCd);
        if (!prev) {
          byMovieCd.set(it.movieCd, {
            ...it,
            _rankNum: rankNum,
            _audiAccNum: audiAccNum,
          });
          continue;
        }

        // ✅ window 내에서 “더 좋은 rank / 더 큰 누적관객”으로 갱신
        const betterRank = rankNum < prev._rankNum;
        const betterAudi = audiAccNum > prev._audiAccNum;

        if (betterRank || betterAudi) {
          byMovieCd.set(it.movieCd, {
            ...it,
            rank: betterRank ? it.rank : prev.rank,
            audiAcc: betterAudi ? it.audiAcc : prev.audiAcc,
            openDt: prev.openDt || it.openDt,
            movieNm: prev.movieNm || it.movieNm,
            _rankNum: Math.min(prev._rankNum, rankNum),
            _audiAccNum: Math.max(prev._audiAccNum, audiAccNum),
          });
        }
      }

      // ✅ 유니크 후보가 50개 채워지면 더 이상 KOBIS 호출 X
      if (byMovieCd.size >= this.KOBIS_CANDIDATE_LIMIT) break;
    }

    const all = Array.from(byMovieCd.values());
    all.sort(
      (a, b) => a._rankNum - b._rankNum || b._audiAccNum - a._audiAccNum,
    );

    const sliced = all.slice(0, this.KOBIS_CANDIDATE_LIMIT).map((x) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _rankNum, _audiAccNum, ...rest } = x;
      return rest;
    });

    return {
      items: sliced,
      perDayCounts,
      uniqueCount: byMovieCd.size,
      selectedCount: sliced.length,
    };
  }

  // -----------------------------
  // External fetchers
  // -----------------------------

  private async fetchKobisDaily(
    date: string,
    itemPerPage: number,
  ): Promise<KobisDailyBoxOfficeItem[]> {
    const apiKey = this.config.get<string>('KOBIS_API_KEY') ?? '';
    if (!apiKey)
      throw new ServiceUnavailableException('KOBIS_API_KEY is not set');

    const url =
      'https://kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json';

    const { data } = await firstValueFrom(
      this.http.get<KobisDailyBoxOfficeResponse>(url, {
        params: {
          key: apiKey,
          targetDt: date,
          itemPerPage: clamp(itemPerPage, 10, 100),
        },
        timeout: 10_000,
      }),
    );

    return data.boxOfficeResult?.dailyBoxOfficeList ?? [];
  }

  private async collectNaverSearch(
    keywords: string[],
  ): Promise<Map<string, { blog: number; cafe: number; news: number }>> {
    const clientId = this.config.get<string>('NAVER_SEARCH_CLIENT_ID') ?? '';
    const clientSecret =
      this.config.get<string>('NAVER_SEARCH_CLIENT_SECRET') ?? '';

    const out = new Map<string, { blog: number; cafe: number; news: number }>();
    if (!clientId || !clientSecret) {
      for (const k of keywords) out.set(k, { blog: 0, cafe: 0, news: 0 });
      return out;
    }

    const call = async (
      type: 'blog' | 'cafearticle' | 'news',
      query: string,
    ): Promise<number> => {
      const url = `https://openapi.naver.com/v1/search/${type}.json`;
      try {
        const { data } = await firstValueFrom(
          this.http.get<NaverSearchResponse>(url, {
            params: { query, display: 1, start: 1, sort: 'sim' },
            headers: {
              'X-Naver-Client-Id': clientId,
              'X-Naver-Client-Secret': clientSecret,
            },
            timeout: 10_000,
          }),
        );
        return safeNumber(data.total, 0);
      } catch {
        return 0;
      }
    };

    const results = await mapLimit(keywords, 3, async (k) => {
      const [blog, cafe, news] = await Promise.all([
        call('blog', k),
        call('cafearticle', k),
        call('news', k),
      ]);
      return { k, blog, cafe, news };
    });

    for (const r of results)
      out.set(r.k, { blog: r.blog, cafe: r.cafe, news: r.news });
    return out;
  }

  private async collectNaverDatalab(
    dateYmd: string,
    keywords: string[],
  ): Promise<Map<string, number>> {
    const clientId = this.config.get<string>('NAVER_DATALAB_CLIENT_ID') ?? '';
    const clientSecret =
      this.config.get<string>('NAVER_DATALAB_CLIENT_SECRET') ?? '';
    const out = new Map<string, number>();

    if (!clientId || !clientSecret) {
      for (const k of keywords) out.set(k, 0);
      return out;
    }

    const end = `${dateYmd.slice(0, 4)}-${dateYmd.slice(4, 6)}-${dateYmd.slice(6, 8)}`;
    const start = (() => {
      const y = Number(dateYmd.slice(0, 4));
      const m = Number(dateYmd.slice(4, 6));
      const d = Number(dateYmd.slice(6, 8));
      const base = new Date(Date.UTC(y, m - 1, d));
      base.setUTCDate(base.getUTCDate() - 6);
      const yy = base.getUTCFullYear();
      const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(base.getUTCDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    })();

    const url = 'https://openapi.naver.com/v1/datalab/search';
    const batchSize = 5;

    for (let i = 0; i < keywords.length; i += batchSize) {
      const batch = keywords.slice(i, i + batchSize);

      const body = {
        startDate: start,
        endDate: end,
        timeUnit: 'date',
        keywordGroups: batch.map((k) => ({ groupName: k, keywords: [k] })),
      };

      try {
        const { data } = await firstValueFrom(
          this.http.post<NaverDataLabResponse>(url, body, {
            headers: {
              'X-Naver-Client-Id': clientId,
              'X-Naver-Client-Secret': clientSecret,
              'Content-Type': 'application/json',
            },
            timeout: 12_000,
          }),
        );

        const results = data.results ?? [];
        for (const r of results) {
          const last = r.data[r.data.length - 1];
          out.set(r.title, last ? safeNumber(last.ratio, 0) : 0);
        }
      } catch {
        for (const k of batch) out.set(k, 0);
      }
    }

    for (const k of keywords) if (!out.has(k)) out.set(k, 0);
    return out;
  }

  private async collectYoutube(
    keywords: string[],
  ): Promise<Map<string, { totalResults: number; itemsCount: number }>> {
    const apiKey = this.config.get<string>('YOUTUBE_API_KEY') ?? '';
    const out = new Map<string, { totalResults: number; itemsCount: number }>();

    if (!apiKey) {
      for (const k of keywords) out.set(k, { totalResults: 0, itemsCount: 0 });
      return out;
    }

    const url = 'https://www.googleapis.com/youtube/v3/search';

    const results = await mapLimit(keywords, 3, async (k) => {
      try {
        const q = `${k} 예고편`;
        const { data } = await firstValueFrom(
          this.http.get<YoutubeSearchResponse>(url, {
            params: {
              key: apiKey,
              part: 'snippet',
              q,
              regionCode: 'KR',
              maxResults: 10,
              type: 'video',
              safeSearch: 'none',
            },
            timeout: 12_000,
          }),
        );

        const totalResults = safeNumber(data.pageInfo?.totalResults, 0);
        const itemsCount = Array.isArray(data.items) ? data.items.length : 0;
        return { k, totalResults, itemsCount };
      } catch {
        return { k, totalResults: 0, itemsCount: 0 };
      }
    });

    for (const r of results)
      out.set(r.k, { totalResults: r.totalResults, itemsCount: r.itemsCount });
    return out;
  }

  private async getLatestRankDateOrYesterday(): Promise<string> {
    const latest = await this.prisma.trendRank.findFirst({
      where: { seed: { source: 'kobis', mediaType: 'movie' } },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    return latest?.date ?? kstYmdOffset(-1);
  }

  // -----------------------------
  // Fallback: seed-only rank
  // -----------------------------

  private async persistSeedOnlyRank(
    date: string,
    seeds: SeedRow[],
  ): Promise<number> {
    const list = seeds
      .slice()
      .sort((a, b) => a.kobisRank - b.kobisRank)
      .map((s, idx) => ({
        seedId: s.id,
        rank: idx + 1,
        score: 1 / Math.sqrt(Math.max(1, s.kobisRank)),
        kobisRank: s.kobisRank,
      }));

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const it of list) {
        await tx.trendRank.upsert({
          where: { seedId_date: { seedId: it.seedId, date } },
          create: {
            seedId: it.seedId,
            date,
            rank: it.rank,
            score: it.score,
            breakdown: {
              fallback: true,
              kobisRank: it.kobisRank,
              score: it.score,
            } as Prisma.InputJsonValue,
          },
          update: {
            rank: it.rank,
            score: it.score,
            breakdown: {
              fallback: true,
              kobisRank: it.kobisRank,
              score: it.score,
            } as Prisma.InputJsonValue,
          },
        });
      }
    });

    return list.length;
  }
}
