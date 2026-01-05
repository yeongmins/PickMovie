// frontend/src/pages/detail/contentDetail.data.ts
import { apiGet } from "../../lib/apiClient";

export type MediaType = "movie" | "tv";

export type TmdbGenre = { id: number; name: string };

export type DetailBase = {
  id: number;
  media_type?: MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;

  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;

  vote_average?: number;
  vote_count?: number;

  release_date?: string;
  first_air_date?: string;

  runtime?: number;
  episode_run_time?: number[];

  genres?: TmdbGenre[];

  adult?: boolean;

  production_companies?: Array<{ id?: number; name: string }>;
  networks?: Array<{ id?: number; name: string }>;

  last_air_date?: string;
  seasons?: Array<{
    season_number?: number;
    air_date?: string;
    poster_path?: string | null;
  }>;
};

export type ProviderItem = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

export type WatchProviderRegion = {
  link?: string;
  flatrate?: ProviderItem[];
  rent?: ProviderItem[];
  buy?: ProviderItem[];
  free?: ProviderItem[];
  ads?: ProviderItem[];
};

type WatchProvidersResponse = {
  results?: Record<string, WatchProviderRegion>;
};

type TmdbVideosResponse = {
  results?: Array<{
    key: string;
    site: string;
    type: string;
    name?: string;
    official?: boolean;
    iso_639_1?: string;
    iso_3166_1?: string;
  }>;
};

type TmdbReleaseDatesResponse = {
  results?: Array<{
    iso_3166_1: string;
    release_dates: Array<{
      certification: string;
      type: number;
      release_date: string;
    }>;
  }>;
};

type TmdbTvContentRatingsResponse = {
  results?: Array<{
    iso_3166_1: string;
    rating: string;
  }>;
};

/* =========================
   TMDB Direct (frontend)
========================= */

const TMDB_API_KEY = (import.meta as any)?.env?.VITE_TMDB_API_KEY as
  | string
  | undefined;

const TMDB_DIRECT_BASE_RAW = (import.meta as any)?.env?.VITE_TMDB_BASE_URL as
  | string
  | undefined;

const TMDB_DIRECT_BASE = (
  TMDB_DIRECT_BASE_RAW || "https://api.themoviedb.org/3"
)
  .trim()
  .replace(/\/+$/, "");

const DIRECT_FIRST = !!TMDB_API_KEY;

