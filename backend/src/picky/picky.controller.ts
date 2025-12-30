// backend/src/picky/picky.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PickyService } from './picky.service';
import { PickyRecommendDto } from './dto/picky.dto'; // ✅ 반드시 value import
import type { PickyRecommendResponse } from './dto/picky.dto';

type SearchMultiResponse = {
  expandedQueries: string[];
  results: Array<Record<string, unknown>>;
};

@Controller('picky')
export class PickyController {
  constructor(private readonly pickyService: PickyService) {}

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @Post('recommend')
  async recommend(
    @Body() dto: PickyRecommendDto,
  ): Promise<PickyRecommendResponse> {
    // ✅ 이건 “터미널”이 아니라 “여기(코드)”에 써야 함
    // console.log('[picky/recommend] dto =', dto);
    return await this.pickyService.recommend(dto);
  }

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

    return await this.pickyService.searchMultiWithLexicon({
      query: q,
      page: p,
      language: language ?? undefined,
      includeAdult: ia,
    });
  }

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
