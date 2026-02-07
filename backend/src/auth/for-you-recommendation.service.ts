import { Injectable, Logger } from '@nestjs/common';
import { TmdbService } from '../tmdb/tmdb.service';
import { UserLibraryService } from './user-library.service';
import { TrendsService } from '../trends/trends.service';
import { isBlockedContentByPolicy } from '../common/content-policy';

type ApiMediaType = 'movie' | 'tv';
type CandidateMediaType = 'movie' | 'tv';

type FavoriteItem = { id: number; mediaType: ApiMediaType };
type PlaylistDto = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{ id: number; mediaType: ApiMediaType; addedAt: Date }>;
};

type ForYouPreferences = {
  genres?: string[];
  releaseYear?: string;
};

type ProfileItem = {
  id: number;
  media_type: CandidateMediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  original_language?: string;
};

type CandidateItem = ProfileItem;

type CandidateScored = CandidateItem & {
  _genreIds: number[];
  _hybridRaw: number;
  matchScore: number;
  showMatchBadge: true;
  recommendReason: string;
};

type ForYouResultItem = CandidateItem & {
  matchScore: number;
  showMatchBadge: true;
  recommendReason: string;
  media_type: CandidateMediaType;
};

type FavoriteProfile = {
  genreHist: Map<number, number>;
  genreWeight: Map<number, number>;
  decadeWeight: Map<number, number>;
  langWeight: Map<string, number>;
  topGenreIds: number[];
  mediaWeight: Map<CandidateMediaType, number>;
  animeAffinity: number;
};

type TrendItem = {
  tmdbId: number;
  tmdbType?: string;
  mediaType?: string;
  rank?: number;
  score?: number;
};

const GENRE_IDS: Record<string, number> = {
  액션: 28,
  코미디: 35,
  로맨스: 10749,
  스릴러: 53,
  SF: 878,
  드라마: 18,
  공포: 27,
  애니메이션: 16,
  판타지: 14,
  범죄: 80,
  모험: 12,
  미스터리: 9648,
  가족: 10751,
  음악: 10402,
  다큐멘터리: 99,
};

@Injectable()
export class ForYouRecommendationService {
  private readonly logger = new Logger(ForYouRecommendationService.name);

  constructor(
    private readonly library: UserLibraryService,
    private readonly tmdb: TmdbService,
    private readonly trends: TrendsService,
  ) {}

