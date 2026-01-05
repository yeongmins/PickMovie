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

  // (백엔드가 TV 상세에서 내려주면 런타임에 존재할 수 있음)
  seasons?: any[];
  last_air_date?: string;
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

    // 그 외 객체는 쿼리에 넣지 않음
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
// ✅ 제목(한글) 필터링
// =========================

function getDisplayTitle(item: TMDBMovie): string {
  return (
    item.title ??
    item.name ??
    item.original_title ??
    item.original_name ??
    ""
  ).trim();
}

function isKoreanTitle(item: TMDBMovie): boolean {
  const t = getDisplayTitle(item);
  if (!t) return false;
  return /[가-힣]/.test(t);
}

function filterKoreanTitles(items: TMDBMovie[]): TMDBMovie[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.filter(isKoreanTitle);
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
// ✅ 상세페이지 “최신 포스터(ko 우선 → en)” 선택
// =========================

export type TmdbImageAsset = {
  file_path: string;
  iso_639_1: string | null;
  width: number;
  height: number;
  vote_average: number;
  vote_count: number;
};

export type TmdbImagesResponse = {
  posters?: TmdbImageAsset[];
  logos?: TmdbImageAsset[];
  backdrops?: TmdbImageAsset[];
};

function normLang(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

function pickBestPosterFromGroup(
  posters: TmdbImageAsset[],
  lang: "ko" | "en" | "null"
) {
  const group =
    lang === "null"
      ? posters.filter((p) => !p.iso_639_1)
      : posters.filter((p) => normLang(p.iso_639_1) === lang);

  if (!group.length) return null;

  group.sort((a, b) => {
    const areaA = (a.width ?? 0) * (a.height ?? 0);
    const areaB = (b.width ?? 0) * (b.height ?? 0);
    if (areaB !== areaA) return areaB - areaA;

    const vc = (b.vote_count ?? 0) - (a.vote_count ?? 0);
    if (vc !== 0) return vc;

    return (b.vote_average ?? 0) - (a.vote_average ?? 0);
  });

  return group[0]?.file_path ?? null;
}

async function fetchImagesSafeForPoster(
  mediaType: "movie" | "tv",
  id: number
): Promise<TmdbImagesResponse | null> {
  try {
    return await fetchFromBackend<TmdbImagesResponse>(
      `/tmdb/images/${mediaType}/${id}`,
      { include_image_language: "ko,en,null" }
    );
  } catch {
    const json = await tmdbDirectFetch(
      `/${mediaType}/${id}/images?include_image_language=ko,en,null`
    );
    return (json as TmdbImagesResponse) ?? null;
  }
}

const _preferredPosterCache = new Map<string, string | null>();
const _preferredPosterInFlight = new Map<string, Promise<string | null>>();

export async function fetchPreferredPosterPath(
  mediaType: "movie" | "tv",
  id: number
): Promise<string | null> {
  const key = `${mediaType}:${id}:preferredPoster`;
  if (_preferredPosterCache.has(key))
    return _preferredPosterCache.get(key) ?? null;

  const inflight = _preferredPosterInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const data = await fetchImagesSafeForPoster(mediaType, id);
      const posters = (data?.posters ?? []).filter((p) => !!p?.file_path);

      if (!posters.length) {
        _preferredPosterCache.set(key, null);
        return null;
      }

      const ko = pickBestPosterFromGroup(posters, "ko");
      if (ko) {
        _preferredPosterCache.set(key, ko);
        return ko;
      }

      const en = pickBestPosterFromGroup(posters, "en");
      if (en) {
        _preferredPosterCache.set(key, en);
        return en;
      }

      const any = pickBestPosterFromGroup(posters, "null");
      _preferredPosterCache.set(key, any ?? null);
      return any ?? null;
    } catch {
      _preferredPosterCache.set(key, null);
      return null;
    } finally {
      _preferredPosterInFlight.delete(key);
    }
  })();

  _preferredPosterInFlight.set(key, p);
  return p;
}

export async function fetchPreferredPosterUrl(
  mediaType: "movie" | "tv",
  id: number,
  size: TMDBImageSize = "w500"
): Promise<string | null> {
  const path = await fetchPreferredPosterPath(mediaType, id);
  return path ? getPosterUrl(path, size) : null;
}

