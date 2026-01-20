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

export function computeMovieStatus(args: {
  statusKindFromReleaseStatus: (rs: DbReleaseStatus) => DbStatusKind | null;

  detail: Record<string, unknown>;
  tmdbReleaseYmd: string | null;

  krReleaseDatesYmd: string[]; // asc

  // ✅ OTT 보유 여부(전 화면 동일 표시용)
  hasOttProviders: boolean;

  // ✅ 추가: TMDB now_playing 포함 여부(메타 서비스에서 계산해서 전달)
  isNowPlaying: boolean;
}): Promise<{
  releaseStatus: DbReleaseStatus;
  statusKind: DbStatusKind | null;

  computedReleaseYear: number | null;

  originalTheatricalDate: string | null;
  rerunTheatricalDate: string | null;

  hasMultipleTheatrical: boolean;

  krEligible: boolean;
  hidden: boolean;
}> {
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

  const krEligible = krHasTheatrical || args.hasOttProviders;
  const hidden = !krHasTheatrical && !args.hasOttProviders;

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
    // ✅ 이제 TMDB now_playing 반영됨
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

  // ✅ 상세 날짜 표시 규칙 수정(재개봉 분리)
  const originalDisplayDate = isRerun
    ? (earliestKr ?? tmdbRelease ?? null) // ✅ 재개봉이면 "개봉일" = KR 최초
    : (latestKr ?? tmdbRelease ?? null); // ✅ 그 외는 기존대로 최신(없으면 TMDB)

  const rerunDisplayDate = isRerun
    ? (latestKr ?? tmdbRelease ?? null) // ✅ 재개봉일 = KR 최신
    : null;

  return Promise.resolve({
    releaseStatus,
    statusKind,
    computedReleaseYear,

    originalTheatricalDate: originalDisplayDate,
    rerunTheatricalDate: rerunDisplayDate,

    hasMultipleTheatrical,
    krEligible,
    hidden,
  });
}
