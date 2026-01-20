// backend/src/meta/meta.poster.ts
import {
  asArray,
  asNumber,
  asString,
  isRecord,
  toIsoYmd,
} from './meta.resolver';

export function pickMoviePosterPath(
  detail: Record<string, unknown>,
): string | null {
  const p = detail['poster_path'];
  return typeof p === 'string' && p ? p : null;
}

/**
 * ✅ 컨텐츠카드-이미지: "가장 최신 시즌 포스터"
 * - seasons[].air_date 최신순으로 poster_path 우선 선택
 * - 없으면 tv의 poster_path fallback
 */
export function pickLatestSeasonPosterPath(
  detail: Record<string, unknown>,
): string | null {
  const seasons = asArray(detail['seasons']);
  const tvPoster = asString(detail['poster_path']) || null;

  if (!seasons.length) return tvPoster;

  const candidates: { air: number; poster: string | null }[] = [];

  for (const s of seasons) {
    if (!isRecord(s)) continue;

    // Specials(0) 제외
    const no = asNumber(s['season_number']);
    if (typeof no === 'number' && no <= 0) continue;

    const airYmd = toIsoYmd(asString(s['air_date']));
    const air = airYmd ? new Date(airYmd).getTime() : -1;

    const poster = (() => {
      const v = s['poster_path'];
      return typeof v === 'string' && v ? v : null;
    })();

    if (air > 0) candidates.push({ air, poster });
  }

  candidates.sort((a, b) => b.air - a.air);

  for (const c of candidates) {
    if (c.poster) return c.poster;
  }

  return tvPoster;
}
