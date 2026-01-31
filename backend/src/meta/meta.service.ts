// backend/src/meta/meta.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { PrismaService } from '../prisma/prisma.service';

import { Prisma } from '../generated/prisma';
import type {
  AgeRating as DbAgeRating,
  ContentKind as DbContentKind,
  ReleaseStatus as DbReleaseStatus,
  StatusKind as DbStatusKind,
} from '../generated/prisma';

import type {
  MediaType,
  ResolveRequest,
  ResolvedMeta,
  SeasonMeta,
  TheatricalInfo,
} from './meta.types';

import {
  asArray,
  asString,
  hasAnimationGenre,
  isRecord,
  toIsoYmd,
  yearFromIsoDate,
} from './meta.resolver';

import {
  apiAgeFromDb,
  apiStatusKindFromDb,
  dbAgeFromApi,
  dbContentKindFromApi,
  dbMediaType,
  dbReleaseStatusFromApi,
  dbStatusKindFromApi,
  isoNow,
  statusKindFromReleaseStatus,
} from './meta.mappers';

import {
  fetchWatchProvidersKR,
  flattenProviders,
  safeWatchProviders,
  toNullableJson,
} from './meta.providers';

import { pickLatestSeasonPosterPath, pickMoviePosterPath } from './meta.poster';

import { buildTvSeasonMeta } from './meta.seasons';

import { computeMovieStatus } from './meta.movieStatus';

/**
 * ✅ 계산 로직/필드가 바뀌면 올려서 캐시 강제 재계산
 */
const TARGET_META_VERSION = 100;

/**
 * ✅ computed 구조 변경 시 강제 재계산
 */
const COMPUTED_SCHEMA_VERSION = 10;

const NOW_PLAYING_TTL_MS = 10 * 60 * 1000; // 10분
const NOW_PLAYING_PAGES = 20; // 1~N 페이지

type NullableJson = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

