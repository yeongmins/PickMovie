// frontend/src/lib/tmdb.ts

// ✅ 백엔드 API 주소 (Vite 환경변수 또는 로컬호스트)
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// 이미지는 여전히 TMDB CDN에서 직접 가져옵니다.
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

// ✅ 기본값: “한국 기준”
const DEFAULT_REGION = "KR";
const DEFAULT_LANGUAGE = "ko-KR";

// =========================
// 타입 정의
// =========================

export interface TMDBMovie {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  media_type?: "movie" | "tv";
  original_language?: string;
  popularity?: number;
  vote_count?: number;
  adult?: boolean;
  video?: boolean;

  // ✅ UI에서 쓰는 확장 필드(있어도 되고 없어도 됨)
  isNowPlaying?: boolean;
  ageRating?: string;
  providers?: any[];
  platform?: string;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface MovieDetails extends TMDBMovie {
  genres?: TMDBGenre[];
  runtime?: number;
  episode_run_time?: number[];
  credits?: {
    cast?: Array<{
      id: number;
      name: string;
      profile_path: string | null;
      character?: string;
    }>;
    crew?: Array<{
      id: number;
      name: string;
      job: string;
    }>;
  };
  similar?: {
    results: TMDBMovie[];
  };
}

export type TVDetails = MovieDetails;

export interface UserPreferencesLike {
  genres: string[];
  moods?: string[];
  runtime?: string;
  releaseYear?: string;
  country?: string;
  excludes?: string[];
}

// =========================
// 상수 데이터 (장르, 언어, OTT ID)
// =========================

export const GENRE_IDS: Record<string, number> = {
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

export const LANGUAGE_CODES: Record<string, string> = {
  한국: "ko-KR",
  미국: "en-US",
  영국: "en-US",
  일본: "ja-JP",
  프랑스: "fr-FR",
  상관없음: "",
};

export const PROVIDER_IDS: Record<string, number> = {
  NETFLIX: 8,
  WATCHA: 97,
  WAVVE: 356,
  DISNEY_PLUS: 337,
};

// =========================
// 내부 헬퍼: 백엔드 요청(안전한 쿼리 변환)
// =========================

function safeInt(v: unknown, fallback = 1): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const f = Math.floor(n);
  return f > 0 ? f : fallback;
}

function normalizeBackendParam(key: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value === "") return null;

  // 배열 → "a,b,c"
  if (Array.isArray(value)) {
    const filtered = value
      .map((v) => (v === undefined || v === null ? "" : String(v)))
      .filter(Boolean);
    return filtered.length ? filtered.join(",") : null;
  }

  // 객체가 들어오면 [object Object] 방지
  if (typeof value === "object") {
    // page에 객체가 들어오면 최대한 숫자로 복구 시도
    if (key === "page") {
      const v: any = value as any;
      const cand = v?.page ?? v?.value ?? v?.current ?? v?.index;
      if (cand !== undefined) return String(safeInt(cand, 1));
      // 복구 불가면 page 자체를 빼서 서버 기본값 사용
      return null;
    }

    // 그 외 객체는 쿼리에 넣지 않음(콘솔 경고도 출력하지 않음)
    return null;
  }

  return String(value);
}

