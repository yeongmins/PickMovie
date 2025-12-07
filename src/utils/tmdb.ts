// TMDB 관련 설정, 타입 정의, 추천 알고리즘, 공통 유틸 함수들을 모아둔 파일

const env = (import.meta as any).env; // Vite 환경변수 객체
export type PosterSize = "w200" | "w300" | "w500" | "original";

// TMDB API 키 (환경변수에서 읽어옴)
export const TMDB_API_KEY: string = env.VITE_TMDB_API_KEY ?? "";

// TMDB 기본 API URL 및 이미지 베이스 URL
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

// TMDB에서 내려주는 영화(또는 TV)를 표현하는 공통 타입
export interface TMDBMovie {
  id: number;
  title: string; // 영화 제목
  name?: string; // TV 시리즈 이름(TMDB에서 TV는 name을 씀)
  overview: string; // 줄거리
  poster_path: string | null; // 포스터 경로
  backdrop_path: string | null; // 배경 이미지 경로
  vote_average: number; // 평균 평점
  release_date: string; // 영화 개봉일
  first_air_date?: string; // TV 첫 방영일(있을 때만)
  genre_ids: number[]; // 장르 ID 목록
  popularity: number; // 인기 지표
  adult: boolean; // 청불 여부
  original_language: string; // 원어 코드 (ko, en 등)
  media_type?: "movie" | "tv"; // 콘텐츠 타입
}

// 영화 상세 정보 타입 (기본 TMDBMovie + 추가 정보)
export interface MovieDetails extends TMDBMovie {
  runtime: number; // 러닝타임
  genres: { id: number; name: string }[]; // 장르 이름까지 포함
  credits?: {
    // 출연/제작진 정보
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }>;
    crew?: Array<{
      id: number;
      name: string;
      job: string;
      profile_path: string | null;
    }>;
  };
  similar?: {
    // 비슷한 영화 목록
    results: TMDBMovie[];
  };
}

// TV 상세 정보 타입 (영화와 조금 다른 필드 포함)
export interface TVDetails {
  id: number;
  name: string; // TV는 title 대신 name 사용
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date: string; // TV는 release_date 대신 first_air_date 사용
  genre_ids: number[];
  genres: { id: number; name: string }[];
  popularity: number;
  adult: boolean;
  original_language: string;
  episode_run_time: number[]; // TV는 runtime 대신 episode_run_time 사용
  media_type?: "tv";
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }>;
    crew?: Array<{
      id: number;
      name: string;
      job: string;
      profile_path: string | null;
    }>;
  };
  similar?: {
    results: TMDBMovie[];
  };
}

// =========================
// 장르 / 언어 매핑 설정
// =========================

// TMDB 장르 ID 매핑 (한글로 선택된 장르를 TMDB 숫자 ID로 변환하는 데 사용)
export const GENRE_IDS: Record<string, number> = {
  액션: 28,
  모험: 12,
  애니메이션: 16,
  코미디: 35,
  범죄: 80,
  다큐멘터리: 99,
  드라마: 18,
  가족: 10751,
  판타지: 14,
  역사: 36,
  공포: 27,
  음악: 10402,
  미스터리: 9648,
  로맨스: 10749,
  SF: 878,
  "TV 영화": 10770,
  스릴러: 53,
  전쟁: 10752,
  서부: 37,
};

// 언어 코드 매핑 (설문에서 선택한 국가 → TMDB 언어 코드)
export const LANGUAGE_CODES: Record<string, string> = {
  한국: "ko",
  미국: "en",
  일본: "ja",
  프랑스: "fr",
  영국: "en",
  상관없음: "",
};

// =========================
// 이미지 URL 유틸 함수
// =========================

