// backend/src/tmdb/tmdb.controller.ts
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
import { ScreeningService } from './screening.service';
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

@Controller('tmdb')
export class TmdbController {
  constructor(
    private readonly tmdb: TmdbService,
    private readonly screening: ScreeningService,
  ) {}

  private viewerIsAdmin(req: Request): boolean {
    return getViewerAccessFromAuthHeader(req.headers?.authorization).isAdmin;
  }

  @Get('screening/sets')
  screeningSets(
    @Query('region') region?: string,
    @Query('language') language?: string,
  ) {
    return this.screening.getScreeningSets({
      region: region ?? 'KR',
      language: language ?? 'ko-KR',
    });
  }

  @Get('meta/:type/:id')
  meta(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('region') region?: string,
    @Query('language') language?: string,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.getMeta(
      type,
      id,
      region,
      language,
      this.viewerIsAdmin(req),
    );
  }

  @Get('images/:type/:id')
  getImages(
    @Req() _req: Request,
    @Param('type') type: 'movie' | 'tv',
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.tmdb.getImages(type, Number(id), language ?? 'ko-KR');
  }
  @Get('videos/:type/:id')
  videos(
    @Req() _req: Request,
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('language') language?: string,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.getVideos(type, id, language);
  }

  @Get('watch/providers/:type/:id')
  legacyWatchProviders(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(
      `${type}/${id}/watch/providers`,
      toTmdbQuery(raw),
      this.viewerIsAdmin(req),
    );
  }

  @Get('providers/:type/:id')
  legacyProviders(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(
      `${type}/${id}/watch/providers`,
      toTmdbQuery(raw),
      this.viewerIsAdmin(req),
    );
  }

  @Get('watch/:type/:id')
  legacyWatch(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(
      `${type}/${id}/watch/providers`,
      toTmdbQuery(raw),
      this.viewerIsAdmin(req),
    );
  }

  @Get('reviews/:type/:id')
  legacyReviews(
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

  @Get(':type/:id/reviews')
  legacyTypeReviews(
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

  @Get('proxy/*path')
  proxy(@Req() req: Request, @Query() raw: RawQuery): Promise<unknown> {
    let path = '';

    const paramsUnknown: unknown = req.params;
    if (paramsUnknown && typeof paramsUnknown === 'object') {
      const params = paramsUnknown as Record<string, unknown>;
      const v = params['path'] ?? params['0'];
      if (typeof v === 'string') path = v;
    }

    if (!path) {
      const url = String(req.originalUrl || req.url || '').split('?')[0];
      const marker = '/tmdb/proxy/';
      const i = url.indexOf(marker);
      if (i >= 0) path = url.slice(i + marker.length);
    }

    if (!path) throw new BadRequestException('Invalid proxy path');
    return this.tmdb.proxy(path, toTmdbQuery(raw), this.viewerIsAdmin(req));
  }
}
