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
const TARGET_META_VERSION = 13;

const NOW_PLAYING_TTL_MS = 10 * 60 * 1000; // 10분
// ✅ now_playing(KR) 페이지를 적게 가져오면 "상영중인데 상영중으로 안 잡힘" 발생 가능
//    (TMDB now_playing에 있지만 4페이지 이후면 누락)
//    TTL 캐시가 있으니 넉넉히 가져와도 부담 적음
const NOW_PLAYING_PAGES = 20; // 1~N 페이지

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

function pickComputedHidden(
  sourcesUsed: Record<string, unknown> | null,
): boolean {
  if (!sourcesUsed) return false;
  const computed = sourcesUsed['computed'];
  if (!isRecord(computed)) return false;
  return Boolean(computed['hidden']);
}

function pickComputedSeasons(
  sourcesUsed: Record<string, unknown> | null,
): SeasonMeta[] | null {
  if (!sourcesUsed) return null;
  const computed = sourcesUsed['computed'];
  if (!isRecord(computed)) return null;

  const seasons = computed['seasons'];
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
  if (!sourcesUsed) return null;
  const computed = sourcesUsed['computed'];
  if (!isRecord(computed)) return null;

  const t = computed['theatrical'];
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

  // ✅ 메타데이터에서 KOBIS 값 절대 적용 금지: 항상 null
  const rerunKobisMovieCd: string | null = null;

  if (!hasMultipleTheatrical && !originalTheatricalDate && !rerunTheatricalDate)
    return null;

  return {
    hasMultipleTheatrical,
    originalTheatricalDate,
    rerunTheatricalDate,
    rerunKobisMovieCd,
  };
}

/**
 * ✅ (요구사항) TV/Ani: "KR 기준 가장 최근 방영년도"
 * - buildTvSeasonMeta가 airDate desc 정렬이므로 첫 항목의 airDate 연도 우선
 * - 없으면 last_air_date, 그것도 없으면 first_air_date
 */
function pickLatestSeasonYear(detail: Record<string, unknown>): number | null {
  const seasons = buildTvSeasonMeta(detail);
  const latest = seasons[0];

  const yFromSeason = latest?.airDate ? yearFromIsoDate(latest.airDate) : null;
  if (yFromSeason) return yFromSeason;

  const yFromLast = yearFromIsoDate(asString(detail['last_air_date']));
  if (yFromLast) return yFromLast;

  const yFromFirst = yearFromIsoDate(asString(detail['first_air_date']));
  return yFromFirst ?? null;
}

