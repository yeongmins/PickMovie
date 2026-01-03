// backend/src/tmdb/tmdb.service.ts
import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type {
  MediaType,
  TmdbMovieResult,
  TmdbMultiResult,
  TmdbPagedResponse,
  TmdbReleaseDatesResponse,
  TmdbTvContentRatingsResponse,
  TmdbTvResult,
  TmdbWatchProvider,
  TmdbWatchProvidersResponse,
} from './tmdb.types';

export type TmdbQuery = Record<string, string | number | boolean | undefined>;

@Injectable()
export class TmdbService {
  private readonly baseUrl: string;

  constructor(private readonly http: HttpService) {
    this.baseUrl = (process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3')
      .trim()
      .replace(/\/+$/, '');
  }

  private apiKey(): string {
    const key = process.env.TMDB_API_KEY;
    if (!key || key.trim().length < 5) {
      throw new InternalServerErrorException(
        'TMDB_API_KEY 가 설정되어 있지 않습니다.',
      );
    }
    return key.trim();
  }

  private toUrl(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${p}`;
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const api_key = this.apiKey();

    try {
      const res = await firstValueFrom(
        this.http.get<T>(this.toUrl(path), {
          params: { ...params, api_key },
        }),
      );
      return res.data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'TMDB 요청 실패';
      throw new ServiceUnavailableException(msg);
    }
  }

  getPopularMovies(page = 1, language?: string) {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    return this.get<TmdbPagedResponse<TmdbMovieResult>>('/movie/popular', {
      page,
      language: lang,
    });
  }

  getTopRatedMovies(page = 1, language?: string) {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    return this.get<TmdbPagedResponse<TmdbMovieResult>>('/movie/top_rated', {
      page,
      language: lang,
    });
  }

  getNowPlayingMovies(page = 1, language?: string, region?: string) {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    const reg = region ?? process.env.TMDB_REGION ?? 'KR';
    return this.get<TmdbPagedResponse<TmdbMovieResult>>('/movie/now_playing', {
      page,
      language: lang,
      region: reg,
    });
  }

  getUpcomingMovies(page = 1, region?: string, language?: string) {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    const reg = region ?? process.env.TMDB_REGION ?? 'KR';
    return this.get<TmdbPagedResponse<TmdbMovieResult>>('/movie/upcoming', {
      page,
      language: lang,
      region: reg,
    });
  }

  getPopularTVShows(page = 1, language?: string) {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    return this.get<TmdbPagedResponse<TmdbTvResult>>('/tv/popular', {
      page,
      language: lang,
    });
  }

  getMovieDetails(id: number, language?: string) {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    return this.get<unknown>(`/movie/${id}`, { language: lang });
  }

  getTVDetails(id: number, language?: string) {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    return this.get<unknown>(`/tv/${id}`, { language: lang });
  }

  async getSimilar<T extends MediaType>(
    mediaType: T,
    id: number,
    page = 1,
    language?: string,
  ): Promise<
    TmdbPagedResponse<T extends 'tv' ? TmdbTvResult : TmdbMovieResult>
  > {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    const path =
      mediaType === 'tv' ? `/tv/${id}/similar` : `/movie/${id}/similar`;

    return await this.get<
      TmdbPagedResponse<T extends 'tv' ? TmdbTvResult : TmdbMovieResult>
    >(path, { page, language: lang });
  }

  async searchMulti(opts: {
    query: string;
    page?: number;
    language?: string;
    includeAdult?: boolean;
  }): Promise<TmdbPagedResponse<TmdbMultiResult>> {
    const language = opts.language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    return await this.get<TmdbPagedResponse<TmdbMultiResult>>('/search/multi', {
      query: opts.query,
      page: opts.page ?? 1,
      include_adult: opts.includeAdult ?? false,
      language,
    });
  }

  async searchMovie(opts: {
    query: string;
    page?: number;
    language?: string;
    region?: string;
    includeAdult?: boolean;
    year?: number;
    primaryReleaseYear?: number;
  }): Promise<TmdbPagedResponse<TmdbMovieResult>> {
    const language = opts.language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    const region = opts.region ?? process.env.TMDB_REGION ?? 'KR';

    return await this.get<TmdbPagedResponse<TmdbMovieResult>>('/search/movie', {
      query: opts.query,
      page: opts.page ?? 1,
      include_adult: opts.includeAdult ?? false,
      language,
      region,
      year: opts.year,
      primary_release_year: opts.primaryReleaseYear,
    });
  }

  async discoverMovies(query: TmdbQuery): Promise<unknown> {
    const type =
      String(query.type ?? query.mediaType ?? query.media_type ?? 'movie') ===
      'tv'
        ? 'tv'
        : 'movie';

    const lang = String(query.language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR');
    const reg = String(query.region ?? process.env.TMDB_REGION ?? 'KR');

    if (type === 'tv') {
      return await this.get<unknown>('/discover/tv', {
        ...query,
        language: lang,
      });
    }

    return await this.get<unknown>('/discover/movie', {
      ...query,
      language: lang,
      region: reg,
    });
  }

  async getWatchProviders(opts: {
    mediaType: MediaType;
    id: number;
    region?: string;
    limit?: number;
  }): Promise<TmdbWatchProvider[]> {
    const region = opts.region ?? process.env.TMDB_REGION ?? 'KR';
    const limit = opts.limit ?? 4;

    const data = await this.get<TmdbWatchProvidersResponse>(
      `/${opts.mediaType}/${opts.id}/watch/providers`,
      {},
    );

    const regionData = data.results?.[region];
    if (!regionData) return [];

    const pools: TmdbWatchProvider[] = [
      ...(regionData.flatrate ?? []),
      ...(regionData.rent ?? []),
      ...(regionData.buy ?? []),
    ];

    const map = new Map<number, TmdbWatchProvider>();
    for (const p of pools) map.set(p.provider_id, p);

    return Array.from(map.values()).slice(0, limit);
  }

  async getAgeRating(opts: {
    mediaType: MediaType;
    id: number;
    region?: string;
  }): Promise<string | null> {
    const region = opts.region ?? process.env.TMDB_REGION ?? 'KR';

    if (opts.mediaType === 'movie') {
      const data = await this.get<TmdbReleaseDatesResponse>(
        `/movie/${opts.id}/release_dates`,
        {},
      );

      const target = data.results.find((r) => r.iso_3166_1 === region);
      if (!target) return null;

      const cert = target.release_dates
        .map((d) => d.certification.trim())
        .find((c) => c.length > 0);

      return cert ?? null;
    }

    const data = await this.get<TmdbTvContentRatingsResponse>(
      `/tv/${opts.id}/content_ratings`,
      {},
    );

    const target = data.results.find((r) => r.iso_3166_1 === region);
    const rating = target?.rating?.trim();
    return rating && rating.length > 0 ? rating : null;
  }

  async getMeta(
    mediaType: MediaType,
    id: number,
    region?: string,
    language?: string,
  ) {
    const reg = region ?? process.env.TMDB_REGION ?? 'KR';
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';

    const [details, providers, ageRating] = await Promise.all([
      mediaType === 'tv'
        ? this.getTVDetails(id, lang)
        : this.getMovieDetails(id, lang),
      this.getWatchProviders({ mediaType, id, region: reg, limit: 6 }),
      this.getAgeRating({ mediaType, id, region: reg }),
    ]);

    return { details, providers, ageRating };
  }

  async proxy(path: string, query: TmdbQuery): Promise<unknown> {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return await this.get<unknown>(safePath, query);
  }

  async searchKeyword(query: string, page = 1) {
    return await this.get<{ results: Array<{ id: number; name: string }> }>(
      '/search/keyword',
      { query, page },
    );
  }

  async searchCompany(query: string, page = 1) {
    return await this.get<{ results: Array<{ id: number; name: string }> }>(
      '/search/company',
      { query, page },
    );
  }

  async searchNetwork(query: string, page = 1) {
    return await this.get<{ results: Array<{ id: number; name: string }> }>(
      '/search/network',
      { query, page },
    );
  }

  async searchCollection(query: string, page = 1) {
    return await this.get<{ results: Array<{ id: number; name: string }> }>(
      '/search/collection',
      { query, page },
    );
  }

  async getImages(
    mediaType: MediaType,
    id: number,
    opts?: { includeImageLanguage?: string },
  ) {
    return await this.get<unknown>(`/${mediaType}/${id}/images`, {
      include_image_language: opts?.includeImageLanguage ?? 'ko,en,null',
    });
  }

  // ✅✅✅ 완전 안정화: Videos 전용
  getVideos(mediaType: MediaType, id: number, language?: string) {
    const lang = language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    return this.get<unknown>(`/${mediaType}/${id}/videos`, { language: lang });
  }
}
