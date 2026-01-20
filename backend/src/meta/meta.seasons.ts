// backend/src/meta/meta.seasons.ts
import {
  asArray,
  asNumber,
  asString,
  isRecord,
  toIsoYmd,
  yearFromIsoDate,
} from './meta.resolver';
import type { SeasonMeta } from './meta.types';

export function buildTvSeasonMeta(
  detail: Record<string, unknown>,
): SeasonMeta[] {
  const seasons = asArray(detail['seasons']);
  const out: SeasonMeta[] = [];

  for (const s of seasons) {
    if (!isRecord(s)) continue;
    const seasonNumber = asNumber(s['season_number']);
    if (typeof seasonNumber !== 'number') continue;

    const name = asString(s['name']) || null;
    const airDate = toIsoYmd(asString(s['air_date']));
    const yearLabel = airDate ? String(yearFromIsoDate(airDate) ?? '') : null;

    const posterPath = (() => {
      const v = s['poster_path'];
      return typeof v === 'string' && v ? v : null;
    })();

    out.push({
      seasonNumber,
      name,
      airDate,
      yearLabel: yearLabel && yearLabel !== 'null' ? yearLabel : null,
      posterPath,
    });
  }

  // 최신 시즌이 먼저 오게 정렬(airDate 기준 desc)
  out.sort((a, b) => {
    const ta = a.airDate ? new Date(a.airDate).getTime() : -1;
    const tb = b.airDate ? new Date(b.airDate).getTime() : -1;
    return tb - ta;
  });

  return out;
}

/**
 * ✅ TV 상세 첫 진입 시 "최신 시즌 기준 연도"를 releaseYear로 쓰기 위한 헬퍼
 * - buildTvSeasonMeta는 이미 최신 시즌이 앞에 오도록 정렬하므로, 첫 항목을 사용
 */
export function getLatestSeasonYearFromDetail(
  detail: Record<string, unknown>,
): number | null {
  const seasons = buildTvSeasonMeta(detail);
  const latest = seasons[0];
  if (!latest?.airDate) return null;
  return yearFromIsoDate(latest.airDate);
}
