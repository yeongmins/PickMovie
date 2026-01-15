// backend/src/meta/meta.types.ts
export type MediaType = 'movie' | 'tv';

export type ContentKind = 'MOVIE' | 'TV' | 'ANI';
export type ReleaseStatus = 'NOW_SHOWING' | 'UPCOMING' | 'RE_RELEASE' | 'NONE';

/** ✅ 프론트로 내보내는 값은 "12/15/19" */
export type AgeRating = 'ALL' | '12' | '15' | '19' | 'UNKNOWN';

export type WatchProviderItem = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
};

export type WatchProviders = {
  link?: string | null;
  flatrate?: WatchProviderItem[];
  free?: WatchProviderItem[];
  ads?: WatchProviderItem[];
  rent?: WatchProviderItem[];
  buy?: WatchProviderItem[];
};

export type ResolveRequest = { mediaType: MediaType; tmdbId: number };

export type ResolvedMeta = {
  mediaType: MediaType;
  tmdbId: number;

  contentKind: ContentKind;
  releaseStatus: ReleaseStatus;
  ageRating: AgeRating;
  releaseYear: number | null;

  watchProviders: WatchProviders | null;

  metaVersion: number;
  resolvedAt: string;
  expiresAt: string | null;

  // 디버깅/운영용 (DB Json 그대로 내려줌)
  sourcesUsed: Record<string, unknown> | null;
};