// =========================
// 매칭 점수 계산 로직
// =========================

export function calculateMatchScore(
  movie: TMDBMovie,
  prefs: UserPreferencesLike
): number {
  let score = 50;

  if (prefs.genres.length && movie.genre_ids?.length) {
    const preferredGenreIds = prefs.genres
      .map((g) => GENRE_IDS[g])
      .filter(Boolean);

    const matched = movie.genre_ids.filter((id) =>
      preferredGenreIds.includes(id)
    );
    score += Math.min(30, matched.length * 10);
  }

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

  const rating = movie.vote_average || 0;
  score += Math.min(10, Math.max(0, (rating - 5) * 2));

  return Math.max(1, Math.min(99, Math.round(score)));
}

// =========================
// ✅ 리스트 API 공통 옵션
// =========================

type ListOptions = {
  page?: number;
  region?: string;
  language?: string;
};

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
// ✅ 동시성 제한(OTT 판정용)
// =========================

async function promisePool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) break;
        results[i] = await worker(items[i]);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

// =========================
// ✅ 핵심: TV 결과를 항상 “UI 공통 포맷”으로 정규화
// - TV에서도 release_date가 항상 존재하도록(first_air_date로 채움)
// - media_type도 항상 tv로 고정
// =========================

function normalizeTvResult<T extends Record<string, any>>(tv: T): T {
  const fa = (tv as any)?.first_air_date ?? (tv as any)?.release_date ?? "";
  return {
    ...tv,
    media_type: "tv",
    first_air_date: fa,
    release_date: fa,
  } as T;
}

function normalizeMovieResult<T extends Record<string, any>>(m: T): T {
  return {
    ...m,
    media_type: (m as any)?.media_type ?? "movie",
  } as T;
}

// =========================
// API 함수들 (Backend Proxy 사용)
// =========================

export async function discoverMovies(options: {
  genres?: number[];
  language?: string;
  year?: string;
  page?: number;
  providers?: number[];
  sort_by?: string;
  region?: string;
}): Promise<TMDBMovie[]> {
  const page = safeInt(options.page, 1);

  const params: Record<string, unknown> = {
    page,
    sort_by: options.sort_by || "popularity.desc",
    region: options.region ?? DEFAULT_REGION,
    language: options.language ?? DEFAULT_LANGUAGE,
  };

  if (options.genres && options.genres.length > 0)
    params.genre = options.genres.join(",");
  if (options.language) params.languageCode = options.language.split("-")[0];
  if (options.year) params.year = options.year;
  if (options.providers && options.providers.length > 0)
    params.providers = options.providers.join("|");

  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/discover",
    params
  );

  const base = (data.results || []).map((m) => normalizeMovieResult(m));
  return filterKoreanTitles(base);
}

export async function getPopularMovies(
  arg: number | ListOptions = 1
): Promise<TMDBMovie[]> {
  const opt = normalizeListArg(arg);
  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/popular",
    { page: opt.page, region: opt.region, language: opt.language }
  );

  const base = (data.results || []).map((m) => normalizeMovieResult(m));
  return filterKoreanTitles(base);
}

export async function getTopRatedMovies(
  arg: number | ListOptions = 1
): Promise<TMDBMovie[]> {
  const opt = normalizeListArg(arg);
  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/top_rated",
    { page: opt.page, region: opt.region, language: opt.language }
  );

  const base = (data.results || []).map((m) => normalizeMovieResult(m));
  return filterKoreanTitles(base);
}

export async function getNowPlayingMovies(
  arg: number | ListOptions = 1
): Promise<TMDBMovie[]> {
  const opt = normalizeListArg(arg);
  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/now_playing",
    { page: opt.page, region: opt.region, language: opt.language }
  );

  const base = (data.results || []).map((m) => ({
    ...normalizeMovieResult(m),
    isNowPlaying: true,
  }));

  const filtered = filterKoreanTitles(base);
  return await removeNowPlayingForOttOnly(filtered, opt.region);
}

export async function getPopularTVShows(
  arg: number | ListOptions = 1
): Promise<TMDBMovie[]> {
  const opt = normalizeListArg(arg);
  const data = await fetchFromBackend<{ results: TMDBMovie[] }>(
    "/movies/tv/popular",
    { page: opt.page, region: opt.region, language: opt.language }
  );

  // ✅ 여기서 TV 정규화가 핵심: release_date/first_air_date/media_type 통일
  const base = (data.results || []).map((tv) => normalizeTvResult(tv));
  return filterKoreanTitles(base);
}

