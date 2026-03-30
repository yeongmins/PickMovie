// backend/src/meta/meta.mappers.ts
import type {
  AgeRating as DbAgeRating,
  ContentKind as DbContentKind,
  MetaMediaType as DbMediaType,
  ReleaseStatus as DbReleaseStatus,
  StatusKind as DbStatusKind,
} from '../generated/prisma';

import type { AgeRating, MediaType } from './meta.types';

export function isoNow(): string {
  return new Date().toISOString();
}

export function dbMediaType(mediaType: MediaType): DbMediaType {
  return mediaType;
}

export function apiAgeFromDb(db: DbAgeRating): AgeRating {
  if (db === 'R12') return '12';
  if (db === 'R15') return '15';
  if (db === 'R19') return '19';
  return db; // ALL, UNKNOWN
}

export function dbAgeFromApi(v?: string): DbAgeRating | null {
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

export function dbContentKindFromApi(v?: string): DbContentKind | null {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (s === 'MOVIE' || s === 'TV' || s === 'ANI') return s as DbContentKind;
  return null;
}

export function dbReleaseStatusFromApi(v?: string): DbReleaseStatus | null {
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

export function apiStatusKindFromDb(
  v?: DbStatusKind | null,
): 'now' | 'upcoming' | 'rerun' | null {
  if (!v) return null;
  if (v === 'now') return 'now';
  if (v === 'upcoming') return 'upcoming';
  if (v === 'rerun') return 'rerun';
  return null;
}

export function dbStatusKindFromApi(v?: string): DbStatusKind | null {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s === 'now' || s === 'upcoming' || s === 'rerun')
    return s as DbStatusKind;
  return null;
}

export function statusKindFromReleaseStatus(
  rs: DbReleaseStatus,
): DbStatusKind | null {
  if (rs === 'NOW_SHOWING') return 'now';
  if (rs === 'UPCOMING') return 'upcoming';
  if (rs === 'RE_RELEASE') return 'rerun';
  return null;
}
