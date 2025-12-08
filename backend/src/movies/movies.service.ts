// backend/src/movies/movies.service.ts

import { Injectable } from '@nestjs/common';
import { TmdbService } from '../tmdb/tmdb.service';

@Injectable()
export class MoviesService {
  constructor(private readonly tmdbService: TmdbService) {}

  getPopular() {
    return this.tmdbService.getPopularMovies();
  }

  discoverMovies(params: {
    genre?: string;
    sort_by?: string;
    page?: number;
    languageCode?: string;
  }) {
    return this.tmdbService.discoverMovies({
      with_genres: params.genre,
      sort_by: params.sort_by,
      page: params.page,
      with_original_language: params.languageCode,
    });
  }

  getDetails(id: number) {
    return this.tmdbService.getMovieDetails(id);
  }
}
