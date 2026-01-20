// backend/src/meta/meta.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { PrismaService } from '../prisma/prisma.service';
import { KobisService } from '../kobis/kobis.service';

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

import { computeMovieStatus } from './meta.movieStatus';

import { buildTvSeasonMeta } from './meta.seasons';

/**
 * ✅ 계산 로직/필드가 바뀌면 올려서 캐시 강제 재계산
 */
const TARGET_META_VERSION = 8;

type NullableJson = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

function toPrismaJson(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

function pickComputedContentCardPosterPath(
  sourcesUsed: Record<string, unknown> | null,
): string | null {
  if (!sourcesUsed) return null;
  const computed = sourcesUsed['computed'];
  if (!isRecord(computed)) return null;

  const v = computed['contentCardPosterPath'];
  if (typeof v === 'string') return v;
  if (v === null) return null;
  return null;
}

function toBoolEnv(v: unknown, defaultValue: boolean) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;

  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  }

  return defaultValue;
}

function toIntEnv(v: unknown, defaultValue: number) {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;

  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

function withTimeout<T>(ms: number, p: Promise<T>): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;

  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`timeout(${ms}ms)`));
    }, ms);

    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * ✅ (요구사항) TV 상세 첫 진입 시:
 * - 최신 시즌 뱃지/포스터 기준과 "연도"가 동일하게 맞도록
 * - "가장 큰 season_number"의 air_date 연도를 우선 사용
 * - air_date가 없으면 last_air_date, 그것도 없으면 first_air_date
 */
