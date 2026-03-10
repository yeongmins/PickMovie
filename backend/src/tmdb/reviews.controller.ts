// backend/src/tmdb/reviews.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { TmdbService, type TmdbQuery } from './tmdb.service';
import { getViewerAccessFromAuthHeader } from '../common/viewer-access';

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

  private viewerIsAdmin(req: Request): boolean {
    return getViewerAccessFromAuthHeader(req.headers?.authorization).isAdmin;
  }

  // /reviews/movie/123 -> /movie/123/reviews
  @Get(':type/:id')
  reviews(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(
      `${type}/${id}/reviews`,
      toTmdbQuery(raw),
      this.viewerIsAdmin(req),
    );
  }
}
