import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AnalyzeEventPayload = {
  visitorId: string;
  userId?: number | null;
  isAuthed: boolean;
  genres: string[];
  moods: string[];
  runtime: string;
  releaseYear: string;
  country: string;
  excludes: string[];
  favoriteMovieIds: number[];
};

type ContentIssuePayload = {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  contentTitle?: string | null;
  issueMessage: string;
  issueDetail?: string | null;
  reporterUserId?: number | null;
  reporterName?: string | null;
  reporterEmail?: string | null;
  visitorId?: string | null;
};

type IssueNotificationItem = {
  id: number;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  contentTitle: string | null;
  issueMessage: string;
  adminReply: string;
  adminRepliedAt: string;
  isRead: boolean;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAnalyzeEvent(payload: AnalyzeEventPayload): Promise<void> {
    const visitorId = String(payload.visitorId ?? '').trim().slice(0, 120);
    if (!visitorId) return;

    const genres = Array.from(
      new Set((payload.genres ?? []).map((v) => String(v ?? '').trim()).filter(Boolean)),
    ).slice(0, 30);
    const moods = Array.from(
      new Set((payload.moods ?? []).map((v) => String(v ?? '').trim()).filter(Boolean)),
    ).slice(0, 30);
    const excludes = Array.from(
      new Set((payload.excludes ?? []).map((v) => String(v ?? '').trim()).filter(Boolean)),
    ).slice(0, 30);

    const favoriteMovieIds = Array.from(
      new Set(
        (payload.favoriteMovieIds ?? [])
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n > 0)
          .map((n) => Math.trunc(n)),
      ),
    ).slice(0, 200);

    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO "AnalyzeEvent"
        ("visitorId", "userId", "isAuthed", "genres", "moods", "runtime", "releaseYear", "country", "excludes", "favoriteMovieIds", "favoriteCount", "source", "createdAt")
      VALUES
        ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11, 'analyze', NOW())
      `,
      visitorId,
      typeof payload.userId === 'number' && Number.isFinite(payload.userId)
        ? Math.trunc(payload.userId)
        : null,
      !!payload.isAuthed,
      JSON.stringify(genres),
      JSON.stringify(moods),
      String(payload.runtime ?? '').trim() || null,
      String(payload.releaseYear ?? '').trim() || null,
      String(payload.country ?? '').trim() || null,
      JSON.stringify(excludes),
      JSON.stringify(favoriteMovieIds),
      favoriteMovieIds.length,
    );
  }

  async createContentIssue(payload: ContentIssuePayload): Promise<void> {
    const mediaType = payload.mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbId = Math.trunc(Number(payload.tmdbId));
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return;

    const issueMessage = String(payload.issueMessage ?? '').trim().slice(0, 200);
    if (!issueMessage) return;

    const contentTitle = String(payload.contentTitle ?? '')
      .trim()
      .slice(0, 200);
    const issueDetail = String(payload.issueDetail ?? '')
      .trim()
      .slice(0, 4000);
    const reporterName = String(payload.reporterName ?? '')
      .trim()
      .slice(0, 80);
    const reporterEmail = String(payload.reporterEmail ?? '')
      .trim()
      .slice(0, 160);
    const visitorId = String(payload.visitorId ?? '')
      .trim()
      .slice(0, 120);
    const reporterUserId =
      typeof payload.reporterUserId === 'number' && Number.isFinite(payload.reporterUserId)
        ? Math.trunc(payload.reporterUserId)
        : null;

    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO "ContentIssueReport"
        ("mediaType", "tmdbId", "contentTitle", "issueMessage", "issueDetail", "reporterUserId", "reporterName", "reporterEmail", "visitorId", "source", "status", "createdAt", "updatedAt")
      VALUES
        ($1::"MediaType", $2, $3, $4, $5, $6, $7, $8, $9, 'detail', 'received', NOW(), NOW())
      `,
      mediaType,
      tmdbId,
      contentTitle || null,
      issueMessage,
      issueDetail || null,
      reporterUserId,
      reporterName || null,
      reporterEmail || null,
      visitorId || null,
    );
  }

  async getMyIssueNotifications(
    userId: number,
    limitRaw?: number,
  ): Promise<{
    unreadCount: number;
    items: IssueNotificationItem[];
  }> {
    const uid = Math.trunc(Number(userId));
    if (!Number.isFinite(uid) || uid <= 0) {
      return { unreadCount: 0, items: [] };
    }
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(limitRaw ?? 20))));

    const [unreadRows, rows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ value: bigint | number }>>(
        `
        SELECT COUNT(*)::bigint AS value
        FROM "ContentIssueReport"
        WHERE "reporterUserId" = $1
          AND COALESCE("status", 'received') = 'answered'
          AND COALESCE("adminReply", '') <> ''
          AND "adminRepliedAt" IS NOT NULL
          AND "userDeletedAt" IS NULL
          AND "userReadAt" IS NULL
        `,
        uid,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{
          id: number;
          mediaType: 'movie' | 'tv';
          tmdbId: number;
          contentTitle: string | null;
          issueMessage: string;
          adminReply: string;
          adminRepliedAt: Date | string;
          userReadAt: Date | string | null;
        }>
      >(
        `
        SELECT
          "id",
          "mediaType",
          "tmdbId",
          "contentTitle",
          "issueMessage",
          "adminReply",
          "adminRepliedAt",
          "userReadAt"
        FROM "ContentIssueReport"
        WHERE "reporterUserId" = $1
          AND COALESCE("status", 'received') = 'answered'
          AND COALESCE("adminReply", '') <> ''
          AND "adminRepliedAt" IS NOT NULL
          AND "userDeletedAt" IS NULL
        ORDER BY "adminRepliedAt" DESC
        LIMIT ${limit}
        `,
        uid,
      ),
    ]);

    return {
      unreadCount: Number(unreadRows?.[0]?.value ?? 0),
      items: rows.map((r) => ({
        id: Math.trunc(Number(r.id ?? 0)),
        mediaType: r.mediaType === 'tv' ? 'tv' : 'movie',
        tmdbId: Math.trunc(Number(r.tmdbId ?? 0)),
        contentTitle: r.contentTitle ? String(r.contentTitle) : null,
        issueMessage: String(r.issueMessage ?? ''),
        adminReply: String(r.adminReply ?? ''),
        adminRepliedAt: new Date(r.adminRepliedAt).toISOString(),
        isRead: !!r.userReadAt,
      })),
    };
  }

  async markMyIssueNotificationRead(userId: number, issueId: number): Promise<void> {
    const uid = Math.trunc(Number(userId));
    const iid = Math.trunc(Number(issueId));
    if (!Number.isFinite(uid) || uid <= 0) return;
    if (!Number.isFinite(iid) || iid <= 0) return;

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE "ContentIssueReport"
      SET "userReadAt" = COALESCE("userReadAt", NOW()), "updatedAt" = NOW()
      WHERE "id" = $1
        AND "reporterUserId" = $2
        AND COALESCE("status", 'received') = 'answered'
      `,
      iid,
      uid,
    );
  }

  async deleteMyIssueNotification(userId: number, issueId: number): Promise<void> {
    const uid = Math.trunc(Number(userId));
    const iid = Math.trunc(Number(issueId));
    if (!Number.isFinite(uid) || uid <= 0) return;
    if (!Number.isFinite(iid) || iid <= 0) return;

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE "ContentIssueReport"
      SET "userDeletedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = $1
        AND "reporterUserId" = $2
        AND COALESCE("status", 'received') = 'answered'
      `,
      iid,
      uid,
    );
  }
}
