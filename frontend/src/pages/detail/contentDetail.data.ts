// frontend/src/pages/detail/contentDetail.data.ts
import { apiGet } from "../../lib/apiClient";
import {
  requestResolvedMeta,
  type MediaType as MetaMediaType,
} from "../../lib/metaClient";

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

  // backend meta가 내려주면 채워서 UI에서 사용 가능
  kr_release_date?: string;
  kr_first_release_date?: string;

  is_rerelease_kr?: boolean;

  kobis_movie_cd?: string | null;
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

export async function tmdbDirect<T>(
  path: string,
  params: Record<string, string> = {},
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

/* =========================
   backend proxy helper
========================= */

async function apiGetOrNull<T>(
  path: string,
  params?: Record<string, any>,
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
   ✅ Detail Safe Fetch
   - TMDB detail은 그대로 가져오고
   - ✅ 백엔드 Meta(단일 소스)로 KR 날짜/재개봉 여부를 “가능하면” 보강
========================= */

export async function fetchDetailSafe(
  mediaType: MediaType,
  id: number,
): Promise<DetailBase | null> {
  let detail: DetailBase | null = null;

  // 1) TMDB detail (ko -> en fallback)
  if (TMDB_API_KEY) {
    const ko = await tmdbDirect<DetailBase>(`/${mediaType}/${id}`, {
      language: "ko-KR",
    });
    if (ko?.id) detail = ko;
    else {
      const en = await tmdbDirect<DetailBase>(`/${mediaType}/${id}`, {
        language: "en-US",
      });
      detail = en?.id ? en : null;
    }
  } else {
    const r1 = await apiGetOrNull<DetailBase>(
      backendProxyPath(`${mediaType}/${id}`),
      { language: "ko-KR" },
    );
    if (r1?.id) detail = r1;
    else {
      const r2 = await apiGetOrNull<DetailBase>(
        backendProxyPath(`${mediaType}/${id}`),
        { language: "en-US" },
      );
      detail = r2?.id ? r2 : null;
    }
  }

  if (!detail?.id) return null;

  // 2) ✅ 백엔드 Meta 보강(가능하면)
  try {
    const meta = await requestResolvedMeta(mediaType as MetaMediaType, id);
    if (meta && mediaType === "movie") {
      const first = String(meta.theatrical?.originalTheatricalDate ?? "").slice(
        0,
        10,
      );
      const rerun = String(meta.theatrical?.rerunTheatricalDate ?? "").slice(
        0,
        10,
      );

      if (first) detail.kr_first_release_date = first;
      if (rerun) detail.kr_release_date = rerun;

      detail.is_rerelease_kr = meta.statusKind === "rerun";
    }
  } catch {
    // ignore
  }

  return detail;
}

/* =========================
   Trailer / Providers / Age
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

  if (TMDB_API_KEY) {
    for (const lang of ["ko-KR", "en-US"]) {
      const json = await tmdbDirect<TmdbVideosResponse>(
        `/${mediaType}/${id}/videos`,
        { language: lang },
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
    { language: "ko-KR" },
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

  if (TMDB_API_KEY) {
    const json = await tmdbDirect<WatchProvidersResponse>(
      `/${mediaType}/${id}/watch/providers`,
    );
    const kr = json?.results?.KR ?? null;
    _providersCache.set(k, kr);
    return kr;
  }

  const json = await apiGetOrNull<WatchProvidersResponse>(
    backendProxyPath(`${mediaType}/${id}/watch/providers`),
  );
  const kr = json?.results?.KR ?? null;
  _providersCache.set(k, kr);
  return kr;
}

function normalizeRatingToAge(raw: string | undefined | null, adult?: boolean) {
  if (adult) return 19;

  const origin = (raw ?? "").trim();
  const r = origin.toUpperCase();
  if (!r) return 0;

  const kr = origin.replace(/\s+/g, "");
  if (kr.includes("전체")) return 0;
  if (kr.includes("12")) return 12;
  if (kr.includes("15")) return 15;
  if (kr.includes("청소년") || kr.includes("관람불가") || kr.includes("제한"))
    return 19;

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

export async function fetchAge(
  mediaType: MediaType,
  id: number,
  adult?: boolean,
) {
  const k = `${mediaType}:${id}:age`;
  if (_ageCache.has(k)) return _ageCache.get(k)!;

  try {
    if (mediaType === "movie") {
      const raw = await apiGetOrNull<any>(
        backendProxyPath(`movie/${id}/release_dates`),
      );

      const row = (raw?.results ?? []).find((r: any) => r.iso_3166_1 === "KR");
      const sorted = Array.isArray(row?.release_dates)
        ? [...row.release_dates].sort((a, b) => (a.type ?? 99) - (b.type ?? 99))
        : [];

      const cert =
        sorted.find(
          (x: any) => String(x?.certification ?? "").trim().length > 0,
        )?.certification ?? "";

      const age = normalizeRatingToAge(cert, adult);
      _ageCache.set(k, age);
      return age;
    }

    const tvJson = await apiGetOrNull<TmdbTvContentRatingsResponse>(
      backendProxyPath(`tv/${id}/content_ratings`),
    );
    const rating =
      (tvJson?.results ?? []).find((r) => r.iso_3166_1 === "KR")?.rating ?? "";

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
   ORIGINAL / ONLY (기존 유지)
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
  providersKR: WatchProviderRegion | null,
): ProviderItem[] {
  if (!providersKR) return [];
  const list = mergeUnique([
    ...(providersKR.flatrate ?? []),
    ...(providersKR.free ?? []),
    ...(providersKR.ads ?? []),
  ]);
  if (list.length) return list;

  return mergeUnique([
    ...(providersKR.flatrate ?? []),
    ...(providersKR.free ?? []),
    ...(providersKR.ads ?? []),
    ...(providersKR.rent ?? []),
    ...(providersKR.buy ?? []),
  ]);
}

export function detectOriginalProvider(
  detail: DetailBase,
  providersKR: WatchProviderRegion | null,
): ProviderItem | null {
  const pool = [
    ...(detail.networks ?? []).map((x) => x?.name),
    ...(detail.production_companies ?? []).map((x) => x?.name),
  ]
    .filter(Boolean)
    .map((x) => String(x));

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
      (p) => brandKeyFromName(p.provider_name) === key && !!p.logo_path,
    ) ??
    candidates.find((p) => brandKeyFromName(p.provider_name) === key) ??
    null;

  if (hit) return hit;

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
