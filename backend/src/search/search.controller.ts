// backend/src/search/search.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SearchService } from './search.service';
import { SearchRecommendDto } from './dto/search.dto'; // ✅ 반드시 value import
import type { SearchRecommendResponse } from './dto/search.dto';
import { getViewerAccessFromAuthHeader } from '../common/viewer-access';
import { SearchPolicyService } from './search-policy.service';

type SearchMultiResponse = {
  expandedQueries: string[];
  results: Array<Record<string, unknown>>;
};
type PopularContentMediaType = 'movie' | 'tv';

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly searchPolicy: SearchPolicyService,
  ) {}

  private viewerIsAdmin(req: Request): boolean {
    return getViewerAccessFromAuthHeader(req.headers?.authorization).isAdmin;
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @Post('recommend')
  async recommend(
    @Req() req: Request,
    @Body() dto: SearchRecommendDto,
  ): Promise<SearchRecommendResponse> {
    // ✅ 이건 “터미널”이 아니라 “여기(코드)”에 써야 함
    // console.log('[search/recommend] dto =', dto);
    return await this.searchService.recommend(dto, {
      viewerIsAdmin: this.viewerIsAdmin(req),
    });
  }

  @Get('multi')
  async searchMultiGet(
    @Req() req: Request,
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
      viewerIsAdmin: this.viewerIsAdmin(req),
    });
  }

  @Post('multi')
  async searchMultiPost(
    @Req() req: Request,
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
      viewerIsAdmin: this.viewerIsAdmin(req),
    });
  }

  @Get('policy')
  async getSearchPolicy(): Promise<{
    keywords: string[];
    updatedAt: string | null;
  }> {
    return await this.searchPolicy.getSensitiveKeywords();
  }

  @Get('popular-contents')
  async getPopularContents(@Query('limit') limit?: string): Promise<{
    items: Array<{
      tmdbId: number;
      mediaType: PopularContentMediaType;
      title: string;
      count: number;
      updatedAt: string;
    }>;
  }> {
    const parsed = Number(limit ?? 10);
    const max = Number.isFinite(parsed) ? parsed : 10;
    return await this.searchService.getPopularContents(max);
  }

  @Post('popular-contents/hit')
  async hitPopularContent(
    @Body()
    body: {
      tmdbId?: number;
      mediaType?: string;
      title?: string;
    },
  ): Promise<{ ok: true }> {
    const tmdbId = Number(body?.tmdbId);
    const mediaRaw = String(body?.mediaType ?? '').toLowerCase().trim();
    const title = String(body?.title ?? '').trim();

    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      throw new BadRequestException('tmdbId is invalid');
    }
    if (!title) {
      throw new BadRequestException('title is required');
    }
    if (mediaRaw !== 'movie' && mediaRaw !== 'tv') {
      throw new BadRequestException('mediaType is invalid');
    }
    const mediaType = mediaRaw as PopularContentMediaType;

    await this.searchService.recordPopularContentHit({
      tmdbId,
      mediaType,
      title,
    });
    return { ok: true };
  }
}