async function fetchFromBackend<T>(
  path: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    const normalized = normalizeBackendParam(key, value);
    if (normalized === null) return;
    url.searchParams.set(key, normalized);
  });

  const res = await fetch(url.toString(), {
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Backend Request Failed: ${res.status} ${res.statusText}${
        text ? ` - ${text}` : ""
      }`
    );
  }

  return (await res.json()) as T;
}

// =========================
// 이미지 URL 생성
// =========================

export type TMDBImageSize =
  | "w92"
  | "w154"
  | "w185"
  | "w342"
  | "w500"
  | "w780"
  | "original";

export function getPosterUrl(
  path: string | null | undefined,
  size: TMDBImageSize = "w342"
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}${size}${path}`;
}

export function getBackdropUrl(
  path: string | null | undefined,
  size: "w300" | "w780" | "w1280" | "original" = "w780"
): string {
  if (!path) return "";
  return `${TMDB_IMAGE_BASE_URL}${size}${path}`;
}

// =========================
// 매칭 점수 계산 로직 (프론트엔드에서 수행)
// =========================

export function calculateMatchScore(
  movie: TMDBMovie,
  prefs: UserPreferencesLike
): number {
  let score = 50;

  // 장르 매칭
  if (prefs.genres.length && movie.genre_ids?.length) {
    const preferredGenreIds = prefs.genres
      .map((g) => GENRE_IDS[g])
      .filter(Boolean);

    const matched = movie.genre_ids.filter((id) =>
      preferredGenreIds.includes(id)
    );
    score += Math.min(30, matched.length * 10);
  }

  // 개봉 연도 매칭
  const dateString = movie.release_date || movie.first_air_date;
  if (dateString && prefs.releaseYear) {
    const year = new Date(dateString).getFullYear();
    if (prefs.releaseYear.endsWith("년")) {
      const target = parseInt(prefs.releaseYear, 10);
      if (year === target) score += 10;
    } else if (prefs.releaseYear === "2020년대" && year >= 2020) score += 8;
    else if (prefs.releaseYear === "2010년대" && year >= 2010 && year < 2020)
      score += 6;
    else if (prefs.releaseYear === "2000년대" && year >= 2000 && year < 2010)
      score += 4;
    else if (prefs.releaseYear === "고전" && year < 2000) score += 4;
  }

  // 평점 보정
  const rating = movie.vote_average || 0;
  score += Math.min(10, Math.max(0, (rating - 5) * 2));

  return Math.max(1, Math.min(99, Math.round(score)));
}

// =========================
// ✅ 리스트 API 공통 옵션(숫자/옵션 모두 지원)
// =========================

type ListOptions = {
  page?: number;
  region?: string; // "KR"
  language?: string; // "ko-KR"
};

// getPopularMovies(1) / getPopularMovies({region, language}) 모두 OK
function normalizeListArg(arg?: number | ListOptions): Required<ListOptions> {
  if (typeof arg === "number") {
    return {
      page: safeInt(arg, 1),
      region: DEFAULT_REGION,
      language: DEFAULT_LANGUAGE,
    };
  }

  return {
    page: safeInt(arg?.page, 1),
    region: arg?.region ?? DEFAULT_REGION,
    language: arg?.language ?? DEFAULT_LANGUAGE,
  };
}

// =========================
// API 함수들 (Backend Proxy 사용)
// =========================

export async function discoverMovies(options: {
  genres?: number[];
  language?: string; // 예: "ko-KR" (기존 로직 유지)
  year?: string;
  page?: number;
  providers?: number[];
  sort_by?: string;

  // ✅ 추가: 한국 기준 강제/오버라이드 가능
  region?: string;
}): Promise<TMDBMovie[]> {
  const page = safeInt(options.page, 1);

  const params: Record<string, unknown> = {
    page,
    sort_by: options.sort_by || "popularity.desc",

    // ✅ 한국 기준
    region: options.region ?? DEFAULT_REGION,
    language: options.language ?? DEFAULT_LANGUAGE,
  };

  // 파라미터 변환 (배열 -> 문자열)
  if (options.genres && options.genres.length > 0)
    params.genre = options.genres.join(",");
  // ✅ 기존 코드 유지: 백엔드가 languageCode를 기대하는 경우 대비
  if (options.language) params.languageCode = options.language.split("-")[0];
  if (options.year) params.year = options.year;
  if (options.providers && options.providers.length > 0)
    params.providers = options.providers.join("|");

  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/discover",
    params
  );
  return data.results || [];
}

export async function getPopularMovies(
  arg: number | ListOptions = 1
): Promise<TMDBMovie[]> {
  const opt = normalizeListArg(arg);
  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/popular",
    { page: opt.page, region: opt.region, language: opt.language }
  );
  return data.results || [];
}

export async function getTopRatedMovies(
  arg: number | ListOptions = 1
): Promise<TMDBMovie[]> {
  const opt = normalizeListArg(arg);
  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/top_rated",
    { page: opt.page, region: opt.region, language: opt.language }
  );
  return data.results || [];
}

export async function getNowPlayingMovies(
  arg: number | ListOptions = 1
): Promise<TMDBMovie[]> {
  const opt = normalizeListArg(arg);
  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/now_playing",
    { page: opt.page, region: opt.region, language: opt.language }
  );
  return data.results || [];
}

export async function getPopularTVShows(
  arg: number | ListOptions = 1
): Promise<TMDBMovie[]> {
  const opt = normalizeListArg(arg);
  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/tv/popular",
    { page: opt.page, region: opt.region, language: opt.language }
  );
  return data.results || [];
}

export async function getMovieDetails(
  id: number,
  opts?: { region?: string; language?: string }
): Promise<MovieDetails> {
  return await fetchFromBackend<MovieDetails>(`/movies/${id}`, {
    type: "movie",
    region: opts?.region ?? DEFAULT_REGION,
    language: opts?.language ?? DEFAULT_LANGUAGE,
  });
}

