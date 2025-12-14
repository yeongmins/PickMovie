// frontend/src/features/picky/algorithm/pickyAlgorithm.ts

import { apiGet } from "../../../lib/apiClient";
import {
  discoverMovies,
  getPopularMovies,
  getPopularTVShows,
  type TMDBMovie,
} from "../../../lib/tmdb";
import {
  extractTagsFromQuery,
  inferMediaTypes,
  inferYearRange,
  isMostlyAscii,
  safeNum,
  uniq,
  yearFromItem,
  type MediaType,
} from "../utils/queryUtils";

export interface AiSearchResponse {
  genres?: number[];
  keywords?: string[];
  mood?: string;
  mediaTypes?: MediaType[];
  yearFrom?: number;
  yearTo?: number;
  originalLanguage?: string;
}

export type ResultItem = TMDBMovie & {
  media_type: MediaType;
  matchScore: number;
  isNowPlaying?: boolean;
  // providers/ageRating은 공통 ContentCard가 /tmdb/meta 로 채우게 두는 걸 추천
  providers?: any[];
  ageRating?: string;
};

function computeNowPlayingBadge(item: TMDBMovie, mediaType: MediaType) {
  if (mediaType !== "movie") return false;
  const d = item.release_date ? new Date(item.release_date) : null;
  if (!d || isNaN(d.getTime())) return false;
  const diff = Date.now() - d.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 60;
}

function computeMatchScore(
  item: TMDBMovie,
  mediaType: MediaType,
  query: string,
  tags: string[],
  yearFrom?: number,
  yearTo?: number
) {
  const title = (item.title || item.name || "").toLowerCase();
  const overview = (item.overview || "").toLowerCase();
  const q = query.toLowerCase();

  // 기본값: 너무 낮으면 다 0개가 될 수 있어서 안전한 시작점
  let score = 45;

  // 쿼리 직접 히트
  if (q && (title.includes(q) || overview.includes(q))) score += 14;

  // 태그 히트
  let hit = 0;
  tags.forEach((t) => {
    const tt = t.toLowerCase();
    if (!tt) return;
    if (title.includes(tt)) hit += 2;
    else if (overview.includes(tt)) hit += 1;
  });
  score += Math.min(20, hit);

  // 연도 히트
  const year = yearFromItem(item);
  if (year && yearFrom && yearTo && year >= yearFrom && year <= yearTo)
    score += 10;

  // 평점 보정
  score += Math.min(10, safeNum((item as any).vote_average, 0));

  // 미디어 타입 힌트
  if (/드라마|시리즈|tv/.test(q) && mediaType === "tv") score += 5;
  if (/영화|movie/.test(q) && mediaType === "movie") score += 5;

  return Math.max(0, Math.min(99, score));
}

