// TMDB API Utility
// API Key는 환경 변수로 관리하는 것을 권장합니다.
// 실제 사용 시: https://www.themoviedb.org/settings/api 에서 API 키를 발급받으세요.

const TMDB_API_KEY = '271fcd8181ac163d1050f2d10d449160';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string;
  genre_ids: number[];
  popularity: number;
  adult: boolean;
  original_language: string;
  media_type?: 'movie' | 'tv'; // 미디어 타입 추가
}

export interface MovieDetails extends TMDBMovie {
  runtime: number;
  genres: { id: number; name: string }[];
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }>;
  };
  similar?: {
    results: TMDBMovie[];
  };
}

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
  media_type?: 'tv';
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }>;
  };
  similar?: {
    results: any[];
  };
}

// TMDB 장르 ID 매핑
export const GENRE_IDS: Record<string, number> = {
  '액션': 28,
  '모험': 12,
  '애니메이션': 16,
  '코미디': 35,
  '범죄': 80,
  '다큐멘터리': 99,
  '드라마': 18,
  '가족': 10751,
  '판타지': 14,
  '역사': 36,
  '공포': 27,
  '음악': 10402,
  '미스터리': 9648,
  '로맨스': 10749,
  'SF': 878,
  'TV 영화': 10770,
  '스릴러': 53,
  '전쟁': 10752,
  '서부': 37,
};

// 언어 코드 매핑
export const LANGUAGE_CODES: Record<string, string> = {
  '한국': 'ko',
  '미국': 'en',
  '일본': 'ja',
  '프랑스': 'fr',
  '영국': 'en',
  '상관없음': '',
};

export function getPosterUrl(path: string | null, size: 'w200' | 'w500' | 'original' = 'w500'): string {
  if (!path) return 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=500&h=750&fit=crop';
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

export function getBackdropUrl(path: string | null, size: 'w780' | 'w1280' | 'original' = 'w1280'): string {
  if (!path) return 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1280&h=720&fit=crop';
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

// API 호출 함수들
export async function discoverMovies(params: {
  genres?: number[];
  language?: string;
  year?: string;
  sortBy?: string;
  page?: number;
}): Promise<TMDBMovie[]> {
  const queryParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: 'ko-KR',
    page: (params.page || 1).toString(),
    sort_by: params.sortBy || 'popularity.desc',
  });

  if (params.genres && params.genres.length > 0) {
    queryParams.append('with_genres', params.genres.join(','));
  }

  if (params.language) {
    queryParams.append('with_original_language', params.language);
  }

  if (params.year) {
    queryParams.append('primary_release_year', params.year);
  }

  try {
    const response = await fetch(`${TMDB_BASE_URL}/discover/movie?${queryParams}`);
    if (!response.ok) throw new Error('Failed to fetch movies');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching movies:', error);
    return [];
  }
}

export async function getMovieDetails(movieId: number): Promise<MovieDetails | null> {
  try {
    // 먼저 영화 정보만 확인
    const movieResponse = await fetch(`${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=ko-KR`);

    // 404 또는 다른 에러 응답 처리 (로그 출력 줄임)
    if (!movieResponse.ok) {
      // 404는 조용히 처리 (로그 없음, 추가 요청 안함)
      return null;
    }

    const movie = await movieResponse.json();

    // 영화가 존재하면 credits와 similar 정보도 가져오기
    const [creditsResponse, similarResponse] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/credits?api_key=${TMDB_API_KEY}&language=ko-KR`),
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/similar?api_key=${TMDB_API_KEY}&language=ko-KR`),
    ]);

    const credits = creditsResponse.ok ? await creditsResponse.json() : { cast: [] };
    const similar = similarResponse.ok ? await similarResponse.json() : { results: [] };

    return {
      ...movie,
      credits,
      similar,
    };
  } catch (error) {
    // 네트워크 에러만 로그 출력
    if (error instanceof TypeError) {
      console.error(`Network error for movie ${movieId}:`, error.message);
    }
    return null;
  }
}

