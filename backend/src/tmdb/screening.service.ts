// backend/src/tmdb/screening.service.ts
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { KobisService } from '../kobis/kobis.service';

type TmdbNowUpcomingResp = { results?: Array<{ id?: number }> };

export type ScreeningSets = {
  nowPlaying: Set<number>;
  upcoming: Set<number>;
  fetchedAt: number;
};

export type UnionFlags = {
  isNowPlaying: boolean;
  isUpcoming: boolean;
};

function ensureLeadingSlash(path: string) {
  const p = String(path || '').trim();
  if (!p) return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

function parseIsoYmdToDayMs(iso: string): number | null {
  const s = String(iso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

@Injectable()
export class ScreeningService {
  private readonly logger = new Logger(ScreeningService.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;

  private cache: ScreeningSets | null = null;
  private inflight: Promise<ScreeningSets> | null = null;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly kobis: KobisService,
  ) {
    this.baseUrl = String(
      this.config.get('TMDB_BASE_URL') ?? 'https://api.themoviedb.org/3',
    )
      .trim()
      .replace(/\/+$/, '');

    this.apiKey = String(this.config.get('TMDB_API_KEY') ?? '').trim();
  }

  private async tmdbGet<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    if (!this.apiKey)
      throw new ServiceUnavailableException('TMDB_API_KEY is missing');

    const url = new URL(`${this.baseUrl}${ensureLeadingSlash(path)}`);
    url.searchParams.set('api_key', this.apiKey);

    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }

    const res = await firstValueFrom(this.http.get<T>(url.toString()));
    return res.data;
  }

  /** ✅ 컨트롤러가 찾는 메서드(호환) */
  async getScreeningSets(params?: {
    region?: string;
    language?: string;
    pages?: number;
  }): Promise<ScreeningSets> {
    const region = (params?.region ?? 'KR').toUpperCase();
    const language = params?.language ?? 'ko-KR';
    const pages = Math.min(Math.max(params?.pages ?? 5, 1), 10);

    const OK_TTL = 30 * 60 * 1000; // 30분
    const now = Date.now();

    if (this.cache && now - this.cache.fetchedAt < OK_TTL) return this.cache;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      const pageList = Array.from({ length: pages }, (_, i) => i + 1);

      const [nowList, upList] = await Promise.all([
        Promise.all(
          pageList.map(async (page) => {
            try {
              return await this.tmdbGet<TmdbNowUpcomingResp>(
                '/movie/now_playing',
                { page, region, language },
              );
            } catch {
              return { results: [] };
            }
          }),
        ),
        Promise.all(
          pageList.map(async (page) => {
            try {
              return await this.tmdbGet<TmdbNowUpcomingResp>(
                '/movie/upcoming',
                {
                  page,
                  region,
                  language,
                },
              );
            } catch {
              return { results: [] };
            }
          }),
        ),
      ]);

      const nowSet = new Set<number>();
      const upSet = new Set<number>();

      for (const r of nowList) {
        for (const it of r.results ?? []) {
          if (typeof it?.id === 'number') nowSet.add(it.id);
        }
      }
      for (const r of upList) {
        for (const it of r.results ?? []) {
          if (typeof it?.id === 'number') upSet.add(it.id);
        }
      }

      const sets: ScreeningSets = {
        nowPlaying: nowSet,
        upcoming: upSet,
        fetchedAt: Date.now(),
      };

      this.cache = sets;
      this.inflight = null;
      return sets;
    })().catch((e: unknown) => {
      this.inflight = null;
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[screening] getScreeningSets failed: ${msg}`);
      throw e;
    });

    return this.inflight;
  }

  /**
   * ✅ TMDB + KOBIS 합집합(현실 버전)
   * - 예정(upcoming) 우선
   * - nowPlaying은:
   *   (TMDB now) OR (KOBIS 박스오피스 등장) OR (KOBIS 개봉일이 최근 N일 이내)
   */
  async computeUnionFlags(params: {
    tmdbId: number;
    kobisMovieCd: string | null;
    kobisOpenDt: string | null; // YYYY-MM-DD
    region: string;
    language: string;
    kobisBoxOfficeDays?: number; // default 7
    nowWindowDays?: number; // default 150 (장기상영 커버)
  }): Promise<UnionFlags> {
    const {
      tmdbId,
      kobisMovieCd,
      kobisOpenDt,
      region,
      language,
      kobisBoxOfficeDays = 7,
      nowWindowDays = 150,
    } = params;

    const sets = await this.getScreeningSets({ region, language });

    const tmdbNow = sets.nowPlaying.has(tmdbId);
    const tmdbUp = sets.upcoming.has(tmdbId);

    // 1) KOBIS upcoming: openDt 미래면 예정
    let kobisUp = false;
    const openMs = kobisOpenDt ? parseIsoYmdToDayMs(kobisOpenDt) : null;
    if (openMs !== null) {
      const todayMs = Math.floor(Date.now() / 86400000) * 86400000;
      const diffDays = Math.floor((todayMs - openMs) / 86400000);
      if (diffDays < 0) kobisUp = true;
    }

    // 2) KOBIS nowPlaying(강한 증거): 최근 박스오피스(Top10) 등장
    let kobisNowByBoxOffice = false;
    if (kobisMovieCd) {
      try {
        const set = await this.kobis.getNowPlayingMovieCds(kobisBoxOfficeDays);
        kobisNowByBoxOffice = set.has(kobisMovieCd);
      } catch {
        kobisNowByBoxOffice = false;
      }
    }

    // 3) KOBIS nowPlaying(현실 fallback): 개봉 후 N일 이내면 상영중 “추정”
    let kobisNowByWindow = false;
    if (openMs !== null) {
      const todayMs = Math.floor(Date.now() / 86400000) * 86400000;
      const diffDays = Math.floor((todayMs - openMs) / 86400000);
      if (diffDays >= 0 && diffDays <= nowWindowDays) kobisNowByWindow = true;
    }

    // ✅ 합집합(예정 우선)
    const isUpcoming = tmdbUp || kobisUp;
    const isNowPlaying =
      !isUpcoming && (tmdbNow || kobisNowByBoxOffice || kobisNowByWindow);

    return { isNowPlaying, isUpcoming };
  }
}
