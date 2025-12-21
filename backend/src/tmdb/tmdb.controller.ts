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

  @Get('proxy/*path')
  proxy(@Param('path') path: string, @Query() raw: RawQuery): Promise<unknown> {
    return this.tmdb.proxy(path, toTmdbQuery(raw));
  }
}
