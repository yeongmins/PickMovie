// backend/src/home-charts/home-charts.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { MetaService } from '../meta/meta.service';
import type { HomeChartItem, HomeChartsResponse } from './home-charts.types';
import { HomeCollectionKey, Prisma } from '../generated/prisma';
import { isBlockedContentByPolicy } from '../common/content-policy';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parseHomeChartItems(v: unknown): HomeChartItem[] {
  if (!Array.isArray(v)) return [];
  const out: HomeChartItem[] = [];

  for (const it of v) {
    if (!isRecord(it)) continue;
    const mediaType = asString(it['mediaType']);
    const tmdbId = asNumber(it['tmdbId']);
    const rank = asNumber(it['rank']);
    if ((mediaType !== 'movie' && mediaType !== 'tv') || !tmdbId || !rank) {
      continue;
    }
    out.push({
      mediaType,
      tmdbId,
      rank,
      title: asString(it['title']) || undefined,
      name: asString(it['name']) || undefined,
      original_title: asString(it['original_title']) || undefined,
      original_name: asString(it['original_name']) || undefined,
      overview: asString(it['overview']) || undefined,
      poster_path: asNullableString(it['poster_path']),
      backdrop_path: asNullableString(it['backdrop_path']),
      vote_average: asNumber(it['vote_average']) ?? undefined,
      release_date: asString(it['release_date']) || undefined,
      first_air_date: asString(it['first_air_date']) || undefined,
    });
  }

  return out;
}

