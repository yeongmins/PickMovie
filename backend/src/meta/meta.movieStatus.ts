// backend/src/meta/meta.movieStatus.ts
import type { KobisService } from '../kobis/kobis.service';
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

export async function computeMovieStatus(args: {
  kobis: KobisService;
  statusKindFromReleaseStatus: (rs: DbReleaseStatus) => DbStatusKind | null;

  detail: Record<string, unknown>;
  tmdbReleaseYmd: string | null;

  theatricalInfo: {
    kobisMovieCd: string | null;
    kobisOpenDt: string | null;
    rerunKobisMovieCd: string | null;
    rerunOpenDt: string | null;
    hasMultipleTheatrical: boolean;
  } | null;

  krReleaseDatesYmd: string[]; // asc

  // ✅ 추가
  hasOttProviders: boolean;
}): Promise<{
  releaseStatus: DbReleaseStatus;
  statusKind: DbStatusKind | null;
  computedReleaseYear: number | null;

  originalTheatricalDate: string | null;
  rerunTheatricalDate: string | null;
  kobisMovieCd: string | null;
  rerunKobisMovieCd: string | null;
  hasMultipleTheatrical: boolean;

  // ✅ KR 상영/개봉 이력 여부 (제외 판단용)
  krEligible: boolean;

  // ✅ 아예 숨김(영화 & KR개봉없음 & OTT없음)
  hidden: boolean;
}> {
  const now = new Date();
  const thisYear = now.getFullYear();

  const tmdbRelease =
    args.tmdbReleaseYmd ?? toIsoYmd(asString(args.detail['release_date']));
  const tmdbUpcoming = tmdbRelease
    ? new Date(tmdbRelease).getTime() > now.getTime()
    : false;

  const earliestKr = args.krReleaseDatesYmd.length
    ? args.krReleaseDatesYmd[0]
    : null;
  const latestKr = args.krReleaseDatesYmd.length
    ? args.krReleaseDatesYmd[args.krReleaseDatesYmd.length - 1]
    : null;

  // ✅ TMDB KR 개봉일이 2개 이상이면(서로 다르면) 재개봉 후보로 인정
  const multipleFromKr = Boolean(
    earliestKr && latestKr && earliestKr !== latestKr,
  );

  const futureKr = args.krReleaseDatesYmd.filter((d) => {
    const t = new Date(d).getTime();
    return Number.isFinite(t) && t > now.getTime();
  });
  const earliestFutureKr = futureKr.length ? futureKr[0] : null;
  const krUpcoming = Boolean(earliestFutureKr);

  const originalTheatricalDate =
    args.theatricalInfo?.kobisOpenDt ?? earliestKr ?? tmdbRelease ?? null;

  // ✅ KOBIS가 없어도 TMDB KR 다중 날짜면 true
  const hasMultipleTheatrical =
    Boolean(args.theatricalInfo?.hasMultipleTheatrical) || multipleFromKr;

  const kobisMovieCd = args.theatricalInfo?.kobisMovieCd ?? null;
  const rerunKobisMovieCd = args.theatricalInfo?.rerunKobisMovieCd ?? null;

  // ✅ KOBIS 우선, 없으면 “TMDB KR 최신 날짜”를 재개봉일로 사용
  const rerunTheatricalDate =
    args.theatricalInfo?.rerunOpenDt ??
    (hasMultipleTheatrical ? latestKr : null) ??
    null;

  const rerunUpcoming = rerunTheatricalDate
    ? new Date(rerunTheatricalDate).getTime() > now.getTime()
    : false;

  const monthsGap =
    hasMultipleTheatrical && originalTheatricalDate && rerunTheatricalDate
      ? diffFullMonths(originalTheatricalDate, rerunTheatricalDate)
      : 0;

  const rerunGapQualified = hasMultipleTheatrical && monthsGap >= 4;

  let isNowPlaying = false;
  try {
    const set = await args.kobis.getNowPlayingMovieCds(7);
    if (kobisMovieCd && set.has(kobisMovieCd)) isNowPlaying = true;
    if (rerunKobisMovieCd && set.has(rerunKobisMovieCd)) isNowPlaying = true;
  } catch {
    isNowPlaying = false;
  }

  const baseYear =
    yearFromIsoDate(originalTheatricalDate ?? '') ??
    yearFromIsoDate(tmdbRelease ?? '') ??
    null;
  const oldEnough = baseYear ? baseYear <= thisYear - 2 : false;

  const isRerun =
    rerunGapQualified || (oldEnough && (isNowPlaying || rerunUpcoming));

  // ✅ KR 기준 “상영/개봉 이력”
  const krHasTheatrical =
    Boolean(earliestKr) ||
    Boolean(args.theatricalInfo?.kobisOpenDt) ||
    isNowPlaying ||
    krUpcoming;

  const krEligible = krHasTheatrical || args.hasOttProviders;
  const hidden = !krHasTheatrical && !args.hasOttProviders;

  let releaseStatus: DbReleaseStatus = 'NONE';

  if (!krHasTheatrical) {
    releaseStatus = tmdbUpcoming ? 'UPCOMING' : 'NONE';
  } else if (isNowPlaying) {
    releaseStatus = isRerun ? 'RE_RELEASE' : 'NOW_SHOWING';
  } else if (rerunUpcoming) {
    releaseStatus = 'RE_RELEASE';
  } else if (krUpcoming || tmdbUpcoming) {
    releaseStatus = isRerun ? 'RE_RELEASE' : 'UPCOMING';
  } else {
    releaseStatus = 'NONE';
  }

  const statusKind = args.statusKindFromReleaseStatus(releaseStatus);

  let computedReleaseYear: number | null = null;

  if (releaseStatus === 'UPCOMING') {
    computedReleaseYear =
      yearFromIsoDate(
        earliestFutureKr ??
          earliestKr ??
          originalTheatricalDate ??
          tmdbRelease ??
          '',
      ) ?? null;
  } else if (releaseStatus === 'NOW_SHOWING') {
    computedReleaseYear =
      yearFromIsoDate(
        earliestKr ?? originalTheatricalDate ?? tmdbRelease ?? '',
      ) ?? null;
  } else if (releaseStatus === 'RE_RELEASE') {
    computedReleaseYear =
      yearFromIsoDate(
        rerunTheatricalDate ??
          latestKr ??
          originalTheatricalDate ??
          tmdbRelease ??
          '',
      ) ?? null;
  } else {
    computedReleaseYear =
      yearFromIsoDate(
        earliestKr ?? originalTheatricalDate ?? tmdbRelease ?? '',
      ) ?? null;
  }

  return {
    releaseStatus,
    statusKind,
    computedReleaseYear,
    originalTheatricalDate,
    rerunTheatricalDate,
    kobisMovieCd,
    rerunKobisMovieCd,
    hasMultipleTheatrical,
    krEligible,
    hidden,
  };
}