function dedupe(list: ResultItem[]) {
  const seen = new Set<string>();
  return list.filter((x) => {
    const key = `${x.media_type}:${x.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function softYearBoostOrdering(
  list: ResultItem[],
  yearFrom?: number,
  yearTo?: number,
  minKeepInRange = 12
) {
  if (!yearFrom || !yearTo) return list;

  const inRange: ResultItem[] = [];
  const outRange: ResultItem[] = [];

  for (const it of list) {
    const y = yearFromItem(it);
    if (y && y >= yearFrom && y <= yearTo) inRange.push(it);
    else outRange.push(it);
  }

  // 너무 빡세게 필터링하면 0개가 될 수 있어서 "우선순위"만 주는 방식
  if (inRange.length >= minKeepInRange) return [...inRange, ...outRange];
  return [...inRange, ...outRange];
}

async function collectMoviesViaBackend(options: {
  genreIds: number[];
  yearFrom?: number;
  yearTo?: number;
  language?: string;
}): Promise<TMDBMovie[]> {
  const { genreIds, yearFrom, yearTo } = options;

  // discoverMovies가 year(단일)만 받는 구조라서 "단일 연도"일 때만 서버 필터를 씀
  const exactYear =
    yearFrom && yearTo && yearFrom === yearTo ? String(yearFrom) : undefined;

  // 1) 장르가 있으면 장르 기반 discover
  if (genreIds.length) {
    const [p1, p2] = await Promise.all([
      discoverMovies({ genres: genreIds, page: 1, year: exactYear }),
      discoverMovies({ genres: genreIds, page: 2, year: exactYear }),
    ]);
    const merged = [...p1, ...p2];
    if (merged.length) return merged;
  }

  // 2) 장르 없이 discover (항상 후보를 뽑아오도록)
  {
    const [p1, p2] = await Promise.all([
      discoverMovies({ page: 1, year: exactYear }),
      discoverMovies({ page: 2, year: exactYear }),
    ]);
    const merged = [...p1, ...p2];
    if (merged.length) return merged;
  }

  // 3) discover가 비면 popular로 최종 폴백
  {
    const [p1, p2] = await Promise.all([
      getPopularMovies(1),
      getPopularMovies(2),
    ]);
    return [...p1, ...p2];
  }
}

async function collectTVViaBackend(): Promise<TMDBMovie[]> {
  // TV는 검색/디스커버 프록시가 별도로 없으니 인기 TV로 후보 확보 후 점수 정렬
  const [p1, p2] = await Promise.all([
    getPopularTVShows(1),
    getPopularTVShows(2),
  ]);
  return [...p1, ...p2];
}

export async function runPickySearch(query: string) {
  const q = (query || "").trim();
  if (!q) {
    return {
      aiAnalysis: null as AiSearchResponse | null,
      tags: [] as string[],
      results: [] as ResultItem[],
    };
  }

  const mediaTypes = inferMediaTypes(q);
  const yr = inferYearRange(q);
  const baseTags = extractTagsFromQuery(q);

  // 1) AI 해석 (실패해도 검색은 계속 진행)
  let aiRes: AiSearchResponse | null = null;
  try {
    aiRes = await apiGet<AiSearchResponse>("/ai/search", { q });
  } catch (e) {
    console.warn("[Picky] /ai/search failed:", e);
    aiRes = null;
  }

  // 2) 태그/조건 보정
  const aiKeywords = (aiRes?.keywords || []).filter(Boolean);
  const tags =
    aiKeywords.length && !isMostlyAscii(aiKeywords)
      ? uniq([...baseTags, ...aiKeywords]).slice(0, 10)
      : baseTags;

  const fixedAi: AiSearchResponse = {
    ...(aiRes || {}),
    mood: q,
    keywords: tags,
    mediaTypes: aiRes?.mediaTypes?.length ? aiRes.mediaTypes : mediaTypes,
    yearFrom: aiRes?.yearFrom ?? yr.from,
    yearTo: aiRes?.yearTo ?? yr.to,
  };

  const planMedia = fixedAi.mediaTypes?.length
    ? fixedAi.mediaTypes
    : mediaTypes;
  const genreIds = Array.isArray(fixedAi.genres) ? fixedAi.genres : [];

  // 3) 후보 수집 (✅ 프론트 TMDB 키 없이도 항상 후보가 나오도록 "백엔드 프록시"만 사용)
  let movies: ResultItem[] = [];
  let tv: ResultItem[] = [];

  try {
    if (planMedia.includes("movie")) {
      const candidates = await collectMoviesViaBackend({
        genreIds,
        yearFrom: fixedAi.yearFrom,
        yearTo: fixedAi.yearTo,
        language: fixedAi.originalLanguage,
      });

      movies = candidates.map((m) => ({
        ...(m as any),
        media_type: "movie" as const,
        matchScore: computeMatchScore(
          m,
          "movie",
          q,
          tags,
          fixedAi.yearFrom,
          fixedAi.yearTo
        ),
        isNowPlaying: computeNowPlayingBadge(m, "movie"),
      }));
    }
  } catch (e) {
    console.warn("[Picky] collectMovies failed:", e);
    movies = [];
  }

  try {
    if (planMedia.includes("tv")) {
      const candidates = await collectTVViaBackend();

      tv = candidates.map((t) => ({
        ...(t as any),
        media_type: "tv" as const,
        matchScore: computeMatchScore(
          t,
          "tv",
          q,
          tags,
          fixedAi.yearFrom,
          fixedAi.yearTo
        ),
        isNowPlaying: false,
      }));
    }
  } catch (e) {
    console.warn("[Picky] collectTV failed:", e);
    tv = [];
  }

  // 4) 결합/정렬/컷
  const combined = dedupe([...movies, ...tv])
    .filter((x) => safeNum(x.matchScore, 0) > 0)
    .sort((a, b) => safeNum(b.matchScore, 0) - safeNum(a.matchScore, 0));

  const yearOrdered = softYearBoostOrdering(
    combined,
    fixedAi.yearFrom,
    fixedAi.yearTo,
    12
  );

  const final = yearOrdered.slice(0, 24);

  return {
    aiAnalysis: fixedAi,
    tags,
    results: final,
  };
}
