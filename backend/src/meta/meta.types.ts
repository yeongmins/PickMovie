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
  originalTheatricalDate: string | null; // YYYY-MM-DD
  rerunTheatricalDate: string | null; // YYYY-MM-DD

  /**
   * KOBIS는 메타데이터에 절대 적용하지 않음.
   * - 메인화면 하단 Top10 차트 용도로만 사용
   * - 따라서 메타에서는 항상 null로 유지
   */
  rerunKobisMovieCd: string | null;
};

export type ResolveRequest = { mediaType: MediaType; tmdbId: number };

export type DetailOverride = {
  title: string | null;
  originalTitle: string | null;
  overview: string | null;
  runtime: number | null;
  releaseDate: string | null;
};

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

  // 모든 화면에서 동일하게 쓰는 “통일 필드”
  contentKind: string; // MOVIE | TV | ANI
  releaseStatus: string; // UPCOMING | NOW_SHOWING | RE_RELEASE | NONE
  ageRating: AgeRating;
  releaseYear: number | null; // 컨텐츠카드/내찜/상세 히어로 출시년도 = 이 값으로 통일
  watchProviders: WatchProviders | null;

  statusKind: StatusKind;
  unifiedYearLabel: string | null;

  providers: WatchProviderItem[];
  theatrical: TheatricalInfo | null;

  // 컨텐츠카드 이미지(영화/TV/ANI 통일)
  contentCardPosterPath: string | null;

  // 백엔드가 “아예 숨김” 판정 내려줌
  hidden?: boolean;
  // 관리자 수동 비노출 토글 상태
  adminHidden?: boolean;

  // TV/Ani 상세 시즌 메타(프론트 계산 X)
  seasons?: SeasonMeta[] | null;

  /**
   * 상세 히어로 “첫 진입” (TV/Ani)
   * - 시즌뱃지 = heroSeasonYear
   * - 포스터   = heroPosterPath
   */
  heroSeasonYear?: number | null;
  heroPosterPath?: string | null;

  /**
   * 상세 컨텐츠정보(처음 개봉/처음 방영)
   * - 출시년도 = contentInfoReleaseYear (KR 기준 “처음”)
   * - 개봉일   = contentInfoLatestReleaseYmd (KR 기준 “가장 최근”)
   * - 재개봉일 = contentInfoRerunYmd (재개봉 상태일 때만)
   */
  contentInfoReleaseYear?: number | null; // “처음”의 연도
  contentInfoReleaseYmd?: string | null; // “처음”의 날짜(YYYY-MM-DD)
  contentInfoLatestReleaseYmd?: string | null; // “가장 최근” 개봉일(YYYY-MM-DD)
  contentInfoRerunYmd?: string | null; // 재개봉일(YYYY-MM-DD)

  detailOverride?: DetailOverride | null;

  metaVersion: number;
  resolvedAt: string;
  expiresAt: string | null;
  sourcesUsed: Record<string, unknown> | null;
};
