// frontend/src/features/home/homeCharts.api.ts
import { apiGetJson, apiPostJson } from "../../lib/http";

export type MediaType = "movie" | "tv";

export type HomeCollectionKey =
  | "POPULAR_MOVIE"
  | "POPULAR_TV"
  | "TRENDING_MOVIE"
  | "TRENDING_TV";

export type HomeChartItem = {
  mediaType: MediaType;
  tmdbId: number;
  rank: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
};

export type HomeChartsCollection = {
  key: HomeCollectionKey;
  generatedAt: string;
  items: HomeChartItem[];
};

export type HomeChartsResponse = {
  collections: HomeChartsCollection[];
};

export type ResolveRequest = { mediaType: MediaType; tmdbId: number };

export type ResolvedMeta = {
  mediaType: MediaType;
  tmdbId: number;

  contentKind: "MOVIE" | "TV" | "ANI";
  releaseStatus: "NOW_SHOWING" | "UPCOMING" | "RE_RELEASE" | "NONE";
  ageRating: "ALL" | "12" | "15" | "19" | "UNKNOWN";
  releaseYear: number | null;

  watchProviders: unknown | null;
  hidden?: boolean;
  adminHidden?: boolean;

  metaVersion: number;
  resolvedAt: string;
  expiresAt: string | null;

  sourcesUsed: unknown | null;
};

// ✅ TMDB 디테일(프록시)에서 카드에 필요한 최소만 씀
export type TmdbDetailLike = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
};

export async function fetchHomeCharts(): Promise<HomeChartsResponse> {
  return apiGetJson<HomeChartsResponse>("/home/charts");
}

export async function fetchMetaBatch(
  items: ResolveRequest[]
): Promise<ResolvedMeta[]> {
  return apiPostJson<ResolvedMeta[], { items: ResolveRequest[] }>(
    "/meta/batch",
    { items }
  );
}

/**
 * ✅ /tmdb/proxy/*path 가 TMDB v3 경로를 프록시한다고 가정:
 *   /tmdb/proxy/movie/550?language=ko-KR
 *   /tmdb/proxy/tv/1399?language=ko-KR
 */
export async function fetchTmdbDetailProxy(
  mediaType: MediaType,
  tmdbId: number
): Promise<TmdbDetailLike | null> {
  const qs = new URLSearchParams({ language: "ko-KR" }).toString();
  const data = await apiGetJson<unknown>(
    `/tmdb/proxy/${mediaType}/${tmdbId}?${qs}`
  );

  if (!data || typeof data !== "object") return null;

  const r = data as Partial<TmdbDetailLike>;
  if (typeof r.id !== "number") return null;

  return {
    id: r.id,
    title: typeof r.title === "string" ? r.title : undefined,
    name: typeof r.name === "string" ? r.name : undefined,
    original_title:
      typeof r.original_title === "string" ? r.original_title : undefined,
    original_name:
      typeof r.original_name === "string" ? r.original_name : undefined,
    overview: typeof r.overview === "string" ? r.overview : undefined,
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
    vote_average:
      typeof r.vote_average === "number" ? r.vote_average : undefined,
    release_date:
      typeof r.release_date === "string" ? r.release_date : undefined,
    first_air_date:
      typeof r.first_air_date === "string" ? r.first_air_date : undefined,
  };
}