// 추천 알고리즘
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
  let score = 0;

  // 1. 장르 매칭 (40%)
  const selectedGenreIds = preferences.genres.map(g => GENRE_IDS[g]).filter(Boolean);
  if (selectedGenreIds.length > 0) {
    const matchingGenres = movie.genre_ids.filter(gId => selectedGenreIds.includes(gId));
    // 부분 매칭도 점수 부여: 하나라도 일치하면 기본 점수 + 추가 매칭마다 보너스
    const genreMatchRatio = matchingGenres.length / selectedGenreIds.length;
    const genreScore = genreMatchRatio * 40;
    score += genreScore;
  } else {
    // 장르 선택 안했으면 기본 20점
    score += 20;
  }

  // 2. 평점/인기도 (20%)
  // TMDB 평점 (0-10) 기반 점수화
  const ratingScore = (movie.vote_average / 10) * 15; // 15%
  score += ratingScore;
  
  // 인기도 보너스 (투표 수가 많을수록 신뢰도 높음)
  const popularityBonus = movie.popularity > 50 ? 5 : (movie.popularity / 50) * 5; // 5%
  score += popularityBonus;

  // 3. 러닝타임 매칭 (15%)
  // 주의: TMDB discover API에서는 runtime 정보가 없으므로, 
  // 평균 런타임 추정 (액션/SF: 120분, 드라마/로맨스: 110분, 코미디: 100분)
  if (preferences.runtime) {
    let preferredRuntime = 120; // 기본값
    let tolerance = 30; // 허용 오차
    
    if (preferences.runtime === '90분 이하') {
      preferredRuntime = 90;
      tolerance = 20;
    } else if (preferences.runtime === '90-120분') {
      preferredRuntime = 105;
      tolerance = 20;
    } else if (preferences.runtime === '120분 이상') {
      preferredRuntime = 140;
      tolerance = 40;
    }
    
    // 장르 기반 추정 런타임
    let estimatedRuntime = 110;
    if (movie.genre_ids.includes(28) || movie.genre_ids.includes(878)) { // 액션, SF
      estimatedRuntime = 120;
    } else if (movie.genre_ids.includes(35)) { // 코미디
      estimatedRuntime = 100;
    } else if (movie.genre_ids.includes(18) || movie.genre_ids.includes(10749)) { // 드라마, 로맨스
      estimatedRuntime = 110;
    }
    
    const runtimeDiff = Math.abs(estimatedRuntime - preferredRuntime);
    const runtimeScore = Math.max(0, 15 - (runtimeDiff / tolerance) * 15);
    score += runtimeScore;
  } else {
    // 선호 없으면 중립 점수
    score += 10;
  }

  // 4. 최신성 매칭 (15%)
  const releaseYear = new Date(movie.release_date).getFullYear();
  const currentYear = new Date().getFullYear();
  
  if (preferences.releaseYear) {
    if (preferences.releaseYear === '2024년' && releaseYear === 2024) {
      score += 15;
    } else if (preferences.releaseYear === '2023년' && releaseYear === 2023) {
      score += 15;
    } else if (preferences.releaseYear === '2022년' && releaseYear === 2022) {
      score += 15;
    } else if (preferences.releaseYear === '2020년대') {
      const yearDiff = Math.abs(releaseYear - currentYear);
      score += Math.max(0, 15 - yearDiff * 2);
    } else if (preferences.releaseYear === '2010년대') {
      const yearDiff = Math.abs(releaseYear - 2015);
      score += Math.max(0, 15 - yearDiff * 1.5);
    } else if (preferences.releaseYear === '상관없음') {
      // 최신 영화에 약간의 보너스
      const yearDiff = currentYear - releaseYear;
      score += Math.max(5, 15 - yearDiff);
    } else {
      // 매칭 안되면 연도 차이에 따라 감점
      const yearDiff = Math.abs(releaseYear - currentYear);
      score += Math.max(0, 15 - yearDiff * 2);
    }
  } else {
    // 최신 영화 선호
    const yearDiff = currentYear - releaseYear;
    score += Math.max(0, 15 - yearDiff);
  }

  // 5. 국가/언어 매칭 (10%)
  if (preferences.country && preferences.country !== '상관없음') {
    const preferredLanguage = LANGUAGE_CODES[preferences.country];
    if (preferredLanguage && movie.original_language === preferredLanguage) {
      score += 10;
    } else {
      score += 3; // 불일치해도 소량 점수
    }
  } else {
    score += 7; // 중립 점수
  }

  // 6. 제외 요소 처리 (감점)
  if (preferences.excludes && preferences.excludes.length > 0) {
    if (preferences.excludes.includes('폭력적 장면') && movie.genre_ids.includes(28)) {
      score *= 0.7; // 30% 감점
    }
    if (preferences.excludes.includes('공포 요소') && movie.genre_ids.includes(27)) {
      score *= 0.7;
    }
    if (preferences.excludes.includes('선정적 내용') && movie.adult) {
      score = 0; // 완전 제외
    }
    if (preferences.excludes.includes('슬픈 결말')) {
      // 드라마 장르는 약간 감점
      if (movie.genre_ids.includes(18)) {
        score *= 0.9;
      }
    }
  }

  // 7. 품질 보너스
  // 평점이 높고 투표수가 많은 영화에 보너스
  if (movie.vote_average >= 7.5 && movie.popularity > 100) {
    score += 5;
  }

  return Math.round(Math.min(score, 100));
}

