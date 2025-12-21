// frontend/src/features/picky/algorithm/pickyAlgorithm.ts
import { apiGet, apiPost } from "../../../lib/apiClient";
import { GENRE_IDS } from "../../../lib/tmdb";
import {
  extractTagsFromQuery,
  inferMediaTypes,
  inferYearRange,
} from "../utils/queryUtils";
import { readUserPreferences } from "../storage/pickyStorage";
import {
  expandQueriesByBrandLexicon,
  expandKeywordsByBrandLexicon,
} from "./brandLexicon";

export type MediaType = "movie" | "tv";

export type ProviderBadge = {
  provider_name: string;
  logo_path?: string | null;

  providerId?: number;
  providerName?: string;
  logoPath?: string | null;
};

export type PickyResultItem = {
  id: number;
  media_type?: MediaType;
  mediaType?: MediaType;

  title?: string;
  name?: string;

  // ✅ 추가: PickyPage에서 참조
  original_title?: string;
  original_name?: string;

  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;

  vote_average?: number;
  vote_count?: number;

  release_date?: string;
  first_air_date?: string;

  genre_ids?: number[];
  original_language?: string;

  providers?: ProviderBadge[];
  ageRating?: string | null;

  matchScore?: number; // 0~100
  reasons?: string[];
};

export type ResultItem = PickyResultItem;

type AiIntentFromBackend = {
  mediaTypes: MediaType[];
  genreIds: number[];
  yearFrom: number | null;
  yearTo: number | null;
  originalLanguage: string | null;
  includeKeywords: string[];
  excludeKeywords: string[];
  tone: "light" | "neutral" | "dark";
  pace: "slow" | "medium" | "fast";
  ending: "happy" | "open" | "sad" | "any";
  confidence: number;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
};

export type AiSearchResponse = {
  analysis: {
    mediaTypes: MediaType[];
    genres: number[];
    yearFrom?: number;
    yearTo?: number;
    originalLanguage?: string;
    includeKeywords: string[];
    excludeKeywords: string[];
    confidence: number;
    needsClarification: boolean;
    clarifyingQuestion: string | null;
  };
  aiSummary: string;
  clarifyingQuestion: string | null;
  expandedQueries: string[];
  confidence: number;
  needsClarification: boolean;
};

type PickyRecommendResponseFromBackend = {
  items: Array<{
    id: number;
    mediaType: MediaType;
    title: string;
    overview: string;
    posterPath: string | null;
    backdropPath: string | null;
    voteAverage: number;
    voteCount: number;
    releaseDate: string | null;
    year: number | null;
    genreIds: number[];
    originalLanguage: string | null;
    providers: Array<{
      providerId: number;
      providerName: string;
      logoPath: string | null;
    }>;
    ageRating: string | null;
    matchScore: number;
    matchReasons: string[];
  }>;
};

