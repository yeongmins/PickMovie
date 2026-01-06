// frontend/src/lib/contentMeta.ts
import { apiGet } from "./apiClient";
import { getTVDetails } from "./tmdb";

/**
 * ✅ 컨텐츠 카드 / 상세페이지 / 메인 캐러셀에서
 * 출시년도, 상영중/상영예정/재개봉 판단을 "무조건 동일"하게 만들기 위한 단일 소스
 */

export type MediaType = "movie" | "tv";

export type ReleaseStatusKind = "now" | "upcoming" | "rerun";

export type ScreeningSets = {
  nowPlaying: Set<number>;
  upcoming: Set<number>;
  fetchedAt: number;
};

let screeningCache: ScreeningSets | null = null;
let screeningInFlight: Promise<ScreeningSets> | null = null;

export function peekScreeningSets(): ScreeningSets | null {
  return screeningCache;
}

export async function loadScreeningSets(): Promise<ScreeningSets> {
  const OK_TTL = 30 * 60 * 1000;
  const now = Date.now();

  if (screeningCache && now - screeningCache.fetchedAt < OK_TTL) {
    return screeningCache;
  }
  if (screeningInFlight) return screeningInFlight;

  const PAGES = 5;

  screeningInFlight = (async () => {
    const pages = Array.from({ length: PAGES }, (_, i) => i + 1);

    // ✅ KR/ko-KR 고정: 카드/캐러셀/상세가 같은 기준을 보게 함
    const [nowPlayingResList, upcomingResList] = await Promise.all([
      Promise.all(
        pages.map((page) =>
          apiGet<{ results: Array<{ id: number }> }>("/movies/now_playing", {
            page,
            region: "KR",
            language: "ko-KR",
          }).catch(() => ({ results: [] }))
        )
      ),
      Promise.all(
        pages.map((page) =>
          apiGet<{ results: Array<{ id: number }> }>("/movies/upcoming", {
            page,
            region: "KR",
            language: "ko-KR",
          }).catch(() => ({ results: [] }))
        )
      ),
    ]);

    const nowSet = new Set<number>();
    const upSet = new Set<number>();

    for (const r of nowPlayingResList) {
      for (const it of r?.results ?? []) {
        if (typeof it?.id === "number") nowSet.add(it.id);
      }
    }
    for (const r of upcomingResList) {
      for (const it of r?.results ?? []) {
        if (typeof it?.id === "number") upSet.add(it.id);
      }
    }

    screeningCache = {
      nowPlaying: nowSet,
      upcoming: upSet,
      fetchedAt: Date.now(),
    };
    screeningInFlight = null;
    return screeningCache;
  })().catch((e) => {
    screeningInFlight = null;
    throw e;
  });

  return screeningInFlight;
}

const TMDB_API_KEY = (import.meta as any)?.env?.VITE_TMDB_API_KEY as
  | string
  | undefined;

const TMDB_DIRECT_BASE =
  (import.meta as any)?.env?.VITE_TMDB_BASE_URL ||
  "https://api.themoviedb.org/3";

const ottOnlyCache = new Map<string, boolean>();
const ottOnlyInFlight = new Map<string, Promise<boolean>>();

export function peekOttOnlyMovie(
  id: number,
  region: string = "KR"
): boolean | undefined {
  return ottOnlyCache.get(`${id}:${region}`);
}

