// backend/src/admin-meta/admin-meta.controller.ts
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminTokenGuard } from './admin-token.guard';
import { MetaService } from '../meta/meta.service';
import type { MediaType } from '../meta/meta.types';
import { PrismaService } from '../prisma/prisma.service';
import { SearchPolicyService } from '../search/search-policy.service';

function parseMediaType(v: string): MediaType {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (s === 'movie' || s === 'tv') return s as MediaType;
  throw new BadRequestException('mediaType must be "movie" or "tv"');
}

function parseTmdbId(v: string): number {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n) || n <= 0)
    throw new BadRequestException('tmdbId must be a positive number');
  return Math.trunc(n);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asStringOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  return v;
}

function asNumberOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.trunc(v);
}

function asBooleanOrNull(v: unknown): boolean | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'boolean') return undefined;
  return v;
}

function parsePositiveInt(
  v: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function csvEscape(v: unknown): string {
  const raw = String(v ?? '');
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

type IssueReportStatus = 'received' | 'in_progress' | 'answered';
type UserAdminRole = 'USER' | 'ADMIN';

function parseIssueReportStatus(v: unknown): IssueReportStatus {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (s === 'received' || s === 'in_progress' || s === 'answered') {
    return s;
  }
  throw new BadRequestException(
    'status must be one of "received", "in_progress", "answered"',
  );
}

function parseUserRole(v: unknown): UserAdminRole {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  if (s === 'USER' || s === 'ADMIN') return s;
  throw new BadRequestException('role must be one of "USER", "ADMIN"');
}

@Controller('admin/meta')
@UseGuards(AdminTokenGuard)
export class AdminMetaController {
  constructor(
    private readonly meta: MetaService,
    private readonly prisma: PrismaService,
    private readonly searchPolicy: SearchPolicyService,
  ) {}

  @Patch(':mediaType/:tmdbId')
  @Post(':mediaType/:tmdbId')
  async patch(
    @Param('mediaType') mediaTypeRaw: string,
    @Param('tmdbId') tmdbIdRaw: string,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const mediaType = parseMediaType(mediaTypeRaw);
    const tmdbId = parseTmdbId(tmdbIdRaw);

    const patch = isRecord(body) ? body : {};

    await this.meta.upsertOverride({
      mediaType,
      tmdbId,
      patch: {
        contentKind:
          typeof patch['contentKind'] === 'string'
            ? patch['contentKind']
            : undefined,
        releaseStatus:
          typeof patch['releaseStatus'] === 'string'
            ? patch['releaseStatus']
            : undefined,
        ageRating:
          typeof patch['ageRating'] === 'string'
            ? patch['ageRating']
            : undefined,
        releaseYear:
          typeof patch['releaseYear'] === 'number'
            ? patch['releaseYear']
            : patch['releaseYear'] === null
              ? null
              : undefined,
        contentInfoReleaseYear:
          typeof patch['contentInfoReleaseYear'] === 'number'
            ? patch['contentInfoReleaseYear']
            : patch['contentInfoReleaseYear'] === null
              ? null
              : undefined,
        watchProviders: patch['watchProviders'],
        title: asStringOrNull(patch['title']),
        originalTitle: asStringOrNull(patch['originalTitle']),
        overview: asStringOrNull(patch['overview']),
        runtime: asNumberOrNull(patch['runtime']),
        releaseDate: asStringOrNull(patch['releaseDate']),
        rerunTheatricalDate: asStringOrNull(patch['rerunTheatricalDate']),
        unifiedYearLabel: asStringOrNull(patch['unifiedYearLabel']),
        forceHidden: asBooleanOrNull(patch['forceHidden']),
      },
      updatedBy: 'admin-token',
    });

    return { ok: true };
  }

  @Get('overrides')
  async listOverrides(@Query('limit') limitRaw?: string): Promise<{
    items: Array<{
      mediaType: MediaType;
      tmdbId: number;
      contentKind: string | null;
      overrideTitle: string | null;
      overrideOriginalTitle: string | null;
      forceHidden: boolean;
      hasDetailEdits: boolean;
      hasMetaEdits: boolean;
      updatedAt: string;
    }>;
    summary: {
      total: number;
      hiddenCount: number;
      editedCount: number;
    };
  }> {
    const limit = (() => {
      const n = Number(String(limitRaw ?? '200').trim());
      if (!Number.isFinite(n) || n <= 0) return 200;
      return Math.min(500, Math.trunc(n));
    })();

    const rows = await (async () => {
      try {
        return await this.prisma.contentMetaOverride.findMany({
          orderBy: { updatedAt: 'desc' },
          take: limit,
          select: {
            mediaType: true,
            tmdbId: true,
            forceHidden: true,
            contentKind: true,
            releaseStatus: true,
            ageRating: true,
            releaseYear: true,
            contentInfoReleaseYear: true,
            watchProviders: true,
            statusKind: true,
            unifiedYearLabel: true,
            originalTheatricalDate: true,
            rerunTheatricalDate: true,
            hasMultipleTheatrical: true,
            overrideTitle: true,
            overrideOriginalTitle: true,
            overrideOverview: true,
            overrideRuntime: true,
            overrideReleaseDate: true,
            updatedAt: true,
          },
        });
      } catch {
        return await this.prisma.contentMetaOverride.findMany({
          orderBy: { updatedAt: 'desc' },
          take: limit,
          select: {
            mediaType: true,
            tmdbId: true,
            contentKind: true,
            releaseStatus: true,
            ageRating: true,
            releaseYear: true,
            contentInfoReleaseYear: true,
            watchProviders: true,
            statusKind: true,
            unifiedYearLabel: true,
            originalTheatricalDate: true,
            rerunTheatricalDate: true,
            hasMultipleTheatrical: true,
            overrideTitle: true,
            overrideOriginalTitle: true,
            overrideOverview: true,
            overrideRuntime: true,
            overrideReleaseDate: true,
            updatedAt: true,
          },
        });
      }
    })();

    const items = rows.map((r) => {
      const hasDetailEdits = Boolean(
        r.overrideTitle ??
        r.overrideOriginalTitle ??
        r.overrideOverview ??
        r.overrideRuntime ??
        r.overrideReleaseDate,
      );
      const hasMetaEdits = Boolean(
        r.contentKind ??
        r.releaseStatus ??
        r.ageRating ??
        r.releaseYear ??
        r.contentInfoReleaseYear ??
        r.watchProviders ??
        r.statusKind ??
        r.unifiedYearLabel ??
        r.originalTheatricalDate ??
        r.rerunTheatricalDate ??
        r.hasMultipleTheatrical,
      );

      return {
        mediaType: r.mediaType as MediaType,
        tmdbId: r.tmdbId,
        contentKind: typeof r.contentKind === 'string' ? r.contentKind : null,
        overrideTitle: (r as any).overrideTitle ?? null,
        overrideOriginalTitle: (r as any).overrideOriginalTitle ?? null,
        forceHidden:
          (r as { forceHidden?: boolean | null }).forceHidden === true,
        hasDetailEdits,
        hasMetaEdits,
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    const hiddenCount = items.filter((x) => x.forceHidden).length;
    const editedCount = items.filter(
      (x) => x.hasDetailEdits || x.hasMetaEdits,
    ).length;

    return {
      items,
      summary: {
        total: items.length,
        hiddenCount,
        editedCount,
      },
    };
  }

  @Delete(':mediaType/:tmdbId')
  @Post(':mediaType/:tmdbId/reset')
  async reset(
    @Param('mediaType') mediaTypeRaw: string,
    @Param('tmdbId') tmdbIdRaw: string,
  ): Promise<{ ok: true }> {
    const mediaType = parseMediaType(mediaTypeRaw);
    const tmdbId = parseTmdbId(tmdbIdRaw);

    await this.meta.clearOverride({ mediaType, tmdbId });
    return { ok: true };
  }

  @Get('history')
  async history(
    @Query('limit') limitRaw?: string,
    @Query('q') qRaw?: string,
  ): Promise<{
    items: Array<{
      id: string;
      mediaType: MediaType;
      tmdbId: number;
      title: string | null;
      action: string;
      changedFields: string[];
      beforeSnapshot: Record<string, unknown> | null;
      afterSnapshot: Record<string, unknown> | null;
      createdBy: string | null;
      createdAt: string;
    }>;
  }> {
    const limit = (() => {
      const n = Number(String(limitRaw ?? '20').trim());
      if (!Number.isFinite(n) || n <= 0) return 20;
      return Math.min(200, Math.trunc(n));
    })();
    const q = String(qRaw ?? '').trim();

    const items = await this.meta.listOverrideHistory({
      limit,
      query: q || undefined,
    });
    return { items };
  }

  @Post(':mediaType/:tmdbId/history/:historyId/restore')
  async restoreFromHistory(
    @Param('mediaType') mediaTypeRaw: string,
    @Param('tmdbId') tmdbIdRaw: string,
    @Param('historyId') historyIdRaw: string,
  ): Promise<{ ok: true }> {
    const mediaType = parseMediaType(mediaTypeRaw);
    const tmdbId = parseTmdbId(tmdbIdRaw);
    const historyId = String(historyIdRaw ?? '').trim();
    if (!historyId) throw new BadRequestException('historyId is required');

    const ok = await this.meta.restoreOverrideFromHistory({
      mediaType,
      tmdbId,
      historyId,
      updatedBy: 'admin-token:restore',
    });
    if (!ok) throw new BadRequestException('history not found');
    return { ok: true };
  }

  @Get('search-policy')
  async getSearchPolicy(): Promise<{
    keywords: string[];
    updatedAt: string | null;
  }> {
    return await this.searchPolicy.getSensitiveKeywords();
  }

  @Patch('search-policy')
  @Post('search-policy')
  async setSearchPolicy(
    @Body() body: unknown,
  ): Promise<{ ok: true; keywords: string[]; updatedAt: string | null }> {
    const rec = isRecord(body) ? body : {};
    const raw = Array.isArray(rec['keywords']) ? rec['keywords'] : [];
    const keywords = raw.map((x) => String(x ?? '').trim()).filter(Boolean);

    const saved = await this.searchPolicy.setSensitiveKeywords({
      keywords,
      updatedBy: 'admin-token',
    });
    return { ok: true, ...saved };
  }

  @Get('analyze-stats')
  async getAnalyzeStats(): Promise<{
    total: number;
    authedCount: number;
    guestCount: number;
    uniqueVisitors: number;
    last7DaysCount: number;
    topGenres: Array<{ name: string; count: number }>;
    topMoods: Array<{ name: string; count: number }>;
    topExcludes: Array<{ name: string; count: number }>;
    topCountries: Array<{ name: string; count: number }>;
    topRuntimes: Array<{ name: string; count: number }>;
    topReleaseYears: Array<{ name: string; count: number }>;
  }> {
    const scalar = async (sql: string) => {
      const rows =
        await this.prisma.$queryRawUnsafe<Array<{ value: bigint | number }>>(
          sql,
        );
      return Number(rows?.[0]?.value ?? 0);
    };

    const [total, authedCount, guestCount, uniqueVisitors, last7DaysCount] =
      await Promise.all([
        scalar(`SELECT COUNT(*)::bigint AS value FROM "AnalyzeEvent"`),
        scalar(
          `SELECT COUNT(*)::bigint AS value FROM "AnalyzeEvent" WHERE "isAuthed" = true`,
        ),
        scalar(
          `SELECT COUNT(*)::bigint AS value FROM "AnalyzeEvent" WHERE "isAuthed" = false`,
        ),
        scalar(
          `SELECT COUNT(DISTINCT "visitorId")::bigint AS value FROM "AnalyzeEvent"`,
        ),
        scalar(
          `SELECT COUNT(*)::bigint AS value FROM "AnalyzeEvent" WHERE "createdAt" >= NOW() - INTERVAL '7 days'`,
        ),
      ]);

    const asTop = async (sql: string) => {
      const rows =
        await this.prisma.$queryRawUnsafe<
          Array<{ name: string; count: bigint | number }>
        >(sql);
      return rows.map((r) => ({
        name: String(r.name ?? ''),
        count: Number(r.count ?? 0),
      }));
    };

    const [
      topGenres,
      topMoods,
      topExcludes,
      topCountries,
      topRuntimes,
      topReleaseYears,
    ] = await Promise.all([
      asTop(`
          SELECT v AS name, COUNT(*) AS count
          FROM "AnalyzeEvent", jsonb_array_elements_text("genres") AS v
          WHERE COALESCE(v, '') <> ''
          GROUP BY v
          ORDER BY count DESC
          LIMIT 10
        `),
      asTop(`
          SELECT v AS name, COUNT(*) AS count
          FROM "AnalyzeEvent", jsonb_array_elements_text("moods") AS v
          WHERE COALESCE(v, '') <> ''
          GROUP BY v
          ORDER BY count DESC
          LIMIT 10
        `),
      asTop(`
          SELECT v AS name, COUNT(*) AS count
          FROM "AnalyzeEvent", jsonb_array_elements_text("excludes") AS v
          WHERE COALESCE(v, '') <> ''
          GROUP BY v
          ORDER BY count DESC
          LIMIT 10
        `),
      asTop(`
          SELECT "country" AS name, COUNT(*) AS count
          FROM "AnalyzeEvent"
          WHERE COALESCE("country", '') <> ''
          GROUP BY "country"
          ORDER BY count DESC
          LIMIT 10
        `),
      asTop(`
          SELECT "runtime" AS name, COUNT(*) AS count
          FROM "AnalyzeEvent"
          WHERE COALESCE("runtime", '') <> ''
          GROUP BY "runtime"
          ORDER BY count DESC
          LIMIT 10
        `),
      asTop(`
          SELECT "releaseYear" AS name, COUNT(*) AS count
          FROM "AnalyzeEvent"
          WHERE COALESCE("releaseYear", '') <> ''
          GROUP BY "releaseYear"
          ORDER BY count DESC
          LIMIT 10
        `),
    ]);

    return {
      total,
      authedCount,
      guestCount,
      uniqueVisitors,
      last7DaysCount,
      topGenres,
      topMoods,
      topExcludes,
      topCountries,
      topRuntimes,
      topReleaseYears,
    };
  }

  @Get('analyze-stats/detailed')
  async getAnalyzeStatsDetailed(
    @Query('days') daysRaw?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    generatedAt: string;
    range: { days: number; from: string; to: string };
    summary: {
      total: number;
      authedCount: number;
      guestCount: number;
      uniqueVisitors: number;
      firstEventAt: string | null;
      lastEventAt: string | null;
    };
    daily: Array<{
      date: string;
      count: number;
      authedCount: number;
      guestCount: number;
      uniqueVisitors: number;
    }>;
    genres: Array<{ name: string; count: number }>;
    moods: Array<{ name: string; count: number }>;
    excludes: Array<{ name: string; count: number }>;
    countries: Array<{ name: string; count: number }>;
    runtimes: Array<{ name: string; count: number }>;
    releaseYears: Array<{ name: string; count: number }>;
    recentEvents: Array<{
      id: string;
      createdAt: string;
      isAuthed: boolean;
      userId: number | null;
      visitorId: string;
      country: string | null;
      runtime: string | null;
      releaseYear: string | null;
      favoriteCount: number;
      genres: string[];
      moods: string[];
      excludes: string[];
      favoriteMovieIds: number[];
    }>;
  }> {
    const days = parsePositiveInt(daysRaw, 30, 1, 365);
    const limit = parsePositiveInt(limitRaw, 300, 50, 2000);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const baseFilter = `WHERE "createdAt" >= $1`;

    const scalar = async (
      sql: string,
      ...params: Array<string | number | Date>
    ) => {
      const rows =
        await this.prisma.$queryRawUnsafe<Array<{ value: bigint | number }>>(
          sql,
          ...params,
        );
      return Number(rows?.[0]?.value ?? 0);
    };

    const [
      total,
      authedCount,
      guestCount,
      uniqueVisitors,
      firstEventAt,
      lastEventAt,
    ] = await Promise.all([
      scalar(
        `SELECT COUNT(*)::bigint AS value FROM "AnalyzeEvent" ${baseFilter}`,
        since,
      ),
      scalar(
        `SELECT COUNT(*)::bigint AS value FROM "AnalyzeEvent" ${baseFilter} AND "isAuthed" = true`,
        since,
      ),
      scalar(
        `SELECT COUNT(*)::bigint AS value FROM "AnalyzeEvent" ${baseFilter} AND "isAuthed" = false`,
        since,
      ),
      scalar(
        `SELECT COUNT(DISTINCT "visitorId")::bigint AS value FROM "AnalyzeEvent" ${baseFilter}`,
        since,
      ),
      (async () => {
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{ value: Date | string | null }>
        >(
          `SELECT MIN("createdAt") AS value FROM "AnalyzeEvent" ${baseFilter}`,
          since,
        );
        const v = rows?.[0]?.value;
        return v ? new Date(v).toISOString() : null;
      })(),
      (async () => {
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{ value: Date | string | null }>
        >(
          `SELECT MAX("createdAt") AS value FROM "AnalyzeEvent" ${baseFilter}`,
          since,
        );
        const v = rows?.[0]?.value;
        return v ? new Date(v).toISOString() : null;
      })(),
    ]);

    const asTop = async (
      sql: string,
      ...params: Array<string | number | Date>
    ) => {
      const rows =
        await this.prisma.$queryRawUnsafe<
          Array<{ name: string; count: bigint | number }>
        >(sql, ...params);
      return rows.map((r) => ({
        name: String(r.name ?? ''),
        count: Number(r.count ?? 0),
      }));
    };

    const [
      genres,
      moods,
      excludes,
      countries,
      runtimes,
      releaseYears,
      daily,
      recentEvents,
    ] = await Promise.all([
      asTop(`
          SELECT v AS name, COUNT(*) AS count
          FROM "AnalyzeEvent", jsonb_array_elements_text("genres") AS v
          ${baseFilter}
            AND COALESCE(v, '') <> ''
          GROUP BY v
          ORDER BY count DESC
          LIMIT $2
        `,
        since,
        limit,
      ),
      asTop(`
          SELECT v AS name, COUNT(*) AS count
          FROM "AnalyzeEvent", jsonb_array_elements_text("moods") AS v
          ${baseFilter}
            AND COALESCE(v, '') <> ''
          GROUP BY v
          ORDER BY count DESC
          LIMIT $2
        `,
        since,
        limit,
      ),
      asTop(`
          SELECT v AS name, COUNT(*) AS count
          FROM "AnalyzeEvent", jsonb_array_elements_text("excludes") AS v
          ${baseFilter}
            AND COALESCE(v, '') <> ''
          GROUP BY v
          ORDER BY count DESC
          LIMIT $2
        `,
        since,
        limit,
      ),
      asTop(`
          SELECT "country" AS name, COUNT(*) AS count
          FROM "AnalyzeEvent"
          ${baseFilter}
            AND COALESCE("country", '') <> ''
          GROUP BY "country"
          ORDER BY count DESC
          LIMIT $2
        `,
        since,
        limit,
      ),
      asTop(`
          SELECT "runtime" AS name, COUNT(*) AS count
          FROM "AnalyzeEvent"
          ${baseFilter}
            AND COALESCE("runtime", '') <> ''
          GROUP BY "runtime"
          ORDER BY count DESC
          LIMIT $2
        `,
        since,
        limit,
      ),
      asTop(`
          SELECT "releaseYear" AS name, COUNT(*) AS count
          FROM "AnalyzeEvent"
          ${baseFilter}
            AND COALESCE("releaseYear", '') <> ''
          GROUP BY "releaseYear"
          ORDER BY count DESC
          LIMIT $2
        `,
        since,
        limit,
      ),
      (async () => {
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{
            date: string;
            count: bigint | number;
            authedCount: bigint | number;
            guestCount: bigint | number;
            uniqueVisitors: bigint | number;
          }>
        >(
          `
            SELECT
              TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') AS date,
              COUNT(*) AS count,
              COUNT(*) FILTER (WHERE "isAuthed" = true) AS "authedCount",
              COUNT(*) FILTER (WHERE "isAuthed" = false) AS "guestCount",
              COUNT(DISTINCT "visitorId") AS "uniqueVisitors"
            FROM "AnalyzeEvent"
            ${baseFilter}
            GROUP BY DATE("createdAt")
            ORDER BY DATE("createdAt") DESC
            `,
          since,
        );
        return rows.map((r) => ({
          date: String(r.date ?? ''),
          count: Number(r.count ?? 0),
          authedCount: Number(r.authedCount ?? 0),
          guestCount: Number(r.guestCount ?? 0),
          uniqueVisitors: Number(r.uniqueVisitors ?? 0),
        }));
      })(),
      (async () => {
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{
            id: string;
            createdAt: Date | string;
            isAuthed: boolean;
            userId: number | null;
            visitorId: string;
            country: string | null;
            runtime: string | null;
            releaseYear: string | null;
            favoriteCount: number;
            genres: unknown;
            moods: unknown;
            excludes: unknown;
            favoriteMovieIds: unknown;
          }>
        >(
          `
            SELECT
              "id",
              "createdAt",
              "isAuthed",
              "userId",
              "visitorId",
              "country",
              "runtime",
              "releaseYear",
              "favoriteCount",
              "genres",
              "moods",
              "excludes",
              "favoriteMovieIds"
            FROM "AnalyzeEvent"
            ${baseFilter}
            ORDER BY "createdAt" DESC
            LIMIT $2
            `,
          since,
          limit,
        );
        return rows.map((r) => ({
          id: String(r.id ?? ''),
          createdAt: new Date(r.createdAt).toISOString(),
          isAuthed: !!r.isAuthed,
          userId:
            typeof r.userId === 'number' && Number.isFinite(r.userId)
              ? Math.trunc(r.userId)
              : null,
          visitorId: String(r.visitorId ?? ''),
          country: r.country ? String(r.country) : null,
          runtime: r.runtime ? String(r.runtime) : null,
          releaseYear: r.releaseYear ? String(r.releaseYear) : null,
          favoriteCount: Number(r.favoriteCount ?? 0),
          genres: Array.isArray(r.genres)
            ? r.genres.map((x) => String(x ?? ''))
            : [],
          moods: Array.isArray(r.moods)
            ? r.moods.map((x) => String(x ?? ''))
            : [],
          excludes: Array.isArray(r.excludes)
            ? r.excludes.map((x) => String(x ?? ''))
            : [],
          favoriteMovieIds: Array.isArray(r.favoriteMovieIds)
            ? r.favoriteMovieIds
                .map((x) => Number(x))
                .filter((n) => Number.isFinite(n))
                .map((n) => Math.trunc(n))
            : [],
        }));
      })(),
    ]);

    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      generatedAt: now.toISOString(),
      range: {
        days,
        from: from.toISOString(),
        to: now.toISOString(),
      },
      summary: {
        total,
        authedCount,
        guestCount,
        uniqueVisitors,
        firstEventAt,
        lastEventAt,
      },
      daily,
      genres,
      moods,
      excludes,
      countries,
      runtimes,
      releaseYears,
      recentEvents,
    };
  }

  @Get('analyze-stats/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportAnalyzeStatsCsv(
    @Query('days') daysRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const days = parsePositiveInt(daysRaw, 30, 1, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        createdAt: Date | string;
        isAuthed: boolean;
        userId: number | null;
        visitorId: string;
        genres: unknown;
        moods: unknown;
        runtime: string | null;
        releaseYear: string | null;
        country: string | null;
        excludes: unknown;
        favoriteCount: number;
        favoriteMovieIds: unknown;
      }>
    >(
      `
      SELECT
        "id",
        "createdAt",
        "isAuthed",
        "userId",
        "visitorId",
        "genres",
        "moods",
        "runtime",
        "releaseYear",
        "country",
        "excludes",
        "favoriteCount",
        "favoriteMovieIds"
      FROM "AnalyzeEvent"
      WHERE "createdAt" >= $1
      ORDER BY "createdAt" DESC
      `,
      since,
    );

    const filename = `pickmovie-analyze-events-${days}d-${Date.now()}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const header = [
      'id',
      'createdAt',
      'isAuthed',
      'userId',
      'visitorId',
      'country',
      'runtime',
      'releaseYear',
      'favoriteCount',
      'genres',
      'moods',
      'excludes',
      'favoriteMovieIds',
    ];
    const lines = rows.map((r) => {
      const genres = Array.isArray(r.genres) ? r.genres : [];
      const moods = Array.isArray(r.moods) ? r.moods : [];
      const excludes = Array.isArray(r.excludes) ? r.excludes : [];
      const favoriteMovieIds = Array.isArray(r.favoriteMovieIds)
        ? r.favoriteMovieIds
        : [];
      return [
        csvEscape(r.id),
        csvEscape(new Date(r.createdAt).toISOString()),
        csvEscape(r.isAuthed ? 'true' : 'false'),
        csvEscape(r.userId ?? ''),
        csvEscape(r.visitorId),
        csvEscape(r.country ?? ''),
        csvEscape(r.runtime ?? ''),
        csvEscape(r.releaseYear ?? ''),
        csvEscape(Number(r.favoriteCount ?? 0)),
        csvEscape(JSON.stringify(genres)),
        csvEscape(JSON.stringify(moods)),
        csvEscape(JSON.stringify(excludes)),
        csvEscape(JSON.stringify(favoriteMovieIds)),
      ].join(',');
    });
    return [header.join(','), ...lines].join('\n');
  }

  @Get('users/recent-logins')
  async listRecentLoginUsers(
    @Query('limit') limitRaw?: string,
  ): Promise<{
    items: Array<{
      id: number;
      username: string;
      nickname: string | null;
      email: string | null;
      role: UserAdminRole;
      createdAt: string;
      lastLoginAt: string | null;
    }>;
  }> {
    const limit = parsePositiveInt(limitRaw, 5, 1, 20);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: number;
        username: string;
        nickname: string | null;
        email: string | null;
        role: string | null;
        createdAt: Date | string;
        lastLoginAt: Date | string | null;
      }>
    >(
      `
      SELECT
        u."id",
        u."username",
        u."nickname",
        u."email",
        u."role"::text AS "role",
        u."createdAt",
        MAX(rt."createdAt") AS "lastLoginAt"
      FROM "User" u
      JOIN "RefreshToken" rt ON rt."userId" = u."id"
      GROUP BY
        u."id",
        u."username",
        u."nickname",
        u."email",
        u."role",
        u."createdAt"
      ORDER BY MAX(rt."createdAt") DESC
      LIMIT $1
      `,
      limit,
    );

    return {
      items: rows.map((r) => ({
        id: Math.trunc(Number(r.id ?? 0)),
        username: String(r.username ?? ''),
        nickname: r.nickname ? String(r.nickname) : null,
        email: r.email ? String(r.email) : null,
        role: String(r.role ?? '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER',
        createdAt: new Date(r.createdAt).toISOString(),
        lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null,
      })),
    };
  }

  @Get('users/search')
  async searchUsers(
    @Query('q') qRaw?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    items: Array<{
      id: number;
      username: string;
      nickname: string | null;
      email: string | null;
      role: UserAdminRole;
      createdAt: string;
      lastLoginAt: string | null;
    }>;
  }> {
    const q = String(qRaw ?? '')
      .trim()
      .slice(0, 80);
    const limit = parsePositiveInt(limitRaw, 20, 1, 50);
    if (!q) return { items: [] };

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: number;
        username: string;
        nickname: string | null;
        email: string | null;
        role: string | null;
        createdAt: Date | string;
        lastLoginAt: Date | string | null;
      }>
    >(
      `
      SELECT
        u."id",
        u."username",
        u."nickname",
        u."email",
        u."role"::text AS "role",
        u."createdAt",
        MAX(rt."createdAt") AS "lastLoginAt"
      FROM "User" u
      LEFT JOIN "RefreshToken" rt ON rt."userId" = u."id"
      WHERE
        LOWER(u."username") = LOWER($1)
        OR LOWER(SPLIT_PART(u."username", '-', 1)) = LOWER($1)
        OR LOWER(SPLIT_PART(u."username", '_', 1)) = LOWER($1)
        OR LOWER(COALESCE(u."nickname", '')) = LOWER($1)
        OR ($2 <> '' AND CAST(u."id" AS TEXT) = $2)
      GROUP BY
        u."id",
        u."username",
        u."nickname",
        u."email",
        u."role",
        u."createdAt"
      ORDER BY COALESCE(MAX(rt."createdAt"), u."createdAt") DESC
      LIMIT $3
      `,
      q,
      q,
      limit,
    );

    return {
      items: rows.map((r) => ({
        id: Math.trunc(Number(r.id ?? 0)),
        username: String(r.username ?? ''),
        nickname: r.nickname ? String(r.nickname) : null,
        email: r.email ? String(r.email) : null,
        role: String(r.role ?? '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER',
        createdAt: new Date(r.createdAt).toISOString(),
        lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null,
      })),
    };
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') idRaw: string,
    @Body()
    body: {
      role?: unknown;
    },
  ): Promise<{ ok: true }> {
    const id = parsePositiveInt(idRaw, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new BadRequestException('id must be a positive number');
    const nextRole = parseUserRole(body?.role);

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true },
    });
    if (!target) throw new BadRequestException('user not found');

    const currentRole =
      String(target.role ?? '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';
    if (currentRole === nextRole) return { ok: true };

    if (currentRole === 'ADMIN' && nextRole !== 'ADMIN') {
      const adminCount = await this.prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        throw new ConflictException('마지막 관리자는 일반 권한으로 변경할 수 없습니다.');
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: { role: nextRole },
    });

    return { ok: true };
  }

  @Delete('users/account/:id')
  async deleteUser(@Param('id') idRaw: string): Promise<{ ok: true }> {
    const id = parsePositiveInt(idRaw, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new BadRequestException('id must be a positive number');

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) throw new BadRequestException('user not found');

    if (String(target.role ?? '').toUpperCase() === 'ADMIN') {
      const adminCount = await this.prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        throw new ConflictException('마지막 관리자는 삭제할 수 없습니다.');
      }
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return { ok: true };
  }

  @Get('content-issues')
  async listContentIssues(
    @Query('status') statusRaw?: string,
    @Query('days') daysRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('q') qRaw?: string,
  ): Promise<{
    summary: {
      total: number;
      receivedCount: number;
      inProgressCount: number;
      answeredCount: number;
    };
    items: Array<{
      id: number;
      mediaType: 'movie' | 'tv';
      tmdbId: number;
      contentTitle: string | null;
      issueMessage: string;
      issueDetail: string | null;
      reporterUserId: number | null;
      reporterName: string | null;
      reporterEmail: string | null;
      visitorId: string | null;
      source: string;
      status: IssueReportStatus;
      adminReply: string | null;
      adminRepliedAt: string | null;
      adminRepliedBy: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const days = parsePositiveInt(daysRaw, 365, 1, 3650);
    const limit = parsePositiveInt(limitRaw, 100, 1, 500);
    const q = String(qRaw ?? '')
      .trim()
      .slice(0, 120)
      .toLowerCase();
    const status =
      String(statusRaw ?? '')
        .trim()
        .toLowerCase() || 'all';
    if (
      status !== 'all' &&
      status !== 'received' &&
      status !== 'in_progress' &&
      status !== 'answered'
    ) {
      throw new BadRequestException(
        'status must be one of "all", "received", "in_progress", "answered"',
      );
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const conditions: string[] = [`"createdAt" >= $1`];
    const values: Array<string | Date | number> = [since];

    if (status !== 'all') {
      values.push(status);
      conditions.push(`COALESCE("status", 'received') = $${values.length}`);
    }

    if (q) {
      values.push(`%${q}%`);
      const p = `$${values.length}`;
      conditions.push(
        `(${[
          `LOWER(COALESCE("contentTitle", '')) LIKE ${p}`,
          `CAST("tmdbId" AS TEXT) LIKE ${p}`,
          `LOWER(COALESCE("issueMessage", '')) LIKE ${p}`,
          `LOWER(COALESCE("issueDetail", '')) LIKE ${p}`,
          `LOWER(COALESCE("adminReply", '')) LIKE ${p}`,
        ].join(' OR ')})`,
      );
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    values.push(limit);
    const limitPlaceholder = `$${values.length}`;

    const [summaryRows, rows] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        Array<{
          total: bigint | number;
          receivedCount: bigint | number;
          inProgressCount: bigint | number;
          answeredCount: bigint | number;
        }>
      >(
        `
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE COALESCE("status", 'received') = 'received')::bigint AS "receivedCount",
          COUNT(*) FILTER (WHERE COALESCE("status", 'received') = 'in_progress')::bigint AS "inProgressCount",
          COUNT(*) FILTER (WHERE COALESCE("status", 'received') = 'answered')::bigint AS "answeredCount"
        FROM "ContentIssueReport"
        WHERE "createdAt" >= $1
        `,
        since,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{
          id: number;
          mediaType: 'movie' | 'tv';
          tmdbId: number;
          contentTitle: string | null;
          issueMessage: string;
          issueDetail: string | null;
          reporterUserId: number | null;
          reporterName: string | null;
          reporterEmail: string | null;
          visitorId: string | null;
          source: string;
          status: string | null;
          adminReply: string | null;
          adminRepliedAt: Date | string | null;
          adminRepliedBy: string | null;
          createdAt: Date | string;
          updatedAt: Date | string | null;
        }>
      >(
        `
        SELECT
          "id",
          "mediaType",
          "tmdbId",
          "contentTitle",
          "issueMessage",
          "issueDetail",
          "reporterUserId",
          "reporterName",
          "reporterEmail",
          "visitorId",
          "source",
          COALESCE("status", 'received') AS "status",
          "adminReply",
          "adminRepliedAt",
          "adminRepliedBy",
          "createdAt",
          "updatedAt"
        FROM "ContentIssueReport"
        ${whereClause}
        ORDER BY
          CASE COALESCE("status", 'received')
            WHEN 'received' THEN 0
            WHEN 'in_progress' THEN 1
            ELSE 2
          END ASC,
          "createdAt" DESC
        LIMIT ${limitPlaceholder}
        `,
        ...values,
      ),
    ]);

    const s = summaryRows?.[0] ?? {
      total: 0,
      receivedCount: 0,
      inProgressCount: 0,
      answeredCount: 0,
    };

    return {
      summary: {
        total: Number(s.total ?? 0),
        receivedCount: Number(s.receivedCount ?? 0),
        inProgressCount: Number(s.inProgressCount ?? 0),
        answeredCount: Number(s.answeredCount ?? 0),
      },
      items: rows.map((r) => ({
        id: Math.trunc(Number(r.id ?? 0)),
        mediaType: r.mediaType === 'tv' ? 'tv' : 'movie',
        tmdbId: Math.trunc(Number(r.tmdbId ?? 0)),
        contentTitle: r.contentTitle ? String(r.contentTitle) : null,
        issueMessage: String(r.issueMessage ?? ''),
        issueDetail: r.issueDetail ? String(r.issueDetail) : null,
        reporterUserId:
          typeof r.reporterUserId === 'number' &&
          Number.isFinite(r.reporterUserId)
            ? Math.trunc(r.reporterUserId)
            : null,
        reporterName: r.reporterName ? String(r.reporterName) : null,
        reporterEmail: r.reporterEmail ? String(r.reporterEmail) : null,
        visitorId: r.visitorId ? String(r.visitorId) : null,
        source: String(r.source ?? 'detail'),
        status:
          r.status === 'answered' || r.status === 'in_progress'
            ? r.status
            : 'received',
        adminReply: r.adminReply ? String(r.adminReply) : null,
        adminRepliedAt: r.adminRepliedAt
          ? new Date(r.adminRepliedAt).toISOString()
          : null,
        adminRepliedBy: r.adminRepliedBy ? String(r.adminRepliedBy) : null,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: r.updatedAt
          ? new Date(r.updatedAt).toISOString()
          : new Date(r.createdAt).toISOString(),
      })),
    };
  }

  @Patch('content-issues/:id/reply')
  async replyContentIssue(
    @Param('id') idRaw: string,
    @Body()
    body: {
      status?: string;
      adminReply?: string;
      adminRepliedBy?: string;
    },
  ): Promise<{ ok: true }> {
    const id = parsePositiveInt(idRaw, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new BadRequestException('id must be a positive number');

    const reply = String(body?.adminReply ?? '')
      .trim()
      .slice(0, 4000);
    const hasReply = reply.length > 0;
    const status = body?.status
      ? parseIssueReportStatus(body.status)
      : hasReply
        ? 'answered'
        : 'in_progress';
    if (status === 'answered' && !hasReply) {
      throw new BadRequestException(
        'adminReply is required when status is answered',
      );
    }

    const adminRepliedBy = String(body?.adminRepliedBy ?? '')
      .trim()
      .slice(0, 80);

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE "ContentIssueReport"
      SET
        "status" = $2,
        "adminReply" = $3,
        "adminRepliedAt" = $4,
        "adminRepliedBy" = $5,
        "userReadAt" = $6,
        "userDeletedAt" = $7,
        "updatedAt" = NOW()
      WHERE "id" = $1
      `,
      id,
      status,
      hasReply ? reply : null,
      hasReply ? new Date() : null,
      hasReply ? adminRepliedBy || 'admin' : null,
      null,
      null,
    );

    return { ok: true };
  }
}
