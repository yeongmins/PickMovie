// backend/src/search/search.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchRecommendDto } from './dto/search.dto'; // ✅ 반드시 value import
import type { SearchRecommendResponse } from './dto/search.dto';

type SearchMultiResponse = {
  expandedQueries: string[];
  results: Array<Record<string, unknown>>;
};

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @Post('recommend')
  async recommend(
    @Body() dto: SearchRecommendDto,
  ): Promise<SearchRecommendResponse> {
    // ✅ 이건 “터미널”이 아니라 “여기(코드)”에 써야 함
    // console.log('[search/recommend] dto =', dto);
    return await this.searchService.recommend(dto);
  }

  @Get('multi')
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

    return await this.searchService.searchMultiWithLexicon({
      query: q,
      page: p,
      language: language ?? undefined,
      includeAdult: ia,
    });
  }

  @Post('multi')
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

    return await this.searchService.searchMultiWithLexicon({
      query: q,
      page: p,
      language: body?.language ?? undefined,
      includeAdult: !!body?.includeAdult,
    });
  }
}