  async recommendForUser(args: {
    userId: number;
    limit?: number;
    region?: string;
    language?: string;
    preferences?: ForYouPreferences;
  }): Promise<ForYouResultItem[]> {
    const userId = Number(args.userId);
    const limit = this.clampInt(args.limit, 20, 1, 40);
    const region = String(args.region ?? 'KR').trim() || 'KR';
    const language = String(args.language ?? 'ko-KR').trim() || 'ko-KR';
    const preferences: ForYouPreferences = {
      genres: Array.isArray(args.preferences?.genres)
        ? args.preferences?.genres
        : [],
      releaseYear: String(args.preferences?.releaseYear ?? '').trim(),
    };

    if (!Number.isFinite(userId) || userId <= 0) return [];

    const [favorites, playlists] = await Promise.all([
      this.library.getFavorites(userId),
      this.library.getPlaylists(userId),
    ]);

    const sourceItems = this.buildSourceItems(favorites, playlists);
    if (sourceItems.length < 5) return [];

    const details = await this.loadProfileDetails(sourceItems, language);
    if (details.length === 0) return [];

    const profile = this.buildFavoriteProfile(details);

    const prefIds = (preferences.genres ?? [])
      .map((g) => GENRE_IDS[g])
      .filter((x): x is number => Number.isFinite(x) && x > 0);

    const topFromProfile = Array.from(profile.genreHist.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const seedGenreIds = Array.from(
      new Set([...topFromProfile, ...prefIds]),
    ).slice(0, 7);

    if (seedGenreIds.length === 0) return [];

    const animePriority = profile.animeAffinity >= 0.2;
    const tvSeed = seedGenreIds.slice(0, 6).join(',');
    const movieSeed = seedGenreIds.join(',');

    const [
      discoverMovieP1,
      discoverMovieP2,
      discoverMovieVote,
      discoverTvP1Raw,
      discoverTvP2Raw,
      discoverTvVoteRaw,
      popularMovie,
      topRatedMovie,
      popularTv,
      topRatedTvRaw,
      animeMovieRaw,
      animeTvRaw,
      trendRes,
    ] = await Promise.all([
      this.tmdb.discoverMovies({
        page: 1,
        with_genres: movieSeed,
        sort_by: 'popularity.desc',
        region,
        language,
        include_adult: false,
      }),
      this.tmdb.discoverMovies({
        page: 2,
        with_genres: movieSeed,
        sort_by: 'popularity.desc',
        region,
        language,
        include_adult: false,
      }),
      this.tmdb.discoverMovies({
        page: 1,
        with_genres: seedGenreIds.slice(0, 3).join(','),
        sort_by: 'vote_average.desc',
        'vote_count.gte': 100,
        region,
        language,
        include_adult: false,
      }),
      this.tmdb.proxy('/discover/tv', {
        page: 1,
        with_genres: tvSeed,
        sort_by: 'popularity.desc',
        region,
        language,
        include_adult: false,
      }),
      this.tmdb.proxy('/discover/tv', {
        page: 2,
        with_genres: tvSeed,
        sort_by: 'popularity.desc',
        region,
        language,
        include_adult: false,
      }),
      this.tmdb.proxy('/discover/tv', {
        page: 1,
        with_genres: seedGenreIds.slice(0, 3).join(','),
        sort_by: 'vote_average.desc',
        'vote_count.gte': 100,
        region,
        language,
        include_adult: false,
      }),
      this.tmdb.getPopularMovies(1, region, language),
      this.tmdb.getTopRatedMovies(1, region, language),
      this.tmdb.getPopularTVShows(1, language),
      this.tmdb.proxy('/tv/top_rated', {
        page: 1,
        language,
      }),
      this.tmdb.proxy('/discover/movie', {
        page: 1,
        with_genres: 16,
        sort_by: 'popularity.desc',
        region,
        language,
        include_adult: false,
      }),
      this.tmdb.proxy('/discover/tv', {
        page: 1,
        with_genres: 16,
        sort_by: 'popularity.desc',
        region,
        language,
        include_adult: false,
      }),
      this.trends.getRankedTrends({ limit: 120 }).catch(() => ({
        date: '',
        items: [],
      })),
    ]);

    const moviePopularMap = this.buildRankMap(popularMovie?.results ?? []);
    const movieTopRatedMap = this.buildRankMap(topRatedMovie?.results ?? []);
    const tvPopularMap = this.buildRankMap(popularTv?.results ?? []);
    const tvTopRatedMap = this.buildRankMap(
      this.getResultsFromUnknown(topRatedTvRaw),
    );

    const trendMap = new Map<string, { rank: number; score: number }>();
    for (const raw of Array.isArray(trendRes?.items) ? trendRes.items : []) {
      const t = this.toTrendItem(raw);
      if (!t) continue;
      const tmdbTypeRaw = (t.tmdbType ?? '').toLowerCase();
      const mediaTypeRaw = (t.mediaType ?? '').toLowerCase();
      const mt: CandidateMediaType =
        tmdbTypeRaw === 'tv' || mediaTypeRaw === 'tv' ? 'tv' : 'movie';
      const key = `${mt}:${t.tmdbId}`;
      trendMap.set(key, {
        rank: t.rank || 999,
        score: t.score || 0,
      });
    }

    const favoriteKeySet = new Set(
      sourceItems.map((x) => `${x.mediaType}:${x.id}`),
    );

    const candidateInputs: Array<{
      rows: unknown[];
      mediaType: CandidateMediaType;
    }> = [
      { rows: discoverMovieP1?.results ?? [], mediaType: 'movie' },
      { rows: discoverMovieP2?.results ?? [], mediaType: 'movie' },
      { rows: discoverMovieVote?.results ?? [], mediaType: 'movie' },
      { rows: popularMovie?.results ?? [], mediaType: 'movie' },
      { rows: topRatedMovie?.results ?? [], mediaType: 'movie' },
      { rows: this.getResultsFromUnknown(discoverTvP1Raw), mediaType: 'tv' },
      { rows: this.getResultsFromUnknown(discoverTvP2Raw), mediaType: 'tv' },
      { rows: this.getResultsFromUnknown(discoverTvVoteRaw), mediaType: 'tv' },
      { rows: popularTv?.results ?? [], mediaType: 'tv' },
      { rows: this.getResultsFromUnknown(topRatedTvRaw), mediaType: 'tv' },
    ];

    if (animePriority) {
      candidateInputs.push(
        { rows: this.getResultsFromUnknown(animeMovieRaw), mediaType: 'movie' },
        { rows: this.getResultsFromUnknown(animeTvRaw), mediaType: 'tv' },
      );
    }

    const candidates = this.normalizeCandidatePool(
      candidateInputs,
      favoriteKeySet,
    );
    if (candidates.length === 0) return [];

    const scored = candidates
      .map((c) => {
        const gid = this.extractGenreIds(c);

        const base01 = this.normalizeScoreTo01(
          this.calculatePreferenceBaseScore(c, preferences),
        );

        let genreAffinity = 0;
        if (gid.length > 0) {
          let sum = 0;
          for (const id of gid) sum += profile.genreWeight.get(id) || 0;
          genreAffinity = this.clamp01(sum / gid.length);
        }

        const y = this.getYearFromAny(c);
        const decadeAffinity =
          y && profile.decadeWeight.size > 0
            ? this.clamp01(
                profile.decadeWeight.get(this.getDecadeBucket(y)) || 0,
              )
            : 0;

        const lang = String(c.original_language ?? '').trim();
        const langAffinity = lang
          ? this.clamp01(profile.langWeight.get(lang) || 0)
          : 0;

        const quality01 = this.clamp01(((Number(c.vote_average) || 0) - 5) / 5);
        const popularity01 = this.clamp01(
          Math.log10(1 + (Number(c.popularity) || 0)) / 3,
        );

        const popRank =
          c.media_type === 'tv'
            ? (tvPopularMap.get(c.id) ?? 999)
            : (moviePopularMap.get(c.id) ?? 999);
        const topRank =
          c.media_type === 'tv'
            ? (tvTopRatedMap.get(c.id) ?? 999)
            : (movieTopRatedMap.get(c.id) ?? 999);
        const popRank01 =
          popRank < 999 ? this.clamp01((51 - Math.min(50, popRank)) / 50) : 0;
        const topRank01 =
          topRank < 999 ? this.clamp01((51 - Math.min(50, topRank)) / 50) : 0;
        const globalRank01 = 0.6 * popRank01 + 0.4 * topRank01;

        const trend = trendMap.get(`${c.media_type}:${c.id}`);
        const trendRank = trend?.rank ?? 999;
        const trendRank01 =
          trendRank < 999
            ? this.clamp01((101 - Math.min(100, trendRank)) / 100)
            : 0;
        const trendScore01 = this.clamp01((trend?.score ?? 0) / 2.5);
        const trend01 = 0.6 * trendRank01 + 0.4 * trendScore01;

        const mediaAffinity = this.clamp01(
          profile.mediaWeight.get(c.media_type) || 0,
        );

        const isAnime = gid.includes(16);
        const animeFit = isAnime ? profile.animeAffinity : 0;

        const hybrid01 =
          0.32 * base01 +
          0.25 * genreAffinity +
          0.18 * mediaAffinity +
          0.08 * animeFit +
          0.06 * decadeAffinity +
          0.06 * langAffinity +
          0.08 * quality01 +
          0.01 * popularity01 +
          0.02 * globalRank01 +
          0.1 * trend01;

        const reasonGenres = gid
          .filter((id) => profile.topGenreIds.includes(id))
          .slice(0, 2);

        const reason =
          reasonGenres.length > 0
            ? '내 취향을 바탕으로 찾은 추천작'
            : '내가 좋아할 만한 작품';

        const out: CandidateScored = {
          ...c,
          _genreIds: gid,
          _hybridRaw: hybrid01,
          matchScore: Math.max(1, Math.min(99, Math.round(hybrid01 * 99))),
          showMatchBadge: true,
          recommendReason: reason,
        };
        return out;
      })
      .sort((a, b) => b._hybridRaw - a._hybridRaw);

    const reranked = this.rerankByDiversity(
      scored,
      Math.max(limit * 2, limit),
    ).map((item) => {
      const rest: Omit<CandidateScored, '_genreIds' | '_hybridRaw'> = {
        ...item,
      };
      delete (rest as Partial<CandidateScored>)._genreIds;
      delete (rest as Partial<CandidateScored>)._hybridRaw;
      return rest;
    });

    return this.selectByMediaQuota(reranked, limit, profile.mediaWeight);
  }

  private clampInt(
    v: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    const x = Math.floor(n);
    if (x < min) return min;
    if (x > max) return max;
    return x;
  }

  private isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
  }