// 인기 영화 가져오기
export async function getPopularMovies(page: number = 1): Promise<TMDBMovie[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=ko-KR&page=${page}`
    );
    if (!response.ok) throw new Error('Failed to fetch popular movies');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching popular movies:', error);
    return [];
  }
}

// 인기 TV 프로그램 가져오기
export async function getPopularTVShows(page: number = 1): Promise<any[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&language=ko-KR&page=${page}`
    );
    if (!response.ok) throw new Error('Failed to fetch popular TV shows');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching popular TV shows:', error);
    return [];
  }
}

// 높은 평점 영화 가져오기
export async function getTopRatedMovies(page: number = 1): Promise<TMDBMovie[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&language=ko-KR&page=${page}`
    );
    if (!response.ok) throw new Error('Failed to fetch top rated movies');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching top rated movies:', error);
    return [];
  }
}

// 현재 상영중/최신 영화 가져오기
export async function getNowPlayingMovies(page: number = 1): Promise<TMDBMovie[]> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}&language=ko-KR&page=${page}`
    );
    if (!response.ok) throw new Error('Failed to fetch now playing movies');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching now playing movies:', error);
    return [];
  }
}

// TV 프로그램 상세 정보 가져오기
export async function getTVDetails(tvId: number): Promise<TVDetails | null> {
  try {
    // 먼저 TV 정보만 확인
    const tvResponse = await fetch(`${TMDB_BASE_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}&language=ko-KR`);

    // 404 또는 다른 에러 응답 처리
    if (!tvResponse.ok) {
      return null;
    }

    const tv = await tvResponse.json();

    // TV가 존재하면 credits와 similar 정보도 가져오기
    const [creditsResponse, similarResponse] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/tv/${tvId}/credits?api_key=${TMDB_API_KEY}&language=ko-KR`),
      fetch(`${TMDB_BASE_URL}/tv/${tvId}/similar?api_key=${TMDB_API_KEY}&language=ko-KR`),
    ]);

    const credits = creditsResponse.ok ? await creditsResponse.json() : { cast: [] };
    const similar = similarResponse.ok ? await similarResponse.json() : { results: [] };

    return {
      ...tv,
      credits,
      similar,
      media_type: 'tv',
    };
  } catch (error) {
    if (error instanceof TypeError) {
      console.error(`Network error for TV ${tvId}:`, error.message);
    }
    return null;
  }
}

// 통합 콘텐츠 상세 정보 가져오기 (영화 또는 TV)
export async function getContentDetails(contentId: number, mediaType: 'movie' | 'tv'): Promise<MovieDetails | TVDetails | null> {
  if (mediaType === 'tv') {
    return getTVDetails(contentId);
  }
  return getMovieDetails(contentId);
}

// TV 데이터를 영화 형식으로 정규화
export function normalizeTVToMovie(tv: any): TMDBMovie {
  return {
    id: tv.id,
    title: tv.name || tv.title, // TV는 name, 영화는 title
    name: tv.name, // name 필드도 보존
    overview: tv.overview || '',
    poster_path: tv.poster_path || null,
    backdrop_path: tv.backdrop_path || null,
    vote_average: tv.vote_average || 0,
    release_date: tv.first_air_date || tv.release_date || '', // TV는 first_air_date
    first_air_date: tv.first_air_date, // first_air_date 필드도 보존
    genre_ids: tv.genre_ids || [],
    popularity: tv.popularity || 0,
    adult: tv.adult || false,
    original_language: tv.original_language || '',
    media_type: 'tv' as const,
  } as any;
}