/**
 * ✅ TMDB release_dates 기반 "재개봉 힌트" 판정
 * - KR의 note에 'Re-release'/'Rerelease'가 있으면 true
 * - 또는 KR theatrical(type=3) + limited theatrical(type=2) 날짜가 2개 이상이면 true
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

  // 2) theatrical count (2/3)
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

/**
 * ✅ TMDB release_dates payload에서 KR 극장 개봉일 목록 추출
 * - theatrical(3) + limited(2)
 * - 중복 제거/정렬(asc)
 */
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
      let totalPages = 1;

      for (let page = 1; page <= NOW_PLAYING_PAGES; page++) {
        const url = `${this.tmdbBase}/movie/now_playing`;
        const resp = await axios.get<unknown>(url, {
          params: { api_key: apiKey, region: 'KR', language: 'ko-KR', page },
          timeout: 10_000,
        });

        const data = resp.data;
        if (!isRecord(data)) continue;

        // ✅ total_pages 읽어서 불필요한 호출 조기 종료
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

        // ✅ 결과가 비면 더 볼 필요 없음
        if (results.length === 0) break;
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

          hidden: false,
          seasons: null,

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

      const sourcesUsed = isRecord(base.sourcesUsed)
        ? (base.sourcesUsed as Record<string, unknown>)
        : null;

      const contentCardPosterPath =
        pickComputedContentCardPosterPath(sourcesUsed) ?? null;

      const providersFlat = flattenProviders(wpSafe);

      // ✅ theatrical: override가 있으면 우선, 없으면 computed 사용
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
          rerunKobisMovieCd: null, // ✅ KOBIS 메타 적용 금지(항상 null)
        };
      })();

      const seasons = pickComputedSeasons(sourcesUsed);

      const hidden = pickComputedHidden(sourcesUsed);

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

        hidden,
        seasons,

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

      // extra keys are ignored
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

    const computedPosterPath =
      r.mediaType === 'movie'
        ? pickMoviePosterPath(detail)
        : pickLatestSeasonPosterPath(detail);

    const tmdbMovieReleaseYmd =
      r.mediaType === 'movie'
        ? toIsoYmd(asString(detail['release_date']))
        : null;

    const tmdbFirstYear =
      r.mediaType === 'movie'
        ? yearFromIsoDate(asString(detail['release_date']))
        : yearFromIsoDate(asString(detail['first_air_date']));

    const lastAirYear =
      r.mediaType === 'tv'
        ? yearFromIsoDate(asString(detail['last_air_date']))
        : null;

    // ✅ TV/Ani 최신 방영 연도 우선(요구사항)
    const latestSeasonYear =
      r.mediaType === 'tv' ? pickLatestSeasonYear(detail) : null;

    const contentKind: DbContentKind = hasAnimationGenre(detail['genres'])
      ? 'ANI'
      : r.mediaType === 'movie'
        ? 'MOVIE'
        : 'TV';

    // ✅ 영화만 now_playing 기반 statusKind 판정
    let statusKindDb: DbStatusKind | null = null;
    let rerunHint = false;
    let inNowPlaying = false;

    // ✅ KR 극장 개봉일 목록(asc)
    let krReleaseDatesYmd: string[] = [];

    // ✅ computeMovieStatus 결과(영화만 사용)
    let statusComputed: {
      releaseStatus: DbReleaseStatus;
      statusKind: DbStatusKind | null;
      computedReleaseYear: number | null;
      originalTheatricalDate: string | null;
      rerunTheatricalDate: string | null;
      hasMultipleTheatrical: boolean;
      hidden: boolean;
    };

    // ✅ seasons(프론트 계산 금지)
    const seasons: SeasonMeta[] | null =
      r.mediaType === 'tv' || contentKind === 'ANI'
        ? buildTvSeasonMeta(detail)
        : null;

    if (r.mediaType === 'movie') {
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

      const computed = await computeMovieStatus({
        statusKindFromReleaseStatus,
        detail,
        tmdbReleaseYmd: tmdbMovieReleaseYmd,
        krReleaseDatesYmd,
        hasOttProviders,
        isNowPlaying: inNowPlaying,
      });

      /**
       * ✅ 라우팅 규칙 강제 (절대 흔들리면 안됨)
       * - /movie/now_playing(KR)에 있으면 => 무조건 NOW_SHOWING 또는 RE_RELEASE + statusKind now/rerun
       * - 그 외 => computeMovieStatus 결과(UPCOMING이면 upcoming)
       */
      let enforcedReleaseStatus = computed.releaseStatus;
      let enforcedStatusKind = computed.statusKind;

      // 1) UPCOMING은 무조건 upcoming으로 고정
      if (computed.releaseStatus === 'UPCOMING') {
        enforcedReleaseStatus = 'UPCOMING';
        enforcedStatusKind = statusKindFromReleaseStatus('UPCOMING');
      } else if (inNowPlaying) {
        // 2) now_playing이면 무조건 now/rerun으로 고정
        enforcedReleaseStatus = rerunHint ? 'RE_RELEASE' : 'NOW_SHOWING';
        enforcedStatusKind = statusKindDb; // now | rerun
      } else {
        // 3) now_playing이 아니면 재개봉/상영중은 절대 허용하지 않음
        if (
          enforcedReleaseStatus === 'RE_RELEASE' ||
          enforcedReleaseStatus === 'NOW_SHOWING'
        ) {
          enforcedReleaseStatus = 'NONE';
        }
        enforcedStatusKind = null;
      }

      // ✅ (요구사항) 출시년도 규칙(컨텐츠카드/상세 동일):
      // - 영화-상영예정: KR 최초 개봉년도
      // - 영화-상영중:   KR 최초 개봉년도
      // - 영화-재개봉:   KR 최신 재개봉년도
      const earliestKr = krReleaseDatesYmd.length ? krReleaseDatesYmd[0] : null;
      const latestKr = krReleaseDatesYmd.length
        ? krReleaseDatesYmd[krReleaseDatesYmd.length - 1]
        : null;

      const computedReleaseYear =
        enforcedReleaseStatus === 'RE_RELEASE'
          ? (yearFromIsoDate(
              latestKr ??
                tmdbMovieReleaseYmd ??
                computed.rerunTheatricalDate ??
                computed.originalTheatricalDate ??
                '',
            ) ?? null)
          : (yearFromIsoDate(earliestKr ?? tmdbMovieReleaseYmd ?? '') ?? null);

      // ✅ (추가 규칙) 재개봉 영화인 경우
      // - 개봉일: 한국 최초 개봉일
      // - 재개봉일: 한국 가장 최신 개봉일
      // 그 외(상영중/상영예정 등): 개봉일은 KR 최신(없으면 TMDB), 재개봉일은 null
      const enforcedOriginalTheatricalDate =
        enforcedReleaseStatus === 'RE_RELEASE'
          ? (earliestKr ?? tmdbMovieReleaseYmd ?? null)
          : (latestKr ?? tmdbMovieReleaseYmd ?? null);

      const enforcedRerunTheatricalDate =
        enforcedReleaseStatus === 'RE_RELEASE'
          ? (latestKr ?? tmdbMovieReleaseYmd ?? null)
          : null;

      statusComputed = {
        releaseStatus: enforcedReleaseStatus,
        statusKind: enforcedStatusKind,
        computedReleaseYear,
        originalTheatricalDate: enforcedOriginalTheatricalDate,
        rerunTheatricalDate: enforcedRerunTheatricalDate,
        hasMultipleTheatrical: computed.hasMultipleTheatrical,
        hidden: computed.hidden,
      };
    } else {
      statusComputed = {
        releaseStatus: 'NONE' as DbReleaseStatus,
        statusKind: null as DbStatusKind | null,
        computedReleaseYear:
          latestSeasonYear ?? lastAirYear ?? tmdbFirstYear ?? null,
        originalTheatricalDate: null,
        rerunTheatricalDate: null,
        hasMultipleTheatrical: false,
        hidden: false,
      };
    }

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
        hidden: r.mediaType === 'movie' ? statusComputed.hidden : false,
        seasons: seasons,
        // ✅ 디버깅/검증용(다른 기능 영향 없음)
        krReleaseDatesYmd: r.mediaType === 'movie' ? krReleaseDatesYmd : null,
        // ✅ 상세 표시용 theatrical (KOBIS 미사용)
        theatrical:
          r.mediaType === 'movie'
            ? {
                hasMultipleTheatrical: statusComputed.hasMultipleTheatrical,
                originalTheatricalDate: statusComputed.originalTheatricalDate,
                rerunTheatricalDate: statusComputed.rerunTheatricalDate,
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