  private asString(v: unknown): string {
    return typeof v === 'string' ? v : '';
  }

  private asNumber(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  private toTrendItem(v: unknown): TrendItem | null {
    if (!this.isRecord(v)) return null;
    const tmdbId = this.asNumber(v['tmdbId']);
    if (!tmdbId) return null;
    return {
      tmdbId,
      tmdbType: this.asString(v['tmdbType']),
      mediaType: this.asString(v['mediaType']),
      rank: this.asNumber(v['rank']),
      score: this.asNumber(v['score']),
    };
  }

  private asNumberArray(v: unknown): number[] {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null))
      .filter((x): x is number => x !== null);
  }

  private buildSourceItems(
    favorites: FavoriteItem[],
    playlists: PlaylistDto[],
  ): FavoriteItem[] {
    const map = new Map<string, FavoriteItem>();

    for (const f of favorites) {
      const id = Number(f?.id);
      const mt: ApiMediaType = f?.mediaType === 'tv' ? 'tv' : 'movie';
      if (!Number.isFinite(id) || id <= 0) continue;
      map.set(`${mt}:${id}`, { id, mediaType: mt });
    }

    for (const p of playlists) {
      for (const it of p.items ?? []) {
        const id = Number(it?.id);
        const mt: ApiMediaType = it?.mediaType === 'tv' ? 'tv' : 'movie';
        if (!Number.isFinite(id) || id <= 0) continue;
        map.set(`${mt}:${id}`, { id, mediaType: mt });
      }
    }

    return Array.from(map.values());
  }

  private async loadProfileDetails(
    items: FavoriteItem[],
    language: string,
  ): Promise<ProfileItem[]> {
    const settled = await this.pMapLimit(items, 6, async (it) => {
      try {
        const detail =
          it.mediaType === 'tv'
            ? await this.tmdb.getTVDetails(it.id, language)
            : await this.tmdb.getMovieDetails(it.id, language);
        const normalized = this.normalizeDetailToProfileItem(
          detail,
          it.mediaType,
        );
        return normalized;
      } catch {
        this.logger.debug(`detail load failed: ${it.mediaType}:${it.id}`);
        return null;
      }
    });

    return settled.filter((x): x is ProfileItem => x !== null);
  }

  private normalizeDetailToProfileItem(
    raw: unknown,
    mediaType: ApiMediaType,
  ): ProfileItem | null {
    if (!this.isRecord(raw)) return null;

    const id = this.asNumber(raw.id);
    if (!id) return null;

    const genresRaw = Array.isArray(raw.genres) ? raw.genres : [];
    const fromGenres = genresRaw
      .map((g) =>
        this.isRecord(g) && typeof g.id === 'number' && Number.isFinite(g.id)
          ? g.id
          : null,
      )
      .filter((x): x is number => x !== null);

    const fromGenreIds = this.asNumberArray(raw.genre_ids);
    const merged = Array.from(new Set([...fromGenreIds, ...fromGenres]));

    const title = this.asString(raw.title);
    const name = this.asString(raw.name);
    const overview = this.asString(raw.overview);

    const out: ProfileItem = {
      id,
      media_type: mediaType === 'tv' ? 'tv' : 'movie',
      title: mediaType === 'tv' ? name || title : title || name,
      name,
      original_title: this.asString(raw.original_title),
      original_name: this.asString(raw.original_name),
      overview,
      poster_path:
        raw.poster_path === null
          ? null
          : typeof raw.poster_path === 'string'
            ? raw.poster_path
            : null,
      backdrop_path:
        raw.backdrop_path === null
          ? null
          : typeof raw.backdrop_path === 'string'
            ? raw.backdrop_path
            : null,
      vote_average: this.asNumber(raw.vote_average),
      vote_count: this.asNumber(raw.vote_count),
      popularity: this.asNumber(raw.popularity),
      release_date:
        mediaType === 'tv'
          ? this.asString(raw.first_air_date)
          : this.asString(raw.release_date),
      first_air_date: this.asString(raw.first_air_date),
      genre_ids: merged,
      original_language: this.asString(raw.original_language),
    };

    return out;
  }

  private normalizeCandidatePool(
    rawItems: Array<{ rows: unknown[]; mediaType: CandidateMediaType }>,
    favoriteKeySet: Set<string>,
  ): CandidateItem[] {
    const out: CandidateItem[] = [];
    const seen = new Set<string>();

    for (const bucket of rawItems) {
      for (const raw of bucket.rows) {
        if (!this.isRecord(raw)) continue;

        const id = this.asNumber(raw.id);
        if (!id) continue;

        const mtRaw = this.asString(raw.media_type).toLowerCase();
        const mt: CandidateMediaType =
          mtRaw === 'tv' || bucket.mediaType === 'tv' ? 'tv' : 'movie';
        const key = `${mt}:${id}`;
        if (seen.has(key) || favoriteKeySet.has(key)) continue;

        const title = this.asString(raw.title);
        const name = this.asString(raw.name);
        const display = (title || name).trim();
        if (!display) continue;

        const candidate: CandidateItem = {
          id,
          media_type: mt,
          title,
          name,
          original_title: this.asString(raw.original_title),
          original_name: this.asString(raw.original_name),
          overview: this.asString(raw.overview),
          poster_path:
            raw.poster_path === null
              ? null
              : typeof raw.poster_path === 'string'
                ? raw.poster_path
                : null,
          backdrop_path:
            raw.backdrop_path === null
              ? null
              : typeof raw.backdrop_path === 'string'
                ? raw.backdrop_path
                : null,
          vote_average: this.asNumber(raw.vote_average),
          vote_count: this.asNumber(raw.vote_count),
          popularity: this.asNumber(raw.popularity),
          release_date:
            mt === 'tv'
              ? this.asString(raw.first_air_date)
              : this.asString(raw.release_date),
          first_air_date: this.asString(raw.first_air_date),
          genre_ids: this.asNumberArray(raw.genre_ids),
          original_language: this.asString(raw.original_language),
        };

        if (isBlockedContentByPolicy(candidate)) continue;

        seen.add(key);
        out.push(candidate);
      }
    }

    return out;
  }

  private buildRankMap(items: unknown[]): Map<number, number> {
    const out = new Map<number, number>();
    let rank = 0;
    for (const it of items) {
      rank += 1;
      if (!this.isRecord(it)) continue;
      const id = this.asNumber(it.id);
      if (!id || out.has(id)) continue;
      out.set(id, rank);
    }
    return out;
  }

  private extractGenreIds(
    item: { genre_ids?: number[] } | null | undefined,
  ): number[] {
    const arr = Array.isArray(item?.genre_ids) ? item.genre_ids : [];
    const clean = arr.filter(
      (x) => typeof x === 'number' && Number.isFinite(x) && x > 0,
    );
    return Array.from(new Set(clean));
  }

  private clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    return v;
  }

  private normalizeScoreTo01(score: number): number {
    return this.clamp01((score - 1) / 98);
  }

  private getYearFromAny(item: {
    release_date?: string;
    first_air_date?: string;
  }): number | null {
    const s = String(item.release_date || item.first_air_date || '').trim();
    if (!s) return null;
    const y = Number(s.slice(0, 4));
    if (!Number.isFinite(y) || y < 1800) return null;
    return y;
  }

  private getDecadeBucket(year: number): number {
    return Math.floor(year / 10) * 10;
  }

  private topGenresFromHistogram(
    hist: Map<number, number>,
    topN = 2,
  ): number[] {
    return Array.from(hist.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([id]) => id);
  }

  private buildFavoriteProfile(items: ProfileItem[]): FavoriteProfile {
    const genreHist = new Map<number, number>();
    const decadeHist = new Map<number, number>();
    const langHist = new Map<string, number>();
    const mediaHist = new Map<CandidateMediaType, number>();

    for (const it of items) {
      const gids = this.extractGenreIds(it);
      for (const gid of gids) {
        genreHist.set(gid, (genreHist.get(gid) || 0) + 1);
      }

      const y = this.getYearFromAny(it);
      if (y) {
        const d = this.getDecadeBucket(y);
        decadeHist.set(d, (decadeHist.get(d) || 0) + 1);
      }

      const lang = String(it.original_language || '').trim();
      if (lang) langHist.set(lang, (langHist.get(lang) || 0) + 1);

      const mt: CandidateMediaType = it.media_type === 'tv' ? 'tv' : 'movie';
      mediaHist.set(mt, (mediaHist.get(mt) || 0) + 1);
    }

    const normalize = <T>(hist: Map<T, number>): Map<T, number> => {
      const out = new Map<T, number>();
      const total = Array.from(hist.values()).reduce((s, v) => s + v, 0);
      if (total <= 0) return out;
      for (const [k, v] of hist.entries()) out.set(k, v / total);
      return out;
    };

    return {
      genreHist,
      genreWeight: normalize(genreHist),
      decadeWeight: normalize(decadeHist),
      langWeight: normalize(langHist),
      topGenreIds: this.topGenresFromHistogram(genreHist, 2),
      mediaWeight: normalize(mediaHist),
      animeAffinity: normalize(genreHist).get(16) ?? 0,
    };
  }

  private getResultsFromUnknown(raw: unknown): unknown[] {
    if (!this.isRecord(raw)) return [];
    const rows = raw.results;
    return Array.isArray(rows) ? rows : [];
  }

  private selectByMediaQuota(
    items: ForYouResultItem[],
    limit: number,
    mediaWeight: Map<CandidateMediaType, number>,
  ): ForYouResultItem[] {
    if (items.length <= limit) return items;

    const movieShare = this.clamp01(mediaWeight.get('movie') ?? 0.5);
    const tvShare = this.clamp01(mediaWeight.get('tv') ?? 0.5);
    const norm = movieShare + tvShare || 1;
    const movieTarget = Math.max(1, Math.round((movieShare / norm) * limit));
    const tvTarget = Math.max(1, limit - movieTarget);

    const picked: ForYouResultItem[] = [];
    let movieCount = 0;
    let tvCount = 0;

    for (const it of items) {
      if (picked.length >= limit) break;
      if (it.media_type === 'movie' && movieCount < movieTarget) {
        picked.push(it);
        movieCount += 1;
        continue;
      }
      if (it.media_type === 'tv' && tvCount < tvTarget) {
        picked.push(it);
        tvCount += 1;
      }
    }

    if (picked.length < limit) {
      const pickedKeys = new Set(picked.map((x) => `${x.media_type}:${x.id}`));
      for (const it of items) {
        if (picked.length >= limit) break;
        const k = `${it.media_type}:${it.id}`;
        if (pickedKeys.has(k)) continue;
        picked.push(it);
      }
    }

    return picked;
  }

  private calculatePreferenceBaseScore(
    item: CandidateItem,
    prefs: ForYouPreferences,
  ): number {
    let score = 50;

    const prefGenres = Array.isArray(prefs.genres) ? prefs.genres : [];
    const itemGenreIds = this.extractGenreIds(item);

    if (prefGenres.length > 0 && itemGenreIds.length > 0) {
      const prefIds = prefGenres
        .map((g) => GENRE_IDS[g])
        .filter((x): x is number => Number.isFinite(x) && x > 0);

      let matched = 0;
      for (const gid of itemGenreIds) {
        if (prefIds.includes(gid)) matched += 1;
      }

      score += Math.min(30, matched * 10);
    }

    const dateString = String(item.release_date || item.first_air_date || '');
    const releaseYearPref = String(prefs.releaseYear || '').trim();
    if (dateString && releaseYearPref) {
      const year = Number(new Date(dateString).getFullYear());
      if (Number.isFinite(year) && year > 1800) {
        if (releaseYearPref.endsWith('년')) {
          const target = parseInt(releaseYearPref, 10);
          if (year === target) score += 10;
        } else if (releaseYearPref === '2020년대' && year >= 2020) score += 8;
        else if (releaseYearPref === '2010년대' && year >= 2010 && year < 2020)
          score += 6;
        else if (releaseYearPref === '2000년대' && year >= 2000 && year < 2010)
          score += 4;
        else if (releaseYearPref === '고전' && year < 2000) score += 4;
      }
    }

    const rating = Number(item.vote_average) || 0;
    score += Math.min(10, Math.max(0, (rating - 5) * 2));

    return Math.max(1, Math.min(99, Math.round(score)));
  }

  private jaccardGenreSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const sa = new Set(a);
    const sb = new Set(b);
    let intersection = 0;
    for (const id of sa) {
      if (sb.has(id)) intersection += 1;
    }
    const union = new Set([...sa, ...sb]).size;
    if (union <= 0) return 0;
    return intersection / union;
  }

  private rerankByDiversity(
    items: CandidateScored[],
    limit: number,
  ): CandidateScored[] {
    const picked: CandidateScored[] = [];
    const remain = [...items];

    while (picked.length < limit && remain.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remain.length; i += 1) {
        const cur = remain[i];
        let maxSim = 0;
        for (const p of picked) {
          const sim = this.jaccardGenreSimilarity(cur._genreIds, p._genreIds);
          if (sim > maxSim) maxSim = sim;
        }
        const mmr = cur._hybridRaw - 0.18 * maxSim;
        if (mmr > bestScore) {
          bestScore = mmr;
          bestIdx = i;
        }
      }

      picked.push(remain[bestIdx]);
      remain.splice(bestIdx, 1);
    }

    return picked;
  }

  private async pMapLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, idx: number) => Promise<R>,
  ): Promise<R[]> {
    const max = Math.max(1, Math.min(limit, items.length));
    const out = new Array<R>(items.length);
    let cursor = 0;

    const workers = Array.from({ length: max }, async () => {
      while (cursor < items.length) {
        const idx = cursor;
        cursor += 1;
        out[idx] = await mapper(items[idx], idx);
      }
    });

    await Promise.all(workers);
    return out;
  }
}
