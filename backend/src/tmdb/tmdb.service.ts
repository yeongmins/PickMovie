// backend/src/tmdb/tmdb.service.ts
import { Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';

export type TmdbQuery = Record<string, string | number | boolean | undefined>;

type CacheLike = {
  get<T>(key: string): T | undefined | Promise<T | undefined>;
  set<T>(
    key: string,
    value: T,
    ttl?: number | { ttl: number },
  ): void | Promise<void>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asUnknownArray(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? (v as unknown[]) : undefined;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function safeRecord(v: unknown): Record<string, unknown> {
  return isObject(v) ? v : {};
}

function pickCertificationFromMovieReleaseDates(
  releaseDates: unknown,
  region: string,
): string | undefined {
  const obj = safeRecord(releaseDates);

  // ✅ Array.isArray는 any[]로 좁히므로 unknown[]로 고정
  const results = asUnknownArray(obj['results']);
  if (!results) return undefined;

  // ✅ find 결과를 Record<string, unknown>로 좁히는 type predicate
  const regionBlock = results.find(
    (r): r is Record<string, unknown> =>
      isObject(r) && r['iso_3166_1'] === region,
  );
  if (!regionBlock) return undefined;

  const dates = asUnknownArray(regionBlock['release_dates']);
  if (!dates) return undefined;

  for (const d of dates) {
    if (!isObject(d)) continue;
    const cert = getString(d['certification']);
    if (cert && cert.trim().length > 0) return cert.trim();
  }
  return undefined;
}

function pickRatingFromTvContentRatings(
  contentRatings: unknown,
  region: string,
): string | undefined {
  const obj = safeRecord(contentRatings);

  const results = asUnknownArray(obj['results']);
  if (!results) return undefined;

  const regionBlock = results.find(
    (r): r is Record<string, unknown> =>
      isObject(r) && r['iso_3166_1'] === region,
  );
  if (!regionBlock) return undefined;

  const rating = getString(regionBlock['rating']);
  return rating?.trim() || undefined;
}

function extractProviderBadges(
  regionProviders: unknown,
  limit = 6,
): Array<{ provider_name: string; logo_path: string | null }> {
  const obj = safeRecord(regionProviders);

  const flatrate = asUnknownArray(obj['flatrate']) ?? [];
  const rent = asUnknownArray(obj['rent']) ?? [];
  const buy = asUnknownArray(obj['buy']) ?? [];

  const merged = [...flatrate, ...rent, ...buy];

  const out: Array<{ provider_name: string; logo_path: string | null }> = [];
  const seen = new Set<string>();

  for (const p of merged) {
    if (!isObject(p)) continue;

    const name = getString(p['provider_name']);
    const logo = getString(p['logo_path']) ?? null;

    if (!name || seen.has(name)) continue;
    seen.add(name);

    out.push({ provider_name: name, logo_path: logo });
    if (out.length >= limit) break;
  }

  return out;
}

@Injectable()
export class TmdbService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultLanguage: string;
  private readonly defaultRegion: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: CacheLike,
  ) {
    this.baseUrl =
      this.config.get<string>('TMDB_BASE_URL') ??
      'https://api.themoviedb.org/3';

    this.apiKey = this.config.get<string>('TMDB_API_KEY') ?? '';

    this.defaultLanguage = this.config.get<string>('TMDB_LANGUAGE') ?? 'ko-KR';
    this.defaultRegion = this.config.get<string>('TMDB_REGION') ?? 'KR';
  }

  private async cacheGet<T>(key: string): Promise<T | undefined> {
    const v = this.cache.get<T>(key);
    return v instanceof Promise ? v : Promise.resolve(v);
  }

  private async cacheSet<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    const r = this.cache.set(key, value, { ttl: ttlSeconds });
    if (r instanceof Promise) await r;
  }

  private makeCacheKey(
    path: string,
    params: Record<string, string | number | boolean>,
  ): string {
    const keys = Object.keys(params).sort();
    const qs = keys
      .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
      .join('&');
    return `tmdb:${path}?${qs}`;
  }

  private withDefaults(query: TmdbQuery): TmdbQuery {
    const q: TmdbQuery = { ...query };
    if (q.language === undefined) q.language = this.defaultLanguage;
    if (q.region === undefined) q.region = this.defaultRegion;
    return q;
  }

  private async getFromTmdb<T>(
    path: string,
    query: TmdbQuery = {},
    ttlSeconds = 60,
  ): Promise<T> {
    if (!this.apiKey) {
      throw new HttpException(
        'TMDB_API_KEY is missing. Please set TMDB_API_KEY in backend .env',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const q = this.withDefaults(query);

    const params: Record<string, string | number | boolean> = {
      api_key: this.apiKey,
    };

    for (const [k, v] of Object.entries(q)) {
      if (v === undefined) continue;
      params[k] = v;
    }

    const cacheKey = this.makeCacheKey(normalizedPath, params);
    const cached = await this.cacheGet<T>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const res = await firstValueFrom(
        this.http.get<T>(`${this.baseUrl}${normalizedPath}`, { params }),
      );
      await this.cacheSet(cacheKey, res.data, ttlSeconds);
      return res.data;
    } catch (e: unknown) {
      const err = e as AxiosError<unknown>;
      const status = err.response?.status ?? HttpStatus.BAD_GATEWAY;

      const data = err.response?.data;
      const tmdbMsg = isObject(data)
        ? getString(data['status_message'])
        : undefined;

      const message = tmdbMsg ?? err.message ?? 'TMDB request failed';
      throw new HttpException(`TMDB Error (${status}): ${message}`, status);
    }
  }

  // ---------- Movies / TV list ----------
  getPopularMovies(page = 1): Promise<unknown> {
    return this.getFromTmdb<unknown>('/movie/popular', { page });
  }

  getTopRatedMovies(page = 1): Promise<unknown> {
    return this.getFromTmdb<unknown>('/movie/top_rated', { page });
  }

  getNowPlayingMovies(page = 1): Promise<unknown> {
    return this.getFromTmdb<unknown>('/movie/now_playing', { page });
  }

  getPopularTVShows(page = 1): Promise<unknown> {
    return this.getFromTmdb<unknown>('/tv/popular', { page });
  }

  discoverMovies(query: TmdbQuery): Promise<unknown> {
    return this.getFromTmdb<unknown>('/discover/movie', query);
  }

  // ---------- Details ----------
  getMovieDetails(id: number): Promise<unknown> {
    return this.getFromTmdb<unknown>(`/movie/${id}`, {
      include_image_language: `ko,null`,
    });
  }

  getTVDetails(id: number): Promise<unknown> {
    return this.getFromTmdb<unknown>(`/tv/${id}`, {
      include_image_language: `ko,null`,
    });
  }

  // ✅ 프론트가 호출하는 /tmdb/meta/movie/:id 를 위해
  async getMeta(
    type: 'movie' | 'tv',
    id: number,
    region?: string,
    language?: string,
  ): Promise<Record<string, unknown>> {
    const r = region ?? this.defaultRegion;
    const l = language ?? this.defaultLanguage;

    const details = await this.getFromTmdb<Record<string, unknown>>(
      `/${type}/${id}`,
      {
        language: l,
        include_image_language: `ko,null`,
      },
    );

    const providers = await this.getFromTmdb<unknown>(
      `/${type}/${id}/watch/providers`,
      {},
    );

    const ratingSource =
      type === 'movie'
        ? await this.getFromTmdb<unknown>(`/movie/${id}/release_dates`, {})
        : await this.getFromTmdb<unknown>(`/tv/${id}/content_ratings`, {});

    const certification =
      type === 'movie'
        ? pickCertificationFromMovieReleaseDates(ratingSource, r)
        : pickRatingFromTvContentRatings(ratingSource, r);

    // region별 provider 뽑기(없으면 undefined)
    let regionProviders: unknown = undefined;
    const provObj = safeRecord(providers);
    const provResults = provObj['results'];
    if (isObject(provResults)) regionProviders = provResults[r];

    // ✅ 프론트(ContentCard)가 바로 쓸 수 있는 형태로 “최상단” 필드 제공
    const providerBadges = extractProviderBadges(regionProviders);
    const ageRating = certification ?? '';

    return {
      ...details,
      // ✅ ContentCard가 기대하는 키
      providers: providerBadges,
      ageRating,
      meta: {
        region: r,
        language: l,
        certification,
        providers: regionProviders,
      },
    };
  }

  // ---------- Proxy ----------
  proxy(path: string, query: TmdbQuery = {}): Promise<unknown> {
    const safe = path.replace(/^\/+/, '').replace(/\.\./g, '');
    return this.getFromTmdb<unknown>(`/${safe}`, query);
  }
}
