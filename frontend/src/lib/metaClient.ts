// frontend/src/lib/metaClient.ts
import { apiGet } from "./apiClient";

export type MediaType = "movie" | "tv";

/** 백엔드 meta.types.ts 기준 */
export type StatusKind = "now" | "upcoming" | "rerun" | null;

/** ✅ 프론트는 백엔드 값을 그대로 표시(추론/변환 금지) */
export type AgeRating = "ALL" | "12" | "15" | "18" | "19" | "UNKNOWN" | string;

export type WatchProviderItem = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
};

export type WatchProviders = {
  link?: string;
  flatrate?: WatchProviderItem[];
  free?: WatchProviderItem[];
  ads?: WatchProviderItem[];
  rent?: WatchProviderItem[];
  buy?: WatchProviderItem[];
};

export type TheatricalInfo = {
  hasMultipleTheatrical: boolean;
  originalTheatricalDate: string | null;
  rerunTheatricalDate: string | null;
  rerunKobisMovieCd: string | null;
};

export type SeasonMeta = {
  seasonNumber: number;
  name: string | null;
  airDate: string | null; // YYYY-MM-DD
  yearLabel: string | null; // "2026"
  posterPath: string | null; // TMDB poster_path
};

export type ResolvedMeta = {
  mediaType: MediaType;
  tmdbId: number;

  contentKind: "MOVIE" | "TV" | "ANI" | string;
  releaseStatus: "NOW_SHOWING" | "UPCOMING" | "RE_RELEASE" | "NONE" | string;

  ageRating: AgeRating;
  releaseYear: number | null;
  watchProviders: WatchProviders | null;

  statusKind: StatusKind;
  unifiedYearLabel: string | null;
  providers: WatchProviderItem[];

  // ✅ 카드 포스터(백엔드에서 계산해서 내려주는 값)
  contentCardPosterPath: string | null;

  theatrical: TheatricalInfo | null;

  // ✅ 백엔드가 "아예 숨김" 판정 내려줌
  hidden?: boolean;

  // ✅ TV 상세 시즌 메타(프론트 계산 X)
  seasons?: SeasonMeta[] | null;

  metaVersion: number;
  resolvedAt: string;
  expiresAt: string | null;
  sourcesUsed: Record<string, unknown> | null;
};

const memCache = new Map<string, ResolvedMeta>();
const inflight = new Map<string, Promise<ResolvedMeta | null>>();

function keyOf(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}:${tmdbId}`;
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() >= t;
}

function readAccessToken(): string | null {
  try {
    return localStorage.getItem("pickmovie_access_token");
  } catch {
    return null;
  }
}

function buildHeaders() {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = readAccessToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function apiBaseUrl() {
  const base =
    (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:3000";
  return String(base).replace(/\/+$/, "");
}

export function peekResolvedMeta(mediaType: MediaType, tmdbId: number) {
  const k = keyOf(mediaType, tmdbId);
  const cached = memCache.get(k) ?? null;
  if (!cached) return null;
  if (isExpired(cached.expiresAt)) return null;
  return cached;
}

async function postBatch(
  items: Array<{ mediaType: MediaType; tmdbId: number }>,
): Promise<ResolvedMeta[]> {
  const url = `${apiBaseUrl()}/meta/batch`;

  const r = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ items }),
  });

  if (!r.ok) return [];

  const json = (await r.json()) as { items?: ResolvedMeta[] };
  const list = Array.isArray(json?.items) ? json.items : [];

  // ✅ 프론트는 변환/계산 없이 그대로 캐시
  return list;
}

export async function requestResolvedMeta(
  mediaType: MediaType,
  tmdbId: number,
): Promise<ResolvedMeta | null> {
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null;

  const k = keyOf(mediaType, tmdbId);

  const cached = peekResolvedMeta(mediaType, tmdbId);
  if (cached) return cached;

  if (inflight.has(k)) return inflight.get(k)!;

  const p = (async () => {
    try {
      const items = await postBatch([{ mediaType, tmdbId }]);
      const got = items[0] ?? null;
      if (got) memCache.set(k, got);
      return got;
    } catch {
      return null;
    } finally {
      inflight.delete(k);
    }
  })();

  inflight.set(k, p);
  return p;
}

export async function requestResolvedMetaBatch(
  reqs: Array<{ mediaType: MediaType; tmdbId: number }>,
): Promise<ResolvedMeta[]> {
  const normalized = (Array.isArray(reqs) ? reqs : [])
    .filter(
      (x) => (x.mediaType === "movie" || x.mediaType === "tv") && x.tmdbId > 0,
    )
    .slice(0, 80);

  if (!normalized.length) return [];

  const need: Array<{ mediaType: MediaType; tmdbId: number }> = [];
  for (const r of normalized) {
    const k = keyOf(r.mediaType, r.tmdbId);
    const c = peekResolvedMeta(r.mediaType, r.tmdbId);
    if (c) continue;
    if (inflight.has(k)) continue;
    need.push(r);
  }

  const fetched = need.length ? await postBatch(need) : [];

  fetched.forEach((m) => {
    if (m?.mediaType && m?.tmdbId)
      memCache.set(keyOf(m.mediaType, m.tmdbId), m);
  });

  const out: ResolvedMeta[] = [];
  for (const r of normalized) {
    const c = peekResolvedMeta(r.mediaType, r.tmdbId);
    if (c) out.push(c);
  }
  return out;
}