// TMDB search/multi 최소 타입
type TmdbSearchHit = {
  id: number;
  media_type: "movie" | "tv" | "person";

  title?: string;
  name?: string;

  // ✅ search/multi에 존재
  original_title?: string;
  original_name?: string;

  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  original_language?: string;
};

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normText(s: string) {
  return (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function titleOf(hit: { title?: string; name?: string }) {
  return hit.title || hit.name || "";
}

function isTitleLikeQuery(q: string) {
  const s = q.trim();
  if (s.length <= 1) return false;

  const generic =
    /(추천|볼만한|재밌는|요즘|최신|인기|명작|정주행|영화|드라마|애니|시리즈)/;
  if (generic.test(s) && s.split(/\s+/).length <= 2) return false;

  if (/(같은|비슷|류|느낌)/.test(s)) return true;

  const tokens = s.split(/\s+/).filter(Boolean);
  return tokens.length <= 5;
}

function scoreTitleMatch(query: string, candidateTitle: string) {
  const q = normText(query);
  const t = normText(candidateTitle);
  if (!q || !t) return 0;
  if (q === t) return 100;
  if (t.includes(q)) return 96;
  if (q.includes(t)) return 92;

  const rawTokens = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);

  const hit = rawTokens.filter((tok) =>
    normText(candidateTitle).includes(normText(tok))
  ).length;

  return clamp(70 + hit * 8, 70, 90);
}

function mapSearchHitToResult(
  hit: TmdbSearchHit,
  reason: string,
  score: number
): ResultItem {
  const mt = hit.media_type as MediaType;

  return {
    id: hit.id,
    media_type: mt,
    mediaType: mt,

    title: mt === "movie" ? hit.title : undefined,
    name: mt === "tv" ? hit.name : undefined,

    original_title: hit.original_title,
    original_name: hit.original_name,

    overview: hit.overview,
    poster_path: hit.poster_path ?? null,
    backdrop_path: hit.backdrop_path ?? null,
    vote_average: hit.vote_average ?? 0,
    vote_count: hit.vote_count ?? 0,
    release_date: mt === "movie" ? hit.release_date : undefined,
    first_air_date: mt === "tv" ? hit.first_air_date : undefined,
    genre_ids: hit.genre_ids ?? [],
    original_language: hit.original_language,

    matchScore: score,
    reasons: [reason],
  };
}

function mapBackendItemToResult(
  it: PickyRecommendResponseFromBackend["items"][number]
): ResultItem {
  const mt = it.mediaType;

  return {
    id: it.id,
    media_type: mt,
    mediaType: mt,

    title: mt === "movie" ? it.title : undefined,
    name: mt === "tv" ? it.title : undefined,

    overview: it.overview,
    poster_path: it.posterPath,
    backdrop_path: it.backdropPath,
    vote_average: it.voteAverage,
    vote_count: it.voteCount,
    release_date: mt === "movie" ? it.releaseDate ?? undefined : undefined,
    first_air_date: mt === "tv" ? it.releaseDate ?? undefined : undefined,
    genre_ids: it.genreIds,
    original_language: it.originalLanguage ?? undefined,

    providers: (it.providers ?? []).map((p) => ({
      provider_name: p.providerName,
      logo_path: p.logoPath,
      providerId: p.providerId,
      providerName: p.providerName,
      logoPath: p.logoPath,
    })),
    ageRating: it.ageRating ?? null,

    matchScore: it.matchScore,
    reasons: it.matchReasons,
  };
}

function dedupeByKey(items: ResultItem[]) {
  const m = new Map<string, ResultItem>();
  for (const it of items) {
    const k = `${it.mediaType ?? it.media_type}:${it.id}`;
    if (!m.has(k)) m.set(k, it);
  }
  return Array.from(m.values());
}

function keywordBoost(item: ResultItem, include: string[]) {
  if (!include.length) return 0;
  const text = `${item.title ?? item.name ?? ""} ${
    item.overview ?? ""
  }`.toLowerCase();

  let hit = 0;
  for (const k of include) {
    const kk = (k || "").trim().toLowerCase();
    if (kk && text.includes(kk)) hit += 1;
  }
  return clamp(hit * 4, 0, 18);
}

export async function runPickySearch(
  query: string,
  limit = 24
): Promise<{
  aiAnalysis: AiSearchResponse | null;
  tags: string[];
  results: ResultItem[];
}> {
  const q = (query || "").trim();
  if (!q) return { aiAnalysis: null, tags: [], results: [] };

  const prefs = readUserPreferences();
  const titleLike = isTitleLikeQuery(q);

  // 1) ✅ search/multi는 “검색엔진”처럼 먼저 직격 결과 뽑기
  //    + 브랜드/스튜디오/프랜차이즈 alias로 쿼리 확장
  const expandedSearchQueries = expandQueriesByBrandLexicon(q, 6);

  const searchPages = await Promise.all(
    expandedSearchQueries.map((qq) =>
      apiGet<{ results: TmdbSearchHit[] }>("/movies/search/multi", {
        query: qq,
        page: 1,
        language: "ko-KR",
        includeAdult: false,
      }).catch(() => ({ results: [] as TmdbSearchHit[] }))
    )
  );

  const rawHits = searchPages
    .flatMap((p) => p.results ?? [])
    .filter((h) => h && (h.media_type === "movie" || h.media_type === "tv"))
    .filter((h) => (h.poster_path ?? null) !== null);

  const scoredHits = rawHits
    .map((h) => ({ h, score: scoreTitleMatch(q, titleOf(h)) }))
    .sort((a, b) => b.score - a.score);

  const best = scoredHits[0];

  const directResults = scoredHits
    .slice(0, titleLike ? 6 : 10)
    .map(({ h, score }) =>
      mapSearchHitToResult(
        h,
        score >= 96 ? "검색어 제목 일치" : "검색어 관련 결과",
        score
      )
    );

  // 2) AI 분석 + 휴리스틱 보강
  const intent = await apiPost<AiIntentFromBackend>("/ai/analyze", {
    prompt: q,
    language: "ko",
    region: "KR",
  });

  const extractedTags = extractTagsFromQuery(q);
  const inferredTypes = inferMediaTypes(q);
  const inferredYears = inferYearRange(q);

  const prefGenreIds = (prefs.genres || [])
    .map((g) => GENRE_IDS[g])
    .filter((x): x is number => typeof x === "number");

  const mediaTypes =
    intent.mediaTypes?.length && intent.confidence >= 0.35
      ? intent.mediaTypes
      : inferredTypes;

  const genreIds = uniq([...(intent.genreIds ?? []), ...prefGenreIds]).filter(
    (n) => Number.isFinite(n)
  );

  const yearFrom = intent.yearFrom ?? inferredYears.from ?? null;
  const yearTo = intent.yearTo ?? inferredYears.to ?? null;

  // includeKeywords: AI + 사용자 쿼리 태그를 합치고
  const baseInclude = uniq([
    ...(intent.includeKeywords ?? []),
    ...extractedTags,
  ]).slice(0, 12);

  // ✅ 브랜드/스튜디오/프랜차이즈 alias를 대량으로 확장 (요구사항 핵심)
  const includeKeywords = expandKeywordsByBrandLexicon(baseInclude, 24);

  const excludeKeywords = uniq([
    ...(intent.excludeKeywords ?? []),
    ...(prefs.excludes ?? []),
  ]).slice(0, 12);

  // 화면 태그는 “너무 영어 범벅” 되지 않게 baseInclude 중심
  const tags = uniq([
    ...baseInclude,
    intent.tone !== "neutral" ? intent.tone : "",
    intent.ending !== "any" ? intent.ending : "",
    intent.pace !== "medium" ? intent.pace : "",
  ]).filter(Boolean);

  // 3) 제목이 정확히 잡히면 similar로 “체감” 올리기
  let similarResults: ResultItem[] = [];
  if (best && best.score >= 96) {
    try {
      const sim = await apiGet<{ results: TmdbSearchHit[] }>(
        `/movies/${best.h.id}/similar`,
        { type: best.h.media_type, page: 1, language: "ko-KR" }
      );

      similarResults = (sim.results ?? [])
        .filter((h) => h.media_type === "movie" || h.media_type === "tv")
        .slice(0, 12)
        .map((h) => mapSearchHitToResult(h, "유사작 추천", 88));
    } catch {
      similarResults = [];
    }
  }

  // 4) ✅ 백엔드 추천(discover) 호출: includeKeywords(확장본)를 그대로 전달
  const rec = await apiPost<PickyRecommendResponseFromBackend>(
    "/picky/recommend",
    {
      prompt: q,
      mediaTypes,
      genreIds,
      yearFrom,
      yearTo,
      originalLanguage: intent.originalLanguage ?? null,
      includeKeywords, // ✅ 중요
      excludeKeywords,
      region: "KR",
      page: 1,
    }
  );

  const recResults = (rec.items ?? []).map(mapBackendItemToResult);

  // 5) 합치고 정렬 최적화
  const merged = dedupeByKey([
    ...directResults,
    ...similarResults,
    ...recResults,
  ])
    .filter((it) => {
      if (!excludeKeywords.length) return true;
      const text = `${it.title ?? it.name ?? ""} ${
        it.overview ?? ""
      }`.toLowerCase();
      return !excludeKeywords.some(
        (k) => k && text.includes(String(k).toLowerCase())
      );
    })
    .map((it) => {
      const bonus = keywordBoost(it, includeKeywords);
      const base = typeof it.matchScore === "number" ? it.matchScore : 0;
      const score = clamp(base + bonus, 0, 100);
      const reasons = uniq([
        ...(it.reasons ?? []),
        bonus > 0 ? `키워드 매칭 +${bonus}` : "",
      ]).filter(Boolean);

      return { ...it, matchScore: score, reasons };
    });

  const final = merged
    .sort((a, b) => {
      const s1 = b.matchScore ?? 0;
      const s2 = a.matchScore ?? 0;
      if (s1 !== s2) return s1 - s2;
      return (b.vote_average ?? 0) - (a.vote_average ?? 0);
    })
    .slice(0, limit);

  const aiAnalysis: AiSearchResponse = {
    analysis: {
      mediaTypes,
      genres: genreIds,
      yearFrom: yearFrom ?? undefined,
      yearTo: yearTo ?? undefined,
      originalLanguage: intent.originalLanguage ?? undefined,
      includeKeywords,
      excludeKeywords,
      confidence: intent.confidence ?? 0.5,
      needsClarification: !!intent.needsClarification,
      clarifyingQuestion: intent.clarifyingQuestion ?? null,
    },
    aiSummary: tags.length
      ? `키워드 기반 추천: ${tags.slice(0, 6).join(", ")}`
      : "입력 기반 추천",
    clarifyingQuestion: intent.clarifyingQuestion ?? null,
    expandedQueries: expandedSearchQueries,
    confidence: intent.confidence ?? 0.5,
    needsClarification: !!intent.needsClarification,
  };

  return { aiAnalysis, tags, results: final };
}
