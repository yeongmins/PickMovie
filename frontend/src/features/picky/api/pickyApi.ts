// frontend/src/features/picky/api/pickyApi.ts
import { extractTagsFromQuery, safeNum } from "../utils/queryUtils";

type MediaType = "movie" | "tv";

/**
 * ✅ API Base 규칙 (단일화)
 * - VITE_API_BASE_URL 설정 시: 그 값을 그대로 사용 (예: http://localhost:3000, http://localhost:3000/api, /api)
 * - 미설정 시: 개발은 http://localhost:3000, 운영은 /api 를 기본값으로 사용
 *
 * ⚠️ 자동 후보(baseCandidates) 재시도는 제거함 (연동 문제 숨김 방지)
 */
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:3000" : "/api");

function normalizeBase(base: string) {
  return String(base || "").replace(/\/+$/, "");
}

function joinUrl(path: string) {
  const b = normalizeBase(API_BASE);
  const p = String(path || "").replace(/^\/+/, "");
  // base가 "/api" 같은 상대경로여도 fetch에서 정상 동작함
  return `${b}/${p}`;
}

async function requestJSON<T>(
  method: "GET" | "POST",
  path: string,
  opts?: {
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    signal?: AbortSignal;
  }
): Promise<T> {
  const url = new URL(joinUrl(path), window.location.origin);

  // joinUrl이 absolute(http...)인 경우 URL 생성이 원치 않게 origin을 붙일 수 있으니 보정
  // - http로 시작하면 그대로 사용
  // - /api 같은 상대경로면 origin 붙여서 사용
  const finalUrl = joinUrl(path).startsWith("http")
    ? new URL(joinUrl(path))
    : url;

  const params = opts?.params;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined) return;
      finalUrl.searchParams.set(k, String(v));
    });
  }

  const res = await fetch(finalUrl.toString(), {
    method,
    headers:
      method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(opts?.body ?? {}) : undefined,
    signal: opts?.signal,
  });

  // 응답 파싱 (json 우선, 실패 시 text)
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      typeof data === "string"
        ? data
        : data && typeof data === "object" && "message" in (data as any)
        ? String((data as any).message)
        : res.statusText;

    throw new Error(`[${res.status}] ${msg || "API request failed"}`);
  }

  return data as T;
}

/**
 * ✅ (기존 PickyPage 호환) ResultItem 유지
 * - 백엔드 PickyItem(camelCase)을 프론트에서 snake_case로 1회 매핑만 수행
 * - 점수/정렬/부스트는 절대 프론트에서 하지 않음
 */
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

  // ⚠️ 프론트 추론 제거: 기본값만 유지(표시용)
  mediaTypes: MediaType[];
  tags: string[];
};

export type AiSearchResponse = {
  tags: string[];
  results: ResultItem[];
  aiAnalysis: AiAnalysis;
};

type SearchMultiResponse = {
  expandedQueries?: string[];
  results?: any[];
};

type RecommendResponse = {
  items?: any[];
};

function mapBackendItemToResultItem(it: any): ResultItem {
  const mediaType = (it?.mediaType === "tv" ? "tv" : "movie") as MediaType;

  return {
    id: safeNum(it?.id, 0),
    media_type: mediaType,

    title: mediaType === "movie" ? it?.title ?? "" : undefined,
    name: mediaType === "tv" ? it?.title ?? "" : undefined,

    overview: it?.overview ?? "",
    poster_path: it?.posterPath ?? null,
    backdrop_path: it?.backdropPath ?? null,

    vote_average: safeNum(it?.voteAverage, 0),
    vote_count: safeNum(it?.voteCount, 0),

    release_date:
      mediaType === "movie" ? it?.releaseDate ?? undefined : undefined,
    first_air_date:
      mediaType === "tv" ? it?.releaseDate ?? undefined : undefined,

    genre_ids: Array.isArray(it?.genreIds) ? it.genreIds : [],
    original_language: it?.originalLanguage ?? undefined,

    matchScore: safeNum(it?.matchScore, 0),
    matchReasons: Array.isArray(it?.matchReasons) ? it.matchReasons : [],

    providers: Array.isArray(it?.providers) ? it.providers : [],
    ageRating: it?.ageRating ?? null,
  };
}

/**
 * ✅ 정리된 runPickySearch
 * - 프론트에서 includeKeywords/mediaTypes/year 추론 X (백엔드가 infer)
 * - search/multi는 expandedQueries(표시용)만 받아옴 (실패해도 추천은 계속 진행)
 * - fallback(/movies/search/multi) 제거 (문제 숨김 방지)
 * - 부스트/정렬 제거 (서버 결과 그대로 사용)
 */
export async function runPickySearch(
  userQuery: string,
  opts?: { signal?: AbortSignal }
): Promise<AiSearchResponse> {
  const q = (userQuery || "").trim().replace(/\s+/g, " ");
  const tags = extractTagsFromQuery(q);

  let expandedQueries: string[] = q ? [q] : [];

  if (!q) {
    return {
      tags: [],
      results: [],
      aiAnalysis: {
        originalQuery: userQuery,
        normalizedQuery: "",
        expandedQueries: [],
        mediaTypes: ["movie", "tv"],
        tags: [],
      },
    };
  }

  // 1) (선택) search/multi로 expandedQueries만 확보
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
        signal: opts?.signal,
      }
    );

    if (Array.isArray(res?.expandedQueries) && res.expandedQueries.length) {
      expandedQueries = res.expandedQueries;
    }
  } catch {
    // search/multi 실패해도 추천은 진행
    expandedQueries = [q];
  }

  // 2) recommend: 백엔드가 하이브리드/랭킹/확장 전부 담당
  const recommend = await requestJSON<RecommendResponse>(
    "POST",
    "picky/recommend",
    {
      body: {
        prompt: q,
        language: "ko-KR",
        region: "KR",
        page: 1,
        includeAdult: false,
        sortBy: "popularity.desc",
        // ✅ mediaTypes/includeKeywords/year/genreIds/originalLanguage 등은 보내지 않음
        // -> 백엔드(PickyService)가 infer + lexicon 기반으로 처리
      },
      signal: opts?.signal,
    }
  );

  const results: ResultItem[] = (
    Array.isArray(recommend?.items) ? recommend.items : []
  )
    .map(mapBackendItemToResultItem)
    .filter(
      (x) => x.id > 0 && (x.media_type === "movie" || x.media_type === "tv")
    );

  return {
    tags,
    results,
    aiAnalysis: {
      originalQuery: userQuery,
      normalizedQuery: q,
      expandedQueries,
      mediaTypes: ["movie", "tv"],
      tags,
    },
  };
}
