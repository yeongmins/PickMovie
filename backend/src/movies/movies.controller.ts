import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { MoviesService } from './movies.service';
import type { TmdbQuery } from '../tmdb/tmdb.service';

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
  constructor(private readonly movies: MoviesService) {}

  @Get('popular')
  getPopular(@Query('page') page?: string) {
    return this.movies.getPopular(page ? Number(page) : 1);
  }

  // ✅ 프론트가 top_rated로 호출함(언더스코어)
  @Get('top_rated')
  getTopRatedUnderscore(@Query('page') page?: string) {
    return this.movies.getTopRated(page ? Number(page) : 1);
  }

  // (혹시 기존 하이픈 경로도 쓰면 같이 지원)
  @Get('top-rated')
  getTopRatedHyphen(@Query('page') page?: string) {
    return this.movies.getTopRated(page ? Number(page) : 1);
  }

  // ✅ 프론트가 now_playing로 호출함(언더스코어)
  @Get('now_playing')
  getNowPlayingUnderscore(@Query('page') page?: string) {
    return this.movies.getNowPlaying(page ? Number(page) : 1);
  }

  @Get('now-playing')
  getNowPlayingHyphen(@Query('page') page?: string) {
    return this.movies.getNowPlaying(page ? Number(page) : 1);
  }

  // ✅ 프론트가 /movies/tv/popular 호출함
  @Get('tv/popular')
  getPopularTV(@Query('page') page?: string) {
    return this.movies.getPopularTV(page ? Number(page) : 1);
  }

  // (기존 popular-tv도 같이 지원)
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

  // ✅ 프론트가 /movies/:id?type=movie|tv 호출함
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
