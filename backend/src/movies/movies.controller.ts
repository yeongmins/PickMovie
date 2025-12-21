// backend/src/movies/movies.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { MoviesService } from './movies.service';
import { TmdbService } from '../tmdb/tmdb.service'; // ✅ 여기로 변경!
import type { TmdbQuery } from '../tmdb/tmdb.service';
import type { MediaType } from '../ai/dto/analyze.dto';

type RawQuery = Record<string, string | string[] | undefined>;

function toTmdbQuery(raw: RawQuery): TmdbQuery {
  const out: TmdbQuery = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(',') : v;
  }
  return out;
}

@Controller('movies')
export class MoviesController {
  constructor(
    private readonly movies: MoviesService,
    private readonly tmdb: TmdbService, // ✅ 주입 추가!
  ) {}

  @Get('popular')
  getPopular(@Query('page') page?: string) {
    return this.movies.getPopular(page ? Number(page) : 1);
  }

  @Get('top_rated')
  getTopRatedUnderscore(@Query('page') page?: string) {
    return this.movies.getTopRated(page ? Number(page) : 1);
  }

  @Get('top-rated')
  getTopRatedHyphen(@Query('page') page?: string) {
    return this.movies.getTopRated(page ? Number(page) : 1);
  }

  @Get('now_playing')
  getNowPlayingUnderscore(@Query('page') page?: string) {
    return this.movies.getNowPlaying(page ? Number(page) : 1);
  }

  @Get('now-playing')
  getNowPlayingHyphen(@Query('page') page?: string) {
    return this.movies.getNowPlaying(page ? Number(page) : 1);
  }

  @Get('tv/popular')
  getPopularTV(@Query('page') page?: string) {
    return this.movies.getPopularTV(page ? Number(page) : 1);
  }

  @Get('popular-tv')
  getPopularTVLegacy(@Query('page') page?: string) {
    return this.movies.getPopularTV(page ? Number(page) : 1);
  }

  @Get('discover')
  discover(@Query() raw: RawQuery) {
    const query = toTmdbQuery(raw);

    const pageRaw = raw.page;
    const pageStr = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
    if (pageStr) query.page = Number(pageStr);

    return this.movies.discover(query);
  }

  // ✅✅✅ 반드시 :id 보다 위에 있어야 함
  @Get('search/multi')
  searchMulti(
    @Query('query') query: string,
    @Query('page') page?: string,
    @Query('language') language?: string,
    @Query('includeAdult') includeAdult?: string,
  ) {
    return this.tmdb.searchMulti({
      query,
      page: page ? Number(page) : 1,
      language: language || 'ko-KR',
      includeAdult: includeAdult === 'true',
    });
  }

  // ✅✅✅ 반드시 :id 보다 위에 있어야 함
  @Get(':id/similar')
  similar(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type: MediaType,
    @Query('page') page?: string,
    @Query('language') language?: string,
  ) {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }

    return this.tmdb.getSimilar(
      type,
      id,
      page ? Number(page) : 1,
      language || 'ko-KR',
    );
  }

  // ✅ 맨 마지막에 두기 (search/multi 잡아먹는 문제 방지)
  @Get(':id')
  getDetails(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type?: string,
  ) {
    const media = type ?? 'movie';
    if (media !== 'movie' && media !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.movies.getDetails(id, media);
  }
}
