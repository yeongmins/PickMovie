// backend/src/meta/meta.types.ts

export type MediaType = 'movie' | 'tv';

export type StatusKind = 'now' | 'upcoming' | 'rerun' | null;

export type AgeRating = 'ALL' | '12' | '15' | '19' | 'UNKNOWN';

export type WatchProviderItem = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
};

export type WatchProviders = {
  link?: string;
  flatrate?: WatchProviderItem[];
  free?: WatchProviderItem[];
  ads?: WatchProviderItem[];
  rent?: WatchProviderItem[];
  buy?: WatchProviderItem[];
};

export type TheatricalInfo = {
  hasMultipleTheatrical: boolean;
  originalTheatricalDate: string | null;
  rerunTheatricalDate: string | null;

  /**
   * ✅ KOBIS는 메타데이터에 절대 적용하지 않음.
   * - 메인화면 하단 Top10 차트 용도로만 사용
   * - 따라서 메타에서는 항상 null로 유지
   */
  rerunKobisMovieCd: string | null;
};

export type ResolveRequest = { mediaType: MediaType; tmdbId: number };

export type SeasonMeta = {
  seasonNumber: number;
  name: string | null;
  airDate: string | null; // YYYY-MM-DD
  yearLabel: string | null; // "2026"
  posterPath: string | null; // TMDB poster_path
};

export type ResolvedMeta = {
  mediaType: MediaType;
  tmdbId: number;

  contentKind: string;
  releaseStatus: string;
  ageRating: AgeRating;
  releaseYear: number | null;
  watchProviders: WatchProviders | null;

  statusKind: StatusKind;
  unifiedYearLabel: string | null;

  providers: WatchProviderItem[];
  theatrical: TheatricalInfo | null;

  contentCardPosterPath: string | null;

  // ✅ 추가: 백엔드가 "아예 숨김" 판정 내려줌
  hidden?: boolean;

  // ✅ 추가: TV 상세 시즌 메타(프론트 계산 X)
  seasons?: SeasonMeta[] | null;

  metaVersion: number;
  resolvedAt: string;
  expiresAt: string | null;
  sourcesUsed: Record<string, unknown> | null;
};
