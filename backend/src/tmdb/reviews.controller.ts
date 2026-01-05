// backend/src/tmdb/reviews.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { TmdbService, type TmdbQuery } from './tmdb.service';

type RawQuery = Record<string, string | string[] | undefined>;

function toTmdbQuery(raw: RawQuery): TmdbQuery {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(',') : v;
  }
  return out;
}

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly tmdb: TmdbService) {}

  // /reviews/movie/123 -> /movie/123/reviews
  @Get(':type/:id')
  reviews(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(`${type}/${id}/reviews`, toTmdbQuery(raw));
  }
}
