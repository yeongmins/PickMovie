// frontend/src/features/picky/algorithm/pickyAlgorithm.ts
import {
  extractTagsFromQuery,
  inferMediaTypes,
  inferYearRange,
  safeNum,
  uniq,
  extractIncludeKeywords,
} from "../utils/queryUtils";

type MediaType = "movie" | "tv";

// ✅ base가 http://localhost:3000 이든 http://localhost:3000/api 든 모두 지원
const RAW_API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3000";

function normalizeBase(base: string) {
  return String(base || "").replace(/\/+$/, "");
}

function joinUrl(base: string, path: string) {
  const b = normalizeBase(base);
  const p = String(path || "").replace(/^\/+/, ""); // leading slash 제거 (base path 유지)
  return `${b}/${p}`;
}

// ✅ base 후보들 자동 구성 (api prefix 유무 자동 대응)
function buildBaseCandidates(): string[] {
  const b = normalizeBase(RAW_API_BASE);
  const bNoApi = b.replace(/\/api$/i, "");
  const bApi = /\/api$/i.test(b) ? b : `${b}/api`;
  return uniq([b, bNoApi, bApi]);
}

async function requestJSON<T>(
  method: "GET" | "POST",
  path: string,
  opts?: {
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  }
): Promise<T> {
  const bases = buildBaseCandidates();

  let lastErr: unknown = null;

  for (const base of bases) {
    const url = new URL(joinUrl(base, path));
    const params = opts?.params;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v === undefined) return;
        url.searchParams.set(k, String(v));
      });
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers:
          method === "POST"
            ? { "Content-Type": "application/json" }
            : undefined,
        body: method === "POST" ? JSON.stringify(opts?.body ?? {}) : undefined,
      });

      if (!res.ok) {
        // ✅ 404 등은 다음 base 후보로 재시도
        const text = await res.text().catch(() => res.statusText);
        lastErr = new Error(text || res.statusText);
        continue;
      }

      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("API request failed");
}

// ✅ PickyPage가 import 하던 타입명 복구
export type ResultItem = {
  id: number;
  media_type: MediaType;

  title?: string;
  name?: string;

  overview?: string;

  poster_path: string | null;
  backdrop_path?: string | null;

  vote_average: number;
  vote_count?: number;

  release_date?: string;
  first_air_date?: string;

  genre_ids?: number[];
  original_language?: string;

  matchScore?: number;
  matchReasons?: string[];

  original_title?: string;
  original_name?: string;

  providers?: Array<{
    providerId: number;
    providerName: string;
    logoPath: string | null;
  }>;
  ageRating?: string | null;
};

export type AiAnalysis = {
  originalQuery: string;
  normalizedQuery: string;
  expandedQueries: string[];

  mediaTypes: MediaType[];
  tags: string[];

  yearFrom?: number;
  yearTo?: number;
};

export type AiSearchResponse = {
  tags: string[];
  results: ResultItem[];
  aiAnalysis: AiAnalysis;
};

type SearchMultiResponse = {
  expandedQueries?: string[];
  results: any[];
};

type RecommendResponse = {
  items: any[];
};

export async function runPickySearch(
  userQuery: string
): Promise<AiSearchResponse> {
  const q = userQuery.trim().replace(/\s+/g, " ");
  const tags = extractTagsFromQuery(q);
  const mediaTypes = inferMediaTypes(q);
  const yr = inferYearRange(q);

  // 1) 서버 lexicon 확장 포함 search/multi
  let expandedQueries: string[] = [q];
  let multiResults: any[] = [];

  try {
    const res = await requestJSON<SearchMultiResponse>(
      "GET",
      "picky/search/multi",
      {
        params: {
          query: q,
          page: 1,
          language: "ko-KR",
          includeAdult: false,
        },
      }
    );

    expandedQueries =
      Array.isArray(res.expandedQueries) && res.expandedQueries.length
        ? res.expandedQueries
        : [q];

    multiResults = Array.isArray(res.results) ? res.results : [];
  } catch {
    // fallback: 기존 프로젝트에 /movies/search/multi가 있다면 사용
    const res = await requestJSON<{ results: any[] }>(
      "GET",
      "movies/search/multi",
      {
        params: {
          query: q,
          page: 1,
          language: "ko-KR",
          includeAdult: false,
        },
      }
    );
    multiResults = Array.isArray(res.results) ? res.results : [];
  }

  // 2) 추천 (서버가 include 확장/회사힌트까지 처리)
  const includeKeywords = extractIncludeKeywords(q, tags).slice(0, 24);

  const recommend = await requestJSON<RecommendResponse>(
    "POST",
    "picky/recommend",
    {
      body: {
        prompt: q,
        mediaTypes,
        includeKeywords,
        excludeKeywords: [],
        genreIds: [],
        originalLanguage: null,
        yearFrom: yr.from ?? null,
        yearTo: yr.to ?? null,
        language: "ko-KR",
        region: "KR",
        page: 1,
        includeAdult: false,
        sortBy: "popularity.desc",
      },
    }
  );

  // 3) PickyPage 호환 shape로 변환
  const mapped: ResultItem[] = (
    Array.isArray(recommend.items) ? recommend.items : []
  )
    .map((it) => ({
      id: safeNum(it.id, 0),
      media_type: it.mediaType as MediaType,

      title: it.mediaType === "movie" ? it.title : undefined,
      name: it.mediaType === "tv" ? it.title : undefined,

      overview: it.overview ?? "",
      poster_path: it.posterPath ?? null,
      backdrop_path: it.backdropPath ?? null,

      vote_average: safeNum(it.voteAverage, 0),
      vote_count: safeNum(it.voteCount, 0),

      release_date:
        it.mediaType === "movie" ? it.releaseDate ?? undefined : undefined,
      first_air_date:
        it.mediaType === "tv" ? it.releaseDate ?? undefined : undefined,

      genre_ids: Array.isArray(it.genreIds) ? it.genreIds : [],
      original_language: it.originalLanguage ?? undefined,

      matchScore: safeNum(it.matchScore, 0),
      matchReasons: Array.isArray(it.matchReasons) ? it.matchReasons : [],

      providers: Array.isArray(it.providers) ? it.providers : [],
      ageRating: it.ageRating ?? null,
    }))
    .filter(
      (x) => x.id > 0 && (x.media_type === "movie" || x.media_type === "tv")
    );

  // 4) search/multi 상위 결과가 추천 목록에 있으면 살짝 부스트
  const directKeySet = new Set(
    multiResults
      .filter(
        (x) =>
          x &&
          (x.media_type === "movie" || x.media_type === "tv") &&
          typeof x.id === "number"
      )
      .slice(0, 30)
      .map((x) => `${x.media_type}:${x.id}`)
  );

  const boosted = mapped
    .map((x) => {
      const key = `${x.media_type}:${x.id}`;
      const boost = directKeySet.has(key) ? 6 : 0;
      return { ...x, matchScore: safeNum(x.matchScore, 0) + boost };
    })
    .sort((a, b) => safeNum(b.matchScore, 0) - safeNum(a.matchScore, 0));

  return {
    tags,
    results: boosted,
    aiAnalysis: {
      originalQuery: userQuery,
      normalizedQuery: q,
      expandedQueries,
      mediaTypes,
      tags,
      yearFrom: yr.from,
      yearTo: yr.to,
    },
  };
}
