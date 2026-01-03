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
import { TmdbService } from '../tmdb/tmdb.service';
import type { TmdbQuery } from '../tmdb/tmdb.service';
import type { MediaType } from '../ai/dto/analyze.dto';

type RawQuery = Record<string, string | string[] | undefined>;
type LocalMediaType = 'movie' | 'tv';

function toTmdbQuery(raw: RawQuery): TmdbQuery {
  const out: TmdbQuery = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(',') : v;
  }
  return out;
}

function toPage(page?: string): number {
  const n = Number(page);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

@Controller('movies')
export class MoviesController {
  constructor(
    private readonly movies: MoviesService,
    private readonly tmdb: TmdbService,
  ) {}

  @Get('popular')
  getPopular(@Query('page') page?: string): Promise<unknown> {
    return this.movies.getPopular(toPage(page));
  }

  @Get('top_rated')
  getTopRatedUnderscore(@Query('page') page?: string): Promise<unknown> {
    return this.movies.getTopRated(toPage(page));
  }

  @Get('top-rated')
  getTopRatedHyphen(@Query('page') page?: string): Promise<unknown> {
    return this.movies.getTopRated(toPage(page));
  }

  @Get('now_playing')
  getNowPlayingUnderscore(@Query('page') page?: string): Promise<unknown> {
    return this.movies.getNowPlaying(toPage(page));
  }

  @Get('now-playing')
  getNowPlayingHyphen(@Query('page') page?: string): Promise<unknown> {
    return this.movies.getNowPlaying(toPage(page));
  }

  // ✅ upcoming 라우트 추가 (반드시 :id 보다 위)
  @Get('upcoming')
  getUpcoming(
    @Query('page') page?: string,
    @Query('region') region?: string,
    @Query('language') language?: string,
  ): Promise<unknown> {
    return this.movies.getUpcoming(
      toPage(page),
      region || 'KR',
      language || 'ko-KR',
    );
  }

  @Get('tv/popular')
  getPopularTV(@Query('page') page?: string): Promise<unknown> {
    return this.movies.getPopularTV(toPage(page));
  }

  @Get('popular-tv')
  getPopularTVLegacy(@Query('page') page?: string): Promise<unknown> {
    return this.movies.getPopularTV(toPage(page));
  }

  @Get('discover')
  discover(@Query() raw: RawQuery): Promise<unknown> {
    const query = toTmdbQuery(raw);

    const pageRaw = raw.page;
    const pageStr = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
    if (pageStr) query.page = toPage(pageStr);

    return this.movies.discover(query);
  }

  // ✅ 반드시 :id 보다 위
  @Get('search/multi')
  searchMulti(
    @Query('query') query: string,
    @Query('page') page?: string,
    @Query('language') language?: string,
    @Query('includeAdult') includeAdult?: string,
  ): Promise<unknown> {
    return this.tmdb.searchMulti({
      query,
      page: toPage(page),
      language: language || 'ko-KR',
      includeAdult: includeAdult === 'true',
    });
  }

  // ✅ 반드시 :id 보다 위 (정규식 제거)
  @Get(':id/similar')
  similar(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type: MediaType,
    @Query('page') page?: string,
    @Query('language') language?: string,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }

    return this.tmdb.getSimilar(type, id, toPage(page), language || 'ko-KR');
  }

  // ✅ 맨 마지막 (정규식 제거)
  @Get(':id')
  getDetails(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type?: string,
  ): Promise<unknown> {
    const media = (type ?? 'movie') as LocalMediaType;
    if (media !== 'movie' && media !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.movies.getDetails(id, media);
  }
}
