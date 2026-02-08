// backend/src/picky/picky.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import type {
  MediaType,
  PickyRecommendDto,
  PickyRecommendResponse,
  PickyItem,
  ProviderBadge,
} from './dto/picky.dto';

import {
  expandQueriesByBrandLexicon,
  inferPickySignals,
} from './picky.lexicon';
import { expandWithLexicon } from './picky.query';

type JsonRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is JsonRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isArray = Array.isArray;
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const norm = (s: string) => (s ?? '').trim().toLowerCase();

const uniqStrings = (arr: Array<string | null | undefined>): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = (v ?? '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
};

const uniqNums = (arr: Array<number | null | undefined>): number[] => {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of arr) {
    if (!isNumber(v)) continue;
    const n = Math.trunc(v);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
};

const toYear = (dateStr: unknown): number | null => {
  if (!isString(dateStr) || !dateStr) return null;
  const y = Number(dateStr.slice(0, 4));
  return Number.isFinite(y) ? y : null;
};

const normalizeNumArray = (v: unknown): number[] => {
  if (!isArray(v)) return [];
  const out: number[] = [];
  for (const it of v) {
    if (isNumber(it)) out.push(Math.trunc(it));
  }
  return uniqNums(out);
};

const isAscii = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0x7f) return false;
  return true;
};

const containsAny = (hayLower: string, tokens: string[]): string[] => {
  const hits: string[] = [];
  for (const t of tokens) {
    const tt = norm(t);
    if (tt.length < 2) continue;
    if (hayLower.includes(tt)) hits.push(tt);
  }
  return hits;
};

type InferResult = {
  mediaTypes: MediaType[];
  yearFrom?: number;
  yearTo?: number;

  titleQueries: string[];
  companyQueries: string[];
  keywordQueriesEn: string[];

  scoreTokens: string[];
  forceGenreIds: number[];
};

@Injectable()
export class PickyService {
  private readonly logger = new Logger(PickyService.name);
  private readonly tmdbBase = 'https://api.themoviedb.org/3';

  private readonly keywordIdCache = new Map<string, number | null>();
  private readonly companyIdCache = new Map<string, number | null>();

  private readonly providersCache = new Map<string, ProviderBadge[]>();
  private readonly ageCache = new Map<string, string | null>();

  constructor(private readonly http: HttpService) {}

  private get apiKey(): string {
    const key = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
    if (!key) throw new Error('TMDB_API_KEY is missing');
    return key;
  }

  private async fetchJson(url: string): Promise<unknown> {
    try {
      const res = await firstValueFrom(
        this.http.get<unknown>(url, {
          validateStatus: () => true,
        }),
      );

      if (
        typeof res.status !== 'number' ||
        res.status < 200 ||
        res.status >= 300
      )
        return null;
      return res.data;
    } catch {
      return null;
    }
  }

  private parseYearRange(
    prompt: string,
  ): { yearFrom: number; yearTo: number } | null {
    const p = (prompt ?? '').trim();

    const m1 = p.match(/(\d{4})\s*[-~–]\s*(\d{4})/);
    if (m1) {
      const a = Number(m1[1]);
      const b = Number(m1[2]);
      if (Number.isFinite(a) && Number.isFinite(b))
        return { yearFrom: Math.min(a, b), yearTo: Math.max(a, b) };
    }

    const m2 = p.match(/(\d{4})\s*년대/);
    if (m2) {
      const base = Number(m2[1]);
      if (Number.isFinite(base)) {
        const from = Math.floor(base / 10) * 10;
        return { yearFrom: from, yearTo: from + 9 };
      }
    }

    const m3 = p.match(/(\d{2})\s*년대/);
    if (m3) {
      const yy = Number(m3[1]);
      if (Number.isFinite(yy)) {
        const century = yy >= 30 ? 1900 : 2000;
        const from = century + yy * 10;
        return { yearFrom: from, yearTo: from + 9 };
      }
    }

    const m4 = p.match(/(\d{4})\s*년/);
    if (m4) {
      const y = Number(m4[1]);
      if (Number.isFinite(y)) return { yearFrom: y, yearTo: y };
    }

    return null;
  }

