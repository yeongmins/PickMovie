// backend/src/tmdb/tmdb.service.ts

import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  TMDBMovie,
  TMDBMovieDetails,
  TMDBPaginatedResponse,
} from './tmdb.types';

@Injectable()
export class TmdbService {
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly baseUrl =
    process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3';

  constructor(private readonly http: HttpService) {
    if (!this.apiKey) {
      console.warn('⚠️ TMDB_API_KEY 환경변수가 설정되어 있지 않습니다.');
    }
  }

  private async get<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await firstValueFrom(
      this.http.get<T>(url, {
        params: {
          api_key: this.apiKey,
          language: 'ko-KR',
          ...params,
        },
      }),
    );

    return response.data;
  }

  async getPopularMovies(): Promise<TMDBPaginatedResponse<TMDBMovie>> {
    return this.get<TMDBPaginatedResponse<TMDBMovie>>('/movie/popular');
  }

  async discoverMovies(options: {
    with_genres?: string;
    sort_by?: string;
    page?: number;
    with_original_language?: string;
  }): Promise<TMDBPaginatedResponse<TMDBMovie>> {
    return this.get<TMDBPaginatedResponse<TMDBMovie>>('/discover/movie', {
      with_genres: options.with_genres,
      sort_by: options.sort_by ?? 'popularity.desc',
      page: options.page ?? 1,
      with_original_language: options.with_original_language,
    });
  }

  async getMovieDetails(id: number): Promise<TMDBMovieDetails> {
    return this.get<TMDBMovieDetails>(`/movie/${id}`, {
      append_to_response: 'credits,similar',
    });
  }
}