// 포스터 이미지 URL 생성 함수
export function getPosterUrl(
  path: string | null | undefined,
  size: string = "w500"
): string | null {
  if (!path) return null; // 포스터가 없으면 null 반환
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

// 배경 이미지 URL 생성 함수 (없을 경우 기본 Unsplash 이미지 사용)
export function getBackdropUrl(
  path: string | null,
  size: "w780" | "w1280" | "original" = "w1280"
): string {
  if (!path)
    // 기본 배경 이미지 (영화 느낌 나는 랜덤 이미지)
    return "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1280&h=720&fit=crop";
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

// =========================
// TMDB API 호출 함수들
// =========================

// 설문에서 선택한 조건을 기반으로 영화 목록 조회
export async function discoverMovies(params: {
  genres?: number[];
  language?: string;
  year?: string;
  sortBy?: string;
  page?: number;
}): Promise<TMDBMovie[]> {
  // 쿼리스트링 생성
  const queryParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: "ko-KR",
    page: (params.page || 1).toString(),
    sort_by: params.sortBy || "popularity.desc", // 기본 정렬: 인기순
  });

  // 선택된 장르가 있으면 with_genres에 추가
  if (params.genres && params.genres.length > 0) {
    queryParams.append("with_genres", params.genres.join(","));
  }

  // 원어(국가) 필터
  if (params.language) {
    queryParams.append("with_original_language", params.language);
  }

  // 개봉 연도 필터
  if (params.year) {
    queryParams.append("primary_release_year", params.year);
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/discover/movie?${queryParams}`
    );
    if (!response.ok) throw new Error("Failed to fetch movies");
    const data = await response.json();
    return data.results || []; // 결과가 없으면 빈 배열 반환
  } catch (error) {
    console.error("Error fetching movies:", error);
    return []; // 에러 발생 시에도 앱이 죽지 않도록 빈 배열 반환
  }
}

// 단일 영화 상세 정보 + 출연진 + 비슷한 영화까지 한 번에 가져오는 함수
export async function getMovieDetails(
  movieId: number
): Promise<MovieDetails | null> {
  try {
    // 1) 기본 영화 정보 요청
    const movieResponse = await fetch(
      `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=ko-KR`
    );

    if (!movieResponse.ok) {
      return null; // 영화가 없거나 에러일 경우 null 반환
    }

    const movie = await movieResponse.json();

    // 2) 출연진, 3) 비슷한 영화 정보를 동시에 요청 (Promise.all)
    const [creditsResponse, similarResponse] = await Promise.all([
      fetch(
        `${TMDB_BASE_URL}/movie/${movieId}/credits?api_key=${TMDB_API_KEY}&language=ko-KR`
      ),
      fetch(
        `${TMDB_BASE_URL}/movie/${movieId}/similar?api_key=${TMDB_API_KEY}&language=ko-KR`
      ),
    ]);

    // 응답이 실패하더라도 기본 구조는 유지하도록 안전 처리
    const credits = creditsResponse.ok
      ? await creditsResponse.json()
      : { cast: [], crew: [] };
    const similar = similarResponse.ok
      ? await similarResponse.json()
      : { results: [] };

    // 기본 movie 데이터에 credits와 similar을 합쳐서 반환
    return {
      ...movie,
      credits,
      similar,
    };
  } catch (error) {
    // 네트워크 에러 등 처리
    if (error instanceof TypeError) {
      console.error(`Network error for movie ${movieId}:`, error.message);
    }
    return null;
  }
}

// =========================
// 추천 점수 계산 알고리즘
// =========================

// 사용자의 설문 응답(preferences)과 영화 정보를 기반으로 0~100 점수 계산
export function calculateMatchScore(
  movie: TMDBMovie,
  preferences: {
    genres: string[];
    runtime?: string;
    releaseYear?: string;
    country?: string;
    excludes: string[];
  }
): number {
  let score = 0; // 가중치 합산용 점수

  // -----------------------
  // 1. 장르 매칭 (최대 40점)
  // -----------------------
  const selectedGenreIds = preferences.genres
    .map((g) => GENRE_IDS[g]) // 한글 장르 → TMDB 장르 ID로 변환
    .filter(Boolean);

  if (selectedGenreIds.length > 0) {
    const matchingGenres = movie.genre_ids.filter((gId) =>
      selectedGenreIds.includes(gId)
    );
    // 사용자가 고른 장르 중 얼마나 겹치는지 비율로 계산
    const genreMatchRatio =
      matchingGenres.length / Math.max(selectedGenreIds.length, 1);
    const genreScore = genreMatchRatio * 40; // 최대 40점
    score += genreScore;
  } else {
    // (이제 UI에서 최소 1개 선택을 강제하지만, 혹시 모를 상황을 위해 기본 점수)
    score += 15;
  }

  // ---------------------------------
  // 2. 기본 품질: 평점 / 인기도 (최대 20점)
  //    → "취향"보다 비중 낮게, 품질 보정용
  // ---------------------------------
  // 평점: 최대 15점
  const ratingScore = (movie.vote_average / 10) * 15;
  score += ratingScore;

  // 인기: 최대 5점 (50 기준으로 선형 보정)
  const popularityBonus =
    movie.popularity >= 50 ? 5 : (Math.max(movie.popularity, 0) / 50) * 5;
  score += popularityBonus;

  // ---------------------------------------
  // 3. 러닝타임 매칭 (선호 러닝타임, 최대 15점)
  //    discover 결과에 runtime이 없어서 장르 기반 추정 유지
  // ---------------------------------------
  if (preferences.runtime) {
    // 사용자가 선호하는 러닝타임을 기준값 + 허용 오차로 변환
    let preferredRuntime = 120;
    let tolerance = 30;

    if (preferences.runtime === "90분 이하") {
      preferredRuntime = 90;
      tolerance = 20;
    } else if (preferences.runtime === "90-120분") {
      preferredRuntime = 105;
      tolerance = 20;
    } else if (preferences.runtime === "120분 이상") {
      preferredRuntime = 140;
      tolerance = 40;
    }

    // 장르 조합으로 러닝타임을 대략 추정
    let estimatedRuntime = 110;
    if (movie.genre_ids.includes(28) || movie.genre_ids.includes(878)) {
      // 액션(28), SF(878)는 대체로 긴 편
      estimatedRuntime = 120;
    } else if (movie.genre_ids.includes(35)) {
      // 코미디(35)는 보통 짧은 편
      estimatedRuntime = 100;
    } else if (
      movie.genre_ids.includes(18) || // 드라마
      movie.genre_ids.includes(10749) // 로맨스
    ) {
      estimatedRuntime = 110;
    }

    const runtimeDiff = Math.abs(estimatedRuntime - preferredRuntime);
    const runtimeScore = Math.max(0, 15 - (runtimeDiff / tolerance) * 15);
    score += runtimeScore;
  } else {
    // 러닝타임 상관없음 → 완전 가산은 아니고 중간 정도만
    score += 10;
  }

  // -----------------------------------
  // 4. 최신성 매칭 (개봉 연도, 최대 15점)
  // -----------------------------------
  const currentYear = new Date().getFullYear();
  const rawReleaseYear = movie.release_date
    ? new Date(movie.release_date).getFullYear()
    : NaN;

  // release_date가 비어있을 경우 현재 연도로 대체
  const releaseYear = Number.isFinite(rawReleaseYear)
    ? rawReleaseYear
    : currentYear;

  if (preferences.releaseYear) {
    if (preferences.releaseYear === "2024년") {
      score += releaseYear === 2024 ? 15 : 0;
    } else if (preferences.releaseYear === "2023년") {
      score += releaseYear === 2023 ? 15 : 0;
    } else if (preferences.releaseYear === "2022년") {
      score += releaseYear === 2022 ? 15 : 0;
    } else if (preferences.releaseYear === "2020년대") {
      // 2020년대 전반적으로 가깝게 줄수록 점수 높게
      const center = 2022;
      const yearDiff = Math.abs(releaseYear - center);
      score += Math.max(0, 15 - yearDiff * 2);
    } else if (preferences.releaseYear === "2010년대") {
      const center = 2015;
      const yearDiff = Math.abs(releaseYear - center);
      score += Math.max(0, 15 - yearDiff * 1.5);
    } else if (preferences.releaseYear === "상관없음") {
      // 상관없음이지만 너무 오래된 영화는 약간만 감점
      const yearDiff = currentYear - releaseYear;
      score += Math.max(5, 15 - yearDiff);
    } else {
      // 기타 범위(2000년대, 고전 등) - 현재와의 차이 기반
      const yearDiff = Math.abs(releaseYear - currentYear);
      score += Math.max(0, 15 - yearDiff * 2);
    }
  } else {
    // 연도 선택 안했을 경우: 기본적으로 최신일수록 가산
    const yearDiff = currentYear - releaseYear;
    score += Math.max(0, 15 - yearDiff);
  }

  // --------------------------------
  // 5. 국가 / 언어 매칭 (최대 10점)
  // --------------------------------
  if (preferences.country && preferences.country !== "상관없음") {
    const preferredLanguage = LANGUAGE_CODES[preferences.country];
    if (preferredLanguage && movie.original_language === preferredLanguage) {
      // 사용자가 고른 국가의 언어와 일치
      score += 10;
    } else {
      // 완전히 일치하진 않아도 약간의 기본 점수
      score += 3;
    }
  } else {
    // 국가 상관없음 → 적당한 기본 가산점
    score += 7;
  }

  // ------------------------------------------
  // 6. 제외 요소 처리 (감점 로직: 페널티 방식)
  //    - 취향이 잘 맞아도 싫어하는 요소가 있으면 확실히 깎기
  // ------------------------------------------
  let penalty = 0;
  let hardBlock = false;

  if (preferences.excludes && preferences.excludes.length > 0) {
    // 폭력적 장면 제외 + 액션 장르 포함 시 강한 감점
    if (
      preferences.excludes.includes("폭력적 장면") &&
      movie.genre_ids.includes(28) // Action
    ) {
      penalty += 20;
    }

    // 공포 요소 제외 + 공포 장르 포함 시 강한 감점
    if (
      preferences.excludes.includes("공포 요소") &&
      movie.genre_ids.includes(27) // Horror
    ) {
      penalty += 20;
    }

    // 선정적 내용 제외 + 성인 영화면 바로 하드 블락
    if (preferences.excludes.includes("선정적 내용") && movie.adult) {
      hardBlock = true;
    }

    // 슬픈 결말 제외 + 드라마 장르일 경우 중간 정도 감점
    if (
      preferences.excludes.includes("슬픈 결말") &&
      movie.genre_ids.includes(18) // Drama
    ) {
      penalty += 10;
    }
  }

  if (hardBlock) {
    return 0;
  }

  score -= penalty;

  // --------------------------------------
  // 7. 품질 보너스 - 평점과 인기가 모두 매우 높으면 +5
  // --------------------------------------
  if (movie.vote_average >= 7.5 && movie.popularity > 100) {
    score += 5;
  }

  // 최종 점수는 0~100 사이 정수로 보정
  const finalScore = Math.round(Math.min(Math.max(score, 0), 100));
  return Number.isFinite(finalScore) ? finalScore : 0;
}

// =========================
// TMDB 인기/상영중/평점순 API
// =========================

// 인기 영화 가져오기
export async function getPopularMovies(page: number = 1): Promise<TMDBMovie[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=ko-KR&page=${page}`
    );
    if (!response.ok) throw new Error("Failed to fetch popular movies");
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("Error fetching popular movies:", error);
    return [];
  }
}

