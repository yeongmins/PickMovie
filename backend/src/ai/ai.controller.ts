import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TmdbService } from '../tmdb/tmdb.service';

@Controller('ai')
export class AiController {
  constructor(private readonly tmdb: TmdbService) {}

  @Get('search')
  search(@Query('q') q?: string, @Query('page') pageStr?: string) {
    if (!q || q.trim().length === 0) {
      throw new BadRequestException('q is required');
    }
    const page = pageStr ? Number(pageStr) : 1;

    // 프론트가 “Picky 검색”에 쓰는 용도로 최소한 TMDB 검색이라도 내려주자(404 제거)
    return this.tmdb.proxy('search/multi', {
      query: q,
      page,
      include_adult: false,
    });
  }
}
