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

/**
 * ✅ 계산 로직/필드가 바뀌면 올려서 캐시 강제 재계산
 * - KOBIS 제거 + now_playing 기반 판정으로 변경 => 버전 업
 */
const TARGET_META_VERSION = 9;

const NOW_PLAYING_TTL_MS = 10 * 60 * 1000; // 10분
const NOW_PLAYING_PAGES = 3; // 1~3 페이지(필요하면 늘리기)

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

/**
 * ✅ TMDB release_dates 기반 "재개봉 힌트" 판정
 * - KR의 note에 'Re-release'/'Rerelease'가 있으면 true
 * - 또는 KR theatrical(type=3) 날짜가 2개 이상이면 true
 */
function detectRerunFromTmdbReleaseDates(payload: unknown): boolean {
  if (!isRecord(payload)) return false;

  const results = asArray(payload['results']);
  const kr = results.find(
    (r) => isRecord(r) && asString(r['iso_3166_1']) === 'KR',
  );
  if (!isRecord(kr)) return false;

  const rds = asArray(kr['release_dates']);

  // 1) note
  const hasRerunNote = rds.some((rd) => {
    if (!isRecord(rd)) return false;
    const note = asString(rd['note']).trim().toLowerCase();
    return note.includes('re-release') || note.includes('rerelease');
  });
  if (hasRerunNote) return true;

  // 2) theatrical(type=3) count
  const theatricalYmd = new Set<string>();
  for (const rd of rds) {
    if (!isRecord(rd)) continue;
    const type = Number(rd['type']);
    if (type !== 3) continue;
    const ymd = toIsoYmd(asString(rd['release_date']));
    if (ymd) theatricalYmd.add(ymd);
  }

  return theatricalYmd.size >= 2;
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private readonly tmdbBase = 'https://api.themoviedb.org/3';

  // ✅ now_playing 캐시
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
      for (let page = 1; page <= NOW_PLAYING_PAGES; page++) {
        const url = `${this.tmdbBase}/movie/now_playing`;
        const resp = await axios.get<unknown>(url, {
          params: { api_key: apiKey, region: 'KR', language: 'ko-KR', page },
          timeout: 10_000,
        });

        const data = resp.data;
        if (!isRecord(data)) continue;

        const results = asArray(data['results']);
        for (const r of results) {
          if (!isRecord(r)) continue;
          const id = Number(r['id']);
          if (Number.isFinite(id)) ids.add(id);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[meta] fetch now_playing(KR) failed: ${msg}`);
      // 실패 시에도 TTL 짧게 캐시해서 폭주 방지
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

      // ✅ KOBIS 제거 정책이지만, 과거 캐시에 값이 남아있을 수도 있어 null 처리
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

      // ✅ (변경) "OTT 있으면 now 뱃지 제거" 로직 제거
      // 요구사항: now_playing에 있는 것만 개봉/재개봉이 보이게 => now_playing이면 그대로 노출

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

    const age = await this.fetchAgeRating(r.mediaType, r.tmdbId, apiKey);

    const computedPosterPath =
      r.mediaType === 'movie'
        ? pickMoviePosterPath(detail)
        : pickLatestSeasonPosterPath(detail);

    const tmdbFirstYear =
      r.mediaType === 'movie'
        ? yearFromIsoDate(asString(detail['release_date']))
        : yearFromIsoDate(asString(detail['first_air_date']));

    const lastAirYear =
      r.mediaType === 'tv'
        ? yearFromIsoDate(asString(detail['last_air_date']))
        : null;

    // ✅ TV 최신 시즌 연도 우선
    const latestSeasonYear =
      r.mediaType === 'tv' ? pickLatestSeasonYear(detail) : null;

    const contentKind: DbContentKind = hasAnimationGenre(detail['genres'])
      ? 'ANI'
      : r.mediaType === 'movie'
        ? 'MOVIE'
        : 'TV';

    // ✅ 영화만 now_playing 기반 statusKind 판정
    // - now_playing(KR)에 있으면 NOW 또는 RERUN
    // - 없으면 null
    let statusKindDb: DbStatusKind | null = null;
    let rerunHint = false;
    let inNowPlaying = false;

    if (r.mediaType === 'movie') {
      const nowPlayingIds = await this.getNowPlayingIdsKR(apiKey);
      inNowPlaying = nowPlayingIds.has(r.tmdbId);

      // rerun 힌트는 release_dates에서만(TMDB 기반)
      const releaseDatesPayload = await this.fetchMovieReleaseDatesPayload(
        r.tmdbId,
        apiKey,
      );
      rerunHint = detectRerunFromTmdbReleaseDates(releaseDatesPayload);

      if (inNowPlaying) {
        // DbStatusKind 실제 enum 문자열은 프로젝트에 맞춰야 함.
        // 보통 'NOW' | 'RERUN' | 'UPCOMING' 형태.
        statusKindDb = dbStatusKindFromApi(rerunHint ? 'rerun' : 'now');
      }
    }

    const statusComputed =
      r.mediaType === 'movie'
        ? {
            releaseStatus: 'NONE' as DbReleaseStatus,
            statusKind: statusKindDb,
            computedReleaseYear: tmdbFirstYear ?? null,

            // ✅ KOBIS 제거: 극장/재개봉 상세 정보는 메타에서 전부 비움
            originalTheatricalDate: null as string | null,
            rerunTheatricalDate: null as string | null,
            kobisMovieCd: null as string | null,
            rerunKobisMovieCd: null as string | null,
            hasMultipleTheatrical: false,
          }
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
      nowPlaying:
        r.mediaType === 'movie' ? { region: 'KR', inNowPlaying } : null,
      rerunHint: r.mediaType === 'movie' ? rerunHint : null,
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

        originalTheatricalDate: null,
        rerunTheatricalDate: null,
        kobisMovieCd: null,
        rerunKobisMovieCd: null,
        hasMultipleTheatrical: false,

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

        originalTheatricalDate: null,
        rerunTheatricalDate: null,
        kobisMovieCd: null,
        rerunKobisMovieCd: null,
        hasMultipleTheatrical: false,

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
