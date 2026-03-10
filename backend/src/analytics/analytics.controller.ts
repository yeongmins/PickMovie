import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import type { JwtAccessPayload } from '../auth/strategies/jwt-access.strategy';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('analyze-events')
  async createAnalyzeEvent(
    @Body()
    body: {
      visitorId?: string;
      userId?: number | null;
      isAuthed?: boolean;
      preferences?: {
        genres?: string[];
        moods?: string[];
        runtime?: string;
        releaseYear?: string;
        country?: string;
        excludes?: string[];
      };
      favoriteMovieIds?: number[];
    },
  ): Promise<{ ok: true }> {
    await this.analytics.createAnalyzeEvent({
      visitorId: String(body?.visitorId ?? ''),
      userId: body?.userId ?? null,
      isAuthed: !!body?.isAuthed,
      genres: Array.isArray(body?.preferences?.genres)
        ? body.preferences.genres
        : [],
      moods: Array.isArray(body?.preferences?.moods) ? body.preferences.moods : [],
      runtime: String(body?.preferences?.runtime ?? ''),
      releaseYear: String(body?.preferences?.releaseYear ?? ''),
      country: String(body?.preferences?.country ?? ''),
      excludes: Array.isArray(body?.preferences?.excludes)
        ? body.preferences.excludes
        : [],
      favoriteMovieIds: Array.isArray(body?.favoriteMovieIds)
        ? body.favoriteMovieIds
        : [],
    });
    return { ok: true };
  }

  @Post('content-issues')
  @UseGuards(JwtAccessGuard)
  async createContentIssue(
    @CurrentUser() user: JwtAccessPayload,
    @Body()
    body: {
      mediaType?: string;
      tmdbId?: number;
      contentTitle?: string;
      issueMessage?: string;
      issueDetail?: string;
      reporterName?: string;
      reporterEmail?: string;
      visitorId?: string;
    },
  ): Promise<{ ok: true }> {
    const mediaType = String(body?.mediaType ?? '')
      .trim()
      .toLowerCase();
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      throw new BadRequestException('mediaType must be "movie" or "tv"');
    }

    const tmdbId = Math.trunc(Number(body?.tmdbId ?? 0));
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      throw new BadRequestException('tmdbId must be a positive number');
    }

    const issueMessage = String(body?.issueMessage ?? '').trim();
    if (!issueMessage) {
      throw new BadRequestException('issueMessage is required');
    }

    await this.analytics.createContentIssue({
      mediaType,
      tmdbId,
      contentTitle: body?.contentTitle ?? null,
      issueMessage,
      issueDetail: body?.issueDetail ?? null,
      reporterUserId: Number(user?.sub ?? 0),
      reporterName: body?.reporterName ?? null,
      reporterEmail: body?.reporterEmail ?? null,
      visitorId: body?.visitorId ?? null,
    });
    return { ok: true };
  }

  @Get('content-issues/my-notifications')
  @UseGuards(JwtAccessGuard)
  async getMyIssueNotifications(
    @CurrentUser() user: JwtAccessPayload,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    unreadCount: number;
    items: Array<{
      id: number;
      mediaType: 'movie' | 'tv';
      tmdbId: number;
      contentTitle: string | null;
      issueMessage: string;
      adminReply: string;
      adminRepliedAt: string;
      isRead: boolean;
    }>;
  }> {
    const limit = Math.min(
      100,
      Math.max(1, Math.trunc(Number(limitRaw ?? 20) || 20)),
    );
    return this.analytics.getMyIssueNotifications(Number(user?.sub ?? 0), limit);
  }

  @Patch('content-issues/my-notifications/:id/read')
  @UseGuards(JwtAccessGuard)
  async markMyIssueNotificationRead(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') idRaw: string,
  ): Promise<{ ok: true }> {
    const id = Math.trunc(Number(idRaw));
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('id must be a positive number');
    }
    await this.analytics.markMyIssueNotificationRead(Number(user?.sub ?? 0), id);
    return { ok: true };
  }

  @Delete('content-issues/my-notifications/:id')
  @UseGuards(JwtAccessGuard)
  async deleteMyIssueNotification(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') idRaw: string,
  ): Promise<{ ok: true }> {
    const id = Math.trunc(Number(idRaw));
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('id must be a positive number');
    }
    await this.analytics.deleteMyIssueNotification(Number(user?.sub ?? 0), id);
    return { ok: true };
  }
}