@Injectable()
export class HomeChartsService {
  private readonly tmdbBaseUrl = 'https://api.themoviedb.org/3';
  private chartsCache: HomeChartsResponse | null = null;
  private chartsCacheExpiresAt = 0;
  private keywordSoftcoreCache = new Map<string, boolean>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: MetaService,
  ) {}

  private tmdbKey(): string {
    const key = this.config.get<string>('TMDB_API_KEY');
    if (!key) throw new Error('TMDB_API_KEY is missing');
    return key;
  }

  private cloneCharts(src: HomeChartsResponse): HomeChartsResponse {
    return {
      collections: src.collections.map((c) => ({
        key: c.key,
        generatedAt: c.generatedAt,
        items: c.items.map((it) => ({ ...it })),
      })),
    };
  }

  private async applyContentPolicyToCharts(
    src: HomeChartsResponse,
    opts?: { viewerIsAdmin?: boolean },
  ): Promise<HomeChartsResponse> {
    if (opts?.viewerIsAdmin) return this.cloneCharts(src);
    const apiKey = this.tmdbKey();
    const collections: HomeChartsResponse['collections'] = [];
    for (const c of src.collections) {
      const items: HomeChartItem[] = [];
      for (const it of c.items) {
        if (isBlockedContentByPolicy(it, { viewerIsAdmin: false })) continue;
        const blockedByKeyword = await this.hasSoftcoreKeywordByTmdb(
          apiKey,
          it.mediaType,
          it.tmdbId,
        );
        if (blockedByKeyword) continue;
        items.push(it);
      }
      collections.push({
        ...c,
        items: items.map((it, idx) => ({ ...it, rank: idx + 1 })),
      });
    }
    return { collections };
  }

  private invalidateChartsCache(): void {
    this.chartsCache = null;
    this.chartsCacheExpiresAt = 0;
  }

  private async hasSoftcoreKeywordByTmdb(
    apiKey: string,
    mediaType: 'movie' | 'tv',
    tmdbId: number,
  ): Promise<boolean> {
    const key = `${mediaType}:${tmdbId}`;
    if (this.keywordSoftcoreCache.has(key)) {
      return this.keywordSoftcoreCache.get(key) ?? false;
    }

    const path =
      mediaType === 'movie'
        ? `/movie/${tmdbId}/keywords`
        : `/tv/${tmdbId}/keywords`;
    const url = `${this.tmdbBaseUrl}${path}`;
    const resp = await axios.get<unknown>(url, {
      params: { api_key: apiKey },
      timeout: 8_000,
      validateStatus: () => true,
    });
    if (resp.status < 200 || resp.status >= 300 || !isRecord(resp.data)) {
      this.keywordSoftcoreCache.set(key, false);
      return false;
    }

    const root = resp.data;
    const list = Array.isArray(root['keywords'])
      ? root['keywords']
      : Array.isArray(root['results'])
        ? root['results']
        : [];

    let blocked = false;
    for (const it of list) {
      if (!isRecord(it)) continue;
      const name = asString(it['name']).toLowerCase();
      if (name.includes('softcore')) {
        blocked = true;
        break;
      }
    }

    this.keywordSoftcoreCache.set(key, blocked);
    return blocked;
  }

  async getCharts(opts?: { viewerIsAdmin?: boolean }): Promise<HomeChartsResponse> {
    const now = Date.now();
    if (this.chartsCache && now < this.chartsCacheExpiresAt) {
      return await this.applyContentPolicyToCharts(this.chartsCache, opts);
    }

    const keys: HomeCollectionKey[] = [
      HomeCollectionKey.POPULAR_MOVIE,
      HomeCollectionKey.POPULAR_TV,
      HomeCollectionKey.TRENDING_MOVIE,
      HomeCollectionKey.TRENDING_TV,
    ];

    const rows = await this.prisma.homeCollectionSnapshot.findMany({
      where: { key: { in: keys } },
    });

    const byKey = new Map<HomeCollectionKey, (typeof rows)[number]>();
    for (const r of rows) byKey.set(r.key, r);

    const build = (key: HomeCollectionKey) => {
      const row = byKey.get(key);
      const items = parseHomeChartItems(row?.items);
      return {
        key,
        generatedAt: row?.generatedAt
          ? row.generatedAt.toISOString()
          : new Date().toISOString(),
        items,
      };
    };

    const response: HomeChartsResponse = { collections: keys.map(build) };
    this.chartsCache = response;
    this.chartsCacheExpiresAt = now + 10_000;
    return await this.applyContentPolicyToCharts(response, opts);
  }

  async refreshAllCharts(): Promise<void> {
    this.invalidateChartsCache();

    const limit = Number(this.config.get<string>('HOME_CHARTS_LIMIT') ?? '20');
    const apiKey = this.tmdbKey();

    const [popularMovieRaw, popularTvRaw, trendingMovieRaw, trendingTvRaw] =
      await Promise.all([
        this.fetchList('/movie/popular', apiKey, limit, 'movie'),
        this.fetchList('/tv/popular', apiKey, limit, 'tv'),
        this.fetchTrending('/trending/movie/day', apiKey, limit, 'movie'),
        this.fetchTrending('/trending/tv/day', apiKey, limit, 'tv'),
      ]);

    const all = [
      ...popularMovieRaw,
      ...popularTvRaw,
      ...trendingMovieRaw,
      ...trendingTvRaw,
    ];

    const uniq = new Map<
      string,
      { mediaType: 'movie' | 'tv'; tmdbId: number }
    >();
    for (const x of all) {
      const k = `${x.mediaType}:${x.tmdbId}`;
      if (!uniq.has(k))
        uniq.set(k, { mediaType: x.mediaType, tmdbId: x.tmdbId });
    }

    await this.meta.resolveBatch([...uniq.values()]);

    await Promise.all([
      this.upsertSnapshot(HomeCollectionKey.POPULAR_MOVIE, popularMovieRaw),
      this.upsertSnapshot(HomeCollectionKey.POPULAR_TV, popularTvRaw),
      this.upsertSnapshot(HomeCollectionKey.TRENDING_MOVIE, trendingMovieRaw),
      this.upsertSnapshot(HomeCollectionKey.TRENDING_TV, trendingTvRaw),
    ]);

    this.invalidateChartsCache();
  }

  private async fetchList(
    path: string,
    apiKey: string,
    limit: number,
    mediaType: 'movie' | 'tv',
  ): Promise<HomeChartItem[]> {
    const url = `${this.tmdbBaseUrl}${path}`;
    const resp = await axios.get<unknown>(url, {
      params: { api_key: apiKey, language: 'ko-KR', page: 1, region: 'KR' },
      timeout: 10_000,
    });

    const data = resp.data;
    if (!isRecord(data)) return [];

    const results = asArray(data['results']);
    const items: HomeChartItem[] = [];

    for (let i = 0; i < results.length && items.length < limit; i += 1) {
      const r = results[i];
      if (!isRecord(r)) continue;
      const id = asNumber(r['id']);
      if (!id) continue;
      const blockedByKeyword = await this.hasSoftcoreKeywordByTmdb(
        apiKey,
        mediaType,
        id,
      );
      if (blockedByKeyword) continue;
      items.push({
        mediaType,
        tmdbId: id,
        rank: items.length + 1,
        title: asString(r['title']) || undefined,
        name: asString(r['name']) || undefined,
        original_title: asString(r['original_title']) || undefined,
        original_name: asString(r['original_name']) || undefined,
        overview: asString(r['overview']) || undefined,
        poster_path: asNullableString(r['poster_path']),
        backdrop_path: asNullableString(r['backdrop_path']),
        vote_average: asNumber(r['vote_average']) ?? undefined,
        release_date: asString(r['release_date']) || undefined,
        first_air_date: asString(r['first_air_date']) || undefined,
      });
    }

    return items;
  }

  private async fetchTrending(
    path: string,
    apiKey: string,
    limit: number,
    mediaType: 'movie' | 'tv',
  ): Promise<HomeChartItem[]> {
    const url = `${this.tmdbBaseUrl}${path}`;
    const resp = await axios.get<unknown>(url, {
      params: { api_key: apiKey, language: 'ko-KR' },
      timeout: 10_000,
    });

    const data = resp.data;
    if (!isRecord(data)) return [];

    const results = asArray(data['results']);
    const items: HomeChartItem[] = [];

    for (let i = 0; i < results.length && items.length < limit; i += 1) {
      const r = results[i];
      if (!isRecord(r)) continue;
      const id = asNumber(r['id']);
      if (!id) continue;
      const blockedByKeyword = await this.hasSoftcoreKeywordByTmdb(
        apiKey,
        mediaType,
        id,
      );
      if (blockedByKeyword) continue;
      items.push({
        mediaType,
        tmdbId: id,
        rank: items.length + 1,
        title: asString(r['title']) || undefined,
        name: asString(r['name']) || undefined,
        original_title: asString(r['original_title']) || undefined,
        original_name: asString(r['original_name']) || undefined,
        overview: asString(r['overview']) || undefined,
        poster_path: asNullableString(r['poster_path']),
        backdrop_path: asNullableString(r['backdrop_path']),
        vote_average: asNumber(r['vote_average']) ?? undefined,
        release_date: asString(r['release_date']) || undefined,
        first_air_date: asString(r['first_air_date']) || undefined,
      });
    }

    return items;
  }

  private async upsertSnapshot(
    key: HomeCollectionKey,
    items: HomeChartItem[],
  ): Promise<void> {
    // Prisma JSON 타입에 안전하게 들어가는 “순수 JSON”으로 변환
    const jsonItems = items.map(
      (x: HomeChartItem): Prisma.InputJsonObject => ({
        mediaType: x.mediaType,
        tmdbId: x.tmdbId,
        rank: x.rank,
        title: x.title ?? null,
        name: x.name ?? null,
        original_title: x.original_title ?? null,
        original_name: x.original_name ?? null,
        overview: x.overview ?? null,
        poster_path: x.poster_path ?? null,
        backdrop_path: x.backdrop_path ?? null,
        vote_average: x.vote_average ?? null,
        release_date: x.release_date ?? null,
        first_air_date: x.first_air_date ?? null,
      }),
    ) as Prisma.InputJsonValue;

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 6);

    await this.prisma.homeCollectionSnapshot.upsert({
      where: { key },
      update: {
        items: jsonItems,
        generatedAt: new Date(),
        expiresAt,
      },
      create: {
        key,
        items: jsonItems,
        generatedAt: new Date(),
        expiresAt,
      },
    });
  }
}
