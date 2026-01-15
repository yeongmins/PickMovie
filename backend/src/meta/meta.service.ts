// backend/src/meta/meta.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { PrismaService } from '../prisma/prisma.service';
import { KobisService } from '../kobis/kobis.service';

import {
  AgeRating as DbAgeRating,
  ContentKind as DbContentKind,
  MetaMediaType as DbMediaType,
  ReleaseStatus as DbReleaseStatus,
  Prisma,
} from '../generated/prisma';

import type {
  MediaType,
  ResolveRequest,
  ResolvedMeta,
  WatchProviderItem,
  WatchProviders,
} from './meta.types';
import {
  asArray,
  asNumber,
  asString,
  hasAnimationGenre,
  isRecord,
  yearFromIsoDate,
} from './meta.resolver';

function dbMediaType(mediaType: MediaType): DbMediaType {
  return mediaType;
}

function apiAgeFromDb(db: DbAgeRating): ResolvedMeta['ageRating'] {
  if (db === 'R12') return '12';
  if (db === 'R15') return '15';
  if (db === 'R19') return '19';
  return db; // ALL, UNKNOWN
}

function dbAgeFromApi(v?: string): DbAgeRating | null {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (s === '12') return 'R12';
  if (s === '15') return 'R15';
  if (s === '19') return 'R19';
  if (
    s === 'R12' ||
    s === 'R15' ||
    s === 'R19' ||
    s === 'ALL' ||
    s === 'UNKNOWN'
  )
    return s as DbAgeRating;
  return null;
}

function dbContentKindFromApi(v?: string): DbContentKind | null {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (s === 'MOVIE' || s === 'TV' || s === 'ANI') return s as DbContentKind;
  return null;
}

function dbReleaseStatusFromApi(v?: string): DbReleaseStatus | null {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (
    s === 'NOW_SHOWING' ||
    s === 'UPCOMING' ||
    s === 'RE_RELEASE' ||
    s === 'NONE'
  )
    return s as DbReleaseStatus;
  return null;
}

function isoNow(): string {
  return new Date().toISOString();
}

const WP_LIST_KEYS = ['flatrate', 'free', 'ads', 'rent', 'buy'] as const;

function parseProviderList(arr: unknown): WatchProviderItem[] | undefined {
  const src = asArray(arr);
  const items: WatchProviderItem[] = [];

  for (const it of src) {
    if (!isRecord(it)) continue;
    const provider_id = asNumber(it['provider_id']);
    const provider_name = asString(it['provider_name']);
    const logo_path =
      it['logo_path'] === null || typeof it['logo_path'] === 'string'
        ? it['logo_path']
        : null;
    const display_priority = asNumber(it['display_priority']) ?? undefined;

    if (!provider_id || !provider_name) continue;
    items.push({ provider_id, provider_name, logo_path, display_priority });
  }

  return items.length ? items : undefined;
}