async function tmdbDirectFetch(path: string) {
  if (!TMDB_API_KEY) return null;
  const url = new URL(`${TMDB_DIRECT_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return await res.json();
}

/**
 * ✅ “상영중 목록에 들어있지만” 실제론 디지털만(극장개봉 없음)인 케이스 방지용
 * (기존 로직 유지)
 */
export async function isOttOnlyMovie(
  id: number,
  region: string = "KR"
): Promise<boolean> {
  if (!TMDB_API_KEY) return false;

  const key = `${id}:${region}`;
  if (ottOnlyCache.has(key)) return ottOnlyCache.get(key)!;

  const inflight = ottOnlyInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    const json = await tmdbDirectFetch(`/movie/${id}/release_dates`);
    const results = Array.isArray(json?.results) ? json.results : [];
    const block = results.find((r: any) => r?.iso_3166_1 === region);
    const dates = Array.isArray(block?.release_dates)
      ? block.release_dates
      : [];

    const types: number[] = dates
      .map((d: any) => d?.type)
      .filter((t: any) => typeof t === "number");

    const hasTheatrical = types.some((t) => t === 2 || t === 3);
    const hasDigital = types.some((t) => t === 4);

    const ottOnly = !hasTheatrical && hasDigital;
    ottOnlyCache.set(key, ottOnly);
    return ottOnly;
  })()
    .catch(() => {
      ottOnlyCache.set(key, false);
      return false;
    })
    .finally(() => {
      ottOnlyInFlight.delete(key);
    });

  ottOnlyInFlight.set(key, p);
  return p;
}

/* =========================================================
   ✅ Year: 단일 소스용 유틸
   - "YYYY-..." 형태면 앞 4자리 그대로 사용 (타임존 이슈 방지)
   ========================================================= */

export function yearFromDate(d?: string | null | undefined) {
  const s = String(d || "").trim();
  if (!s) return "";

  const m = s.match(/^(\d{4})/);
  if (m) return m[1];

  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";

  const y = new Date(t).getUTCFullYear();
  return Number.isFinite(y) ? String(y) : "";
}

/* =========================================================
   ✅ Movie rerun info (KR 극장 개봉일 리스트 기반)
   - 재개봉 조건: "극장 개봉일 2회 이상" + "최초~최신 7개월 이상"
   - 재개봉일(표시용): KR 최신 극장 개봉일(YYYY-MM-DD)
   ========================================================= */

type TmdbReleaseDateItem = { release_date?: string; type?: number };
type TmdbReleaseDatesResult = {
  iso_3166_1?: string;
  release_dates?: TmdbReleaseDateItem[];
};
type TmdbReleaseDatesResponse = { results?: TmdbReleaseDatesResult[] };

export type MovieRerunInfo = {
  hasMultipleTheatrical: boolean;
  originalTheatricalDate: string; // YYYY-MM-DD (KR)
  rerunTheatricalDate: string; // YYYY-MM-DD (KR 최신)
};

type MovieRerunInfoPayload = MovieRerunInfo & {
  fetchedAt: number;
  isError?: boolean;
};

const movieRerunInfoCache = new Map<string, MovieRerunInfoPayload>();
const movieRerunInfoInFlight = new Map<
  string,
  Promise<MovieRerunInfoPayload>
>();

function toYmd(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function extractKrTheatricalDates(
  res: TmdbReleaseDatesResponse | null,
  region: string
): string[] {
  const list = Array.isArray(res?.results) ? res!.results! : [];
  const bucket =
    list.find(
      (x) => String(x?.iso_3166_1 || "").toUpperCase() === region.toUpperCase()
    ) ?? null;

  const dates = Array.isArray(bucket?.release_dates)
    ? bucket!.release_dates!
    : [];

  // TMDB type: 2(Theatrical limited), 3(Theatrical)
  const theatrical = dates
    .filter((d) => {
      const t = Number(d?.type);
      return t === 2 || t === 3;
    })
    .map((d) => toYmd(d?.release_date))
    .filter(Boolean);

  const uniq = Array.from(new Set(theatrical));
  uniq.sort((a, b) => a.localeCompare(b)); // YYYY-MM-DD
  return uniq;
}

function diffFullMonths(fromYmd?: string, toYmd?: string): number {
  const a = new Date(String(fromYmd || "").slice(0, 10));
  const b = new Date(String(toYmd || "").slice(0, 10));
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0;

  let months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}

export function isMovieRerunGapQualified(
  info: MovieRerunInfo | null | undefined,
  minMonths = 7
) {
  if (!info?.hasMultipleTheatrical) return false;
  const m = diffFullMonths(
    info.originalTheatricalDate,
    info.rerunTheatricalDate
  );
  return m >= minMonths;
}

export function peekMovieRerunInfo(
  id: number,
  region: string = "KR"
): MovieRerunInfo | null {
  const v = movieRerunInfoCache.get(`${id}:${region.toUpperCase()}`);
  if (!v) return null;
  return {
    hasMultipleTheatrical: v.hasMultipleTheatrical,
    originalTheatricalDate: v.originalTheatricalDate,
    rerunTheatricalDate: v.rerunTheatricalDate,
  };
}

export async function loadMovieRerunInfo(
  id: number,
  region: string = "KR"
): Promise<MovieRerunInfo> {
  const key = `${id}:${region.toUpperCase()}`;
  const now = Date.now();

  const OK_TTL = 7 * 24 * 60 * 60 * 1000;
  const ERROR_TTL = 60 * 1000;

  const cached = movieRerunInfoCache.get(key);
  if (cached) {
    const ttl = cached.isError ? ERROR_TTL : OK_TTL;
    if (now - cached.fetchedAt < ttl) {
      return {
        hasMultipleTheatrical: cached.hasMultipleTheatrical,
        originalTheatricalDate: cached.originalTheatricalDate,
        rerunTheatricalDate: cached.rerunTheatricalDate,
      };
    }
  }

  const inflight = movieRerunInfoInFlight.get(key);
  if (inflight) {
    const v = await inflight;
    return {
      hasMultipleTheatrical: v.hasMultipleTheatrical,
      originalTheatricalDate: v.originalTheatricalDate,
      rerunTheatricalDate: v.rerunTheatricalDate,
    };
  }

  const p = (async () => {
    try {
      const res = await apiGet<TmdbReleaseDatesResponse>(
        `/tmdb/proxy/movie/${id}/release_dates`
      );
      const theatricalDates = extractKrTheatricalDates(res, region);

      const payload: MovieRerunInfoPayload = {
        hasMultipleTheatrical: theatricalDates.length >= 2,
        originalTheatricalDate: theatricalDates[0] ?? "",
        rerunTheatricalDate:
          theatricalDates.length >= 2
            ? theatricalDates[theatricalDates.length - 1] ?? ""
            : "",
        fetchedAt: Date.now(),
        isError: false,
      };

      movieRerunInfoCache.set(key, payload);
      return payload;
    } catch (e) {
      if ((import.meta as any).env?.DEV) {
        console.warn("[contentMeta] rerun info fetch failed:", key, e);
      }
      const payload: MovieRerunInfoPayload = {
        hasMultipleTheatrical: false,
        originalTheatricalDate: "",
        rerunTheatricalDate: "",
        fetchedAt: Date.now(),
        isError: true,
      };
      movieRerunInfoCache.set(key, payload);
      return payload;
    } finally {
      movieRerunInfoInFlight.delete(key);
    }
  })();

  movieRerunInfoInFlight.set(key, p);
  const v = await p;

  return {
    hasMultipleTheatrical: v.hasMultipleTheatrical,
    originalTheatricalDate: v.originalTheatricalDate,
    rerunTheatricalDate: v.rerunTheatricalDate,
  };
}

/* =========================================================
   ✅ Movie rerun year (재개봉 최신 극장 날짜 기반)
   - TMDB /movie/{id}/release_dates 에서 type 2/3 최신 날짜
   ========================================================= */

type MovieRerunYearPayload = {
  year: string; // "2026" 형태, 없으면 ""
  fetchedAt: number;
  isError?: boolean;
};

const movieRerunYearCache = new Map<string, MovieRerunYearPayload>();
const movieRerunYearInFlight = new Map<
  string,
  Promise<MovieRerunYearPayload>
>();

function pickLatestTheatricalReleaseDate(
  json: any,
  region: string
): string | null {
  const results = Array.isArray(json?.results) ? json.results : [];
  const theatricalTypes = new Set<number>([2, 3]); // 극장 개봉 타입
  const nowMs = Date.now() + 86400000; // 미래 값 방지(여유 1일)

  const pickFromBlock = (block: any, allowFuture: boolean): string | null => {
    const dates = Array.isArray(block?.release_dates)
      ? block.release_dates
      : [];
    let bestMs = -1;
    let bestIso: string | null = null;

    for (const d of dates) {
      const type = d?.type;
      const iso = String(d?.release_date || "").trim();
      if (!theatricalTypes.has(type)) continue;
      if (!iso) continue;

      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) continue;
      if (!allowFuture && ms > nowMs) continue;

      if (ms > bestMs) {
        bestMs = ms;
        bestIso = iso;
      }
    }
    return bestIso;
  };

  // 1) KR 블록 우선
  const regionBlock = results.find((r: any) => r?.iso_3166_1 === region);
  if (regionBlock) {
    const a = pickFromBlock(regionBlock, false);
    if (a) return a;
    const b = pickFromBlock(regionBlock, true);
    if (b) return b;
  }

  // 2) 전체에서 최신 극장 날짜
  const pickAll = (allowFuture: boolean) => {
    let bestMs = -1;
    let bestIso: string | null = null;

    for (const block of results) {
      const iso = pickFromBlock(block, allowFuture);
      if (!iso) continue;

      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) continue;

      if (ms > bestMs) {
        bestMs = ms;
        bestIso = iso;
      }
    }
    return bestIso;
  };

  return pickAll(false) ?? pickAll(true);
}

export function peekMovieRerunYear(
  id: number,
  region: string = "KR"
): string | null {
  return movieRerunYearCache.get(`${id}:${region}`)?.year ?? null;
}

export async function loadMovieRerunYear(
  id: number,
  region: string = "KR"
): Promise<string> {
  if (!TMDB_API_KEY) return "";

  const key = `${id}:${region}`;
  const now = Date.now();

  const OK_TTL = 7 * 24 * 60 * 60 * 1000;
  const ERROR_TTL = 60 * 1000;

  const cached = movieRerunYearCache.get(key);
  if (cached) {
    const ttl = cached.isError ? ERROR_TTL : OK_TTL;
    if (now - cached.fetchedAt < ttl) return cached.year;
  }

  const inflight = movieRerunYearInFlight.get(key);
  if (inflight) return (await inflight).year;

  const p = (async () => {
    const json = await tmdbDirectFetch(`/movie/${id}/release_dates`);
    const latestIso = pickLatestTheatricalReleaseDate(json, region);
    const year = latestIso ? yearFromDate(latestIso) : "";

    const safe: MovieRerunYearPayload = {
      year: year || "",
      fetchedAt: Date.now(),
      isError: false,
    };
    movieRerunYearCache.set(key, safe);
    return safe;
  })()
    .catch((e) => {
      if ((import.meta as any).env?.DEV) {
        console.warn("[contentMeta] rerun year fetch failed:", key, e);
      }
      const safe: MovieRerunYearPayload = {
        year: "",
        fetchedAt: Date.now(),
        isError: true,
      };
      movieRerunYearCache.set(key, safe);
      return safe;
    })
    .finally(() => {
      movieRerunYearInFlight.delete(key);
    });

  movieRerunYearInFlight.set(key, p);
  return (await p).year;
}

/* =========================================================
   ✅ TV latest year + poster (최신 시즌)
   ========================================================= */

export function pickLatestSeason(seasons: any[]): any | null {
  const list = (Array.isArray(seasons) ? seasons : [])
    .filter((s) => typeof s?.season_number === "number" && s.season_number > 0)
    .map((s) => {
      const t = Date.parse(String(s?.air_date || "").trim());
      const date = Number.isFinite(t) ? t : -1;
      const sn = typeof s?.season_number === "number" ? s.season_number : -1;
      return { s, date, sn };
    })
    .sort((a, b) => {
      if (b.date !== a.date) return b.date - a.date;
      return b.sn - a.sn;
    });

  return list[0]?.s ?? null;
}

export type TvLatestPayload = {
  posterPath: string | null;
  year: string; // (캐시 내부값은 "" 가능)
  fetchedAt: number;
  isError?: boolean;
};

const tvLatestCache = new Map<string, TvLatestPayload>();
const tvLatestInFlight = new Map<string, Promise<TvLatestPayload>>();

export function peekTvLatest(id: number): TvLatestPayload | null {
  return tvLatestCache.get(`tv:${id}`) ?? null;
}

export async function loadTvLatest(id: number): Promise<TvLatestPayload> {
  const key = `tv:${id}`;
  const now = Date.now();
  const OK_TTL = 6 * 60 * 60 * 1000;

  const cached = tvLatestCache.get(key);
  if (cached && !cached.isError && now - cached.fetchedAt < OK_TTL)
    return cached;

  const inflight = tvLatestInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    const json: any = await getTVDetails(id);

    const seasons = Array.isArray(json?.seasons) ? json.seasons : [];
    const latest = pickLatestSeason(seasons);

    const seasonPoster: string | null =
      (latest?.poster_path as string | null) ?? null;

    const fallbackPoster: string | null =
      (json?.poster_path as string | null) ?? null;

    const seasonYear = yearFromDate(latest?.air_date);
    const lastAirYear = yearFromDate(json?.last_air_date);
    const firstYear = yearFromDate(json?.first_air_date);

    const safe: TvLatestPayload = {
      posterPath: seasonPoster ?? fallbackPoster ?? null,
      year: seasonYear || lastAirYear || firstYear || "",
      fetchedAt: Date.now(),
      isError: false,
    };

    tvLatestCache.set(key, safe);
    return safe;
  })()
    .catch((e) => {
      if ((import.meta as any).env?.DEV) {
        console.warn("[contentMeta] tv latest fetch failed:", key, e);
      }
      const safe: TvLatestPayload = {
        posterPath: null,
        year: "",
        fetchedAt: Date.now(),
        isError: true,
      };
      tvLatestCache.set(key, safe);
      return safe;
    })
    .finally(() => {
      tvLatestInFlight.delete(key);
    });

  tvLatestInFlight.set(key, p);
  return p;
}

/** ✅ 상영중/상영예정/재개봉 통일 판단
 * - 데이터 소스: (1) now_playing/upcoming Set (KR/ko-KR) (2) release_date 비교 fallback
 * - 재개봉: “상영중”인데 release_date가 오래됐으면 재개봉으로 표기
 */
export function getReleaseStatusKind(params: {
  mediaType: MediaType | null | undefined;
  id: number;
  releaseDate?: string | null;
  firstAirDate?: string | null;
  sets: ScreeningSets | null;
  ottOnly: boolean;

  // ✅ 추가: 재개봉 판정용
  rerunInfo?: MovieRerunInfo | null;
  rerunMinMonths?: number; // default 7

  // (하위 호환: 남겨둠)
  rerunThresholdDays?: number;
  nowWindowDays?: number;
}): ReleaseStatusKind | null {
  const {
    mediaType,
    id,
    releaseDate,
    firstAirDate,
    sets,
    ottOnly,

    rerunInfo = null,
    rerunMinMonths = 7,
  } = params;

  const mt: MediaType =
    mediaType === "tv" || mediaType === "movie"
      ? mediaType
      : firstAirDate && !releaseDate
      ? "tv"
      : "movie";

  const today = new Date();

  const parse = (s?: string | null) => {
    const raw = String(s || "").trim();
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  if (mt === "movie") {
    const inUpcoming = !!sets?.upcoming?.has(id);
    const inNowPlaying = !!sets?.nowPlaying?.has(id);

    // ✅ 상영예정은 KR upcoming 우선
    if (inUpcoming) return "upcoming";

    // ✅ 상영중/재개봉은 "KR now_playing"에 있는 경우에만
    if (inNowPlaying) {
      if (ottOnly) return null;

      // ✅ 재개봉: now_playing + (극장개봉 2회 이상) + (최초~최신 7개월 이상)
      const rerunOk = isMovieRerunGapQualified(rerunInfo, rerunMinMonths);
      return rerunOk ? "rerun" : "now";
    }

    // ✅ fallback: 미래 release_date면 upcoming (상영중 fallback은 제거)
    const rel = parse(releaseDate);
    if (rel && rel.getTime() > today.getTime()) return "upcoming";

    return null;
  }

  // TV: 첫 방영일이 미래면 “상영예정”
  const first = parse(firstAirDate);
  if (first && first.getTime() > today.getTime()) return "upcoming";

  return null;
}

export function theatricalLabelForMovieFromFlags(params: {
  id: number;
  releaseDate?: string | null;

  // ✅ DetailSections에서 쓰던 기존 플래그(있을 수도/없을 수도)
  isNowPlaying?: boolean;
  isUpcoming?: boolean;

  // ✅ 통일 로직(가능하면 넘김)
  sets?: ScreeningSets | null;

  // ✅ OTT-only면 상영중/재개봉 라벨 숨김 처리
  ottOnly?: boolean;

  // ✅ 재개봉/상영중 판단 기준(기본값은 기존 통일 로직과 동일)
  rerunThresholdDays?: number;
  nowWindowDays?: number;
}): string | null {
  const {
    id,
    releaseDate,
    isNowPlaying,
    isUpcoming,
    sets = null,
    ottOnly = false,
    rerunThresholdDays = 180,
    nowWindowDays = 90,
  } = params;

  // ✅ 기존 코드가 플래그를 우선적으로 보던 경우를 위해: 플래그 우선
  if (isUpcoming === true) return "상영예정";

  if (isNowPlaying === true) {
    if (ottOnly) return null;

    const raw = String(releaseDate || "").trim();
    const d = raw ? new Date(raw) : null;
    const ok = d && !Number.isNaN(d.getTime());

    if (!ok) return "상영중";

    const ms = 86400000;
    const today = Math.floor(Date.now() / ms);
    const rel = Math.floor((d as Date).getTime() / ms);
    const diff = today - rel;

    return diff >= rerunThresholdDays ? "재개봉" : "상영중";
  }

  // ✅ 플래그가 없으면 통일 로직으로 판정
  const kind = getReleaseStatusKind({
    mediaType: "movie",
    id,
    releaseDate: releaseDate ?? null,
    firstAirDate: null,
    sets,
    ottOnly,
    rerunThresholdDays,
    nowWindowDays,
  });

  if (!kind) return null;
  if (kind === "upcoming") return "상영예정";
  if (kind === "rerun") return "재개봉";
  return "상영중";
}

/** ✅ 상세(detail) 기반 TV 최신 시즌 연도 + (movie rerun이면 rerunYear 우선) */
export function getUnifiedYearFromDetail(
  detail: any,
  mediaType: MediaType | null | undefined,
  opts?: {
    statusKind?: ReleaseStatusKind | null;

    // ✅ 재개봉이어도 “출시년도”는 KR 최초 극장 개봉년도(earliest)로 표시
    originalYear?: string | null;

    // (하위 호환) 기존 호출부가 rerunYear를 넘겨도 깨지지 않게 유지
    rerunYear?: string | null;
  }
): string {
  if (!detail) return "—";

  const statusKind = opts?.statusKind ?? null;

  // ✅ originalYear 우선, 없으면 기존 rerunYear(하위 호환)도 받아줌
  const originalYear = String(
    opts?.originalYear ?? opts?.rerunYear ?? ""
  ).trim();

  // ✅ mediaType이 흔들리면(detail 구조로) 추론
  const mt: MediaType =
    mediaType === "tv" || mediaType === "movie"
      ? mediaType
      : Array.isArray(detail?.seasons)
      ? "tv"
      : "movie";

  if (mt === "tv") {
    const seasons = Array.isArray(detail?.seasons) ? detail.seasons : [];
    const latest = pickLatestSeason(seasons);

    const y =
      yearFromDate(latest?.air_date) ||
      yearFromDate(detail?.last_air_date) ||
      yearFromDate(detail?.first_air_date) ||
      "";

    return y || "—";
  }

  // ✅ movie: 재개봉이어도 release_date(최초 출시년도) 그대로
  const y = yearFromDate(detail?.release_date) || "";
  return y || "—";
}

/** ✅ 카드/캐러셀 item 기반 연도(=TV는 tvLatest 우선) + (movie rerun이면 rerunYear 우선) */
export function getUnifiedYearFromItem(
  item: any,
  mediaType: MediaType | null | undefined,
  tvLatest: TvLatestPayload | null,
  opts?: {
    statusKind?: ReleaseStatusKind | null;

    // ✅ 재개봉이어도 “출시년도”는 KR 최초 극장 개봉년도(earliest)로 표시
    originalYear?: string | null;

    // (하위 호환)
    rerunYear?: string | null;
  }
): string {
  if (!item) return "—";

  const statusKind = opts?.statusKind ?? null;
  const originalYear = String(
    opts?.originalYear ?? opts?.rerunYear ?? ""
  ).trim();

  // ✅ item.media_type 누락/깨짐 방어
  const rawItemType = item?.media_type;
  const itemType: MediaType | null =
    rawItemType === "tv" || rawItemType === "movie" ? rawItemType : null;

  const mt: MediaType =
    mediaType === "tv" || mediaType === "movie"
      ? mediaType
      : itemType ??
        (item?.first_air_date && !item?.release_date ? "tv" : "movie");

  if (mt === "tv") {
    const y =
      String(tvLatest?.year || "").trim() ||
      yearFromDate(item?.first_air_date) ||
      "";
    return y || "—";
  }

  // ✅ movie: 재개봉이어도 release_date(최초 출시년도) 그대로
  const y = yearFromDate(item?.release_date) || "";
  return y || "—";
}
