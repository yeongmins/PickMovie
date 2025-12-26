// backend/src/picky/picky.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PickyService } from './picky.service';
import type {
  PickyRecommendDto,
  PickyRecommendResponse,
} from './dto/picky.dto';

type SearchMultiResponse = {
  expandedQueries: string[];
  results: Array<Record<string, unknown>>;
};

@Controller('picky')
export class PickyController {
  constructor(private readonly pickyService: PickyService) {}

  @Post('recommend')
  async recommend(
    @Body() dto: PickyRecommendDto,
  ): Promise<PickyRecommendResponse> {
    return await this.pickyService.recommend(dto);
  }

  /**
   * ✅ 프론트가 현재 호출하는 엔드포인트:
   * GET /picky/search/multi?query=...&page=1&language=ko-KR&includeAdult=false
   */
  @Get('search/multi')
  async searchMultiGet(
    @Query('query') query: string,
    @Query('page') page?: string,
    @Query('language') language?: string,
    @Query('includeAdult') includeAdult?: string,
  ): Promise<SearchMultiResponse> {
    const q = String(query ?? '').trim();
    const p = Number(page ?? '1') || 1;

    const ia =
      String(includeAdult ?? 'false').toLowerCase() === 'true' ||
      String(includeAdult ?? 'false') === '1';

    // ✅ PickyService에 searchMultiWithLexicon이 있어야 함 (아래 서비스 패치 참고)
    return await this.pickyService.searchMultiWithLexicon({
      query: q,
      page: p,
      language: language ?? undefined,
      includeAdult: ia,
    });
  }

  /**
   * (호환용) body로 보내는 경우도 지원
   */
  @Post('search/multi')
  async searchMultiPost(
    @Body()
    body: {
      query?: string;
      page?: number;
      language?: string;
      includeAdult?: boolean;
    },
  ): Promise<SearchMultiResponse> {
    const q = String(body?.query ?? '').trim();
    const p = Number(body?.page ?? 1) || 1;

    return await this.pickyService.searchMultiWithLexicon({
      query: q,
      page: p,
      language: body?.language ?? undefined,
      includeAdult: !!body?.includeAdult,
    });
  }
}
