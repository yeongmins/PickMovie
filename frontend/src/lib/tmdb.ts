// src/lib/tmdb.ts
// ✅ 프론트 전용 TMDB 유틸 (React 의존 X, 순수 TS + fetch 기반)

// TMDB 기본 설정
const TMDB_BASE_URL =
  import.meta.env.VITE_TMDB_BASE_URL ?? "https://api.themoviedb.org/3";
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY as string;

// 이미지 기본 URL
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

// =========================
// 타입 정의
// =========================

export interface TMDBMovie {
  id: number;
  title?: string; // 번역된 영화 제목 (movie)
  name?: string; // 번역된 제목 (tv)
  original_title?: string; // 원제(영화)
  original_name?: string; // 원제(TV)
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

// 온보딩 취향 타입과 구조만 맞추면 됨 (프론트 UserPreferences와 호환)
export interface UserPreferencesLike {
  genres: string[];
  moods?: string[]; // ✅ 선택 속성으로 변경
  runtime?: string;
  releaseYear?: string;
  country?: string;
  excludes?: string[];
}

// =========================
// 장르 / 언어 매핑
// =========================

// GenreStep에서 쓰는 한글 라벨 → TMDB 장르 ID
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

// PreferencesStep 국가 → TMDB 언어 코드
export const LANGUAGE_CODES: Record<string, string> = {
  한국: "ko-KR",
  미국: "en-US",
  영국: "en-US",
  일본: "ja-JP",
  프랑스: "fr-FR",
  상관없음: "",
};

// =========================
// 내부 fetch 헬퍼
// =========================

async function fetchFromTmdb<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  if (!TMDB_API_KEY) {
    throw new Error("TMDB API key is not set");
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`);

  url.searchParams.set("api_key", TMDB_API_KEY);
  // 기본 언어는 한국어
  if (!params.language) {
    url.searchParams.set("language", "ko-KR");
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDB 요청 실패: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// =========================
// 이미지 URL 생성
// =========================

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

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
  // ✅ 여기서 TMDB_IMAGE_BASE_URL을 실제로 사용
  return `${TMDB_IMAGE_BASE_URL}${size}${path}`;
}

// =========================
// 매칭 점수 계산 로직
// =========================

export function calculateMatchScore(
  movie: TMDBMovie,
  prefs: UserPreferencesLike
): number {
  let score = 50; // 기본 점수

  // 장르 매칭 (최대 +30)
  if (prefs.genres.length && movie.genre_ids?.length) {
    const preferredGenreIds = prefs.genres
      .map((g) => GENRE_IDS[g])
      .filter(Boolean);

    const matched = movie.genre_ids.filter((id) =>
      preferredGenreIds.includes(id)
    );
    const genreScore = Math.min(30, matched.length * 10);
    score += genreScore;
  }

  // 개봉 연도 (최대 +10)
  const dateString = movie.release_date || movie.first_air_date;
  if (dateString && prefs.releaseYear) {
    const year = new Date(dateString).getFullYear();

    if (prefs.releaseYear.endsWith("년")) {
      const target = parseInt(prefs.releaseYear, 10);
      if (year === target) score += 10;
    } else if (prefs.releaseYear === "2020년대" && year >= 2020) {
      score += 8;
    } else if (
      prefs.releaseYear === "2010년대" &&
      year >= 2010 &&
      year < 2020
    ) {
      score += 6;
    } else if (
      prefs.releaseYear === "2000년대" &&
      year >= 2000 &&
      year < 2010
    ) {
      score += 4;
    } else if (prefs.releaseYear === "고전" && year < 2000) {
      score += 4;
    }
  }

  // 러닝타임/국가/무드/제외요소 등은 TMDB 데이터와 직접 매칭하기 애매해서
  // 여기서는 일단 기본 점수에 포함된 걸로 두고,
  // 나중에 백엔드 쪽에서 더 정교하게 계산해도 됨.

  // 평점 보정 (최대 +10)
  const rating = movie.vote_average || 0;
  score += Math.min(10, Math.max(0, (rating - 5) * 2));

  // 하드 클램프
  if (!Number.isFinite(score)) return 50;
  return Math.max(1, Math.min(99, Math.round(score)));
}

// =========================
// TMDB API 래퍼 함수들
// =========================

interface DiscoverMoviesParams {
  genres?: number[];
  language?: string;
  year?: string;
  page?: number;
}

// 영화 Discover
// TMDB Discover API – 온보딩 추천에서 사용
export async function discoverMovies(options: {
  genres: number[];   // TMDB 장르 ID 배열
  language?: string;  // 원본 언어 코드(ko, ja, en, ja-JP 등) → with_original_language에 사용
  year?: string;      // "2024" 같은 문자열
  page?: number;
}): Promise<TMDBMovie[]> {
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    sort_by: "popularity.desc",
    include_adult: "false",
    include_video: "false",
    page: String(options.page ?? 1),

    // ✅ 응답 언어는 무조건 한국어
    language: "ko-KR",
  });

  // 장르 필터 (여러 개면 쉼표로 연결)
  if (options.genres && options.genres.length > 0) {
    params.set("with_genres", options.genres.join(","));
  }

  // 원본 언어 필터 (일본 애니만 보고 싶을 때 등)
  if (options.language) {
    // LANGUAGE_CODES가 "ja"든 "ja-JP"든 상관없이 앞 두 글자만 사용
    const originalLang = options.language.split("-")[0]; // "ja-JP" → "ja"
    params.set("with_original_language", originalLang);
  }

  // 개봉 연도 필터
  if (options.year) {
    params.set("primary_release_year", options.year);
  }

  const response = await fetch(
    `${TMDB_BASE_URL}/discover/movie?${params.toString()}`
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("TMDB discover 실패:", response.status, text);
    throw new Error("TMDB discover 요청 실패");
  }

  const data = (await response.json()) as { results: TMDBMovie[] };
  return data.results;
}

export async function getPopularMovies(page = 1): Promise<TMDBMovie[]> {
  const data = await fetchFromTmdb<{ results: TMDBMovie[] }>("/movie/popular", {
    page,
  });
  return data.results || [];
}

export async function getTopRatedMovies(page = 1): Promise<TMDBMovie[]> {
  const data = await fetchFromTmdb<{ results: TMDBMovie[] }>(
    "/movie/top_rated",
    { page }
  );
  return data.results || [];
}

export async function getNowPlayingMovies(page = 1): Promise<TMDBMovie[]> {
  const data = await fetchFromTmdb<{ results: TMDBMovie[] }>(
    "/movie/now_playing",
    { page }
  );
  return data.results || [];
}

export async function getPopularTVShows(page = 1): Promise<TMDBMovie[]> {
  const data = await fetchFromTmdb<{ results: TMDBMovie[] }>("/tv/popular", {
    page,
  });
  // TV 응답을 TMDBMovie 형태에 맞게 normalize해서 반환해도 되고,
  // MainScreen에서 normalizeTVToMovie를 써도 됨.
  return data.results || [];
}

export async function getMovieDetails(id: number): Promise<MovieDetails> {
  return await fetchFromTmdb<MovieDetails>(`/movie/${id}`, {
    append_to_response: "credits,similar",
  });
}

export async function getTVDetails(id: number): Promise<TVDetails> {
  return await fetchFromTmdb<TVDetails>(`/tv/${id}`, {
    append_to_response: "credits,similar",
  });
}

// MovieDetailModal에서 사용: movie / tv 둘 다 대응
export async function getContentDetails(
  id: number,
  mediaType: "movie" | "tv" = "movie"
): Promise<MovieDetails | TVDetails> {
  return mediaType === "tv" ? getTVDetails(id) : getMovieDetails(id);
}

// TV → Movie 형식으로 변환 (MainScreen용)
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

export function getBackdropUrl(
  path: string | null | undefined,
  size: "w300" | "w780" | "w1280" | "original" = "w780"
): string {
  if (!path) return "";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
