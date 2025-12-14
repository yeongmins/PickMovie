import { Injectable } from '@nestjs/common';
import { TmdbService, type TmdbQuery } from '../tmdb/tmdb.service';

type MediaType = 'movie' | 'tv';

@Injectable()
export class MoviesService {
  constructor(private readonly tmdb: TmdbService) {}

  getPopular(page = 1): Promise<unknown> {
    return this.tmdb.getPopularMovies(page);
  }

  getTopRated(page = 1): Promise<unknown> {
    return this.tmdb.getTopRatedMovies(page);
  }

  getNowPlaying(page = 1): Promise<unknown> {
    return this.tmdb.getNowPlayingMovies(page);
  }

  getPopularTV(page = 1): Promise<unknown> {
    return this.tmdb.getPopularTVShows(page);
  }

  discover(query: TmdbQuery): Promise<unknown> {
    return this.tmdb.discoverMovies(query);
  }

  getDetails(id: number, type: MediaType = 'movie'): Promise<unknown> {
    return type === 'tv'
      ? this.tmdb.getTVDetails(id)
      : this.tmdb.getMovieDetails(id);
  }
}