  private inferGenreIds(promptLower: string): number[] {
    // TMDB 장르 ID(영화/TV 공통으로 많이 겹침)
    const map: Array<[RegExp, number]> = [
      [/애니|animation|anime/i, 16],
      [/액션|action/i, 28],
      [/모험|adventure/i, 12],
      [/코미디|comedy/i, 35],
      [/범죄|crime|느와르/i, 80],
      [/다큐|documentary/i, 99],
      [/드라마|drama/i, 18],
      [/가족|family|kids/i, 10751],
      [/판타지|fantasy/i, 14],
      [/공포|horror|호러/i, 27],
      [/음악|music|뮤지컬|musical/i, 10402],
      [/미스터리|mystery|추리/i, 9648],
      [/로맨스|romance|멜로/i, 10749],
      [/sf|sci[-\s]*fi|공상과학/i, 878],
      [/스릴러|thriller/i, 53],
      [/전쟁|war/i, 10752],
      [/서부|western/i, 37],
    ];

    const out: number[] = [];
    for (const [re, id] of map) if (re.test(promptLower)) out.push(id);
    return uniqNums(out);
  }

  private inferFromPrompt(promptRaw: string): InferResult {
    const prompt = (promptRaw ?? '').trim();
    const p = prompt.toLowerCase();

    const wantsMovie = /영화|극장|movie/.test(p);
    const wantsTv = /tv|드라마|시리즈|show/.test(p);
    const wantsAnime = /애니|애니메이션|anime/.test(p);

    let mediaTypes: MediaType[] = ['movie', 'tv'];
    if (wantsMovie && !wantsTv) mediaTypes = ['movie'];
    if (wantsTv && !wantsMovie) mediaTypes = ['tv'];
    if (wantsAnime && !wantsMovie && !wantsTv) mediaTypes = ['movie', 'tv'];

    const yr = this.parseYearRange(prompt);

    const companyQueries: string[] = [];
    const addCompany = (k: RegExp, qs: string[]) => {
      if (k.test(p)) companyQueries.push(...qs);
    };

    addCompany(/지브리|스튜디오\s*지브리/, ['Studio Ghibli']);
    addCompany(/디즈니/, ['Walt Disney Pictures', 'Disney']);
    addCompany(/픽사/, ['Pixar Animation Studios', 'Pixar']);
    addCompany(/마블/, ['Marvel Studios', 'Marvel Entertainment']);
    addCompany(/\bdc\b|디씨/, ['DC Studios', 'DC Entertainment']);
    addCompany(/워너|warner/, ['Warner Bros. Pictures']);
    addCompany(/넷플릭스|netflix/, ['Netflix']);
    addCompany(/hbo/, ['HBO']);

    const keywordQueriesEn: string[] = [];
    const addKw = (k: RegExp, kws: string[]) => {
      if (k.test(p)) keywordQueriesEn.push(...kws);
    };

    addKw(/연말|크리스마스|성탄|holiday|christmas/, [
      'christmas',
      'holiday',
      'new year',
    ]);
    addKw(/따뜻|훈훈|힐링|마음이\s*편한|잔잔/, [
      'heartwarming',
      'feel good',
      'friendship',
      'family',
      'uplifting',
    ]);
    addKw(/감성|먹먹|눈물|성장|청춘/, [
      'coming of age',
      'life',
      'love',
      'relationship',
    ]);
    addKw(/스릴|긴장|추적|범죄/, ['thriller', 'crime', 'mystery']);

    const fillers = new Set([
      '추천',
      '영화',
      '드라마',
      '시리즈',
      'tv',
      '애니',
      '애니메이션',
      '분위기',
      '느낌',
      '같은',
      '비슷한',
      '찾아줘',
      '보고싶어',
      '보고싶은',
      '좀',
      '더',
      '전부',
      '중',
      '위주',
      '작품',
      '콘텐츠',
      '컨텐츠',
    ]);

    const rawTokens = prompt
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const scoreTokens = uniqStrings(
      rawTokens
        .filter((t) => !/^\d{2,4}년대$/.test(t))
        .filter((t) => !/^\d{4}$/.test(t))
        .filter((t) => t.length >= 2),
    );

    const titleTokens = uniqStrings(
      rawTokens
        .filter((t) => !fillers.has(t.toLowerCase()))
        .filter((t) => !/^\d/.test(t))
        .filter((t) => t.length >= 2),
    );

    const titleQueries = uniqStrings([
      prompt,
      ...titleTokens,
      ...companyQueries,
    ]).slice(0, 6);

    const forceGenreIds: number[] = [];
    // 애니 강제 + 장르 감지
    if (/지브리/.test(p) || wantsAnime) forceGenreIds.push(16);
    forceGenreIds.push(...this.inferGenreIds(p));

    return {
      mediaTypes,
      yearFrom: yr?.yearFrom,
      yearTo: yr?.yearTo,
      titleQueries,
      companyQueries: uniqStrings(companyQueries),
      keywordQueriesEn: uniqStrings(keywordQueriesEn),
      scoreTokens,
      forceGenreIds: uniqNums(forceGenreIds),
    };
  }

