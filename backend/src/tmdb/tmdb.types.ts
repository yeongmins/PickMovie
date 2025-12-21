// backend/src/tmdb/tmdb.types.ts
export type MediaType = 'movie' | 'tv';

export interface TmdbPagedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbMovieResult {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  genre_ids: number[];
  original_language?: string;
  popularity?: number;
}

export interface TmdbTvResult {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  first_air_date?: string;
  genre_ids: number[];
  original_language?: string;
  popularity?: number;
}

export type TmdbMultiResult =
  | ({ media_type: 'movie' } & TmdbMovieResult)
  | ({ media_type: 'tv' } & TmdbTvResult)
  | {
      media_type: 'person';
      id: number;
    };

export interface TmdbWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

export interface TmdbWatchProvidersResponse {
  results?: Record<
    string,
    {
      flatrate?: TmdbWatchProvider[];
      rent?: TmdbWatchProvider[];
      buy?: TmdbWatchProvider[];
    }
  >;
}

export interface TmdbReleaseDatesResponse {
  results: Array<{
    iso_3166_1: string;
    release_dates: Array<{
      certification: string;
      type?: number;
    }>;
  }>;
}

export interface TmdbTvContentRatingsResponse {
  results: Array<{
    iso_3166_1: string;
    rating: string;
  }>;
}