export async function getTVDetails(
  id: number,
  opts?: { region?: string; language?: string }
): Promise<TVDetails> {
  return await fetchFromBackend<TVDetails>(`/movies/${id}`, {
    type: "tv",
    region: opts?.region ?? DEFAULT_REGION,
    language: opts?.language ?? DEFAULT_LANGUAGE,
  });
}

// MovieDetailModal 등에서 사용하는 통합 함수
export async function getContentDetails(
  id: number,
  mediaType: "movie" | "tv" = "movie",
  opts?: { region?: string; language?: string }
): Promise<MovieDetails | TVDetails> {
  return await fetchFromBackend(`/movies/${id}`, {
    type: mediaType,
    region: opts?.region ?? DEFAULT_REGION,
    language: opts?.language ?? DEFAULT_LANGUAGE,
  });
}

export function normalizeTVToMovie(tv: any): TMDBMovie {
  return {
    id: tv.id,
    title: tv.name,
    name: tv.name,
    overview: tv.overview,
    poster_path: tv.poster_path ?? null,
    backdrop_path: tv.backdrop_path ?? null,
    vote_average: tv.vote_average ?? 0,
    release_date: tv.first_air_date ?? "",
    first_air_date: tv.first_air_date ?? "",
    genre_ids: (tv.genre_ids as number[]) ?? [],
    popularity: tv.popularity ?? 0,
    adult: tv.adult ?? false,
    original_language: tv.original_language ?? "",
    media_type: "tv",
  };
}

// =========================
// ✅ Providers / Age Rating (TMDB 직접 호출 + 캐시)
// - VITE_TMDB_API_KEY가 있어야 동작
// =========================

export type ProviderBadge = {
  provider_name: string;
  logo_path?: string | null;
};

const TMDB_API_KEY = (import.meta as any)?.env?.VITE_TMDB_API_KEY as
  | string
  | undefined;

const TMDB_DIRECT_BASE =
  (import.meta as any)?.env?.VITE_TMDB_BASE_URL ||
  "https://api.themoviedb.org/3";

const _providersCache = new Map<string, ProviderBadge[]>();
const _ageCache = new Map<string, string>();

async function tmdbDirectFetch(path: string) {
  if (!TMDB_API_KEY) return null;
  const url = new URL(`${TMDB_DIRECT_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return await res.json();
}

/** OTT Providers (KR) */
export async function getWatchProviders(
  mediaType: "movie" | "tv",
  id: number,
  region: string = DEFAULT_REGION
): Promise<ProviderBadge[]> {
  const key = `${mediaType}:${id}:${region}`;
  if (_providersCache.has(key)) return _providersCache.get(key)!;

  const json = await tmdbDirectFetch(`/${mediaType}/${id}/watch/providers`);
  const block = json?.results?.[region];
  if (!block) {
    _providersCache.set(key, []);
    return [];
  }

  const list: ProviderBadge[] = [
    ...(block.flatrate || []),
    ...(block.rent || []),
    ...(block.buy || []),
  ];

  const seen = new Set<string>();
  const uniq = list.filter((p: ProviderBadge) => {
    const n = p?.provider_name;
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  const sliced = uniq.slice(0, 6);
  _providersCache.set(key, sliced);
  return sliced;
}

/** 연령 등급 (KR 우선) */
export async function getAgeRating(
  mediaType: "movie" | "tv",
  id: number,
  region: string = DEFAULT_REGION
): Promise<string> {
  const key = `${mediaType}:${id}:${region}`;
  if (_ageCache.has(key)) return _ageCache.get(key)!;

  try {
    if (mediaType === "movie") {
      const json = await tmdbDirectFetch(`/movie/${id}/release_dates`);
      const results = Array.isArray(json?.results) ? json.results : [];
      const kr = results.find((r: any) => r?.iso_3166_1 === region);
      const dates = Array.isArray(kr?.release_dates) ? kr.release_dates : [];
      const cert = dates
        .map((d: any) => d?.certification)
        .find((c: any) => c && String(c).trim());
      const value = cert ? String(cert).trim() : "";
      _ageCache.set(key, value);
      return value;
    }

    const json = await tmdbDirectFetch(`/tv/${id}/content_ratings`);
    const results = Array.isArray(json?.results) ? json.results : [];
    const kr = results.find((r: any) => r?.iso_3166_1 === region);
    const rating = kr?.rating ? String(kr.rating).trim() : "";
    _ageCache.set(key, rating);
    return rating;
  } catch {
    _ageCache.set(key, "");
    return "";
  }
}