  private async searchKeywordId(keyword: string): Promise<number | null> {
    const q = (keyword ?? '').trim();
    if (!q) return null;

    const key = q.toLowerCase();
    if (this.keywordIdCache.has(key))
      return this.keywordIdCache.get(key) ?? null;

    const url = `${this.tmdbBase}/search/keyword?${new URLSearchParams({
      api_key: this.apiKey,
      query: q,
      page: '1',
    }).toString()}`;

    const data: unknown = await this.fetchJson(url);
    if (!isRecord(data)) {
      this.keywordIdCache.set(key, null);
      return null;
    }

    const results: unknown = data.results;
    if (!isArray(results) || results.length === 0) {
      this.keywordIdCache.set(key, null);
      return null;
    }

    const first: unknown = results[0];
    if (!isRecord(first)) {
      this.keywordIdCache.set(key, null);
      return null;
    }

    const id: unknown = first.id;
    const v = isNumber(id) ? Math.trunc(id) : null;
    this.keywordIdCache.set(key, v);
    return v;
  }

  private async searchCompanyId(companyQuery: string): Promise<number | null> {
    const q = (companyQuery ?? '').trim();
    if (!q) return null;

    const key = q.toLowerCase();
    if (this.companyIdCache.has(key))
      return this.companyIdCache.get(key) ?? null;

    const url = `${this.tmdbBase}/search/company?${new URLSearchParams({
      api_key: this.apiKey,
      query: q,
      page: '1',
    }).toString()}`;

    const data: unknown = await this.fetchJson(url);
    if (!isRecord(data)) {
      this.companyIdCache.set(key, null);
      return null;
    }

    const results: unknown = data.results;
    if (!isArray(results) || results.length === 0) {
      this.companyIdCache.set(key, null);
      return null;
    }

    const first: unknown = results[0];
    if (!isRecord(first)) {
      this.companyIdCache.set(key, null);
      return null;
    }

    const id: unknown = first.id;
    const v = isNumber(id) ? Math.trunc(id) : null;
    this.companyIdCache.set(key, v);
    return v;
  }

