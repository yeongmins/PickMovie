// backend/src/meta/meta.movieStatus.ts
import type {
  ReleaseStatus as DbReleaseStatus,
  StatusKind as DbStatusKind,
} from '../generated/prisma';
import {
  asString,
  diffFullMonths,
  toIsoYmd,
  yearFromIsoDate,
} from './meta.resolver';

/**
 * computeMovieStatus는 “숨김/개봉 유효성” 같은 베이스 판정용.
 * ✅ 실제 화면 표시 규칙(카드 출시년도/컨텐츠정보 날짜/히어로)은 meta.service에서 최종 강제한다.
 */
export function computeMovieStatus(args: {
  statusKindFromReleaseStatus: (rs: DbReleaseStatus) => DbStatusKind | null;

  detail: Record<string, unknown>;
  tmdbReleaseYmd: string | null;

  krReleaseDatesYmd: string[]; // asc

  // ✅ OTT 보유 여부(전 화면 동일 표시용)
  hasOttProviders: boolean;

  // ✅ TMDB now_playing 포함 여부
  isNowPlaying: boolean;
}): {
  releaseStatus: DbReleaseStatus;
  statusKind: DbStatusKind | null;

  computedReleaseYear: number | null;

  originalTheatricalDate: string | null;
  rerunTheatricalDate: string | null;

  hasMultipleTheatrical: boolean;

  krEligible: boolean;
  hidden: boolean;
} {
  const now = new Date();
  const thisYear = now.getFullYear();

  const tmdbRelease =
    args.tmdbReleaseYmd ?? toIsoYmd(asString(args.detail['release_date']));
  const tmdbUpcoming = tmdbRelease
    ? new Date(tmdbRelease).getTime() > now.getTime()
    : false;

  const normalizedKr = Array.from(
    new Set(
      (args.krReleaseDatesYmd ?? [])
        .map((d) => String(d ?? '').trim())
        .filter(Boolean)
        .filter((d) => Number.isFinite(new Date(d).getTime())),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const earliestKr = normalizedKr.length ? normalizedKr[0] : null;
  const latestKr = normalizedKr.length
    ? normalizedKr[normalizedKr.length - 1]
    : null;

  const futureKr = normalizedKr.filter((d) => {
    const t = new Date(d).getTime();
    return Number.isFinite(t) && t > now.getTime();
  });
  const earliestFutureKr = futureKr.length ? futureKr[0] : null;
  const krUpcoming = Boolean(earliestFutureKr);

  const multipleFromKr = Boolean(
    earliestKr && latestKr && earliestKr !== latestKr,
  );
  const hasMultipleTheatrical = multipleFromKr;

  const originalForLogic = earliestKr ?? tmdbRelease ?? null;
  const rerunForLogic = multipleFromKr ? latestKr : null;

  const rerunUpcoming = rerunForLogic
    ? new Date(rerunForLogic).getTime() > now.getTime()
    : false;

  const monthsGap =
    hasMultipleTheatrical && originalForLogic && rerunForLogic
      ? diffFullMonths(originalForLogic, rerunForLogic)
      : 0;

  const rerunGapQualified = hasMultipleTheatrical && monthsGap >= 4;

  const baseYear =
    yearFromIsoDate(originalForLogic ?? '') ??
    yearFromIsoDate(tmdbRelease ?? '') ??
    null;
  const oldEnough = baseYear ? baseYear <= thisYear - 2 : false;

  const isRerun = rerunGapQualified || (oldEnough && rerunUpcoming);

  const krHasTheatrical = Boolean(earliestKr) || krUpcoming;

  // ✅ KR 개봉일 정보가 없으면 무조건 제외
  const krEligible = krHasTheatrical;
  const hidden = !krHasTheatrical;

  const latestKrUpcoming = latestKr
    ? new Date(latestKr).getTime() > now.getTime()
    : false;

  const shouldBeUpcoming = latestKrUpcoming || krUpcoming || tmdbUpcoming;

  let releaseStatus: DbReleaseStatus = 'NONE';

  if (!krHasTheatrical) {
    releaseStatus = tmdbUpcoming ? 'UPCOMING' : 'NONE';
  } else if (shouldBeUpcoming) {
    releaseStatus = 'UPCOMING';
  } else if (args.isNowPlaying) {
    releaseStatus = isRerun ? 'RE_RELEASE' : 'NOW_SHOWING';
  } else {
    releaseStatus = isRerun ? 'RE_RELEASE' : 'NONE';
  }

  const statusKind = args.statusKindFromReleaseStatus(releaseStatus);

  let computedReleaseYear: number | null = null;
  if (releaseStatus === 'UPCOMING') {
    computedReleaseYear =
      yearFromIsoDate(earliestFutureKr ?? earliestKr ?? tmdbRelease ?? '') ??
      null;
  } else if (releaseStatus === 'RE_RELEASE') {
    computedReleaseYear =
      yearFromIsoDate(latestKr ?? tmdbRelease ?? '') ?? null;
  } else {
    computedReleaseYear =
      yearFromIsoDate(earliestKr ?? tmdbRelease ?? '') ?? null;
  }

  const originalDisplayDate = isRerun
    ? (earliestKr ?? tmdbRelease ?? null)
    : (latestKr ?? tmdbRelease ?? null);

  const rerunDisplayDate = isRerun ? (latestKr ?? tmdbRelease ?? null) : null;

  return {
    releaseStatus,
    statusKind,
    computedReleaseYear,

    originalTheatricalDate: originalDisplayDate,
    rerunTheatricalDate: rerunDisplayDate,

    hasMultipleTheatrical,
    krEligible,
    hidden,
  };
}
