// backend/src/movies/movies.service.ts
import { Injectable } from '@nestjs/common';
import { TmdbService, type TmdbQuery } from '../tmdb/tmdb.service';

type MediaType = 'movie' | 'tv';

@Injectable()
export class MoviesService {
  constructor(private readonly tmdb: TmdbService) {}

  getPopular(page = 1, viewerIsAdmin = false): Promise<unknown> {
    return this.tmdb.getPopularMovies(page, 'KR', 'ko-KR', viewerIsAdmin);
  }

  getTopRated(page = 1, viewerIsAdmin = false): Promise<unknown> {
    return this.tmdb.getTopRatedMovies(page, 'KR', 'ko-KR', viewerIsAdmin);
  }

  getNowPlaying(page = 1, viewerIsAdmin = false): Promise<unknown> {
    return this.tmdb.getNowPlayingMovies(page, 'KR', 'ko-KR', viewerIsAdmin);
  }

  // upcoming 추가 (정상 호출)
  getUpcoming(
    page = 1,
    region = 'KR',
    language = 'ko-KR',
    viewerIsAdmin = false,
  ): Promise<unknown> {
    return this.tmdb.getUpcomingMovies(page, region, language, viewerIsAdmin);
  }

  getPopularTV(page = 1, viewerIsAdmin = false): Promise<unknown> {
    return this.tmdb.getPopularTVShows(page, 'ko-KR', viewerIsAdmin);
  }

  discover(query: TmdbQuery, viewerIsAdmin = false): Promise<unknown> {
    return this.tmdb.discoverMovies(query, viewerIsAdmin);
  }

  getDetails(
    id: number,
    type: MediaType = 'movie',
    viewerIsAdmin = false,
  ): Promise<unknown> {
    return type === 'tv'
      ? this.tmdb.getTVDetails(id, 'ko-KR', viewerIsAdmin)
      : this.tmdb.getMovieDetails(id, 'ko-KR', viewerIsAdmin);
  }
}
