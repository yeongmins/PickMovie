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

@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  assertIngestToken(token?: string): void {
    const required = this.config.get<string>('TRENDS_INGEST_TOKEN') ?? '';
    if (!required) return;
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

    type Row = Prisma.TrendRankGetPayload<{ include: { seed: true } }>;

    const rows = (await this.prisma.trendRank.findMany({
      where: { date, seed: { source: 'kobis', mediaType: 'movie' } },
      orderBy: [{ score: 'desc' }, { rank: 'asc' }],
      take: limit,
      include: { seed: true },
    })) as Row[];

    return {
      date,
      items: rows.map((r) => ({
        id: r.seed.id,
        keyword: r.seed.keyword,
        source: r.seed.source as TrendSource,
        mediaType: r.seed.mediaType as TrendMediaType,
        rank: r.rank,
        score: r.score,
        tmdbId: r.seed.tmdbId ?? null,
        year: r.seed.year ?? null,
      })),
    };
  }

  // ✅ 기존 컨트롤러 엔드포인트 유지용 래퍼
  async ingestKobisDaily(
    targetDt?: string,
  ): Promise<{ date: string; total: number }> {
    return this.ingestDailyKrTrends(targetDt);
  }

  // ✅ KOBIS seed + NAVER(커뮤니티/뉴스) + YouTube(예고편/관심) 결합 점수 저장
  async ingestDailyKrTrends(
    targetDt?: string,
  ): Promise<{ date: string; total: number }> {
    const date = targetDt && isYmd8(targetDt) ? targetDt : kstYmdOffset(-1);

    const kobisList = await this.fetchKobisDaily(date);
    if (kobisList.length === 0) {
      throw new ServiceUnavailableException(
        `KOBIS returned empty list for ${date}`,
      );
    }

    const source: TrendSource = 'kobis';
    const mediaType: TrendMediaType = 'movie';

    const seeds = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const created: Array<{
          id: number;
          keyword: string;
          year: number | null;
          kobisRank: number;
          audiAcc: number;
          movieCd: string;
        }> = [];

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
          };

          const seed = await tx.trendSeed.upsert({
            where: { keyword_source_mediaType: { keyword, source, mediaType } },
            create: { keyword, source, mediaType, year, raw },
            update: { year, raw },
          });

          created.push({
            id: seed.id,
            keyword,
            year: seed.year ?? null,
            kobisRank,
            audiAcc,
            movieCd: item.movieCd,
          });
        }
        return created;
      },
    );

    const naverSearch = await this.collectNaverSearch(
      seeds.map((s) => s.keyword),
    );
    const naverDatalab = await this.collectNaverDatalab(
      date,
      seeds.map((s) => s.keyword),
    );
    const youtube = await this.collectYoutube(seeds.map((s) => s.keyword));

    const rows = seeds.map((s) => {
      const ns = naverSearch.get(s.keyword) ?? { blog: 0, cafe: 0, news: 0 };
      const dl = naverDatalab.get(s.keyword) ?? 0;
      const yt = youtube.get(s.keyword) ?? { totalResults: 0, itemsCount: 0 };

      return {
        seedId: s.id,
        keyword: s.keyword,
        kobisRank: s.kobisRank,
        audiAcc: s.audiAcc,
        naverBlog: ns.blog,
        naverCafe: ns.cafe,
        naverNews: ns.news,
        naverDatalabRatio: dl,
        youtubeTotal: yt.totalResults,
        youtubeItems: yt.itemsCount,
      };
    });

    const m_kobis = rows.map((r) => 1 / Math.max(1, r.kobisRank));
    const m_dl = rows.map((r) => r.naverDatalabRatio);
    const m_cafe = rows.map((r) => logScore(r.naverCafe));
    const m_blog = rows.map((r) => logScore(r.naverBlog));
    const m_news = rows.map((r) => logScore(r.naverNews));
    const m_yt = rows.map((r) => logScore(r.youtubeTotal));

    const p_kobis = zParams(m_kobis);
    const p_dl = zParams(m_dl);
    const p_cafe = zParams(m_cafe);
    const p_blog = zParams(m_blog);
    const p_news = zParams(m_news);
    const p_yt = zParams(m_yt);

    const W = {
      kobis: 0.25,
      datalab: 0.25,
      cafe: 0.2,
      blog: 0.1,
      news: 0.1,
      youtube: 0.1,
    } as const;

    const scored = rows.map((r) => {
      const kobisVal = 1 / Math.max(1, r.kobisRank);
      const dlVal = r.naverDatalabRatio;
      const cafeVal = logScore(r.naverCafe);
      const blogVal = logScore(r.naverBlog);
      const newsVal = logScore(r.naverNews);
      const ytVal = logScore(r.youtubeTotal);

      const zKobis = zScore(kobisVal, p_kobis.mean, p_kobis.std);
      const zDl = zScore(dlVal, p_dl.mean, p_dl.std);
      const zCafe = zScore(cafeVal, p_cafe.mean, p_cafe.std);
      const zBlog = zScore(blogVal, p_blog.mean, p_blog.std);
      const zNews = zScore(newsVal, p_news.mean, p_news.std);
      const zYt = zScore(ytVal, p_yt.mean, p_yt.std);

      const score =
        W.kobis * zKobis +
        W.datalab * zDl +
        W.cafe * zCafe +
        W.blog * zBlog +
        W.news * zNews +
        W.youtube * zYt;

      const breakdown: Prisma.InputJsonValue = {
        weights: W,
        metrics: {
          kobis: {
            rank: r.kobisRank,
            invRank: kobisVal,
            z: zKobis,
            audiAcc: r.audiAcc,
          },
          naver: {
            datalabRatio: { value: dlVal, z: zDl },
            cafeTotal: { value: r.naverCafe, log: cafeVal, z: zCafe },
            blogTotal: { value: r.naverBlog, log: blogVal, z: zBlog },
            newsTotal: { value: r.naverNews, log: newsVal, z: zNews },
          },
          youtube: {
            totalResults: { value: r.youtubeTotal, log: ytVal, z: zYt },
            itemsCount: r.youtubeItems,
          },
        },
      };

      return { seedId: r.seedId, keyword: r.keyword, score, breakdown };
    });

    scored.sort((a, b) => b.score - a.score);

    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        let total = 0;
        for (let i = 0; i < scored.length; i++) {
          const it = scored[i];
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

    this.logger.log(`KR Trends ingest done: ${result.date} (${result.total})`);
    return result;
  }

  private async fetchKobisDaily(
    date: string,
  ): Promise<KobisDailyBoxOfficeItem[]> {
    const apiKey = this.config.get<string>('KOBIS_API_KEY') ?? '';
    if (!apiKey)
      throw new ServiceUnavailableException('KOBIS_API_KEY is not set');

    const url =
      'https://kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json';

    const { data } = await firstValueFrom(
      this.http.get<KobisDailyBoxOfficeResponse>(url, {
        params: { key: apiKey, targetDt: date, itemPerPage: 10 },
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
}
