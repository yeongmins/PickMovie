// frontend/src/components/content/contentCard.year.ts

import type { ContentCardItem, MediaType } from "./contentCard.types";
import { yearFromYmd } from "./contentCard.utils";
import type { ScreeningSets, TvLatestPayload } from "../../lib/contentMeta";

function isIsoYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}/.test(s.trim());
}

function maxIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  // ISO 날짜는 문자열 비교로 최신 판별 가능(YYYY-MM-DD)
  return a >= b ? a : b;
}

function extractLatestIsoDateDeep(
  value: unknown,
  depth = 0,
  maxDepth = 3
): string | null {
  if (depth > maxDepth) return null;

  if (isIsoYmd(value)) return value.slice(0, 10);

  if (Array.isArray(value)) {
    let best: string | null = null;
    // 과도한 순회 방지 (스크리닝 데이터가 커도 안전하게)
    const limit = Math.min(value.length, 60);
    for (let i = 0; i < limit; i++) {
      best = maxIsoDate(best, extractLatestIsoDateDeep(value[i], depth + 1));
    }
    return best;
  }

  if (value && typeof value === "object") {
    const v: any = value;

    // ✅ 자주 쓰이는 날짜 키 우선 탐색
    const directKeys = [
      "date",
      "air_date",
      "airDate",
      "release_date",
      "releaseDate",
      "openDate",
      "startDate",
      "start",
      "from",
      "endDate",
      "end",
      "to",
      "last_air_date",
      "lastAirDate",
      "latestAirDate",
    ];

    let best: string | null = null;

    for (const k of directKeys) {
      if (isIsoYmd(v?.[k])) best = maxIsoDate(best, String(v[k]).slice(0, 10));
    }

    // ✅ TMDB 스타일(episode)
    if (isIsoYmd(v?.last_episode_to_air?.air_date)) {
      best = maxIsoDate(best, String(v.last_episode_to_air.air_date).slice(0, 10));
    }
    if (isIsoYmd(v?.lastEpisodeToAir?.air_date)) {
      best = maxIsoDate(best, String(v.lastEpisodeToAir.air_date).slice(0, 10));
    }

    // 깊게 한 번 더 훑기(키 구조를 모를 때 대비)
    const nextKeys = ["data", "payload", "item", "items", "result", "results", "value"];
    for (const k of nextKeys) {
      best = maxIsoDate(best, extractLatestIsoDateDeep(v?.[k], depth + 1));
    }

    return best;
  }

  return null;
}

function pickLatestTvBaseDate(item: ContentCardItem, tvLatest: TvLatestPayload | null) {
  // “가장 최신 시즌/에피소드”에 가까운 날짜 후보들
  const candidates: Array<string | null> = [
    tvLatest ? extractLatestIsoDateDeep(tvLatest) : null,
    item.first_air_date ? item.first_air_date : null,
  ];

  let best: string | null = null;
  for (const c of candidates) best = maxIsoDate(best, c);
  return best;
}

function pickLatestRerunDate(screening: ScreeningSets | null, id: number) {
  if (!screening) return null;
  const s: any = screening;

  // ✅ “재개봉/리런” 관련으로 흔히 있을 법한 구조들 최대한 대응
  const byIdCandidates: any[] = [
    s?.rerun?.[id],
    s?.rerunById?.[id],
    s?.rerunMap?.[id],
    s?.reRelease?.[id],
    s?.reReleaseById?.[id],
    s?.reReleaseMap?.[id],
  ];

  for (const c of byIdCandidates) {
    const d = extractLatestIsoDateDeep(c);
    if (d) return d;
  }

  const arrayCandidates: any[] = [
    s?.rerun,
    s?.reruns,
    s?.rerunItems,
    s?.reRelease,
    s?.reReleases,
    s?.reReleaseItems,
  ].filter(Boolean);

  for (const arr of arrayCandidates) {
    if (!Array.isArray(arr)) continue;
    const hit =
      arr.find((x: any) => x?.id === id || x?.tmdbId === id || x?.contentId === id) ??
      null;
    const d = extractLatestIsoDateDeep(hit);
    if (d) return d;
  }

  // 마지막 fallback: 전체 screening 객체에서 “id 근처”의 날짜가 있을 수도 있어서
  // (비추천이지만) 깊게 훑되, 안전하게 depth 제한이 걸려있음
  return extractLatestIsoDateDeep(screening);
}

export function resolveDisplayYear(args: {
  mediaType: MediaType;
  item: ContentCardItem;
  statusKind: string | null;
  screening: ScreeningSets | null;
  tvLatest: TvLatestPayload | null;
}): string {
  const { mediaType, item, statusKind, screening, tvLatest } = args;

  if (mediaType === "tv") {
    const base = pickLatestTvBaseDate(item, tvLatest);
    return yearFromYmd(base) ?? "—";
  }

  // movie
  if (statusKind === "rerun") {
    const rerunDate = pickLatestRerunDate(screening, item.id);
    const y = yearFromYmd(rerunDate);
    if (y) return y;
  }

  // 기본: release_date 기준(신작/상영중/개봉예정 포함)
  return yearFromYmd(item.release_date) ?? "—";
}