// 인기 TV 프로그램 가져오기
export async function getPopularTVShows(page: number = 1): Promise<any[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&language=ko-KR&page=${page}`
    );
    if (!response.ok) throw new Error("Failed to fetch popular TV shows");
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("Error fetching popular TV shows:", error);
    return [];
  }
}

// 높은 평점 영화 가져오기
export async function getTopRatedMovies(
  page: number = 1
): Promise<TMDBMovie[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&language=ko-KR&page=${page}`
    );
    if (!response.ok) throw new Error("Failed to fetch top rated movies");
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("Error fetching top rated movies:", error);
    return [];
  }
}

// 현재 상영중/최신 영화 가져오기
export async function getNowPlayingMovies(
  page: number = 1
): Promise<TMDBMovie[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}&language=ko-KR&page=${page}`
    );
    if (!response.ok) throw new Error("Failed to fetch now playing movies");
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("Error fetching now playing movies:", error);
    return [];
  }
}

// =========================
// TV 상세 + 공통 상세 래퍼 + TV 정규화
// =========================

// TV 프로그램 상세 정보 가져오기 (영화와 동일하게 credits, similar까지 포함)
export async function getTVDetails(tvId: number): Promise<TVDetails | null> {
  try {
    const tvResponse = await fetch(
      `${TMDB_BASE_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}&language=ko-KR`
    );

    if (!tvResponse.ok) {
      return null;
    }

    const tv = await tvResponse.json();

    const [creditsResponse, similarResponse] = await Promise.all([
      fetch(
        `${TMDB_BASE_URL}/tv/${tvId}/credits?api_key=${TMDB_API_KEY}&language=ko-KR`
      ),
      fetch(
        `${TMDB_BASE_URL}/tv/${tvId}/similar?api_key=${TMDB_API_KEY}&language=ko-KR`
      ),
    ]);

    const credits = creditsResponse.ok
      ? await creditsResponse.json()
      : { cast: [], crew: [] };
    const similar = similarResponse.ok
      ? await similarResponse.json()
      : { results: [] };

    return {
      ...tv,
      credits,
      similar,
      media_type: "tv",
    };
  } catch (error) {
    if (error instanceof TypeError) {
      console.error(`Network error for TV ${tvId}:`, error.message);
    }
    return null;
  }
}

// 통합 콘텐츠 상세 정보 가져오기 (영화 또는 TV를 구분해서 호출)
export async function getContentDetails(
  contentId: number,
  mediaType: "movie" | "tv"
): Promise<MovieDetails | TVDetails | null> {
  if (mediaType === "tv") {
    return getTVDetails(contentId);
  }
  return getMovieDetails(contentId);
}

// TV 데이터를 영화 형식(TMDBMovie)으로 정규화하는 함수
// → 캐러셀/리스트를 영화/TV 상관없이 같은 UI로 렌더링하기 위해 사용
export function normalizeTVToMovie(tv: any): TMDBMovie {
  return {
    id: tv.id,
    title: tv.name || tv.title, // TV는 name, 영화는 title을 사용하므로 둘 다 고려
    name: tv.name,
    overview: tv.overview || "",
    poster_path: tv.poster_path || null,
    backdrop_path: tv.backdrop_path || null,
    vote_average: tv.vote_average || 0,
    release_date: tv.first_air_date || tv.release_date || "",
    first_air_date: tv.first_air_date,
    genre_ids: tv.genre_ids || [],
    popularity: tv.popularity || 0,
    adult: tv.adult || false,
    original_language: tv.original_language || "",
    media_type: "tv" as const,
  } as TMDBMovie;
}
