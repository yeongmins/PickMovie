// frontend/src/lib/trends.ts
import { apiGet, apiPost } from "./apiClient";

export type MediaType = "movie" | "tv";

// -----------------------
// POST /trends (신규 트렌드 검색/필터링용)
// -----------------------
export type TrendItem = {
  id: number;
  mediaType: MediaType;
  title: string;
  overview?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  voteAverage?: number;
  voteCount?: number;
  releaseDate?: string | null; // movie면 release_date, tv면 first_air_date
};

export type TrendsResponse = { items: TrendItem[] };

export type TrendsRequest = {
  mediaTypes?: MediaType[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
  genreIds?: number[];
  yearFrom?: number | null;
  yearTo?: number | null;
  language?: string;
  region?: string;
  page?: number;
  includeAdult?: boolean;
  sortBy?: string;
};

// ✅ 백엔드 POST /trends
export async function fetchTrends(body: TrendsRequest) {
  return apiPost<TrendsResponse>("/trends", body);
}

// -----------------------
// GET /trends/kr (PickMovie 오늘의 인기차트용)
// -----------------------
export type KrTrendItem = {
  tmdbId: number | null;
  keyword: string;
  rank: number;
  score: number;
  mediaType?: MediaType; // (추후 백엔드 확장 대비)
};

export type KrTrendsResponse = {
  date: string;
  items: KrTrendItem[];
};

export async function getKrTrends(limit = 10) {
  return apiGet<KrTrendsResponse>("/trends/kr", { limit });
}

// ✅ Picky 키워드 칩에 재사용
export function extractTrendKeywords(items: KrTrendItem[], max = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const it of items || []) {
    const k = String(it?.keyword || "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}