export async function tmdbDirect<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  if (!TMDB_API_KEY) return null;
  try {
    const url = new URL(`${TMDB_DIRECT_BASE}${path}`);
    url.searchParams.set("api_key", TMDB_API_KEY);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* =========================
   Helpers
========================= */

export function normalizeMediaType(v: unknown): MediaType {
  return v === "tv" ? "tv" : "movie";
}

export function isAnime(genres?: TmdbGenre[]) {
  if (!genres?.length) return false;
  return genres.some((g) => {
    const n = (g?.name ?? "").toLowerCase();
    return n.includes("애니") || n.includes("animation") || n.includes("anime");
  });
}

function cleanDate(v?: string) {
  const s = (v ?? "").trim();
  return s.length ? s : "";
}

function tvLatestSeasonYear(detail: DetailBase) {
  const seasons = Array.isArray(detail.seasons) ? detail.seasons : [];
  const filtered = seasons
    .filter((s) => typeof s?.season_number === "number" && s.season_number > 0)
    .filter((s) => !!cleanDate(s.air_date));

  if (filtered.length) {
    filtered.sort((a, b) => (b.season_number ?? 0) - (a.season_number ?? 0));
    const d = cleanDate(filtered[0]?.air_date);
    if (d) return String(d).slice(0, 4);
  }

  const d2 =
    cleanDate(detail.last_air_date) || cleanDate(detail.first_air_date);
  return d2 ? String(d2).slice(0, 4) : "";
}

export function yearTextFrom(detail: DetailBase, mediaType: MediaType) {
  if (mediaType === "tv") {
    const y = tvLatestSeasonYear(detail);
    return y && /^\d{4}$/.test(y) ? y : "";
  }

  const d = cleanDate(detail.release_date);
  const y = d ? Number(String(d).slice(0, 4)) : NaN;
  return Number.isFinite(y) ? String(y) : "";
}

function toDateOnly(v?: string) {
  const s = cleanDate(v);
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function normalizeRatingToAge(raw: string | undefined | null, adult?: boolean) {
  if (adult) return 19;
  const r = (raw ?? "").trim().toUpperCase();
  if (!r) return 0;

  if (r === "ALL" || r === "0" || r === "G") return 0;
  if (r === "7" || r === "PG") return 7;
  if (r === "12" || r === "PG-13" || r === "TV-PG") return 12;
  if (r === "15" || r === "TV-14") return 15;

  if (
    r === "18" ||
    r === "19" ||
    r === "R" ||
    r === "NC-17" ||
    r === "TV-MA" ||
    r.includes("18") ||
    r.includes("19")
  )
    return 19;

  const m = r.match(/\d{1,2}/)?.[0];
  if (m) {
    const n = Number(m);
    if (n >= 19) return 19;
    if (n >= 18) return 19;
    if (n >= 15) return 15;
    if (n >= 12) return 12;
    if (n >= 7) return 7;
    return 0;
  }

  return 0;
}

/* =========================
   Backend helper
========================= */

async function apiGetOrNull<T>(
  path: string,
  params?: Record<string, any>
): Promise<T | null> {
  try {
    return await apiGet<T>(path, params);
  } catch {
    return null;
  }
}

function backendProxyPath(path: string) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `/tmdb/proxy/${p}`;
}

/* =========================
   Detail Safe Fetch
========================= */

export async function fetchDetailSafe(
  mediaType: MediaType,
  id: number
): Promise<DetailBase | null> {
  if (DIRECT_FIRST) {
    const ko = await tmdbDirect<DetailBase>(`/${mediaType}/${id}`, {
      language: "ko-KR",
    });
    if (ko?.id) return ko;

    const en = await tmdbDirect<DetailBase>(`/${mediaType}/${id}`, {
      language: "en-US",
    });
    return en?.id ? en : null;
  }

  const r1 = await apiGetOrNull<DetailBase>(
    backendProxyPath(`${mediaType}/${id}`),
    { language: "ko-KR" }
  );
  if (r1?.id) return r1;

  const r2 = await apiGetOrNull<DetailBase>(
    backendProxyPath(`${mediaType}/${id}`),
    { language: "en-US" }
  );
  return r2?.id ? r2 : null;
}

/* =========================
   Caches
========================= */

const _trailerCache = new Map<string, string | null>();
const _providersCache = new Map<string, WatchProviderRegion | null>();
const _ageCache = new Map<string, number>();

export async function fetchTrailerKey(mediaType: MediaType, id: number) {
  const k = `${mediaType}:${id}`;
  if (_trailerCache.has(k)) return _trailerCache.get(k) ?? null;

  const score = (v: any) => {
    let s = 0;
    const t = String(v.type ?? "").toLowerCase();
    const ko = v.iso_639_1 === "ko";
    const official = !!v.official;
    if (t.includes("trailer")) s += 100;
    if (t.includes("teaser")) s += 40;
    if (official) s += 25;
    if (ko) s += 30;
    return s;
  };

  if (DIRECT_FIRST) {
    for (const lang of ["ko-KR", "en-US"]) {
      const json = await tmdbDirect<TmdbVideosResponse>(
        `/${mediaType}/${id}/videos`,
        { language: lang }
      );
      const list = (json?.results ?? []).filter((v) => v.site === "YouTube");
      list.sort((a, b) => score(b) - score(a));
      const key = list[0]?.key ?? null;
      if (key) {
        _trailerCache.set(k, key);
        return key;
      }
    }
    _trailerCache.set(k, null);
    return null;
  }

  const data = await apiGetOrNull<TmdbVideosResponse>(
    `/tmdb/videos/${mediaType}/${id}`,
    { language: "ko-KR" }
  );
  const list = (data?.results ?? []).filter((v) => v.site === "YouTube");
  list.sort((a, b) => score(b) - score(a));
  const key = list[0]?.key ?? null;

  _trailerCache.set(k, key);
  return key;
}

export async function fetchProvidersKR(mediaType: MediaType, id: number) {
  const k = `${mediaType}:${id}:KR`;
  if (_providersCache.has(k)) return _providersCache.get(k) ?? null;

  if (DIRECT_FIRST) {
    const json = await tmdbDirect<WatchProvidersResponse>(
      `/${mediaType}/${id}/watch/providers`
    );
    const kr = json?.results?.KR ?? null;
    _providersCache.set(k, kr);
    return kr;
  }

  const json = await apiGetOrNull<WatchProvidersResponse>(
    backendProxyPath(`${mediaType}/${id}/watch/providers`)
  );
  const kr = json?.results?.KR ?? null;
  _providersCache.set(k, kr);
  return kr;
}

export async function fetchAge(
  mediaType: MediaType,
  id: number,
  adult?: boolean
) {
  const k = `${mediaType}:${id}:age`;
  if (_ageCache.has(k)) return _ageCache.get(k)!;

  try {
    if (mediaType === "movie") {
      if (DIRECT_FIRST) {
        const json = await tmdbDirect<TmdbReleaseDatesResponse>(
          `/movie/${id}/release_dates`
        );

        const pick = (country: string) => {
          const row = (json?.results ?? []).find(
            (r) => r.iso_3166_1 === country
          );
          if (!row?.release_dates?.length) return "";
          const sorted = [...row.release_dates].sort(
            (a, b) => (a.type ?? 99) - (b.type ?? 99)
          );
          return (
            sorted.find((x) => (x.certification ?? "").trim().length > 0)
              ?.certification ?? ""
          );
        };

        const cert = pick("KR") || pick("US") || pick("JP") || "";
        const age = normalizeRatingToAge(cert, adult);
        _ageCache.set(k, age);
        return age;
      }

      const data = await apiGetOrNull<TmdbReleaseDatesResponse>(
        backendProxyPath(`movie/${id}/release_dates`)
      );
      const pick = (country: string) => {
        const row = (data?.results ?? []).find((r) => r.iso_3166_1 === country);
        if (!row?.release_dates?.length) return "";
        const sorted = [...row.release_dates].sort(
          (a, b) => (a.type ?? 99) - (b.type ?? 99)
        );
        return (
          sorted.find((x) => (x.certification ?? "").trim().length > 0)
            ?.certification ?? ""
        );
      };

      const cert = pick("KR") || pick("US") || pick("JP") || "";
      const age = normalizeRatingToAge(cert, adult);
      _ageCache.set(k, age);
      return age;
    }

    if (DIRECT_FIRST) {
      const tvJson = await tmdbDirect<TmdbTvContentRatingsResponse>(
        `/tv/${id}/content_ratings`
      );
      const pickTv = (country: string) =>
        (tvJson?.results ?? []).find((r) => r.iso_3166_1 === country)?.rating ??
        "";
      const rating = pickTv("KR") || pickTv("US") || pickTv("JP") || "";
      const age = normalizeRatingToAge(rating, adult);
      _ageCache.set(k, age);
      return age;
    }

    const tvData = await apiGetOrNull<TmdbTvContentRatingsResponse>(
      backendProxyPath(`tv/${id}/content_ratings`)
    );
    const pickTv = (country: string) =>
      (tvData?.results ?? []).find((r) => r.iso_3166_1 === country)?.rating ??
      "";
    const rating = pickTv("KR") || pickTv("US") || pickTv("JP") || "";
    const age = normalizeRatingToAge(rating, adult);
    _ageCache.set(k, age);
    return age;
  } catch {
    const fallback = normalizeRatingToAge("", adult);
    _ageCache.set(k, fallback);
    return fallback;
  }
}

/* =========================
   ORIGINAL vs ONLY(독점)
   - ORIGINAL: detail.networks / production_companies 에 OTT 단서가 있을 때만
   - ONLY: 국내 스트리밍 제공처(주로 flatrate/free/ads)가 사실상 1개일 때
========================= */

function norm(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

const OTT_BRANDS = [
  { key: "netflix", tokens: ["netflix"] },
  { key: "disney", tokens: ["disney+", "disney plus", "disney"] },
  { key: "prime", tokens: ["amazon prime video", "prime video", "amazon"] },
  { key: "apple", tokens: ["apple tv+", "apple tv plus", "apple"] },
  { key: "tving", tokens: ["tving"] },
  { key: "wavve", tokens: ["wavve"] },
  { key: "watcha", tokens: ["watcha"] },
  { key: "coupang", tokens: ["coupang play", "coupang"] },
  { key: "laftel", tokens: ["laftel"] },
] as const;

type BrandKey = (typeof OTT_BRANDS)[number]["key"];

function brandKeyFromName(name: string): BrandKey | null {
  const n = norm(name);
  for (const b of OTT_BRANDS) {
    if (b.tokens.some((t) => n.includes(norm(t)))) return b.key;
  }
  return null;
}

function mergeUnique(items: ProviderItem[]) {
  const seen = new Set<number>();
  const out: ProviderItem[] = [];
  for (const p of items) {
    if (!p || typeof p.provider_id !== "number") continue;
    if (seen.has(p.provider_id)) continue;
    seen.add(p.provider_id);
    out.push(p);
  }
  return out;
}

function streamingProviders(
  providersKR: WatchProviderRegion | null
): ProviderItem[] {
  if (!providersKR) return [];
  const list = mergeUnique([
    ...(providersKR.flatrate ?? []),
    ...(providersKR.free ?? []),
    ...(providersKR.ads ?? []),
  ]);
  if (list.length) return list;

  // 스트리밍 정보가 없다면(드문 케이스) 전체로 fallback
  return mergeUnique([
    ...(providersKR.flatrate ?? []),
    ...(providersKR.free ?? []),
    ...(providersKR.ads ?? []),
    ...(providersKR.rent ?? []),
    ...(providersKR.buy ?? []),
  ]);
}

/** ✅ ORIGINAL 판정: (오표기 방지) “단독 제공”만으로는 ORIGINAL로 만들지 않음 */
export function detectOriginalProvider(
  detail: DetailBase,
  providersKR: WatchProviderRegion | null
): ProviderItem | null {
  const pool = [
    ...(detail.networks ?? []).map((x) => x?.name),
    ...(detail.production_companies ?? []).map((x) => x?.name),
  ]
    .filter(Boolean)
    .map((x) => String(x));

  // detail에서 브랜드 단서 찾기
  let key: BrandKey | null = null;
  for (const b of OTT_BRANDS) {
    if (
      pool.some((name) => b.tokens.some((t) => norm(name).includes(norm(t))))
    ) {
      key = b.key;
      break;
    }
  }
  if (!key) return null;

  const candidates = streamingProviders(providersKR);
  const hit =
    candidates.find(
      (p) => brandKeyFromName(p.provider_name) === key && !!p.logo_path
    ) ??
    candidates.find((p) => brandKeyFromName(p.provider_name) === key) ??
    null;

  if (hit) return hit;

  // providers에 없어도 ORIGINAL 자체는 표시(로고는 없을 수 있음)
  const fallbackName =
    key === "netflix"
      ? "Netflix"
      : key === "disney"
      ? "Disney Plus"
      : key === "prime"
      ? "Amazon Prime Video"
      : key === "apple"
      ? "Apple TV+"
      : key === "tving"
      ? "TVING"
      : key === "wavve"
      ? "wavve"
      : key === "watcha"
      ? "WATCHA"
      : key === "coupang"
      ? "Coupang Play"
      : key === "laftel"
      ? "Laftel"
      : "Original";

  return {
    provider_id: -1,
    provider_name: fallbackName,
    logo_path: null,
  };
}

/** ✅ ONLY(독점) 판정: 국내 스트리밍 제공처가 사실상 1개일 때 */
export function detectExclusiveProvider(
  providersKR: WatchProviderRegion | null
): ProviderItem | null {
  const list = streamingProviders(providersKR);
  if (!list.length) return null;

  // 1) 정말 1개면 바로 ONLY
  if (list.length === 1) return list[0] ?? null;

  // 2) 여러 개지만 “브랜드 키”로 묶었을 때 1개(예: Netflix + Netflix Ads 같은 케이스)
  const keys = new Set<BrandKey>();
  for (const p of list) {
    const k = brandKeyFromName(p.provider_name);
    if (k) keys.add(k);
    else {
      // 브랜드로 판별 불가한 제공처가 섞이면 ONLY 오판 가능 → 안전하게 중단
      return null;
    }
  }

  if (keys.size !== 1) return null;

  // 대표 provider 선택 (로고 있는 것 우선)
  const onlyKey = Array.from(keys)[0]!;
  const rep =
    list.find(
      (p) => brandKeyFromName(p.provider_name) === onlyKey && !!p.logo_path
    ) ??
    list.find((p) => brandKeyFromName(p.provider_name) === onlyKey) ??
    null;

  return rep;
}

export function computeTheatricalChip(
  detail: DetailBase,
  mediaType: MediaType,
  isOttLike: boolean
) {
  // ✅ ORIGINAL/ONLY면 극장칩 숨김
  if (isOttLike) return null;
  if (mediaType !== "movie") return null;

  const rd = toDateOnly(detail.release_date);
  if (!rd) return null;

  const today = new Date();
  const diff = daysBetween(today, rd);

  if (diff < 0) return { label: "상영 예정", tone: "dark" as const };
  if (diff >= 0 && diff <= 45)
    return { label: "상영중", tone: "dark" as const };

  return null;
}