export async function getMovieDetails(
  id: number,
  opts?: { region?: string; language?: string }
): Promise<MovieDetails> {
  const detail = await fetchFromBackend<MovieDetails>(`/movies/${id}`, {
    type: "movie",
    region: opts?.region ?? DEFAULT_REGION,
    language: opts?.language ?? DEFAULT_LANGUAGE,
  });

  // ✅ movie도 media_type 기본값 고정
  return normalizeMovieResult(detail) as MovieDetails;
}

export async function getTVDetails(
  id: number,
  opts?: { region?: string; language?: string }
): Promise<TVDetails> {
  const detail = await fetchFromBackend<TVDetails>(`/movies/${id}`, {
    type: "tv",
    region: opts?.region ?? DEFAULT_REGION,
    language: opts?.language ?? DEFAULT_LANGUAGE,
  });

  // ✅ TV 상세도 release_date가 항상 존재하도록 통일 (UI가 release_date만 봐도 깨지지 않음)
  return normalizeTvResult(detail) as TVDetails;
}

// MovieDetailModal 등에서 사용하는 통합 함수
export async function getContentDetails(
  id: number,
  mediaType: "movie" | "tv" = "movie",
  opts?: { region?: string; language?: string }
): Promise<MovieDetails | TVDetails> {
  const detail = await fetchFromBackend<any>(`/movies/${id}`, {
    type: mediaType,
    region: opts?.region ?? DEFAULT_REGION,
    language: opts?.language ?? DEFAULT_LANGUAGE,
  });

  return (
    mediaType === "tv"
      ? (normalizeTvResult(detail) as TVDetails)
      : (normalizeMovieResult(detail) as MovieDetails)
  ) as MovieDetails | TVDetails;
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

/** OTT 전용이면 "상영중" 제거 (KR 기준 theatrical 타입이 없고 digital만 있는 경우) */
const _ottOnlyCache = new Map<string, boolean>();
const _ottOnlyInFlight = new Map<string, Promise<boolean>>();

async function isOttOnlyMovie(
  id: number,
  region: string = DEFAULT_REGION
): Promise<boolean> {
  const key = `${id}:${region}`;
  if (_ottOnlyCache.has(key)) return _ottOnlyCache.get(key)!;
  const inflight = _ottOnlyInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    const json = await tmdbDirectFetch(`/movie/${id}/release_dates`);
    const results = Array.isArray(json?.results) ? json.results : [];
    const block = results.find((r: any) => r?.iso_3166_1 === region);
    const dates = Array.isArray(block?.release_dates)
      ? block.release_dates
      : [];

    const types: number[] = dates
      .map((d: any) => d?.type)
      .filter((t: any) => typeof t === "number");

    const hasTheatrical = types.some((t) => t === 2 || t === 3);
    const hasDigital = types.some((t) => t === 4);

    const ottOnly = !hasTheatrical && hasDigital;
    _ottOnlyCache.set(key, ottOnly);
    return ottOnly;
  })()
    .catch(() => {
      _ottOnlyCache.set(key, false);
      return false;
    })
    .finally(() => {
      _ottOnlyInFlight.delete(key);
    });

  _ottOnlyInFlight.set(key, p);
  return p;
}

async function removeNowPlayingForOttOnly(
  items: TMDBMovie[],
  region: string = DEFAULT_REGION
): Promise<TMDBMovie[]> {
  if (!TMDB_API_KEY) return items;
  const targets = items.filter(
    (m) => m?.media_type !== "tv" && m?.isNowPlaying === true
  );
  if (!targets.length) return items;

  const ids = targets.map((m) => m.id);
  const results = await promisePool(
    ids,
    6,
    async (id) => [id, await isOttOnlyMovie(id, region)] as const
  );

  const ottMap = new Map<number, boolean>(results);

  return items.map((m) => {
    if (m?.media_type === "tv" || m?.isNowPlaying !== true) return m;
    const ottOnly = ottMap.get(m.id);
    if (ottOnly) return { ...m, isNowPlaying: false };
    return m;
  });
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