  private async searchMultiCandidates(opts: {
    queries: string[];
    page: number;
    language: string;
    includeAdult: boolean;
    source: 'search' | 'retry';
  }): Promise<
    Array<
      JsonRecord & { mediaType: MediaType; _pickySource: 'search' | 'retry' }
    >
  > {
    const out: Array<
      JsonRecord & { mediaType: MediaType; _pickySource: 'search' | 'retry' }
    > = [];
    const seen = new Set<string>();

    const queries = uniqStrings(opts.queries).slice(0, 8);

    for (const qq of queries) {
      const url = `${this.tmdbBase}/search/multi?${new URLSearchParams({
        api_key: this.apiKey,
        query: qq,
        page: String(opts.page),
        language: opts.language,
        include_adult: opts.includeAdult ? 'true' : 'false',
      }).toString()}`;

      const data: unknown = await this.fetchJson(url);
      if (!isRecord(data)) continue;

      const results: unknown = data.results;
      if (!isArray(results)) continue;

      for (const it of results) {
        if (!isRecord(it)) continue;

        const mt: unknown = it.media_type;
        const id: unknown = it.id;

        if (!((mt === 'movie' || mt === 'tv') && isNumber(id))) continue;

        const key = `${mt}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({ ...it, mediaType: mt, _pickySource: opts.source });
      }
    }

    return out;
  }

  async searchMultiWithLexicon(opts: {
    query: string;
    page: number;
    language?: string;
    includeAdult?: boolean;
  }): Promise<{
    expandedQueries: string[];
    results: Record<string, unknown>[];
  }> {
    const q = (opts.query ?? '').trim();
    if (!q) return { expandedQueries: [], results: [] };

    const language = opts.language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    const includeAdult = !!opts.includeAdult;
    const page = Number(opts.page ?? 1) || 1;

    const expandedQueries = expandQueriesByBrandLexicon(q, 6);

    const cands = await this.searchMultiCandidates({
      queries: expandedQueries,
      page,
      language,
      includeAdult,
      source: 'search',
    });

    // searchMultiCandidates에서 mediaType을 붙여놨다면 프론트에서 필요없을 수 있어서 제거
    const results = cands.map((x) => {
      const { mediaType: _mt, ...rest } = x;
      void _mt;
      return rest;
    });

    return { expandedQueries, results };
  }

  private buildDiscoverUrl(
    mediaType: MediaType,
    dto: PickyRecommendDto,
    filters: {
      keywordIds: number[];
      companyIds: number[];
      forceGenreIds: number[];
    },
  ): string {
    const language = dto.language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
    const region = dto.region ?? process.env.TMDB_REGION ?? 'KR';
    const includeAdult = !!dto.includeAdult;
    const sortBy = dto.sortBy ?? 'popularity.desc';
    const page = String(dto.page ?? 1);

    const params = new URLSearchParams({
      api_key: this.apiKey,
      language,
      region,
      include_adult: includeAdult ? 'true' : 'false',
      sort_by: sortBy,
      page,
    });

    const genreIds = uniqNums([
      ...(dto.genreIds ?? []),
      ...filters.forceGenreIds,
    ]);
    if (genreIds.length) params.set('with_genres', genreIds.join(','));

    if (dto.yearFrom) {
      if (mediaType === 'movie')
        params.set('primary_release_date.gte', `${dto.yearFrom}-01-01`);
      else params.set('first_air_date.gte', `${dto.yearFrom}-01-01`);
    }
    if (dto.yearTo) {
      if (mediaType === 'movie')
        params.set('primary_release_date.lte', `${dto.yearTo}-12-31`);
      else params.set('first_air_date.lte', `${dto.yearTo}-12-31`);
    }

    if (dto.originalLanguage)
      params.set('with_original_language', dto.originalLanguage);

    if (filters.keywordIds.length)
      params.set('with_keywords', filters.keywordIds.join('|'));

    // movie만 companies 가능( tv discover에는 with_companies 없음 )
    if (mediaType === 'movie' && filters.companyIds.length)
      params.set('with_companies', filters.companyIds.join('|'));

    return `${this.tmdbBase}/discover/${mediaType}?${params.toString()}`;
  }

  private normalizeDiscoverItems(
    data: unknown,
    mediaType: MediaType,
  ): Array<JsonRecord & { mediaType: MediaType; _pickySource: 'discover' }> {
    if (!isRecord(data)) return [];
    const results: unknown = data.results;
    if (!isArray(results)) return [];

    const out: Array<
      JsonRecord & { mediaType: MediaType; _pickySource: 'discover' }
    > = [];
    for (const r of results) {
      if (!isRecord(r)) continue;
      const id: unknown = r.id;
      if (!isNumber(id)) continue;
      out.push({ ...r, mediaType, _pickySource: 'discover' });
    }
    return out;
  }

  private async getWatchProviders(
    mediaType: MediaType,
    tmdbId: number,
    region: string,
  ): Promise<ProviderBadge[]> {
    const cacheKey = `${mediaType}:${tmdbId}:${region}`;
    if (this.providersCache.has(cacheKey))
      return this.providersCache.get(cacheKey) ?? [];

    const url = `${this.tmdbBase}/${mediaType}/${tmdbId}/watch/providers?${new URLSearchParams(
      {
        api_key: this.apiKey,
      },
    ).toString()}`;

    const data: unknown = await this.fetchJson(url);
    if (!isRecord(data)) {
      this.providersCache.set(cacheKey, []);
      return [];
    }

    const results: unknown = data.results;
    if (!isRecord(results)) {
      this.providersCache.set(cacheKey, []);
      return [];
    }

    const block: unknown = results[region];
    if (!isRecord(block)) {
      this.providersCache.set(cacheKey, []);
      return [];
    }

    const flatrate: unknown = block.flatrate;
    if (!isArray(flatrate)) {
      this.providersCache.set(cacheKey, []);
      return [];
    }

    const out: ProviderBadge[] = [];
    for (const p of flatrate) {
      if (!isRecord(p)) continue;

      const providerId: unknown = p.provider_id;
      const providerName: unknown = p.provider_name;
      const logoPath: unknown = p.logo_path;

      if (!isNumber(providerId) || !isString(providerName)) continue;

      out.push({
        providerId: Math.trunc(providerId),
        providerName,
        logoPath: isString(logoPath) ? logoPath : null,
      });
    }

    const sliced = out.slice(0, 6);
    this.providersCache.set(cacheKey, sliced);
    return sliced;
  }

  private async getAgeRating(
    mediaType: MediaType,
    tmdbId: number,
    region: string,
  ): Promise<string | null> {
    const cacheKey = `${mediaType}:${tmdbId}:${region}`;
    if (this.ageCache.has(cacheKey)) return this.ageCache.get(cacheKey) ?? null;

    if (mediaType === 'movie') {
      const url = `${this.tmdbBase}/movie/${tmdbId}/release_dates?${new URLSearchParams(
        {
          api_key: this.apiKey,
        },
      ).toString()}`;

      const data: unknown = await this.fetchJson(url);
      if (!isRecord(data)) {
        this.ageCache.set(cacheKey, null);
        return null;
      }

      const results: unknown = data.results;
      if (!isArray(results)) {
        this.ageCache.set(cacheKey, null);
        return null;
      }

      for (const row of results) {
        if (!isRecord(row)) continue;
        if (row.iso_3166_1 !== region) continue;

        const releaseDates: unknown = row.release_dates;
        if (!isArray(releaseDates)) continue;

        for (const rd of releaseDates) {
          if (!isRecord(rd)) continue;
          const cert: unknown = rd.certification;
          if (isString(cert) && cert.trim()) {
            const v = cert.trim();
            this.ageCache.set(cacheKey, v);
            return v;
          }
        }
      }

      this.ageCache.set(cacheKey, null);
      return null;
    }

    const url = `${this.tmdbBase}/tv/${tmdbId}/content_ratings?${new URLSearchParams(
      {
        api_key: this.apiKey,
      },
    ).toString()}`;

    const data: unknown = await this.fetchJson(url);
    if (!isRecord(data)) {
      this.ageCache.set(cacheKey, null);
      return null;
    }

    const results: unknown = data.results;
    if (!isArray(results)) {
      this.ageCache.set(cacheKey, null);
      return null;
    }

    for (const row of results) {
      if (!isRecord(row)) continue;
      if (row.iso_3166_1 !== region) continue;

      const rating: unknown = row.rating;
      const v = isString(rating) ? rating.trim() : null;
      this.ageCache.set(cacheKey, v);
      return v;
    }

    this.ageCache.set(cacheKey, null);
    return null;
  }

  private calcMatchScore(
    it: JsonRecord & { _pickySource?: 'search' | 'discover' | 'retry' },
    mediaType: MediaType,
    tokens: string[],
    notTokens: string[],
    yearFrom?: number,
    yearTo?: number,
  ): { score: number; reasons: string[] } {
    let score = 18; // ✅ 기본 점수 낮춤(인기작이 무조건 이기지 않게)
    const reasons: string[] = [];

    const title = isString(it.title)
      ? it.title
      : isString(it.name)
        ? it.name
        : '';
    const overview = isString(it.overview) ? it.overview : '';
    const hayLower = `${title} ${overview}`.toLowerCase();

    // ✅ 검색 소스 보너스: 실제 텍스트 검색 결과를 discover보다 우선
    if (it._pickySource === 'search') {
      score += 10;
      reasons.push('검색결과 우선 +10');
    } else if (it._pickySource === 'retry') {
      score += 6;
      reasons.push('재검색 +6');
    }

    const hit = containsAny(hayLower, tokens);
    if (hit.length) {
      const add = clamp(hit.length * 12, 0, 52);
      score += add;
      reasons.push(`키워드 일치 +${add}`);
    } else {
      // ✅ 키워드가 0개면 인기 점수로만 올라오는 것을 방지
      score -= 8;
      reasons.push('키워드 미일치 -8');
    }

    // ✅ 부정 토큰 포함 시 강하게 패널티
    const bad = containsAny(hayLower, notTokens);
    if (bad.length) {
      const sub = clamp(bad.length * 20, 0, 60);
      score -= sub;
      reasons.push(`제외 키워드 -${sub}`);
    }

    const releaseDate =
      mediaType === 'movie'
        ? isString(it.release_date)
          ? it.release_date
          : null
        : isString(it.first_air_date)
          ? it.first_air_date
          : null;

    const y = toYear(releaseDate);
    if (y && yearFrom && yearTo && y >= yearFrom && y <= yearTo) {
      score += 10;
      reasons.push('연도 일치 +10');
    }

    // ✅ 인기도 가중치 하향
    const voteAverage = isNumber(it.vote_average)
      ? it.vote_average
      : Number(it.vote_average ?? 0);
    const voteCount = isNumber(it.vote_count)
      ? it.vote_count
      : Number(it.vote_count ?? 0);

    if (Number.isFinite(voteAverage) && voteAverage > 0)
      score += clamp(voteAverage, 0, 10) * 0.6;
    if (Number.isFinite(voteCount) && voteCount > 0)
      score += clamp(Math.log10(voteCount + 1) * 2.2, 0, 7);

    score = clamp(score, 0, 100);

    return {
      score: Math.round(score),
      reasons: uniqStrings(reasons).slice(0, 6),
    };
  }

  private toBaseItem(it: JsonRecord & { mediaType: MediaType }) {
    const mt = it.mediaType;

    const title = isString(it.title)
      ? it.title
      : isString(it.name)
        ? it.name
        : '';
    const overview = isString(it.overview) ? it.overview : '';

    const posterPath = isString(it.poster_path) ? it.poster_path : null;
    const backdropPath = isString(it.backdrop_path) ? it.backdrop_path : null;

    const voteAverage = isNumber(it.vote_average)
      ? it.vote_average
      : Number(it.vote_average ?? 0);
    const voteCount = isNumber(it.vote_count)
      ? it.vote_count
      : Number(it.vote_count ?? 0);

    const releaseDate =
      mt === 'movie'
        ? isString(it.release_date)
          ? it.release_date
          : null
        : isString(it.first_air_date)
          ? it.first_air_date
          : null;

    const genreIds = normalizeNumArray(it.genre_ids);

    const originalLanguage = isString(it.original_language)
      ? it.original_language
      : null;

    return {
      id: isNumber(it.id) ? Math.trunc(it.id) : 0,
      mediaType: mt,
      title,
      overview,
      posterPath,
      backdropPath,
      voteAverage: Number.isFinite(voteAverage) ? voteAverage : 0,
      voteCount: Number.isFinite(voteCount) ? voteCount : 0,
      releaseDate,
      year: toYear(releaseDate),
      genreIds,
      originalLanguage,
    };
  }

  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (v: T) => Promise<R>,
  ): Promise<R[]> {
    const out: R[] = [];
    let i = 0;

    const workers = Array.from({ length: Math.max(1, limit) }).map(async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    });

    await Promise.all(workers);
    return out;
  }

  private pickKeywordQueriesForTmdb(includeExpanded: string[]): string[] {
    const base = uniqStrings(includeExpanded)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    const stop = new Set([
      '추천',
      '영화',
      '드라마',
      '시리즈',
      '애니',
      '애니메이션',
      '작품',
      '콘텐츠',
      '컨텐츠',
      '분위기',
      '느낌',
      '비슷한',
      '같은',
    ]);

    const filtered = base.filter((s) => !stop.has(s));

    const ascii: string[] = [];
    const nonAscii: string[] = [];

    for (const s of filtered) {
      if (isAscii(s)) ascii.push(s);
      else nonAscii.push(s);
    }

    return [...ascii.slice(0, 8), ...nonAscii.slice(0, 4)];
  }

  async recommend(dto: PickyRecommendDto): Promise<PickyRecommendResponse> {
    try {
      const prompt = (dto.prompt ?? '').trim();
      if (!prompt) return { items: [] };

      // ✅ 1) lexicon 기반 정규화/확장/부정어/힌트 추출
      const lex = expandWithLexicon(prompt);

      // ✅ 2) 기존 휴리스틱 + 브랜드 사전 시그널
      const inferred = this.inferFromPrompt(prompt);
      const signals = inferPickySignals(prompt, dto.includeKeywords ?? [], {
        maxInclude: 24,
      });

      // ✅ 회사/네트워크/프랜차이즈/키워드 힌트를 적극 반영
      const companyHintPool = uniqStrings([
        ...inferred.companyQueries,
        ...signals.companyQueries,
        ...lex.entityHints.company,
        ...lex.entityHints.network,
      ]).slice(0, 16);

      const keywordHintPool = uniqStrings([
        ...inferred.keywordQueriesEn,
        ...this.pickKeywordQueriesForTmdb(signals.includeExpanded),
        ...lex.entityHints.keyword,
        ...lex.entityHints.franchise,
      ]).slice(0, 18);

      // ✅ discover에서 강하게 잡아야 하는 장르도 dto에 반영
      const effective: PickyRecommendDto = {
        ...dto,
        mediaTypes: dto.mediaTypes?.length
          ? dto.mediaTypes
          : inferred.mediaTypes,
        yearFrom: dto.yearFrom ?? inferred.yearFrom,
        yearTo: dto.yearTo ?? inferred.yearTo,
        genreIds: dto.genreIds?.length ? dto.genreIds : inferred.forceGenreIds,
        includeKeywords: uniqStrings([
          ...signals.includeExpanded,
          ...lex.expandedTokens,
        ]).slice(0, 24),
        originalLanguage:
          dto.originalLanguage ?? signals.detectedOriginalLanguage ?? null,
      };

      const language =
        effective.language ?? process.env.TMDB_LANGUAGE ?? 'ko-KR';
      const region = effective.region ?? process.env.TMDB_REGION ?? 'KR';
      const includeAdult = !!effective.includeAdult;
      const page = Number(effective.page ?? 1) || 1;

      // ✅ 회사/키워드 ID 확보
      const companyIds = uniqNums(
        await Promise.all(companyHintPool.map((c) => this.searchCompanyId(c))),
      ).slice(0, 10);
      const keywordIds = uniqNums(
        await Promise.all(keywordHintPool.map((k) => this.searchKeywordId(k))),
      ).slice(0, 12);

      // ✅ 3) search/multi 쿼리 강화 (한글 → 영문 aliases까지 포함)
      const expandedQueries = uniqStrings([
        prompt,
        ...expandQueriesByBrandLexicon(prompt, 8),
        ...inferred.titleQueries,
        ...lex.entityHints.franchise,
        ...lex.entityHints.keyword,
      ]).slice(0, 8);

      const searchCands = await this.searchMultiCandidates({
        queries: expandedQueries,
        page,
        language,
        includeAdult,
        source: 'search',
      });

      // ✅ 4) discover 후보(필터 적용)
      const mediaTypes: MediaType[] = effective.mediaTypes?.length
        ? effective.mediaTypes
        : inferred.mediaTypes;

      const discoverPages = await Promise.all(
        mediaTypes.map(async (mt) => {
          const url = this.buildDiscoverUrl(mt, effective, {
            keywordIds,
            companyIds,
            forceGenreIds: inferred.forceGenreIds,
          });
          const data: unknown = await this.fetchJson(url);
          return this.normalizeDiscoverItems(data, mt);
        }),
      );

      const discoverCands = discoverPages.flat();

      // ✅ 5) merge + de-dup
      const merged: Array<
        JsonRecord & {
          mediaType: MediaType;
          _pickySource?: 'search' | 'discover' | 'retry';
        }
      > = [];
      const seen = new Set<string>();

      for (const it of [...searchCands, ...discoverCands]) {
        const id: unknown = it.id;
        if (!isNumber(id)) continue;
        const key = `${it.mediaType}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(it);
      }

      // ✅ 6) 정말 아무것도 못 찾았을 때만 retry
      if (merged.length === 0) {
        const retry = await this.searchMultiCandidates({
          queries: [prompt, ...expandQueriesByBrandLexicon(prompt, 4)],
          page: 1,
          language,
          includeAdult,
          source: 'retry',
        });
        merged.push(...retry);
      }

      // ✅ 7) 점수화 토큰/부정 토큰 구성
      const tokens = uniqStrings([
        ...(effective.includeKeywords ?? []),
        ...inferred.scoreTokens,
        ...companyHintPool,
        ...lex.entityHints.franchise,
        ...lex.entityHints.keyword,
      ]).slice(0, 26);

      const notTokens = uniqStrings([...lex.notTokens])
        .filter((t) => norm(t).length >= 2)
        .slice(0, 18);

      // ✅ 8) 부정 토큰이 강하게 걸리면 아예 제외(“공포 빼고” 같은 케이스)
      const filtered = merged.filter((it) => {
        const title = isString(it.title)
          ? it.title
          : isString(it.name)
            ? it.name
            : '';
        const overview = isString(it.overview) ? it.overview : '';
        const hayLower = `${title} ${overview}`.toLowerCase();
        const bad = containsAny(hayLower, notTokens);
        return bad.length === 0;
      });

      const scored = (filtered.length ? filtered : merged)
        .map((it) => {
          const base = this.toBaseItem(
            it as JsonRecord & { mediaType: MediaType },
          );
          const ms = this.calcMatchScore(
            it,
            (it as { mediaType: MediaType }).mediaType,
            tokens,
            notTokens,
            effective.yearFrom ?? undefined,
            effective.yearTo ?? undefined,
          );
          return { base, matchScore: ms.score, matchReasons: ms.reasons };
        })
        .filter((x) => x.base.id !== 0);

      scored.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (b.base.voteAverage !== a.base.voteAverage)
          return b.base.voteAverage - a.base.voteAverage;
        return b.base.voteCount - a.base.voteCount;
      });

      const top = scored.slice(0, 24);

      const enriched = await this.mapLimit(top, 6, async (x) => {
        const providers = await this.getWatchProviders(
          x.base.mediaType,
          x.base.id,
          region,
        );
        const ageRating = await this.getAgeRating(
          x.base.mediaType,
          x.base.id,
          region,
        );

        const item: PickyItem = {
          ...x.base,
          providers,
          ageRating,
          matchScore: x.matchScore,
          matchReasons: x.matchReasons,
        };

        return item;
      });

      return { items: enriched };
    } catch (e: unknown) {
      this.logger.error(
        `recommend failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new InternalServerErrorException(
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}
