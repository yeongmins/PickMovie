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

  /** ✅ 표시용 개봉일: 영화는 KR 극장 기준으로 덮어씀 */
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

  /** TMDB 원본(월드/미국 등) release_date 보관 */
  global_release_date?: string;

  /** KR 최신 극장 개봉일 */
  kr_release_date?: string;

  /** KR 첫 극장 개봉일 */
  kr_first_release_date?: string;

  /** ✅ KR 기준 재개봉 여부 */
  is_rerelease_kr?: boolean;

  /** ✅ KOBIS 보강값(필요 시 사용) */
  kobis_open_dt?: string;
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

type TmdbReleaseDatesResponse = {
  results?: Array<{
    iso_3166_1: string;
    release_dates: Array<{
      certification: string;
      type: number;
      release_date: string;
      /** ✅ TMDB에 "Re-release" 같은 비고가 들어오는 경우가 있어서 반영 */
      note?: string;
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

// ✅ 시즌 선택 중(DetailModal에서 __seasonNo 주입)에는 "선택한 시즌 연도"를 우선 반환하도록 수정
function tvLatestSeasonYear(detail: DetailBase) {
  // ✅ season= 선택 상태면, 모달에서 덮어쓴 first_air_date(=season air_date)를 우선 사용
  const seasonNo = Number((detail as any)?.__seasonNo ?? 0);
  if (seasonNo > 0) {
    const d = cleanDate(detail.first_air_date) || cleanDate(detail.release_date);
    if (d) return String(d).slice(0, 4);
  }

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

  // ✅ 영화: KR 극장 개봉일 우선 (없으면 KOBIS openDt / release_date)
  const d =
    cleanDate(detail.kr_release_date) ||
    cleanDate(detail.kobis_open_dt) ||
    cleanDate(detail.release_date);
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

  const origin = (raw ?? "").trim();
  const r = origin.toUpperCase();
  if (!r) return 0;

  // ✅ KR 텍스트 인증도 대응
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
   ✅ KOBIS 보강(openDt)
========================= */

type BackendMetaResponse = {
  details?: unknown;
  providers?: unknown;
  ageRating?: string | null;
  kobisOpenDt?: string | null;
  kobisMovieCd?: string | null;
};

const _kobisOpenDtCache = new Map<
  number,
  { kobisOpenDt: string | null; kobisMovieCd: string | null }
>();

async function fetchKobisOpenDtFromBackend(id: number) {
  if (_kobisOpenDtCache.has(id)) return _kobisOpenDtCache.get(id)!;

  const meta = await apiGetOrNull<BackendMetaResponse>(
    `/tmdb/meta/movie/${id}`,
    {
      region: "KR",
      language: "ko-KR",
    }
  );

  const dt = cleanDate(meta?.kobisOpenDt ?? undefined);
  const payload = {
    kobisOpenDt: dt || null,
    kobisMovieCd: meta?.kobisMovieCd ? String(meta.kobisMovieCd) : null,
  };

  _kobisOpenDtCache.set(id, payload);
  return payload;
}

/* =========================
   ✅ KR(한국) 기준: 영화 개봉일/재개봉 판정
========================= */

const THEATRICAL_TYPES = new Set([2, 3]); // limited, theatrical
const RERELEASE_GAP_DAYS = 120; // 같은 시기 limited→wide 오판 방지용

export type KRReleaseMeta = {
  krReleaseDate: string | null; // KR 최신 극장 개봉일
  krFirstReleaseDate: string | null; // KR 첫 극장 개봉일
  isRereleaseKR: boolean;
};

const _movieReleaseDatesRawCache = new Map<
  number,
  TmdbReleaseDatesResponse | null
>();
const _krReleaseMetaCache = new Map<number, KRReleaseMeta | null>();

async function fetchMovieReleaseDatesRaw(
  id: number
): Promise<TmdbReleaseDatesResponse | null> {
  if (_movieReleaseDatesRawCache.has(id)) {
    return _movieReleaseDatesRawCache.get(id) ?? null;
  }

  let raw: TmdbReleaseDatesResponse | null = null;

  if ((import.meta as any)?.env?.VITE_TMDB_API_KEY) {
    raw = await tmdbDirect<TmdbReleaseDatesResponse>(
      `/movie/${id}/release_dates`
    );
  } else {
    raw = await apiGetOrNull<TmdbReleaseDatesResponse>(
      backendProxyPath(`movie/${id}/release_dates`)
    );
  }

  _movieReleaseDatesRawCache.set(id, raw ?? null);
  return raw ?? null;
}

function normalizeNote(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function isRereleaseNote(v: unknown) {
  const s = normalizeNote(v);
  if (!s) return false;
  return (
    s.includes("re-release") ||
    s.includes("rerelease") ||
    s.includes("re release") ||
    s.includes("재개봉")
  );
}

function pickKRTheatricalDates(raw: TmdbReleaseDatesResponse | null): string[] {
  const row = (raw?.results ?? []).find((r) => r.iso_3166_1 === "KR");
  const list = (row?.release_dates ?? [])
    .filter((x) => !!x?.release_date && THEATRICAL_TYPES.has(x.type))
    .map((x) => String(x.release_date).slice(0, 10))
    .filter(Boolean)
    .sort();

  const uniq: string[] = [];
  for (const d of list) {
    if (!uniq.length || uniq[uniq.length - 1] !== d) uniq.push(d);
  }
  return uniq;
}

function hasKRReReleaseNote(raw: TmdbReleaseDatesResponse | null) {
  const row = (raw?.results ?? []).find((r) => r.iso_3166_1 === "KR");
  return (row?.release_dates ?? []).some(
    (x) => THEATRICAL_TYPES.has(x.type) && isRereleaseNote(x.note)
  );
}

function daysBetweenYMD(aYmd: string, bYmd: string) {
  const a = new Date(aYmd + "T00:00:00Z").getTime();
  const b = new Date(bYmd + "T00:00:00Z").getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

export async function fetchMovieKRReleaseMeta(
  id: number
): Promise<KRReleaseMeta | null> {
  if (_krReleaseMetaCache.has(id)) return _krReleaseMetaCache.get(id) ?? null;

  const raw = await fetchMovieReleaseDatesRaw(id);
  const dates = pickKRTheatricalDates(raw);

  if (!dates.length) {
    _krReleaseMetaCache.set(id, null);
    return null;
  }

  const first = dates[0]!;
  const latest = dates[dates.length - 1]!;
  const gap = daysBetweenYMD(first, latest);

  const meta: KRReleaseMeta = {
    krReleaseDate: latest,
    krFirstReleaseDate: first,
    isRereleaseKR:
      hasKRReReleaseNote(raw) ||
      (dates.length >= 2 && gap >= RERELEASE_GAP_DAYS),
  };

  _krReleaseMetaCache.set(id, meta);
  return meta;
}

/* =========================
   Detail Safe Fetch
========================= */

export async function fetchDetailSafe(
  mediaType: MediaType,
  id: number
): Promise<DetailBase | null> {
  let detail: DetailBase | null = null;

  if ((import.meta as any)?.env?.VITE_TMDB_API_KEY) {
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
      { language: "ko-KR" }
    );
    if (r1?.id) detail = r1;
    else {
      const r2 = await apiGetOrNull<DetailBase>(
        backendProxyPath(`${mediaType}/${id}`),
        { language: "en-US" }
      );
      detail = r2?.id ? r2 : null;
    }
  }

  if (!detail?.id) return null;

  if (mediaType === "movie") {
    const global = cleanDate(detail.release_date);
    if (global) detail.global_release_date = global;

    const kobis = await fetchKobisOpenDtFromBackend(id);
    if (kobis?.kobisOpenDt) {
      detail.kobis_open_dt = kobis.kobisOpenDt;
      detail.kobis_movie_cd = kobis.kobisMovieCd ?? null;
    }

    const meta = await fetchMovieKRReleaseMeta(id);

    if (meta?.krReleaseDate) {
      detail.kr_release_date = meta.krReleaseDate;
      detail.kr_first_release_date =
        meta.krFirstReleaseDate ??
        (kobis?.kobisOpenDt ? kobis.kobisOpenDt : undefined);

      detail.is_rerelease_kr = meta.isRereleaseKR;
      detail.release_date = meta.krReleaseDate;
    } else if (kobis?.kobisOpenDt) {
      detail.kr_release_date = kobis.kobisOpenDt;
      detail.kr_first_release_date = kobis.kobisOpenDt;
      detail.is_rerelease_kr = false;
      detail.release_date = kobis.kobisOpenDt;
    } else {
      detail.is_rerelease_kr = false;
    }
  }

  return detail;
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

  if ((import.meta as any)?.env?.VITE_TMDB_API_KEY) {
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

  if ((import.meta as any)?.env?.VITE_TMDB_API_KEY) {
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
      const raw = await fetchMovieReleaseDatesRaw(id);

      const pickKR = () => {
        const row = (raw?.results ?? []).find((r) => r.iso_3166_1 === "KR");
        if (!row?.release_dates?.length) return "";
        const sorted = [...row.release_dates].sort(
          (a, b) => (a.type ?? 99) - (b.type ?? 99)
        );
        return (
          sorted.find((x) => (x.certification ?? "").trim().length > 0)
            ?.certification ?? ""
        );
      };

      const cert = pickKR() || "";
      const age = normalizeRatingToAge(cert, adult);
      _ageCache.set(k, age);
      return age;
    }

    if ((import.meta as any)?.env?.VITE_TMDB_API_KEY) {
      const tvJson = await tmdbDirect<TmdbTvContentRatingsResponse>(
        `/tv/${id}/content_ratings`
      );
      const pickTvKR = () =>
        (tvJson?.results ?? []).find((r) => r.iso_3166_1 === "KR")?.rating ??
        "";
      const rating = pickTvKR() || "";
      const age = normalizeRatingToAge(rating, adult);
      _ageCache.set(k, age);
      return age;
    }

    const tvData = await apiGetOrNull<TmdbTvContentRatingsResponse>(
      backendProxyPath(`tv/${id}/content_ratings`)
    );
    const pickTvKR = () =>
      (tvData?.results ?? []).find((r) => r.iso_3166_1 === "KR")?.rating ?? "";
    const rating = pickTvKR() || "";
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
========================= */
// (이하 원본 그대로)
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
  providersKR: WatchProviderRegion | null
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
      (p) => brandKeyFromName(p.provider_name) === key && !!p.logo_path
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

export function detectExclusiveProvider(
  providersKR: WatchProviderRegion | null
): ProviderItem | null {
  const list = streamingProviders(providersKR);
  if (!list.length) return null;

  if (list.length === 1) return list[0] ?? null;

  const keys = new Set<BrandKey>();
  for (const p of list) {
    const k = brandKeyFromName(p.provider_name);
    if (k) keys.add(k);
    else {
      return null;
    }
  }

  if (keys.size !== 1) return null;

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
  if (isOttLike) return null;
  if (mediaType !== "movie") return null;

  const rd = toDateOnly(
    detail.kr_release_date || detail.kobis_open_dt || detail.release_date
  );
  if (!rd) return null;

  const today = new Date();
  const diff = daysBetween(today, rd);

  const isRerelease = !!detail.is_rerelease_kr;

  if (diff < 0) {
    return {
      label: isRerelease ? "재개봉 예정" : "상영 예정",
      tone: "dark" as const,
    };
  }

  if (diff >= 0 && diff <= 45) {
    return { label: isRerelease ? "재개봉" : "상영중", tone: "dark" as const };
  }

  return null;
}
