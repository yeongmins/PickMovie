// backend/src/picky/picky.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  PickyRecommendDto,
  PickyItem,
  PickyRecommendResponse,
  ProviderBadge,
} from './dto/picky.dto';
import {
  clamp,
  errMessage,
  isArray,
  isNumber,
  isRecord,
  isString,
  toNumberOrNull,
  toStringOrNull,
} from '../common/safe';

type TmdbMediaType = 'movie' | 'tv';

interface TmdbDiscoverItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  original_language?: string;
}

type CacheEntry = { id: number; exp: number };

@Injectable()
export class PickyService {
  private readonly tmdbBase =
    process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3';

  private readonly keywordCache = new Map<string, CacheEntry>();
  private readonly companyCache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 1000 * 60 * 60 * 24; // 24h

  private get apiKey(): string {
    const k = process.env.TMDB_API_KEY;
    if (!k)
      throw new BadRequestException('TMDB_API_KEY가 설정되어 있지 않습니다.');
    return k;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new InternalServerErrorException(`TMDB 요청 실패: ${res.status}`);
    }
    return (await res.json()) as unknown;
  }

  private uniqNums(arr: Array<number | null | undefined>): number[] {
    const s = new Set<number>();
    for (const n of arr)
      if (typeof n === 'number' && Number.isFinite(n)) s.add(n);
    return Array.from(s);
  }

  private normKey(s: string) {
    return (s || '').trim().toLowerCase();
  }

  private shouldTryCompany(term: string) {
    const t = (term || '').trim();
    if (!t) return false;

    // 너무 일반적인 단어는 회사 검색 제외
    if (t.length <= 1) return false;
    if (
      /(추천|영화|드라마|애니|애니메이션|시리즈|힐링|감성|잔잔|명작|인기|최신|요즘|재밌|느낌)/i.test(
        t,
      )
    )
      return false;

    // “스튜디오/필름/픽처스/엔터/애니메이션” 류는 회사일 확률 높음
    if (
      /(스튜디오|필름|픽처스|엔터|애니메이션|studio|films|pictures|animation)/i.test(
        t,
      )
    )
      return true;

    // 영어 Proper-ish(대문자 포함) or 흔한 브랜드 키워드
    if (/[A-Z]/.test(t)) return true;
    if (
      /(disney|pixar|ghibli|marvel|lucasfilm|warner|paramount|universal|netflix|hbo|a24)/i.test(
        t,
      )
    )
      return true;

    // 한국어 2~8글자 고유명사 느낌도 회사일 수 있어서 허용(너무 길면 제외)
    if (/^[가-힣]{2,8}$/.test(t)) return true;

    return false;
  }

  private async searchKeywordId(term: string): Promise<number | null> {
    const key = this.normKey(term);
    if (!key) return null;

    const cached = this.keywordCache.get(key);
    if (cached && cached.exp > Date.now()) return cached.id;

    const url =
      `${this.tmdbBase}/search/keyword?api_key=${encodeURIComponent(this.apiKey)}` +
      `&query=${encodeURIComponent(term)}&page=1`;

    const data = await this.fetchJson(url);
    if (!isRecord(data) || !isArray(data.results) || data.results.length === 0)
      return null;

    const first = data.results[0];
    if (!isRecord(first)) return null;

    const id = toNumberOrNull(first.id);
    if (id === null) return null;

    this.keywordCache.set(key, { id, exp: Date.now() + this.cacheTtlMs });
    return id;
  }

  private async searchCompanyId(term: string): Promise<number | null> {
    const key = this.normKey(term);
    if (!key) return null;

    const cached = this.companyCache.get(key);
    if (cached && cached.exp > Date.now()) return cached.id;

    const url =
      `${this.tmdbBase}/search/company?api_key=${encodeURIComponent(this.apiKey)}` +
      `&query=${encodeURIComponent(term)}&page=1`;

    const data = await this.fetchJson(url);
    if (!isRecord(data) || !isArray(data.results) || data.results.length === 0)
      return null;

    const first = data.results[0];
    if (!isRecord(first)) return null;

    const id = toNumberOrNull(first.id);
    if (id === null) return null;

    this.companyCache.set(key, { id, exp: Date.now() + this.cacheTtlMs });
    return id;
  }

  private buildDiscoverUrl(
    mediaType: TmdbMediaType,
    dto: PickyRecommendDto,
    opts: {
      keywordIds: number[];
      withoutKeywordIds: number[];
      companyIds: number[];
    },
  ): string {
    const params = new URLSearchParams();

    params.set('api_key', this.apiKey);
    params.set('include_adult', 'false');

    // ✅ 기본 정렬은 popularity지만, 우리는 with_keywords/with_companies로 “풀 자체”를 좁힌다
    params.set('sort_by', 'popularity.desc');
    params.set('page', String(dto.page ?? 1));
    params.set('language', process.env.TMDB_LANGUAGE ?? 'ko-KR');

    if (dto.genreIds?.length) params.set('with_genres', dto.genreIds.join(','));
    if (dto.originalLanguage)
      params.set('with_original_language', dto.originalLanguage);

    if (mediaType === 'movie') {
      if (dto.yearFrom)
        params.set('primary_release_date.gte', `${dto.yearFrom}-01-01`);
      if (dto.yearTo)
        params.set('primary_release_date.lte', `${dto.yearTo}-12-31`);

      // ✅ 회사(스튜디오) 필터는 영화쪽에서 특히 효과가 큼
      if (opts.companyIds.length)
        params.set('with_companies', opts.companyIds.join(','));
    } else {
      if (dto.yearFrom)
        params.set('first_air_date.gte', `${dto.yearFrom}-01-01`);
      if (dto.yearTo) params.set('first_air_date.lte', `${dto.yearTo}-12-31`);
    }

    // ✅ 키워드 필터 (movie/tv 공통)
    if (opts.keywordIds.length)
      params.set('with_keywords', opts.keywordIds.join(','));
    if (opts.withoutKeywordIds.length)
      params.set('without_keywords', opts.withoutKeywordIds.join(','));

    return `${this.tmdbBase}/discover/${mediaType}?${params.toString()}`;
  }

  private normalizeDiscoverItems(data: unknown): TmdbDiscoverItem[] {
    if (!isRecord(data) || !isArray(data.results)) return [];
    const out: TmdbDiscoverItem[] = [];

    for (const raw of data.results) {
      if (!isRecord(raw)) continue;
      const id = toNumberOrNull(raw.id);
      if (id === null) continue;

      out.push({
        id,
        title: toStringOrNull(raw.title) ?? undefined,
        name: toStringOrNull(raw.name) ?? undefined,
        overview: toStringOrNull(raw.overview) ?? undefined,
        poster_path:
          raw.poster_path === null || isString(raw.poster_path)
            ? raw.poster_path
            : null,
        backdrop_path:
          raw.backdrop_path === null || isString(raw.backdrop_path)
            ? raw.backdrop_path
            : null,
        vote_average: toNumberOrNull(raw.vote_average) ?? undefined,
        vote_count: toNumberOrNull(raw.vote_count) ?? undefined,
        release_date: toStringOrNull(raw.release_date) ?? undefined,
        first_air_date: toStringOrNull(raw.first_air_date) ?? undefined,
        genre_ids: isArray(raw.genre_ids)
          ? raw.genre_ids.filter(isNumber).map((n) => Math.trunc(n))
          : undefined,
        original_language: toStringOrNull(raw.original_language) ?? undefined,
      });
    }

    return out;
  }

  private async getWatchProviders(
    mediaType: TmdbMediaType,
    id: number,
    region: string,
  ): Promise<ProviderBadge[]> {
    const url = `${this.tmdbBase}/${mediaType}/${id}/watch/providers?api_key=${encodeURIComponent(
      this.apiKey,
    )}`;
    const data = await this.fetchJson(url);

    if (
      !isRecord(data) ||
      !isRecord(data.results) ||
      !isRecord(data.results[region])
    )
      return [];

    const r = data.results[region];
    if (!isRecord(r)) return [];

    const buckets = ['flatrate', 'rent', 'buy'] as const;
    const merged: ProviderBadge[] = [];

    for (const key of buckets) {
      const arr = r[key];
      if (!isArray(arr)) continue;

      for (const it of arr) {
        if (!isRecord(it)) continue;
        const providerId = toNumberOrNull(it.provider_id);
        const providerName = toStringOrNull(it.provider_name);
        const logoPath =
          it.logo_path === null || isString(it.logo_path) ? it.logo_path : null;
        if (providerId === null || providerName === null) continue;
        merged.push({ providerId, providerName, logoPath });
      }
    }

    const map = new Map<number, ProviderBadge>();
    for (const p of merged) map.set(p.providerId, p);
    return Array.from(map.values()).slice(0, 6);
  }

  private async getAgeRating(
    mediaType: TmdbMediaType,
    id: number,
    region: string,
  ): Promise<string | null> {
    if (mediaType === 'movie') {
      const url = `${this.tmdbBase}/movie/${id}/release_dates?api_key=${encodeURIComponent(
        this.apiKey,
      )}`;
      const data = await this.fetchJson(url);
      if (!isRecord(data) || !isArray(data.results)) return null;

      for (const it of data.results) {
        if (!isRecord(it)) continue;
        if (toStringOrNull(it.iso_3166_1) !== region) continue;
        if (!isArray(it.release_dates)) continue;

        for (const rd of it.release_dates) {
          if (!isRecord(rd)) continue;
          const cert = toStringOrNull(rd.certification);
          if (cert && cert.trim().length > 0) return cert.trim();
        }
      }
      return null;
    }

    const url = `${this.tmdbBase}/tv/${id}/content_ratings?api_key=${encodeURIComponent(
      this.apiKey,
    )}`;
    const data = await this.fetchJson(url);
    if (!isRecord(data) || !isArray(data.results)) return null;

    for (const it of data.results) {
      if (!isRecord(it)) continue;
      if (toStringOrNull(it.iso_3166_1) !== region) continue;
      const rating = toStringOrNull(it.rating);
      if (rating && rating.trim().length > 0) return rating.trim();
    }

    return null;
  }

  private calcMatchScore(
    dto: PickyRecommendDto,
    item: TmdbDiscoverItem,
    mediaType: TmdbMediaType,
  ) {
    let score = 45;
    const reasons: string[] = [];

    if (dto.mediaTypes?.length && dto.mediaTypes.includes(mediaType)) {
      score += 10;
      reasons.push(`${mediaType === 'movie' ? '영화' : 'TV'} 타입 일치`);
    }

    if (dto.genreIds?.length && item.genre_ids?.length) {
      const hit = dto.genreIds.some((g) => item.genre_ids?.includes(g));
      if (hit) {
        score += 14;
        reasons.push('선호 장르와 일부 일치');
      }
    }

    const dateStr =
      mediaType === 'movie' ? item.release_date : item.first_air_date;
    const year = dateStr ? Number(dateStr.slice(0, 4)) : null;
    if (year && (dto.yearFrom || dto.yearTo)) {
      const okFrom = dto.yearFrom ? year >= dto.yearFrom : true;
      const okTo = dto.yearTo ? year <= dto.yearTo : true;
      if (okFrom && okTo) {
        score += 8;
        reasons.push('연도 범위 일치');
      }
    }

    if (
      dto.originalLanguage &&
      item.original_language === dto.originalLanguage
    ) {
      score += 5;
      reasons.push('원어(언어) 일치');
    }

    // ✅ 키워드 텍스트 매칭(중요)
    const include = (dto.includeKeywords ?? [])
      .map((s) => (s || '').trim())
      .filter(Boolean);
    if (include.length) {
      const text =
        `${item.title ?? item.name ?? ''} ${item.overview ?? ''}`.toLowerCase();
      let hit = 0;
      for (const k of include) {
        const kk = k.toLowerCase();
        if (kk && text.includes(kk)) hit += 1;
      }

      const bonus = clamp(hit * 6, 0, 30);
      score += bonus;

      if (hit > 0) reasons.push(`키워드 ${hit}개 매칭 (+${bonus})`);
      else score -= 10; // 키워드가 있는데 하나도 안맞으면 강하게 패널티
    }

    const va = item.vote_average ?? 0;
    const vc = item.vote_count ?? 0;
    if (va >= 7.0) {
      score += 4;
      reasons.push('평점이 높은 편');
    }
    if (vc >= 500) {
      score += 4;
      reasons.push('평가 수가 충분함');
    }

    score = clamp(score, 0, 100);
    return { score, reasons };
  }

  async recommend(dto: PickyRecommendDto): Promise<PickyRecommendResponse> {
    const region = dto.region ?? process.env.TMDB_REGION ?? 'KR';
    const mediaTypes: TmdbMediaType[] =
      dto.mediaTypes && dto.mediaTypes.length
        ? (dto.mediaTypes as TmdbMediaType[])
        : ['movie', 'tv'];

    const include = (dto.includeKeywords ?? [])
      .map((s) => (s || '').trim())
      .filter(Boolean);
    const exclude = (dto.excludeKeywords ?? [])
      .map((s) => (s || '').trim())
      .filter(Boolean);

    try {
      // ✅ keywordId / companyId를 만들어 discover 필터로 사용
      const keywordIds = this.uniqNums(
        await Promise.all(
          include.slice(0, 18).map((k) => this.searchKeywordId(k)),
        ),
      );

      const withoutKeywordIds = this.uniqNums(
        await Promise.all(
          exclude.slice(0, 12).map((k) => this.searchKeywordId(k)),
        ),
      );

      const companyTerms = include
        .filter((k) => this.shouldTryCompany(k))
        .slice(0, 10);
      const companyIds = this.uniqNums(
        await Promise.all(companyTerms.map((k) => this.searchCompanyId(k))),
      );

      const pages = await Promise.all(
        mediaTypes.map(async (mt) => {
          const url = this.buildDiscoverUrl(mt, dto, {
            keywordIds,
            withoutKeywordIds,
            companyIds,
          });
          const data = await this.fetchJson(url);
          return { mt, items: this.normalizeDiscoverItems(data) };
        }),
      );

      // ✅ 1) 먼저 “가벼운 점수”로 후보를 추림 (여기서 relevancy가 결정됨)
      const merged = pages.flatMap((p) =>
        p.items.map((it) => ({ mt: p.mt, it })),
      );

      const scored = merged
        .map(({ mt, it }) => {
          const ms = this.calcMatchScore(dto, it, mt);
          return { mt, it, ms };
        })
        .sort((a, b) => b.ms.score - a.ms.score)
        .slice(0, 24); // 후보를 넉넉히

      // ✅ 2) 후보만 OTT/등급 enrich → 속도/비용 최적화
      const enriched: PickyItem[] = await Promise.all(
        scored.map(async ({ mt, it, ms }) => {
          const title = (mt === 'movie' ? it.title : it.name) ?? 'Untitled';
          const overview = it.overview ?? '';
          const dateStr = mt === 'movie' ? it.release_date : it.first_air_date;
          const year = dateStr ? Number(dateStr.slice(0, 4)) : null;

          const [providers, ageRating] = await Promise.all([
            this.getWatchProviders(mt, it.id, region),
            this.getAgeRating(mt, it.id, region),
          ]);

          return {
            id: it.id,
            mediaType: mt,
            title,
            overview,
            posterPath: it.poster_path ?? null,
            backdropPath: it.backdrop_path ?? null,
            voteAverage: it.vote_average ?? 0,
            voteCount: it.vote_count ?? 0,
            releaseDate: dateStr ?? null,
            year: Number.isFinite(year ?? NaN) ? year : null,
            genreIds: it.genre_ids ?? [],
            originalLanguage: it.original_language ?? null,
            providers,
            ageRating,
            matchScore: ms.score,
            matchReasons: ms.reasons,
          };
        }),
      );

      enriched.sort((a, b) => b.matchScore - a.matchScore);
      return { items: enriched };
    } catch (e: unknown) {
      throw new InternalServerErrorException(errMessage(e));
    }
  }
}
