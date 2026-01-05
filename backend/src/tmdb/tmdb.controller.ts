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
  constructor(private readonly tmdb: TmdbService) {}

  @Get('meta/:type/:id')
  meta(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('region') region?: string,
    @Query('language') language?: string,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.getMeta(type, id, region, language);
  }

  // ✅ Title Logo (TMDB images)
  @Get('images/:type/:id')
  images(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('include_image_language') includeImageLanguage?: string,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.getImages(type, id, {
      includeImageLanguage: includeImageLanguage ?? 'ko,en,null',
    });
  }

  // ✅✅✅ 안정화: Videos 전용 엔드포인트
  // GET /tmdb/videos/movie/1084242?language=ko-KR
  @Get('videos/:type/:id')
  videos(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('language') language?: string,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.getVideos(type, id, language);
  }

  /* =========================
     ✅ Legacy aliases (404 방지)
     - 프론트가 예전 경로로 호출해도 TMDB proxy로 연결
  ========================= */

  // /tmdb/watch/providers/movie/123 -> /movie/123/watch/providers
  @Get('watch/providers/:type/:id')
  legacyWatchProviders(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(`${type}/${id}/watch/providers`, toTmdbQuery(raw));
  }

  // /tmdb/providers/movie/123 -> /movie/123/watch/providers
  @Get('providers/:type/:id')
  legacyProviders(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(`${type}/${id}/watch/providers`, toTmdbQuery(raw));
  }

  // /tmdb/watch/movie/123 -> /movie/123/watch/providers
  @Get('watch/:type/:id')
  legacyWatch(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(`${type}/${id}/watch/providers`, toTmdbQuery(raw));
  }

  // /tmdb/reviews/movie/123 -> /movie/123/reviews
  @Get('reviews/:type/:id')
  legacyReviews(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(`${type}/${id}/reviews`, toTmdbQuery(raw));
  }

  // /tmdb/movie/123/reviews -> /movie/123/reviews
  @Get(':type/:id/reviews')
  legacyTypeReviews(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() raw: RawQuery,
  ): Promise<unknown> {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.tmdb.proxy(`${type}/${id}/reviews`, toTmdbQuery(raw));
  }

  // ✅ 프록시(호환 안정화): proxy/*path 만 사용
  // 예) /tmdb/proxy/movie/1084242/videos?language=ko-KR
  @Get('proxy/*path')
  proxy(@Req() req: Request, @Query() raw: RawQuery): Promise<unknown> {
    let path = '';

    // 1) params로 잡히는 환경
    const paramsUnknown: unknown = req.params;
    if (paramsUnknown && typeof paramsUnknown === 'object') {
      const params = paramsUnknown as Record<string, unknown>;
      const v = params['path'] ?? params['0'];
      if (typeof v === 'string') path = v;
    }

    // 2) ✅ params가 비어도 동작: originalUrl에서 강제 추출
    if (!path) {
      const url = String(req.originalUrl || req.url || '').split('?')[0];
      const marker = '/tmdb/proxy/';
      const i = url.indexOf(marker);
      if (i >= 0) path = url.slice(i + marker.length);
    }

    if (!path) throw new BadRequestException('Invalid proxy path');

    return this.tmdb.proxy(path, toTmdbQuery(raw));
  }
}