function pickLatestSeasonYear(detail: Record<string, unknown>): number | null {
  const seasons = buildTvSeasonMeta(detail);

  let maxSeasonNo = -1;
  for (const s of seasons) {
    if (typeof s.seasonNumber === 'number' && s.seasonNumber > maxSeasonNo) {
      maxSeasonNo = s.seasonNumber;
    }
  }

  const latestByNo =
    maxSeasonNo >= 0
      ? seasons.find((s) => s.seasonNumber === maxSeasonNo)
      : null;

  const yFromSeason = latestByNo?.airDate
    ? yearFromIsoDate(latestByNo.airDate)
    : null;
  if (yFromSeason) return yFromSeason;

  const yFromLast = yearFromIsoDate(asString(detail['last_air_date']));
  if (yFromLast) return yFromLast;

  const yFromFirst = yearFromIsoDate(asString(detail['first_air_date']));
  return yFromFirst ?? null;
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private readonly tmdbBase = 'https://api.themoviedb.org/3';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly kobis: KobisService,
  ) {}

  private tmdbKey(): string {
    const key = this.config.get<string>('TMDB_API_KEY');
    if (!key) throw new Error('TMDB_API_KEY is missing');
    return key;
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

    const cachedMap = new Map<string, (typeof cached)[number]>();
    for (const c of cached) {
      const expiredByTime = c.expiresAt
        ? c.expiresAt.getTime() < now.getTime()
        : false;
      const expiredByVersion = (c.metaVersion ?? 0) < TARGET_META_VERSION;

      const sourcesUsed = isRecord(c.sourcesUsed)
        ? (c.sourcesUsed as Record<string, unknown>)
        : null;

      // ✅ 포스터 계산값이 없으면 “구캐시”로 보고 재계산
      const computedPoster = pickComputedContentCardPosterPath(sourcesUsed);
      const missingComputedPoster = computedPoster === null;

      const expired =
        expiredByTime || expiredByVersion || missingComputedPoster;
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

      const originalTheatricalDate =
        o?.originalTheatricalDate ?? base.originalTheatricalDate ?? null;

      const rerunTheatricalDate =
        o?.rerunTheatricalDate ?? base.rerunTheatricalDate ?? null;

      const kobisMovieCd = o?.kobisMovieCd ?? base.kobisMovieCd ?? null;
      const rerunKobisMovieCd =
        o?.rerunKobisMovieCd ?? base.rerunKobisMovieCd ?? null;

      const hasMultiple =
        o?.hasMultipleTheatrical ?? base.hasMultipleTheatrical ?? false;

      const theatrical: TheatricalInfo | null =
        originalTheatricalDate ||
        rerunTheatricalDate ||
        kobisMovieCd ||
        rerunKobisMovieCd
          ? {
              hasMultipleTheatrical: Boolean(hasMultiple),
              originalTheatricalDate,
              rerunTheatricalDate,
              kobisMovieCd,
              rerunKobisMovieCd,
            }
          : null;

      const sourcesUsed = isRecord(base.sourcesUsed)
        ? (base.sourcesUsed as Record<string, unknown>)
        : null;

      const contentCardPosterPath =
        pickComputedContentCardPosterPath(sourcesUsed) ?? null;

      const providersFlat = flattenProviders(wpSafe);
      const hasOttProviders = providersFlat.length > 0;

      // ✅ 상영중이라도 OTT 가능하면 상영중 배지 제거(OTT 섹션을 보여주기 위함)
      let effectiveStatusKind = statusKind;
      if (
        r.mediaType === 'movie' &&
        effectiveStatusKind === 'now' &&
        hasOttProviders
      ) {
        effectiveStatusKind = null;
      }

      return {
        mediaType: r.mediaType,
        tmdbId: r.tmdbId,
        contentKind: mergedContentKind,
        releaseStatus: mergedReleaseStatus,
        ageRating: apiAgeFromDb(mergedAge),
        releaseYear: mergedReleaseYear,
        watchProviders: wpSafe,

        statusKind: effectiveStatusKind,
        unifiedYearLabel: mergedUnified,
        providers: providersFlat,
        theatrical,

        contentCardPosterPath,

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
      kobisMovieCd?: string | null;
      rerunKobisMovieCd?: string | null;
      hasMultipleTheatrical?: boolean | null;
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

    if (Object.prototype.hasOwnProperty.call(args.patch, 'kobisMovieCd'))
      updateData.kobisMovieCd = args.patch.kobisMovieCd;

    if (Object.prototype.hasOwnProperty.call(args.patch, 'rerunKobisMovieCd'))
      updateData.rerunKobisMovieCd = args.patch.rerunKobisMovieCd;

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
      kobisMovieCd: Object.prototype.hasOwnProperty.call(
        args.patch,
        'kobisMovieCd',
      )
        ? args.patch.kobisMovieCd
        : undefined,
      rerunKobisMovieCd: Object.prototype.hasOwnProperty.call(
        args.patch,
        'rerunKobisMovieCd',
      )
        ? args.patch.rerunKobisMovieCd
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

    const computedPosterPath =
      r.mediaType === 'movie'
        ? pickMoviePosterPath(detail)
        : pickLatestSeasonPosterPath(detail);

    const tmdbReleaseYmd =
      r.mediaType === 'movie'
        ? toIsoYmd(asString(detail['release_date']))
        : toIsoYmd(asString(detail['first_air_date']));

    const tmdbFirstYear =
      r.mediaType === 'movie'
        ? yearFromIsoDate(asString(detail['release_date']))
        : yearFromIsoDate(asString(detail['first_air_date']));

    const lastAirYear =
      r.mediaType === 'tv'
        ? yearFromIsoDate(asString(detail['last_air_date']))
        : null;

    // ✅ (요구사항) 최신 시즌 뱃지/포스터와 동일 기준으로 "최신 시즌 연도"를 releaseYear로 우선 사용
    const latestSeasonYear =
      r.mediaType === 'tv' ? pickLatestSeasonYear(detail) : null;

    const contentKind: DbContentKind = hasAnimationGenre(detail['genres'])
      ? 'ANI'
      : r.mediaType === 'movie'
        ? 'MOVIE'
        : 'TV';

    // ✅ KOBIS 영화검색은 “빠르게 실패” + “메타 계산을 막지 않게” 처리
    const kobisEnabled = toBoolEnv(process.env.KOBIS_THEATRICAL_ENABLED, true);
    const kobisTimeoutMs = toIntEnv(
      process.env.KOBIS_THEATRICAL_TIMEOUT_MS,
      1200,
    );

    const theatricalInfo =
      r.mediaType === 'movie' && kobisEnabled
        ? await withTimeout(
            kobisTimeoutMs,
            this.kobis.findTheatricalInfoByTmdbDetail({
              title: detail['title'],
              original_title: detail['original_title'],
              name: detail['name'],
              original_name: detail['original_name'],
              release_date: detail['release_date'],
            }),
          ).catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(
              `[meta] kobis theatrical skipped (tmdbId=${r.tmdbId}): ${msg}`,
            );
            return null;
          })
        : null;

    const krReleaseDatesYmd =
      r.mediaType === 'movie'
        ? await this.fetchMovieKrReleaseDatesYmd(r.tmdbId, apiKey)
        : [];

    const statusComputed =
      r.mediaType === 'movie'
        ? await computeMovieStatus({
            kobis: this.kobis,
            statusKindFromReleaseStatus,
            detail,
            tmdbReleaseYmd,
            theatricalInfo,
            krReleaseDatesYmd,
            hasOttProviders,
          })
        : {
            releaseStatus: 'NONE' as DbReleaseStatus,
            statusKind: null as DbStatusKind | null,
            computedReleaseYear: lastAirYear ?? tmdbFirstYear ?? null,
            originalTheatricalDate: null as string | null,
            rerunTheatricalDate: null as string | null,
            kobisMovieCd: null as string | null,
            rerunKobisMovieCd: null as string | null,
            hasMultipleTheatrical: false,
          };

    const finalReleaseYear =
      // ✅ TV는 최신 시즌 연도 우선
      (r.mediaType === 'tv' ? latestSeasonYear : null) ??
      statusComputed.computedReleaseYear ??
      (r.mediaType === 'tv' ? lastAirYear : null) ??
      tmdbFirstYear ??
      null;

    const finalUnifiedLabel = finalReleaseYear
      ? String(finalReleaseYear)
      : null;

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    const providersJson: NullableJson = toNullableJson(wpSafe);

    const sourcesUsedJson: Prisma.InputJsonValue = toPrismaJson({
      tmdb: true,
      kobis: r.mediaType === 'movie' && kobisEnabled,
      theatrical: theatricalInfo
        ? {
            kobisMovieCd: theatricalInfo.kobisMovieCd,
            kobisOpenDt: theatricalInfo.kobisOpenDt,
            rerunKobisMovieCd: theatricalInfo.rerunKobisMovieCd,
            rerunOpenDt: theatricalInfo.rerunOpenDt,
            hasMultipleTheatrical: theatricalInfo.hasMultipleTheatrical,
          }
        : null,
      computed: {
        contentCardPosterPath: computedPosterPath,
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

        originalTheatricalDate: statusComputed.originalTheatricalDate,
        rerunTheatricalDate: statusComputed.rerunTheatricalDate,
        kobisMovieCd: statusComputed.kobisMovieCd,
        rerunKobisMovieCd: statusComputed.rerunKobisMovieCd,
        hasMultipleTheatrical: statusComputed.hasMultipleTheatrical,

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

        originalTheatricalDate: statusComputed.originalTheatricalDate,
        rerunTheatricalDate: statusComputed.rerunTheatricalDate,
        kobisMovieCd: statusComputed.kobisMovieCd,
        rerunKobisMovieCd: statusComputed.rerunKobisMovieCd,
        hasMultipleTheatrical: statusComputed.hasMultipleTheatrical,

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

  private async fetchMovieKrReleaseDatesYmd(
    tmdbId: number,
    apiKey: string,
  ): Promise<string[]> {
    try {
      const url = `${this.tmdbBase}/movie/${tmdbId}/release_dates`;
      const resp = await axios.get<unknown>(url, {
        params: { api_key: apiKey },
        timeout: 10_000,
      });

      const data = resp.data;
      if (!isRecord(data)) return [];

      const results = asArray(data['results']);
      const kr = results.find(
        (r) => isRecord(r) && asString(r['iso_3166_1']) === 'KR',
      );
      if (!isRecord(kr)) return [];

      const rds = asArray(kr['release_dates']);
      const ymds = new Set<string>();

      for (const rd of rds) {
        if (!isRecord(rd)) continue;
        const raw = asString(rd['release_date']);
        const ymd = toIsoYmd(raw);
        if (ymd) ymds.add(ymd);
      }

      return Array.from(ymds).sort();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[meta] fetchMovieKrReleaseDatesYmd failed: ${msg}`);
      return [];
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
