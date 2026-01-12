// backend/src/tmdb/tmdb.service.ts
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { KobisService } from '../kobis/kobis.service';
import { ScreeningService } from './screening.service';
import { MemoryCache } from '../common/memoryCache';

import type { TmdbMovieResult, TmdbMultiResult } from './tmdb.types';

export type MediaType = 'movie' | 'tv';

/** ✅ controllers에서 import하는 타입(호환 유지) */
export type TmdbQuery = Record<string, string | number | boolean | undefined>;

type TmdbPagedResponse<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

type TmdbProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
};

type WatchProviderRegion = {
  link?: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
};

type WatchProvidersResponse = {
  results?: Record<string, WatchProviderRegion>;
};

type TmdbReleaseDatesResponse = {
  results?: Array<{
    iso_3166_1: string;
    release_dates: Array<{
      certification: string;
      type: number;
      release_date: string;
      note?: string;
    }>;
  }>;
};

type TmdbTvContentRatingsResponse = {
  results?: Array<{
    iso_3166_1: string;
    rating: string;
  }>;
};

type TmdbMetaResponse = Record<string, unknown> & {
  providers: TmdbProvider[];
  ageRating: string | null;
  kobisOpenDt: string | null; // YYYY-MM-DD
  kobisMovieCd: string | null;
  isNowPlaying?: boolean;
  isUpcoming?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

function getNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toIsoYmd(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  // "YYYY-MM-DD..." 형태면 앞 10자리 사용
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function ensureLeadingSlash(path: string) {
  const p = String(path || '').trim();
  if (!p) return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

function normalizeIso639_1(language?: string): string {
  const raw = String(language || '').trim();
  if (!raw) return 'ko';
  // "ko-KR" -> "ko"
  const [a] = raw.split('-');
  return (a || raw).toLowerCase();
}

function mergeUniqueProviders(list: TmdbProvider[]): TmdbProvider[] {
  const seen = new Set<number>();
  const out: TmdbProvider[] = [];
  for (const p of list) {
    if (!p || typeof p.provider_id !== 'number') continue;
    if (seen.has(p.provider_id)) continue;
    seen.add(p.provider_id);
    out.push(p);
  }
  return out;
}

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;

  private readonly metaCache = new MemoryCache({
    defaultTtlMs: 60 * 1000,
    negativeTtlMs: 15 * 1000,
    maxEntries: 10_000,
  });

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly kobis: KobisService,
    private readonly screening: ScreeningService,
  ) {
    this.baseUrl = String(
      this.config.get('TMDB_BASE_URL') ?? 'https://api.themoviedb.org/3',
    )
      .trim()
      .replace(/\/+$/, '');

    this.apiKey = String(this.config.get('TMDB_API_KEY') ?? '').trim();
  }

  /* =========================
     Core requester
  ========================= */

  private async tmdbGet<T>(path: string, params: TmdbQuery = {}): Promise<T> {
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

  private async tmdbGetOrNull<T>(
    path: string,
    params: TmdbQuery = {},
  ): Promise<T | null> {
    try {
      return await this.tmdbGet<T>(path, params);
    } catch (e: unknown) {
      if (process.env.NODE_ENV !== 'production') {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[TMDB] GET failed: ${path} (${msg})`);
      }
      return null;
    }
  }

  private normalizePaged<T>(raw: unknown): TmdbPagedResponse<T> {
    if (!isRecord(raw)) {
      return { page: 1, results: [], total_pages: 1, total_results: 0 };
    }

    const page = getNumber(raw, 'page') ?? 1;
    const total_pages = getNumber(raw, 'total_pages') ?? 1;
    const total_results = getNumber(raw, 'total_results') ?? 0;

    const resultsRaw = raw.results;
    const results = Array.isArray(resultsRaw) ? (resultsRaw as T[]) : [];

    return { page, results, total_pages, total_results };
  }

  /* =========================
     ✅ Controllers 호환: proxy / images / videos / similar / discover / search
  ========================= */

  /** /tmdb/proxy 용 */
  async proxy(path: string, query: TmdbQuery = {}): Promise<unknown> {
    return await this.tmdbGetOrNull<unknown>(ensureLeadingSlash(path), query);
  }

  /**
   * ✅ getImages 호환
   * - getImages(type, id, "ko-KR")
   * - getImages(type, id, { includeImageLanguage: "ko,en,null" })
   */
  async getImages(
    type: MediaType,
    id: number,
    languageOrOpts?:
      | string
      | { includeImageLanguage?: string; language?: string },
  ): Promise<unknown> {
    const mt: MediaType = type === 'tv' ? 'tv' : 'movie';

    let includeImageLanguage = '';
    if (typeof languageOrOpts === 'string') {
      const iso = normalizeIso639_1(languageOrOpts);
      includeImageLanguage = `${iso},en,null`;
    } else if (languageOrOpts && typeof languageOrOpts === 'object') {
      if (typeof languageOrOpts.includeImageLanguage === 'string') {
        includeImageLanguage = languageOrOpts.includeImageLanguage;
      } else {
        const iso = normalizeIso639_1(languageOrOpts.language ?? 'ko-KR');
        includeImageLanguage = `${iso},en,null`;
      }
    } else {
      includeImageLanguage = 'ko,en,null';
    }

    return await this.tmdbGetOrNull<unknown>(`/${mt}/${id}/images`, {
      include_image_language: includeImageLanguage,
    });
  }

  async getVideos(
    type: MediaType,
    id: number,
    language = 'ko-KR',
  ): Promise<unknown> {
    const mt: MediaType = type === 'tv' ? 'tv' : 'movie';
    return await this.tmdbGetOrNull<unknown>(`/${mt}/${id}/videos`, {
      language,
    });
  }

  async getSimilar(
    type: MediaType,
    id: number,
    page = 1,
    language = 'ko-KR',
  ): Promise<TmdbPagedResponse<unknown>> {
    const mt: MediaType = type === 'tv' ? 'tv' : 'movie';
    const raw = await this.tmdbGetOrNull<unknown>(`/${mt}/${id}/similar`, {
      page,
      language,
    });
    return this.normalizePaged<unknown>(raw);
  }

  async discoverMovies(query: TmdbQuery): Promise<TmdbPagedResponse<unknown>> {
    const raw = await this.tmdbGetOrNull<unknown>('/discover/movie', query);
    return this.normalizePaged<unknown>(raw);
  }

  async searchMovie(params: {
    query: string;
    page?: number;
    language?: string;
    region?: string;
    includeAdult?: boolean;
    year?: number;
    primaryReleaseYear?: number;
  }): Promise<TmdbPagedResponse<TmdbMovieResult>> {
    const raw = await this.tmdbGetOrNull<unknown>('/search/movie', {
      query: params.query,
      page: params.page ?? 1,
      language: params.language ?? 'ko-KR',
      region: params.region ?? 'KR',
      include_adult: params.includeAdult ?? false,
      year: params.year,
      primary_release_year: params.primaryReleaseYear,
    });
    return this.normalizePaged<TmdbMovieResult>(raw);
  }

  async multiSearch(params: {
    query: string;
    page?: number;
    language?: string;
    region?: string;
    includeAdult?: boolean;
  }): Promise<TmdbPagedResponse<TmdbMultiResult>> {
    const raw = await this.tmdbGetOrNull<unknown>('/search/multi', {
      query: params.query,
      page: params.page ?? 1,
      language: params.language ?? 'ko-KR',
      region: params.region ?? 'KR',
      include_adult: params.includeAdult ?? false,
    });
    return this.normalizePaged<TmdbMultiResult>(raw);
  }

  /** ✅ movies.controller 가 찾는 이름 그대로 제공 */
  async searchMulti(params: {
    query: string;
    page?: number;
    language?: string;
    region?: string;
    includeAdult?: boolean;
  }): Promise<TmdbPagedResponse<TmdbMultiResult>> {
    return await this.multiSearch(params);
  }

  /* =========================
     ✅ MoviesService가 기대하는 메서드들(기능 복구)
  ========================= */

  async getPopularMovies(page = 1, region = 'KR', language = 'ko-KR') {
    const raw = await this.tmdbGetOrNull<unknown>('/movie/popular', {
      page,
      region,
      language,
    });
    return this.normalizePaged<unknown>(raw);
  }

  async getTopRatedMovies(page = 1, region = 'KR', language = 'ko-KR') {
    const raw = await this.tmdbGetOrNull<unknown>('/movie/top_rated', {
      page,
      region,
      language,
    });
    return this.normalizePaged<unknown>(raw);
  }

  async getNowPlayingMovies(page = 1, region = 'KR', language = 'ko-KR') {
    const raw = await this.tmdbGetOrNull<unknown>('/movie/now_playing', {
      page,
      region,
      language,
    });
    return this.normalizePaged<unknown>(raw);
  }

  async getUpcomingMovies(page = 1, region = 'KR', language = 'ko-KR') {
    const raw = await this.tmdbGetOrNull<unknown>('/movie/upcoming', {
      page,
      region,
      language,
    });
    return this.normalizePaged<unknown>(raw);
  }

  async getPopularTVShows(page = 1, language = 'ko-KR') {
    const raw = await this.tmdbGetOrNull<unknown>('/tv/popular', {
      page,
      language,
    });
    return this.normalizePaged<unknown>(raw);
  }

  async getMovieDetails(id: number, language = 'ko-KR'): Promise<unknown> {
    return await this.tmdbGetOrNull<unknown>(`/movie/${id}`, { language });
  }

  async getTVDetails(id: number, language = 'ko-KR'): Promise<unknown> {
    return await this.tmdbGetOrNull<unknown>(`/tv/${id}`, { language });
  }

  /* =========================
     Meta (TMDB + KOBIS) : /tmdb/meta 단일 소스
  ========================= */

  private pickProvidersKR(wp: WatchProvidersResponse | null, region = 'KR') {
    const block = wp?.results?.[region] ?? null;
    if (!block) return { providers: [] as TmdbProvider[] };

    const merged = mergeUniqueProviders([
      ...(block.flatrate ?? []),
      ...(block.free ?? []),
      ...(block.ads ?? []),
      ...(block.rent ?? []),
      ...(block.buy ?? []),
    ]);

    return { providers: merged };
  }

  private pickMovieAgeRatingKR(raw: TmdbReleaseDatesResponse | null): string {
    const row = (raw?.results ?? []).find((r) => r.iso_3166_1 === 'KR');
    if (!row?.release_dates?.length) return '';

    const sorted = [...row.release_dates].sort((a, b) => {
      const ta = typeof a?.type === 'number' ? a.type : 99;
      const tb = typeof b?.type === 'number' ? b.type : 99;
      return ta - tb;
    });

    const cert =
      sorted.find((x) => String(x?.certification ?? '').trim().length > 0)
        ?.certification ?? '';

    return String(cert).trim();
  }

  private pickTvAgeRatingKR(raw: TmdbTvContentRatingsResponse | null): string {
    const row = (raw?.results ?? []).find((r) => r.iso_3166_1 === 'KR');
    return String(row?.rating ?? '').trim();
  }

  /** ✅ (신규) 객체 인자 버전 */
  async getMeta(params: {
    type: MediaType;
    id: number;
    region?: string;
    language?: string;
  }): Promise<TmdbMetaResponse | null>;

  /** ✅ (호환) 기존 컨트롤러가 쓰던 4인자 버전 */
  async getMeta(
    type: MediaType,
    id: number,
    region?: string,
    language?: string,
  ): Promise<TmdbMetaResponse | null>;

  async getMeta(
    a:
      | {
          type: MediaType;
          id: number;
          region?: string;
          language?: string;
        }
      | MediaType,
    b?: number,
    c?: string,
    d?: string,
  ): Promise<TmdbMetaResponse | null> {
    const type: MediaType =
      typeof a === 'string' ? (a === 'tv' ? 'tv' : 'movie') : a.type;

    const id = typeof a === 'string' ? (typeof b === 'number' ? b : 0) : a.id;

    const region = (typeof a === 'string' ? c : a.region) ?? 'KR';
    const language = (typeof a === 'string' ? d : a.language) ?? 'ko-KR';

    const safeRegion = String(region).toUpperCase();
    const cacheKey = `meta:${type}:${id}:${safeRegion}:${language}`;

    return await this.metaCache.getOrSet<TmdbMetaResponse | null>(
      cacheKey,
      async () => {
        const detailRaw = await this.tmdbGetOrNull<unknown>(`/${type}/${id}`, {
          language,
        });
        if (!isRecord(detailRaw) || typeof detailRaw.id !== 'number') {
          return null;
        }

        const wp = await this.tmdbGetOrNull<WatchProvidersResponse>(
          `/${type}/${id}/watch/providers`,
        );
        const { providers } = this.pickProvidersKR(wp, safeRegion);

        let ageRating = '';
        if (type === 'movie') {
          const rd = await this.tmdbGetOrNull<TmdbReleaseDatesResponse>(
            `/movie/${id}/release_dates`,
          );
          ageRating = this.pickMovieAgeRatingKR(rd);
        } else {
          const cr = await this.tmdbGetOrNull<TmdbTvContentRatingsResponse>(
            `/tv/${id}/content_ratings`,
          );
          ageRating = this.pickTvAgeRatingKR(cr);
        }

        // ✅ KOBIS 보강
        let kobisMovieCd: string | null = null;
        let kobisOpenDt: string | null = null;

        try {
          const forKobis = {
            title: getString(detailRaw, 'title'),
            original_title: getString(detailRaw, 'original_title'),
            name: getString(detailRaw, 'name'),
            original_name: getString(detailRaw, 'original_name'),
            release_date: getString(detailRaw, 'release_date'),
          };

          const match = await this.kobis.findOpenDtByTmdbDetail(forKobis);
          kobisMovieCd = match.kobisMovieCd;
          kobisOpenDt = match.kobisOpenDt;
        } catch {
          kobisMovieCd = null;
          kobisOpenDt = null;
        }

        // ✅ TMDB + KOBIS 합집합 상영 플래그
        let isNowPlaying: boolean | undefined = undefined;
        let isUpcoming: boolean | undefined = undefined;

        try {
          const flags = await this.screening.computeUnionFlags({
            tmdbId: id,
            kobisMovieCd,
            kobisOpenDt,
            region: safeRegion,
            language,
          });
          isNowPlaying = flags.isNowPlaying;
          isUpcoming = flags.isUpcoming;
        } catch {
          // meta는 살리고 플래그만 스킵
        }

        const meta: TmdbMetaResponse = {
          ...detailRaw,
          providers,
          ageRating: ageRating || null,
          kobisOpenDt: toIsoYmd(kobisOpenDt) ?? kobisOpenDt,
          kobisMovieCd,
          isNowPlaying,
          isUpcoming,
        };

        return meta;
      },
      { ttlMs: 60 * 1000, negativeTtlMs: 10 * 1000 },
    );
  }
}
