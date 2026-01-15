// backend/src/home-charts/home-charts.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { MetaService } from '../meta/meta.service';
import type { HomeChartItem, HomeChartsResponse } from './home-charts.types';
import { HomeCollectionKey, Prisma } from '../generated/prisma';

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
    out.push({ mediaType, tmdbId, rank });
  }

  return out;
}

@Injectable()
export class HomeChartsService {
  private readonly tmdbBaseUrl = 'https://api.themoviedb.org/3';

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

  async getCharts(): Promise<HomeChartsResponse> {
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

    return { collections: keys.map(build) };
  }

  async refreshAllCharts(): Promise<void> {
    const limit = Number(this.config.get<string>('HOME_CHARTS_LIMIT') ?? '20');
    const apiKey = this.tmdbKey();

    const [popularMovie, popularTv, trendingMovie, trendingTv] =
      await Promise.all([
        this.fetchList('/movie/popular', apiKey, limit, 'movie'),
        this.fetchList('/tv/popular', apiKey, limit, 'tv'),
        this.fetchTrending('/trending/movie/day', apiKey, limit, 'movie'),
        this.fetchTrending('/trending/tv/day', apiKey, limit, 'tv'),
      ]);

    await Promise.all([
      this.upsertSnapshot(HomeCollectionKey.POPULAR_MOVIE, popularMovie),
      this.upsertSnapshot(HomeCollectionKey.POPULAR_TV, popularTv),
      this.upsertSnapshot(HomeCollectionKey.TRENDING_MOVIE, trendingMovie),
      this.upsertSnapshot(HomeCollectionKey.TRENDING_TV, trendingTv),
    ]);

    const all = [
      ...popularMovie,
      ...popularTv,
      ...trendingMovie,
      ...trendingTv,
    ];
    await this.meta.resolveBatch(
      all.map((x) => ({ mediaType: x.mediaType, tmdbId: x.tmdbId })),
    );
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

    for (let i = 0; i < Math.min(limit, results.length); i += 1) {
      const r = results[i];
      if (!isRecord(r)) continue;
      const id = asNumber(r['id']);
      if (!id) continue;
      items.push({ mediaType, tmdbId: id, rank: i + 1 });
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

    for (let i = 0; i < Math.min(limit, results.length); i += 1) {
      const r = results[i];
      if (!isRecord(r)) continue;
      const id = asNumber(r['id']);
      if (!id) continue;
      items.push({ mediaType, tmdbId: id, rank: i + 1 });
    }

    return items;
  }

  private async upsertSnapshot(
    key: HomeCollectionKey,
    items: HomeChartItem[],
  ): Promise<void> {
    // Prisma JSON 타입에 안전하게 들어가는 “순수 JSON”으로 변환
    const jsonItems: Prisma.InputJsonValue = items.map((x) => ({
      mediaType: x.mediaType,
      tmdbId: x.tmdbId,
      rank: x.rank,
    }));

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