function toPrismaJson(v: unknown): Prisma.InputJsonValue {
  // Prisma.InputJsonValue는 런타임 검사까지 강제하지 않음.
  // 여기서 v는 우리가 만든 순수 객체/배열만 넣도록 사용처에서 보장.
  return v as Prisma.InputJsonValue;
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
      const expired = c.expiresAt
        ? c.expiresAt.getTime() < now.getTime()
        : false;
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
          metaVersion: 1,
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

      return {
        mediaType: r.mediaType,
        tmdbId: r.tmdbId,
        contentKind: mergedContentKind,
        releaseStatus: mergedReleaseStatus,
        ageRating: apiAgeFromDb(mergedAge),
        releaseYear: mergedReleaseYear,
        watchProviders: this.safeWatchProviders(mergedWatchProviders),
        metaVersion: base.metaVersion,
        resolvedAt: base.resolvedAt.toISOString(),
        expiresAt: base.expiresAt ? base.expiresAt.toISOString() : null,
        sourcesUsed: isRecord(base.sourcesUsed) ? base.sourcesUsed : null,
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
      watchProviders?: unknown; // null이면 DB NULL로 저장
    };
    updatedBy?: string;
  }): Promise<void> {
    const dbMt = dbMediaType(args.mediaType);

    const contentKind = dbContentKindFromApi(args.patch.contentKind);
    const releaseStatus = dbReleaseStatusFromApi(args.patch.releaseStatus);
    const ageRating = dbAgeFromApi(args.patch.ageRating);

    const wpPatch = args.patch.watchProviders;
    const wpValue =
      wpPatch === undefined
        ? undefined
        : wpPatch === null
          ? Prisma.DbNull
          : toPrismaJson(wpPatch);

    await this.prisma.contentMetaOverride.upsert({
      where: { mediaType_tmdbId: { mediaType: dbMt, tmdbId: args.tmdbId } },
      update: {
        contentKind: contentKind ?? undefined,
        releaseStatus: releaseStatus ?? undefined,
        ageRating: ageRating ?? undefined,
        releaseYear: args.patch.releaseYear ?? undefined,
        watchProviders: wpValue,
        updatedBy: args.updatedBy ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        mediaType: dbMt,
        tmdbId: args.tmdbId,
        contentKind: contentKind ?? undefined,
        releaseStatus: releaseStatus ?? undefined,
        ageRating: ageRating ?? undefined,
        releaseYear: args.patch.releaseYear ?? undefined,
        watchProviders: wpValue,
        updatedBy: args.updatedBy ?? undefined,
        updatedAt: new Date(),
      },
    });
  }

  private safeWatchProviders(v: unknown): WatchProviders | null {
    if (!isRecord(v)) return null;

    const out: WatchProviders = {};

    const link = v['link'];
    if (typeof link === 'string') out.link = link;

    for (const k of WP_LIST_KEYS) {
      const picked = parseProviderList(v[k]);
      if (picked) out[k] = picked;
    }

    return Object.keys(out).length ? out : null;
  }

  private async computeAndUpsert(r: ResolveRequest) {
    const apiKey = this.tmdbKey();
    const dbMt = dbMediaType(r.mediaType);

    const detail = await this.fetchTmdbDetail(r.mediaType, r.tmdbId, apiKey);
    const providers = await this.fetchWatchProviders(
      r.mediaType,
      r.tmdbId,
      apiKey,
    );
    const age = await this.fetchAgeRating(r.mediaType, r.tmdbId, apiKey);

    const releaseYear =
      r.mediaType === 'movie'
        ? yearFromIsoDate(asString(detail['release_date']))
        : yearFromIsoDate(asString(detail['first_air_date']));

    const contentKind: DbContentKind = hasAnimationGenre(detail['genres'])
      ? 'ANI'
      : r.mediaType === 'movie'
        ? 'MOVIE'
        : 'TV';

    const releaseStatus = await this.computeReleaseStatus(
      r.mediaType,
      detail,
      releaseYear,
    );

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    // ✅ Json? 필드는 null 대신 Prisma.DbNull 사용
    const providersJson =
      providers === null ? Prisma.DbNull : toPrismaJson(providers);

    const sourcesUsedJson = toPrismaJson({
      tmdb: true,
      kobis: r.mediaType === 'movie',
    });

    return this.prisma.contentMetaResolved.upsert({
      where: { mediaType_tmdbId: { mediaType: dbMt, tmdbId: r.tmdbId } },
      update: {
        contentKind,
        releaseStatus,
        ageRating: age,
        releaseYear: releaseYear ?? null,
        watchProviders: providersJson,
        sourcesUsed: sourcesUsedJson,
        metaVersion: 1,
        resolvedAt: new Date(),
        expiresAt,
      },
      create: {
        mediaType: dbMt,
        tmdbId: r.tmdbId,
        contentKind,
        releaseStatus,
        ageRating: age,
        releaseYear: releaseYear ?? null,
        watchProviders: providersJson,
        sourcesUsed: sourcesUsedJson,
        metaVersion: 1,
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

  private async fetchWatchProviders(
    mediaType: MediaType,
    tmdbId: number,
    apiKey: string,
  ): Promise<WatchProviders | null> {
    const url = `${this.tmdbBase}/${mediaType}/${tmdbId}/watch/providers`;
    const resp = await axios.get<unknown>(url, {
      params: { api_key: apiKey },
      timeout: 10_000,
    });

    const data = resp.data;
    if (!isRecord(data)) return null;

    const results = data['results'];
    if (!isRecord(results)) return null;

    const kr = results['KR'];
    if (!isRecord(kr)) return null;

    const out: WatchProviders = {};

    const link = kr['link'];
    if (typeof link === 'string') out.link = link;

    for (const k of WP_LIST_KEYS) {
      const picked = parseProviderList(kr[k as unknown as string]);
      if (picked) out[k] = picked;
    }

    return Object.keys(out).length ? out : null;
  }

  private parseAgeToDb(v: string): DbAgeRating {
    const s = v.trim().toUpperCase();

    const m = s.match(/(\d{1,2})/);
    if (m) {
      const n = Number(m[1]);
      if (n <= 0) return 'ALL';
      if (n <= 12) return 'R12';
      if (n <= 15) return 'R15';
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

        const pickFrom = (x: unknown) => {
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
      return rating ? this.parseAgeToDb(rating) : 'UNKNOWN';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[meta] fetchAgeRating failed: ${msg}`);
      return 'UNKNOWN';
    }
  }

  private async computeReleaseStatus(
    mediaType: MediaType,
    detail: Record<string, unknown>,
    releaseYear: number | null,
  ): Promise<DbReleaseStatus> {
    if (mediaType !== 'movie') return 'NONE';

    const releaseDateIso = asString(detail['release_date']);
    if (releaseDateIso) {
      const rd = new Date(releaseDateIso);
      if (!Number.isNaN(rd.getTime()) && rd.getTime() > Date.now()) {
        return 'UPCOMING';
      }
    }

    const match = await this.kobis.findOpenDtByTmdbDetail({
      title: detail['title'],
      original_title: detail['original_title'],
      release_date: detail['release_date'],
    });

    if (match.kobisMovieCd) {
      const set = await this.kobis.getNowPlayingMovieCds(7);
      const nowPlaying = set.has(match.kobisMovieCd);

      if (nowPlaying) {
        const thisYear = new Date().getFullYear();
        if (releaseYear && releaseYear <= thisYear - 2) return 'RE_RELEASE';
        return 'NOW_SHOWING';
      }
    }

    return 'NONE';
  }
}
