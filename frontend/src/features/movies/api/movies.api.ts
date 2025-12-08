// frontend/src/features/movies/api/movies.api.ts

import { apiGet } from "../../../lib/apiClient";

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
}

export interface TMDBPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// 인기 영화 목록
export async function fetchPopularMovies(): Promise<
  TMDBPaginatedResponse<TMDBMovie>
> {
  return apiGet<TMDBPaginatedResponse<TMDBMovie>>("/movies/popular");
}

// 온보딩/설문 기반 discover
export async function discoverMoviesApi(params: {
  genre?: string; // "16,35" 이런 식으로 전달
  sort_by?: string;
  page?: number;
  languageCode?: string; // with_original_language (ja, ko 등)
  year?: string; // primary_release_year
}): Promise<TMDBPaginatedResponse<TMDBMovie>> {
  return apiGet<TMDBPaginatedResponse<TMDBMovie>>("/movies/discover", params);
}