function toPrismaJson(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

function pickComputedObj(sourcesUsed: Record<string, unknown> | null) {
  if (!sourcesUsed) return null;
  const computed = sourcesUsed['computed'];
  return isRecord(computed) ? computed : null;
}

function pickComputedSchemaVersion(
  sourcesUsed: Record<string, unknown> | null,
): number {
  const c = pickComputedObj(sourcesUsed);
  const v = c ? c['schemaVersion'] : null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickComputedString(
  sourcesUsed: Record<string, unknown> | null,
  key: string,
): string | null {
  const c = pickComputedObj(sourcesUsed);
  const v = c ? c[key] : null;
  return typeof v === 'string' ? v : null;
}

function pickComputedNumber(
  sourcesUsed: Record<string, unknown> | null,
  key: string,
): number | null {
  const c = pickComputedObj(sourcesUsed);
  const v = c ? c[key] : null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickComputedBoolean(
  sourcesUsed: Record<string, unknown> | null,
  key: string,
): boolean {
  const c = pickComputedObj(sourcesUsed);
  return Boolean(c ? c[key] : false);
}

function pickComputedSeasons(
  sourcesUsed: Record<string, unknown> | null,
): SeasonMeta[] | null {
  const c = pickComputedObj(sourcesUsed);
  const seasons = c ? c['seasons'] : null;
  if (!Array.isArray(seasons)) return null;

  const out: SeasonMeta[] = [];
  for (const s of seasons) {
    if (!isRecord(s)) continue;
    const seasonNumber = Number(s['seasonNumber']);
    if (!Number.isFinite(seasonNumber)) continue;

    out.push({
      seasonNumber,
      name: typeof s['name'] === 'string' ? s['name'] : null,
      airDate: typeof s['airDate'] === 'string' ? s['airDate'] : null,
      yearLabel: typeof s['yearLabel'] === 'string' ? s['yearLabel'] : null,
      posterPath: typeof s['posterPath'] === 'string' ? s['posterPath'] : null,
    });
  }
  return out.length ? out : null;
}

function pickComputedTheatrical(
  sourcesUsed: Record<string, unknown> | null,
): TheatricalInfo | null {
  const c = pickComputedObj(sourcesUsed);
  const t = c ? c['theatrical'] : null;
  if (!isRecord(t)) return null;

  const hasMultipleTheatrical = Boolean(t['hasMultipleTheatrical']);
  const originalTheatricalDate =
    typeof t['originalTheatricalDate'] === 'string'
      ? t['originalTheatricalDate']
      : null;
  const rerunTheatricalDate =
    typeof t['rerunTheatricalDate'] === 'string'
      ? t['rerunTheatricalDate']
      : null;

  if (!hasMultipleTheatrical && !originalTheatricalDate && !rerunTheatricalDate)
    return null;

  return {
    hasMultipleTheatrical,
    originalTheatricalDate,
    rerunTheatricalDate,
    rerunKobisMovieCd: null,
  };
}

/**
 * ✅ TMDB release_dates 기반 "재개봉 힌트" 판정
 */
function detectRerunFromTmdbReleaseDates(payload: unknown): boolean {
  if (!isRecord(payload)) return false;

  const results = asArray(payload['results']);
  const kr = results.find(
    (r) => isRecord(r) && asString(r['iso_3166_1']) === 'KR',
  );
  if (!isRecord(kr)) return false;

  const rds = asArray(kr['release_dates']);

  const hasRerunNote = rds.some((rd) => {
    if (!isRecord(rd)) return false;
    const note = asString(rd['note']).trim().toLowerCase();
    return note.includes('re-release') || note.includes('rerelease');
  });
  if (hasRerunNote) return true;

  const theatricalYmd = new Set<string>();
  for (const rd of rds) {
    if (!isRecord(rd)) continue;
    const type = Number(rd['type']);
    if (type !== 2 && type !== 3) continue;
    const ymd = toIsoYmd(asString(rd['release_date']));
    if (ymd) theatricalYmd.add(ymd);
  }
  return theatricalYmd.size >= 2;
}

function extractKrTheatricalDatesYmd(payload: unknown): string[] {
  if (!isRecord(payload)) return [];

  const results = asArray(payload['results']);
  const kr = results.find(
    (r) => isRecord(r) && asString(r['iso_3166_1']) === 'KR',
  );
  if (!isRecord(kr)) return [];

  const rds = asArray(kr['release_dates']);
  const out = new Set<string>();

  for (const rd of rds) {
    if (!isRecord(rd)) continue;
    const type = Number(rd['type']);
    if (type !== 2 && type !== 3) continue;
    const ymd = toIsoYmd(asString(rd['release_date']));
    if (ymd) out.add(ymd);
  }

  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private readonly tmdbBase = 'https://api.themoviedb.org/3';

  private nowPlayingCache: { expiresAt: number; ids: Set<number> } | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private tmdbKey(): string {
    const key = this.config.get<string>('TMDB_API_KEY');
    if (!key) throw new Error('TMDB_API_KEY is missing');
    return key;
  }

  private async getNowPlayingIdsKR(apiKey: string): Promise<Set<number>> {
    const now = Date.now();
    if (this.nowPlayingCache && this.nowPlayingCache.expiresAt > now) {
      return this.nowPlayingCache.ids;
    }

    const ids = new Set<number>();

    try {
      let totalPages = 1;

      for (let page = 1; page <= NOW_PLAYING_PAGES; page++) {
        const url = `${this.tmdbBase}/movie/now_playing`;
        const resp = await axios.get<unknown>(url, {
          params: { api_key: apiKey, region: 'KR', language: 'ko-KR', page },
          timeout: 10_000,
        });

        const data = resp.data;
        if (!isRecord(data)) continue;

        if (page === 1) {
          const tp = Number(data['total_pages']);
          if (Number.isFinite(tp) && tp > 0) totalPages = tp;
        }
        if (page > totalPages) break;

        const results = asArray(data['results']);
        for (const r of results) {
          if (!isRecord(r)) continue;
          const id = Number(r['id']);
          if (Number.isFinite(id)) ids.add(id);
        }

        if (results.length === 0) break;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[meta] fetch now_playing(KR) failed: ${msg}`);
    }

    this.nowPlayingCache = {
      ids,
      expiresAt: now + NOW_PLAYING_TTL_MS,
    };

    return ids;
  }

  async resolveBatch(reqs: ResolveRequest[]): Promise<ResolvedMeta[]> {
    if (reqs.length === 0) return [];

    const overrides = await this.prisma.contentMetaOverride.findMany({
      where: {
        OR: reqs.map((r) => ({
          mediaType: dbMediaType(r.mediaType),
          tmdbId: r.tmdbId,
        })),
      },
    });

    const overrideMap = new Map<string, (typeof overrides)[number]>();
    for (const o of overrides) overrideMap.set(`${o.mediaType}:${o.tmdbId}`, o);

    const now = new Date();
    const cached = await this.prisma.contentMetaResolved.findMany({
      where: {
        OR: reqs.map((r) => ({
          mediaType: dbMediaType(r.mediaType),
          tmdbId: r.tmdbId,
        })),
      },
    });

    // ✅ “반영 안됨” 방지: 필수 computed 필드가 하나라도 없으면 무조건 재계산
    const cachedMap = new Map<string, (typeof cached)[number]>();
    for (const c of cached) {
      const expiredByTime = c.expiresAt
        ? c.expiresAt.getTime() < now.getTime()
        : false;
      const expiredByVersion = (c.metaVersion ?? 0) < TARGET_META_VERSION;

      const sourcesUsed = isRecord(c.sourcesUsed)
        ? (c.sourcesUsed as Record<string, unknown>)
        : null;

      const schemaVer = pickComputedSchemaVersion(sourcesUsed);
      const expiredBySchema = schemaVer < COMPUTED_SCHEMA_VERSION;

      const requiredKeys: Array<{ k: string; type: 'string' | 'number' }> = [
        { k: 'contentCardPosterPath', type: 'string' },
        { k: 'heroPosterPath', type: 'string' },
        { k: 'heroSeasonYear', type: 'number' },
        { k: 'contentInfoReleaseYear', type: 'number' },
        { k: 'contentInfoReleaseYmd', type: 'string' },
        { k: 'contentInfoLatestReleaseYmd', type: 'string' },
      ];

      const missingRequired = requiredKeys.some(({ k, type }) => {
        const v =
          type === 'string'
            ? pickComputedString(sourcesUsed, k)
            : pickComputedNumber(sourcesUsed, k);
        return v === null;
      });

      const expired =
        expiredByTime || expiredByVersion || expiredBySchema || missingRequired;

      if (!expired) cachedMap.set(`${c.mediaType}:${c.tmdbId}`, c);
    }

    const need = reqs.filter(
      (r) => !cachedMap.has(`${dbMediaType(r.mediaType)}:${r.tmdbId}`),
    );

    if (need.length > 0) {
      const computed = await Promise.all(
        need.map((r) => this.computeAndUpsert(r)),
      );
      for (const c of computed) cachedMap.set(`${c.mediaType}:${c.tmdbId}`, c);
    }

    return reqs.map((r) => {
      const key = `${dbMediaType(r.mediaType)}:${r.tmdbId}`;
      const base = cachedMap.get(key);

      if (!base) {
        return {
          mediaType: r.mediaType,
          tmdbId: r.tmdbId,

          contentKind: 'MOVIE',
          releaseStatus: 'NONE',
          ageRating: 'UNKNOWN',
          releaseYear: null,
          watchProviders: null,

          statusKind: null,
          unifiedYearLabel: null,

          providers: [],
          theatrical: null,

          contentCardPosterPath: null,

          hidden: false,
          seasons: null,

          heroSeasonYear: null,
          heroPosterPath: null,
          contentInfoReleaseYear: null,
          contentInfoReleaseYmd: null,
          contentInfoLatestReleaseYmd: null,
          contentInfoRerunYmd: null,

          metaVersion: TARGET_META_VERSION,
          resolvedAt: isoNow(),
          expiresAt: null,
          sourcesUsed: null,
        };
      }

      const o = overrideMap.get(key);

      const mergedContentKind = o?.contentKind ?? base.contentKind;
      const mergedReleaseStatus = o?.releaseStatus ?? base.releaseStatus;
      const mergedAge = o?.ageRating ?? base.ageRating;

      const mergedReleaseYear = o?.releaseYear ?? base.releaseYear ?? null;
      const mergedWatchProviders = o?.watchProviders ?? base.watchProviders;

      const wpSafe = safeWatchProviders(mergedWatchProviders);
      const providersFlat = flattenProviders(wpSafe);

      const mergedStatusKindDb = (o?.statusKind ?? base.statusKind) as
        | DbStatusKind
        | null
        | undefined;

      const statusKind = apiStatusKindFromDb(
        mergedStatusKindDb ?? statusKindFromReleaseStatus(mergedReleaseStatus),
      );

      const mergedUnified =
        o?.unifiedYearLabel ??
        base.unifiedYearLabel ??
        (mergedReleaseYear ? String(mergedReleaseYear) : null);

      const sourcesUsed = isRecord(base.sourcesUsed)
        ? (base.sourcesUsed as Record<string, unknown>)
        : null;

      const contentCardPosterPath = pickComputedString(
        sourcesUsed,
        'contentCardPosterPath',
      );

      const hidden = pickComputedBoolean(sourcesUsed, 'hidden');
      const seasons = pickComputedSeasons(sourcesUsed);

      const heroSeasonYear = pickComputedNumber(sourcesUsed, 'heroSeasonYear');
      const heroPosterPath = pickComputedString(sourcesUsed, 'heroPosterPath');

      const contentInfoReleaseYear = pickComputedNumber(
        sourcesUsed,
        'contentInfoReleaseYear',
      );
      const contentInfoReleaseYmd = pickComputedString(
        sourcesUsed,
        'contentInfoReleaseYmd',
      );
      const contentInfoLatestReleaseYmd = pickComputedString(
        sourcesUsed,
        'contentInfoLatestReleaseYmd',
      );
      const contentInfoRerunYmd = pickComputedString(
        sourcesUsed,
        'contentInfoRerunYmd',
      );

      const computedTheatrical = pickComputedTheatrical(sourcesUsed);

      const oAny = o as unknown as {
        originalTheatricalDate?: string | null;
        rerunTheatricalDate?: string | null;
        hasMultipleTheatrical?: boolean | null;
      };

      const theatrical: TheatricalInfo | null = (() => {
        const originalTheatricalDate =
          oAny?.originalTheatricalDate ??
          computedTheatrical?.originalTheatricalDate ??
          null;
        const rerunTheatricalDate =
          oAny?.rerunTheatricalDate ??
          computedTheatrical?.rerunTheatricalDate ??
          null;
        const hasMultipleTheatrical = Boolean(
          oAny?.hasMultipleTheatrical ??
          computedTheatrical?.hasMultipleTheatrical ??
          false,
        );

        if (
          !originalTheatricalDate &&
          !rerunTheatricalDate &&
          !hasMultipleTheatrical
        )
          return null;

        return {
          hasMultipleTheatrical,
          originalTheatricalDate,
          rerunTheatricalDate,
          rerunKobisMovieCd: null,
        };
      })();

      return {
        mediaType: r.mediaType,
        tmdbId: r.tmdbId,

        contentKind: mergedContentKind,
        releaseStatus: mergedReleaseStatus,
        ageRating: apiAgeFromDb(mergedAge),
        releaseYear: mergedReleaseYear,
        watchProviders: wpSafe,

        statusKind,
        unifiedYearLabel: mergedUnified,

        providers: providersFlat,
        theatrical,

        contentCardPosterPath: contentCardPosterPath ?? null,

        hidden,
        seasons,

        heroSeasonYear,
        heroPosterPath,

        contentInfoReleaseYear,
        contentInfoReleaseYmd,
        contentInfoLatestReleaseYmd,
        contentInfoRerunYmd,

        metaVersion: base.metaVersion ?? TARGET_META_VERSION,
        resolvedAt: base.resolvedAt.toISOString(),
        expiresAt: base.expiresAt ? base.expiresAt.toISOString() : null,
        sourcesUsed,
      };
    });
  }

  async upsertOverride(args: {
    mediaType: MediaType;
    tmdbId: number;
    patch: {
      contentKind?: string;
      releaseStatus?: string;
      ageRating?: string;
      releaseYear?: number | null;
      watchProviders?: unknown;

      statusKind?: string;
      unifiedYearLabel?: string | null;
      originalTheatricalDate?: string | null;
      rerunTheatricalDate?: string | null;
      hasMultipleTheatrical?: boolean | null;

      [key: string]: unknown;
    };
    updatedBy?: string;
  }): Promise<void> {
    const dbMt = dbMediaType(args.mediaType);

    const contentKind = dbContentKindFromApi(args.patch.contentKind);
    const releaseStatus = dbReleaseStatusFromApi(args.patch.releaseStatus);
    const ageRating = dbAgeFromApi(args.patch.ageRating);
    const statusKind = dbStatusKindFromApi(args.patch.statusKind);

    const updateData: Prisma.ContentMetaOverrideUpdateInput = {
      updatedBy: args.updatedBy ?? undefined,
      updatedAt: new Date(),
    };

    if (contentKind !== null && args.patch.contentKind !== undefined)
      updateData.contentKind = contentKind;

    if (releaseStatus !== null && args.patch.releaseStatus !== undefined)
      updateData.releaseStatus = releaseStatus;

    if (ageRating !== null && args.patch.ageRating !== undefined)
      updateData.ageRating = ageRating;

    if (Object.prototype.hasOwnProperty.call(args.patch, 'releaseYear'))
      updateData.releaseYear = args.patch.releaseYear;

    if (Object.prototype.hasOwnProperty.call(args.patch, 'watchProviders')) {
      const wpPatch = args.patch.watchProviders;
      updateData.watchProviders =
        wpPatch === null ? Prisma.DbNull : (wpPatch as Prisma.InputJsonValue);
    }

    if (args.patch.statusKind !== undefined) updateData.statusKind = statusKind;

    if (Object.prototype.hasOwnProperty.call(args.patch, 'unifiedYearLabel'))
      updateData.unifiedYearLabel = args.patch.unifiedYearLabel;

    if (
      Object.prototype.hasOwnProperty.call(args.patch, 'originalTheatricalDate')
    )
      updateData.originalTheatricalDate = args.patch.originalTheatricalDate;

    if (Object.prototype.hasOwnProperty.call(args.patch, 'rerunTheatricalDate'))
      updateData.rerunTheatricalDate = args.patch.rerunTheatricalDate;

    if (
      Object.prototype.hasOwnProperty.call(args.patch, 'hasMultipleTheatrical')
    )
      updateData.hasMultipleTheatrical = args.patch.hasMultipleTheatrical;

    const createData: Prisma.ContentMetaOverrideCreateInput = {
      mediaType: dbMt,
      tmdbId: args.tmdbId,
      updatedBy: args.updatedBy ?? undefined,
      updatedAt: new Date(),
      createdAt: new Date(),
      contentKind: contentKind ?? undefined,
      releaseStatus: releaseStatus ?? undefined,
      ageRating: ageRating ?? undefined,
      releaseYear: Object.prototype.hasOwnProperty.call(
        args.patch,
        'releaseYear',
      )
        ? args.patch.releaseYear
        : undefined,
      statusKind: args.patch.statusKind !== undefined ? statusKind : undefined,
      unifiedYearLabel: Object.prototype.hasOwnProperty.call(
        args.patch,
        'unifiedYearLabel',
      )
        ? args.patch.unifiedYearLabel
        : undefined,
      originalTheatricalDate: Object.prototype.hasOwnProperty.call(
        args.patch,
        'originalTheatricalDate',
      )
        ? args.patch.originalTheatricalDate
        : undefined,
      rerunTheatricalDate: Object.prototype.hasOwnProperty.call(
        args.patch,
        'rerunTheatricalDate',
      )
        ? args.patch.rerunTheatricalDate
        : undefined,
      hasMultipleTheatrical: Object.prototype.hasOwnProperty.call(
        args.patch,
        'hasMultipleTheatrical',
      )
        ? (args.patch.hasMultipleTheatrical ?? undefined)
        : undefined,
      watchProviders: Object.prototype.hasOwnProperty.call(
        args.patch,
        'watchProviders',
      )
        ? args.patch.watchProviders === null
          ? Prisma.DbNull
          : (args.patch.watchProviders as Prisma.InputJsonValue)
        : undefined,
    };

    await this.prisma.contentMetaOverride.upsert({
      where: { mediaType_tmdbId: { mediaType: dbMt, tmdbId: args.tmdbId } },
      update: updateData,
      create: createData,
    });
  }

  private async computeAndUpsert(r: ResolveRequest) {
    const apiKey = this.tmdbKey();
    const dbMt = dbMediaType(r.mediaType);

    const detail = await this.fetchTmdbDetail(r.mediaType, r.tmdbId, apiKey);

    const providersRaw = await fetchWatchProvidersKR({
      tmdbBase: this.tmdbBase,
      mediaType: r.mediaType,
      tmdbId: r.tmdbId,
      apiKey,
    });

    const wpSafe = safeWatchProviders(providersRaw);
    const providersFlat = flattenProviders(wpSafe);
    const hasOttProviders = providersFlat.length > 0;

    const age = await this.fetchAgeRating(r.mediaType, r.tmdbId, apiKey);

    const contentKind: DbContentKind = hasAnimationGenre(detail['genres'])
      ? 'ANI'
      : r.mediaType === 'movie'
        ? 'MOVIE'
        : 'TV';

    // ✅ 컨텐츠카드 이미지: 영화=pickMoviePosterPath, TV/ANI=최신 시즌 포스터
    const contentCardPosterPath =
      r.mediaType === 'movie'
        ? pickMoviePosterPath(detail)
        : pickLatestSeasonPosterPath(detail);

    // ✅ 시즌 메타(시리즈/시즌 카드에서 그대로 사용)
    const seasons: SeasonMeta[] | null =
      r.mediaType === 'tv' || contentKind === 'ANI'
        ? buildTvSeasonMeta(detail)
        : null;

    // ✅ TV/Ani 히어로 첫 진입: 최신 시즌 기준
    const heroPosterPath =
      r.mediaType === 'movie'
        ? null
        : (seasons?.[0]?.posterPath ?? contentCardPosterPath ?? null);

    const heroSeasonYear =
      r.mediaType === 'movie'
        ? null
        : ((seasons?.[0]?.airDate
            ? yearFromIsoDate(seasons[0].airDate)
            : null) ??
          yearFromIsoDate(asString(detail['last_air_date'])) ??
          yearFromIsoDate(asString(detail['first_air_date'])) ??
          null);

    // ✅ 상세 컨텐츠정보(처음 개봉/방영)
    let contentInfoReleaseYmd: string | null = null;
    let contentInfoReleaseYear: number | null = null;
    let contentInfoLatestReleaseYmd: string | null = null;
    let contentInfoRerunYmd: string | null = null;

    // ✅ 영화 상태 계산
    let rerunHint = false;
    let inNowPlaying = false;
    let statusKindDb: DbStatusKind | null = null;
    let krReleaseDatesYmd: string[] = [];

    let statusComputed: {
      releaseStatus: DbReleaseStatus;
      statusKind: DbStatusKind | null;
      releaseYearForCardHero: number | null; // ✅ 컨텐츠카드/상세히어로 출시년도
      theatricalOriginal: string | null;
      theatricalRerun: string | null;
      hasMultipleTheatrical: boolean;
      hidden: boolean;
    };

    if (r.mediaType === 'movie') {
      const tmdbReleaseYmd = toIsoYmd(asString(detail['release_date']));
      const nowPlayingIds = await this.getNowPlayingIdsKR(apiKey);
      inNowPlaying = nowPlayingIds.has(r.tmdbId);

      const releaseDatesPayload = await this.fetchMovieReleaseDatesPayload(
        r.tmdbId,
        apiKey,
      );

      rerunHint = detectRerunFromTmdbReleaseDates(releaseDatesPayload);
      krReleaseDatesYmd = extractKrTheatricalDatesYmd(releaseDatesPayload);

      if (inNowPlaying) {
        statusKindDb = dbStatusKindFromApi(rerunHint ? 'rerun' : 'now');
      }

      const computed = computeMovieStatus({
        statusKindFromReleaseStatus,
        detail,
        tmdbReleaseYmd,
        krReleaseDatesYmd,
        hasOttProviders,
        isNowPlaying: inNowPlaying,
      });

      // ✅ 라우팅 규칙 강제(불변)
      let enforcedReleaseStatus = computed.releaseStatus;
      let enforcedStatusKind = computed.statusKind;

      if (computed.releaseStatus === 'UPCOMING') {
        enforcedReleaseStatus = 'UPCOMING';
        enforcedStatusKind = statusKindFromReleaseStatus('UPCOMING');
      } else if (inNowPlaying) {
        enforcedReleaseStatus = rerunHint ? 'RE_RELEASE' : 'NOW_SHOWING';
        enforcedStatusKind = statusKindDb; // now|rerun
      } else {
        if (
          enforcedReleaseStatus === 'RE_RELEASE' ||
          enforcedReleaseStatus === 'NOW_SHOWING'
        ) {
          enforcedReleaseStatus = 'NONE';
        }
        enforcedStatusKind = null;
      }

      const nowMs = Date.now();
      const earliestKr = krReleaseDatesYmd.length ? krReleaseDatesYmd[0] : null;
      const latestKr = krReleaseDatesYmd.length
        ? krReleaseDatesYmd[krReleaseDatesYmd.length - 1]
        : null;

      const earliestFutureKr = (() => {
        for (const d of krReleaseDatesYmd) {
          const t = new Date(d).getTime();
          if (Number.isFinite(t) && t > nowMs) return d;
        }
        return null;
      })();

      const latestPastOrTodayKr = (() => {
        let out: string | null = null;
        for (const d of krReleaseDatesYmd) {
          const t = new Date(d).getTime();
          if (!Number.isFinite(t)) continue;
          if (t <= nowMs) out = d;
        }
        return out;
      })();

      // ✅ 컨텐츠카드/히어로 출시년도(=releaseYear):
      // - UPCOMING: KR 기준 가장 빨리 개봉할 년도
      // - NOW_SHOWING: KR 기준 현재 상영중인 년도(=최근 past/today)
      // - RE_RELEASE: KR 기준 가장 최근 재개봉 년도(=latest)
      // - NONE: KR 기준 최초 개봉년도(없으면 TMDB)
      const releaseYearForCardHero =
        enforcedReleaseStatus === 'UPCOMING'
          ? (yearFromIsoDate(
              earliestFutureKr ?? earliestKr ?? tmdbReleaseYmd ?? '',
            ) ?? null)
          : enforcedReleaseStatus === 'NOW_SHOWING'
            ? (yearFromIsoDate(
                latestPastOrTodayKr ?? latestKr ?? tmdbReleaseYmd ?? '',
              ) ?? null)
            : enforcedReleaseStatus === 'RE_RELEASE'
              ? (yearFromIsoDate(latestKr ?? tmdbReleaseYmd ?? '') ?? null)
              : (yearFromIsoDate(earliestKr ?? tmdbReleaseYmd ?? '') ?? null);

      // ✅ 상세 컨텐츠정보 “출시년도(처음 개봉)”은 상태와 무관하게 “처음”
      contentInfoReleaseYmd = earliestKr ?? tmdbReleaseYmd ?? null;
      contentInfoReleaseYear =
        yearFromIsoDate(contentInfoReleaseYmd ?? '') ?? null;

      // ✅ 상세 컨텐츠정보 “개봉일(상영예정/상영중)” = KR 기준 가장 최근 개봉일
      // - UPCOMING은 “가장 빨리 다가오는 개봉일”을 최신 개봉일로 취급(현실적으로 이게 화면 의도)
      contentInfoLatestReleaseYmd =
        enforcedReleaseStatus === 'UPCOMING'
          ? (earliestFutureKr ?? earliestKr ?? tmdbReleaseYmd ?? null)
          : (latestPastOrTodayKr ?? latestKr ?? tmdbReleaseYmd ?? null);

      // ✅ 상세 컨텐츠정보 “재개봉일” = 재개봉 상태일 때만 KR 최신
      contentInfoRerunYmd =
        enforcedReleaseStatus === 'RE_RELEASE'
          ? (latestKr ?? tmdbReleaseYmd ?? null)
          : null;

      // ✅ theatrical(상세 표시용)
      const theatricalOriginal =
        enforcedReleaseStatus === 'RE_RELEASE'
          ? (earliestKr ?? tmdbReleaseYmd ?? null)
          : contentInfoLatestReleaseYmd;

      const theatricalRerun =
        enforcedReleaseStatus === 'RE_RELEASE'
          ? (latestKr ?? tmdbReleaseYmd ?? null)
          : null;

      statusComputed = {
        releaseStatus: enforcedReleaseStatus,
        statusKind: enforcedStatusKind,
        releaseYearForCardHero,
        theatricalOriginal,
        theatricalRerun,
        hasMultipleTheatrical: computed.hasMultipleTheatrical,
        hidden: computed.hidden,
      };
    } else {
      // ✅ TV/Ani:
      // - 컨텐츠카드/히어로 출시년도: KR 기준 가장 최근 방영년도(최신 시즌 airDate 연도)
      const latestSeasonYear =
        (seasons?.[0]?.airDate ? yearFromIsoDate(seasons[0].airDate) : null) ??
        yearFromIsoDate(asString(detail['last_air_date'])) ??
        yearFromIsoDate(asString(detail['first_air_date'])) ??
        null;

      // ✅ 컨텐츠정보 “처음 방영”
      const firstAirYmd = toIsoYmd(asString(detail['first_air_date']));
      const oldestSeasonAir = seasons?.length
        ? (seasons[seasons.length - 1]?.airDate ?? null)
        : null;

      contentInfoReleaseYmd = firstAirYmd ?? oldestSeasonAir ?? null;
      contentInfoReleaseYear =
        yearFromIsoDate(contentInfoReleaseYmd ?? '') ?? null;

      // TV는 “가장 최근 방영일”을 최신으로
      const latestAirYmd =
        seasons?.[0]?.airDate ??
        toIsoYmd(asString(detail['last_air_date'])) ??
        contentInfoReleaseYmd ??
        null;

      contentInfoLatestReleaseYmd = latestAirYmd;
      contentInfoRerunYmd = null;

      statusComputed = {
        releaseStatus: 'NONE' as DbReleaseStatus,
        statusKind: null as DbStatusKind | null,
        releaseYearForCardHero: latestSeasonYear,
        theatricalOriginal: null,
        theatricalRerun: null,
        hasMultipleTheatrical: false,
        hidden: false,
      };
    }

    const finalReleaseYear = statusComputed.releaseYearForCardHero ?? null;
    const finalUnifiedLabel = finalReleaseYear
      ? String(finalReleaseYear)
      : null;

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const providersJson: NullableJson = toNullableJson(wpSafe);

    const sourcesUsedJson: Prisma.InputJsonValue = toPrismaJson({
      tmdb: true,
      nowPlaying:
        r.mediaType === 'movie' ? { region: 'KR', inNowPlaying } : null,
      rerunHint: r.mediaType === 'movie' ? rerunHint : null,
      computed: {
        schemaVersion: COMPUTED_SCHEMA_VERSION,

        // 카드/내찜/상세 공통 표시
        contentCardPosterPath,
        hidden: statusComputed.hidden,

        seasons,

        // ✅ 히어로 첫 진입(TV/Ani)
        heroSeasonYear,
        heroPosterPath,

        // ✅ 컨텐츠정보(처음/최근/재개봉)
        contentInfoReleaseYear,
        contentInfoReleaseYmd,
        contentInfoLatestReleaseYmd,
        contentInfoRerunYmd,

        // ✅ theatrical (KOBIS 미사용)
        theatrical:
          r.mediaType === 'movie'
            ? {
                hasMultipleTheatrical: statusComputed.hasMultipleTheatrical,
                originalTheatricalDate: statusComputed.theatricalOriginal,
                rerunTheatricalDate: statusComputed.theatricalRerun,
                rerunKobisMovieCd: null,
              }
            : null,
      },
    });

    return this.prisma.contentMetaResolved.upsert({
      where: { mediaType_tmdbId: { mediaType: dbMt, tmdbId: r.tmdbId } },
      update: {
        contentKind,
        releaseStatus: statusComputed.releaseStatus,

        statusKind: statusComputed.statusKind,
        unifiedYearLabel: finalUnifiedLabel,

        ageRating: age,
        releaseYear: finalReleaseYear,

        watchProviders: providersJson,
        sourcesUsed: sourcesUsedJson,
        metaVersion: TARGET_META_VERSION,
        resolvedAt: new Date(),
        expiresAt,
      },
      create: {
        mediaType: dbMt,
        tmdbId: r.tmdbId,
        contentKind,
        releaseStatus: statusComputed.releaseStatus,

        statusKind: statusComputed.statusKind,
        unifiedYearLabel: finalUnifiedLabel,

        ageRating: age,
        releaseYear: finalReleaseYear,

        watchProviders: providersJson,
        sourcesUsed: sourcesUsedJson,
        metaVersion: TARGET_META_VERSION,
        resolvedAt: new Date(),
        expiresAt,
      },
    });
  }

  private async fetchTmdbDetail(
    mediaType: MediaType,
    tmdbId: number,
    apiKey: string,
  ): Promise<Record<string, unknown>> {
    const url = `${this.tmdbBase}/${mediaType}/${tmdbId}`;
    const resp = await axios.get<unknown>(url, {
      params: { api_key: apiKey, language: 'ko-KR' },
      timeout: 10_000,
    });
    return isRecord(resp.data) ? resp.data : {};
  }

  private async fetchMovieReleaseDatesPayload(
    tmdbId: number,
    apiKey: string,
  ): Promise<unknown> {
    try {
      const url = `${this.tmdbBase}/movie/${tmdbId}/release_dates`;
      const resp = await axios.get<unknown>(url, {
        params: { api_key: apiKey },
        timeout: 10_000,
      });
      return resp.data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[meta] fetchMovieReleaseDatesPayload failed: ${msg}`);
      return null;
    }
  }

  private parseAgeToDb(v: string): DbAgeRating {
    const s = v.trim().toUpperCase();

    const m = s.match(/(\d{1,2})/);
    if (m) {
      const n = Number(m[1]);
      if (n <= 0) return 'ALL';
      if (n <= 12) return 'R12';
      if (n <= 16) return 'R15';
      return 'R19';
    }

    if (s.includes('ALL') || s.includes('G') || s.includes('전체'))
      return 'ALL';
    if (s.includes('PG-13') || s.includes('TV-14')) return 'R15';
    if (s.includes('R') || s.includes('19')) return 'R19';

    return 'UNKNOWN';
  }

  private async fetchAgeRating(
    mediaType: MediaType,
    tmdbId: number,
    apiKey: string,
  ): Promise<DbAgeRating> {
    try {
      if (mediaType === 'movie') {
        const url = `${this.tmdbBase}/movie/${tmdbId}/release_dates`;
        const resp = await axios.get<unknown>(url, {
          params: { api_key: apiKey },
          timeout: 10_000,
        });

        const data = resp.data;
        if (!isRecord(data)) return 'UNKNOWN';

        const results = asArray(data['results']);
        const kr = results.find(
          (r) => isRecord(r) && asString(r['iso_3166_1']) === 'KR',
        );

        const pickFrom = (x: unknown): string => {
          if (!isRecord(x)) return '';
          const rds = asArray(x['release_dates']);
          for (const rd of rds) {
            if (!isRecord(rd)) continue;
            const cert = asString(rd['certification']);
            if (cert) return cert;
          }
          return '';
        };

        const cert = pickFrom(kr) || pickFrom(results[0]);
        return cert ? this.parseAgeToDb(cert) : 'UNKNOWN';
      }

      const url = `${this.tmdbBase}/tv/${tmdbId}/content_ratings`;
      const resp = await axios.get<unknown>(url, {
        params: { api_key: apiKey },
        timeout: 10_000,
      });

      const data = resp.data;
      if (!isRecord(data)) return 'UNKNOWN';

      const results = asArray(data['results']);
      const kr = results.find(
        (r) => isRecord(r) && asString(r['iso_3166_1']) === 'KR',
      );
      const rating = kr && isRecord(kr) ? asString(kr['rating']) : '';

      const fallback =
        results[0] && isRecord(results[0])
          ? asString(results[0]['rating'])
          : '';
      const final = rating || fallback;

      return final ? this.parseAgeToDb(final) : 'UNKNOWN';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[meta] fetchAgeRating failed: ${msg}`);
      return 'UNKNOWN';
    }
  }
}
