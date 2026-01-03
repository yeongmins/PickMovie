import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal } from "lucide-react";

import { apiGet } from "../../../lib/apiClient";
import { getMovieDetails } from "../../../lib/tmdb";

export type MediaType = "movie" | "tv";

export type ProviderBadge = {
  provider_name?: string;
  logo_path?: string | null;

  providerName?: string;
  logoPath?: string | null;

  name?: string;
  logo?: string | null;
};

export interface Movie {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;

  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;

  release_date?: string;
  first_air_date?: string;

  vote_average?: number;

  media_type?: MediaType;

  genre_ids?: number[];
  genres?: Array<{ id: number; name?: string }>;

  isNowPlaying?: boolean;
  providers?: ProviderBadge[];
  ageRating?: string;

  trendRank?: number;
  trendScore?: number;
}

export interface FavoritesCarouselProps {
  movies: Movie[];
  onMovieClick: (movie: Movie) => void;
  onToggleFavorite: (movieId: number, mediaType?: MediaType) => void;
}

export const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

export const AUTH_EVENT = "pickmovie-auth-changed";

export const TRENDS_ENDPOINT = "/trends/kr";
export const TRENDS_LIMIT = 10;

export const AUTO_MS = 9000;

export const TMDB_LOGO_CDN = "https://image.tmdb.org/t/p/";
export const logoUrl = (path: string, size: "w92" | "w185" = "w92") =>
  `${TMDB_LOGO_CDN}${size}${path}`;

const detailCache = new Map<number, any>();

const metaCache = new Map<
  string,
  { providers: ProviderBadge[]; ageRating: string; isNowPlaying?: boolean }
>();
const inflight = new Map<
  string,
  Promise<{
    providers: ProviderBadge[];
    ageRating: string;
    isNowPlaying?: boolean;
  }>
>();

const TRAILER_OPEN_EVENT = "pickmovie-trailer-open";
const TRAILER_CLOSE_EVENT = "pickmovie-trailer-close";

export function isLoggedInFallback(): boolean {
  try {
    return (
      !!localStorage.getItem(AUTH_KEYS.ACCESS) ||
      !!localStorage.getItem(AUTH_KEYS.USER)
    );
  } catch {
    return false;
  }
}

export const getDisplayTitle = (movie: any) => {
  return (
    movie.title ||
    movie.name ||
    movie.original_title ||
    movie.original_name ||
    "제목 정보 없음"
  );
};

export function isKoreanTitle(movie: any): boolean {
  const t = String(getDisplayTitle(movie) || "").trim();
  if (!t || t === "제목 정보 없음") return false;
  return /[가-힣]/.test(t);
}

export function inferMediaType(item: any): MediaType {
  if (item?.media_type === "tv") return "tv";
  if (item?.media_type === "movie") return "movie";
  if (item?.first_air_date && !item?.release_date) return "tv";
  return "movie";
}

function isAni(item: any): boolean {
  if (Array.isArray(item?.genre_ids) && item.genre_ids.includes(16))
    return true;
  if (Array.isArray(item?.genres) && item.genres.some((g: any) => g?.id === 16))
    return true;
  return false;
}

export function typeLabelOf(item: any): "Movie" | "TV" | "Ani" {
  if (isAni(item)) return "Ani";
  return inferMediaType(item) === "tv" ? "TV" : "Movie";
}

export function normalizeAge(age?: string) {
  const raw = (age || "").trim();
  if (!raw || raw === "-" || raw === "—") return "—";
  if (raw === "ALL" || raw.includes("전체")) return "ALL";

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return raw;

  const n = Number(digits);
  if (!Number.isFinite(n)) return raw;
  if (n <= 0) return "ALL";
  if (n <= 12) return "12";
  if (n <= 15) return "15";
  return "18";
}

function ageBadgeClass(v: string) {
  switch (v) {
    case "ALL":
      return "bg-green-500";
    case "12":
      return "bg-yellow-400";
    case "15":
      return "bg-orange-500";
    case "18":
      return "bg-red-600";
    default:
      return "bg-black/60";
  }
}

export function AgeBadge({ value }: { value: string }) {
  const v = normalizeAge(value);
  if (!v || v === "—") return null;

  return (
    <div
      className={[
        "w-[24px] h-[24px] rounded-[5px]",
        "flex items-center justify-center",
        "text-white font-extrabold",
        "shadow-sm",
        ageBadgeClass(v),
      ].join(" ")}
      aria-label={`연령등급 ${v}`}
      title={`연령등급 ${v}`}
    >
      <span className={v === "ALL" ? "text-[10px]" : "text-[13px]"}>{v}</span>
    </div>
  );
}

export function Chip({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "green" | "blue";
}) {
  const base =
    "inline-flex items-center h-[22px] rounded-[5px] text-[11px] font-bold leading-none px-[10px] shadow-sm backdrop-blur-sm whitespace-nowrap";

  const cls =
    tone === "green"
      ? "bg-green-500/90 text-white"
      : tone === "blue"
      ? "bg-sky-500/90 text-white"
      : "bg-black/45 text-white";

  return <div className={`${base} ${cls}`}>{children}</div>;
}

function normalizeProviders(input: any): ProviderBadge[] {
  const arr: any[] = Array.isArray(input) ? input : [];
  return arr
    .map((p) => {
      const provider_name =
        p?.provider_name ?? p?.providerName ?? p?.name ?? "";
      const logo_path = p?.logo_path ?? p?.logoPath ?? p?.logo ?? null;
      if (!provider_name) return null;
      return { provider_name, logo_path } as ProviderBadge;
    })
    .filter(Boolean) as ProviderBadge[];
}

function pickAgeFromResponse(r: any): string {
  const v =
    r?.ageRating ??
    r?.age_rating ??
    r?.age ??
    r?.rating ??
    r?.certification ??
    "";
  const s = String(v || "").trim();
  return s || "—";
}

function pickNowPlayingFromResponse(r: any): boolean | undefined {
  const v =
    r?.isNowPlaying ?? r?.nowPlaying ?? r?.is_now_playing ?? r?.now_playing;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function parseYmdToDate(s?: string): Date | null {
  const raw = String(s || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysDiff(a: Date, b: Date) {
  const ms = 1000 * 60 * 60 * 24;
  const ax = Math.floor(a.getTime() / ms);
  const bx = Math.floor(b.getTime() / ms);
  return ax - bx;
}

export type ScreeningSets = {
  nowPlaying: Set<number>;
  upcoming: Set<number>;
  fetchedAt: number;
};

let screeningCache: ScreeningSets | null = null;
let screeningInFlight: Promise<ScreeningSets> | null = null;

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

    const [nowPlayingResList, upcomingResList] = await Promise.all([
      Promise.all(
        pages.map((page) =>
          apiGet<{ results: Array<{ id: number }> }>("/movies/now_playing", {
            page,
          }).catch(() => ({ results: [] }))
        )
      ),
      Promise.all(
        pages.map((page) =>
          apiGet<{ results: Array<{ id: number }> }>("/movies/upcoming", {
            page,
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

const _ottOnlyCache = new Map<string, boolean>();
const _ottOnlyInFlight = new Map<string, Promise<boolean>>();

async function tmdbDirectFetch(path: string) {
  if (!TMDB_API_KEY) return null;
  const url = new URL(`${TMDB_DIRECT_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return await res.json();
}

async function isOttOnlyMovie(
  id: number,
  region: string = "KR"
): Promise<boolean> {
  if (!TMDB_API_KEY) return false;

  const key = `${id}:${region}`;
  if (_ottOnlyCache.has(key)) return _ottOnlyCache.get(key)!;

  const inflight = _ottOnlyInFlight.get(key);
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
    _ottOnlyCache.set(key, ottOnly);
    return ottOnly;
  })()
    .catch(() => {
      _ottOnlyCache.set(key, false);
      return false;
    })
    .finally(() => {
      _ottOnlyInFlight.delete(key);
    });

  _ottOnlyInFlight.set(key, p);
  return p;
}

export function getAiringChip(
  item: Movie,
  metaNowPlaying: boolean | undefined,
  sets: ScreeningSets | null,
  ottOnly: boolean
): { label: string; tone: "green" | "blue" } | null {
  const mt = inferMediaType(item);

  const NOW = { label: "상영중", tone: "green" as const };
  const UPCOMING = { label: "상영예정", tone: "blue" as const };

  const today = new Date();

  if (mt === "movie") {
    const inNowPlaying = !!sets?.nowPlaying?.has(item.id);
    const inUpcoming = !!sets?.upcoming?.has(item.id);

    if (inNowPlaying && !ottOnly) return NOW;
    if (inUpcoming) return UPCOMING;

    const rel = parseYmdToDate(item.release_date);

    const hasExplicit =
      typeof item.isNowPlaying === "boolean" ||
      typeof metaNowPlaying === "boolean";
    const explicitNow = item.isNowPlaying === true || metaNowPlaying === true;

    if (rel) {
      const diff = daysDiff(today, rel);
      if (diff < 0) return UPCOMING;

      if (hasExplicit) return explicitNow && !ottOnly ? NOW : null;

      const likelyNowPlaying = diff <= 90;
      return likelyNowPlaying && !ottOnly ? NOW : null;
    }

    if (hasExplicit) return explicitNow && !ottOnly ? NOW : null;
    return null;
  }

  const first = parseYmdToDate(item.first_air_date);
  if (first && daysDiff(today, first) < 0) return UPCOMING;

  return null;
}

export function RankBadge({ rank }: { rank: number }) {
  const n = Math.max(1, Math.min(999, Number(rank) || 1));

  if (n === 1) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-yellow-500/15 border border-yellow-400/30 px-3 py-1 text-yellow-200 font-extrabold">
        <Trophy className="w-4 h-4" />
        <span className="text-sm">{n}위</span>
      </div>
    );
  }
  if (n === 2 || n === 3) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-white/90 font-extrabold">
        <Medal className="w-4 h-4" />
        <span className="text-sm">{n}위</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center rounded-full bg-black/35 border border-white/10 px-3 py-1 text-white font-extrabold">
      <span className="text-sm">{n}위</span>
    </div>
  );
}

export function ScrollMouseHint({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none ${className}`}
    >
      <div className="w-[24px] h-[38px] rounded-full border border-white/45 bg-black/10 backdrop-blur-[2px] flex justify-center pt-[7px]">
        <motion.div
          className="w-[4px] h-[7px] rounded-full bg-white/70"
          animate={{ y: [0, 10, 0], opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

type IndexOrigin = "auto" | "nav" | "thumb" | "scroll";

export function useFavoritesHeroState(movies: Movie[]) {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => isLoggedInFallback());
  const [trendMovies, setTrendMovies] = useState<Movie[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const [currentIndex, setCurrentIndexRaw] = useState(0);
  const timerRef = useRef<number | null>(null);
  const indexOriginRef = useRef<IndexOrigin>("auto");

  const [heroMeta, setHeroMeta] = useState<{
    providers: ProviderBadge[];
    ageRating: string;
    isNowPlaying?: boolean;
  } | null>(null);

  const [screening, setScreening] = useState<ScreeningSets | null>(() => {
    return screeningCache ?? null;
  });

  const [heroOttOnly, setHeroOttOnly] = useState(false);

  // ✅ TrailerOverlay가 열려있으면 캐러셀 넘김/오토플레이 pause
  const [trailerOpen, setTrailerOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setTrailerOpen(true);
    const onClose = () => setTrailerOpen(false);

    window.addEventListener(TRAILER_OPEN_EVENT, onOpen);
    window.addEventListener(TRAILER_CLOSE_EVENT, onClose);

    return () => {
      window.removeEventListener(TRAILER_OPEN_EVENT, onOpen);
      window.removeEventListener(TRAILER_CLOSE_EVENT, onClose);
    };
  }, []);

  useEffect(() => {
    const sync = () => setLoggedIn(isLoggedInFallback());
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    loadScreeningSets()
      .then((s) => {
        if (!mounted) return;
        setScreening(s);
      })
      .catch(() => {
        if (!mounted) return;
        setScreening((prev) => prev ?? null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loggedIn) return;

    let mounted = true;
    setTrendLoading(true);

    (async () => {
      try {
        const r = await apiGet<{
          date: string;
          items: Array<{
            keyword: string;
            rank: number;
            score: number;
            tmdbId: number | null;
          }>;
        }>(TRENDS_ENDPOINT, { limit: TRENDS_LIMIT });

        const items = Array.isArray(r?.items) ? r.items : [];
        const mapped: Movie[] = [];

        for (const it of items) {
          const tmdbId =
            typeof it.tmdbId === "number" && it.tmdbId > 0 ? it.tmdbId : null;

          // ✅ TMDB 매칭 없으면 필터링(추가 X)
          if (!tmdbId) continue;

          // ✅ 캐시(hit) / 캐시 miss 구분 (null도 캐시해서 재요청 방지)
          let detail: any = null;

          if (detailCache.has(tmdbId)) {
            detail = detailCache.get(tmdbId);
          } else {
            try {
              detail = await getMovieDetails(tmdbId);
            } catch {
              detail = null;
            }
            detailCache.set(tmdbId, detail); // null도 저장
          }

          // ✅ TMDB 상세 조회 실패하면 필터링
          if (!detail) continue;

          mapped.push({
            ...(detail as any),
            id: (detail as any).id ?? tmdbId,
            media_type: "movie",
            trendRank: it.rank,
            trendScore: it.score,
          });
        }

        if (mounted) setTrendMovies(mapped);
      } catch (e) {
        if ((import.meta as any).env?.DEV) {
          console.warn("[FavoritesCarousel] trends fetch failed:", e);
        }
        if (mounted) setTrendMovies([]);
      } finally {
        if (mounted) setTrendLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loggedIn]);

  const activeMovies = useMemo(() => {
    const raw = loggedIn ? movies : trendMovies;
    return (Array.isArray(raw) ? raw : []).filter(isKoreanTitle);
  }, [loggedIn, movies, trendMovies]);

  const currentMovie: Movie | null = useMemo(() => {
    return activeMovies[currentIndex] ?? null;
  }, [activeMovies, currentIndex]);

  useEffect(() => {
    setCurrentIndexRaw(0);
    indexOriginRef.current = "auto";
  }, [activeMovies.length]);

  const setIndex = (
    updater: number | ((prev: number) => number),
    origin: IndexOrigin
  ) => {
    indexOriginRef.current = origin;
    setCurrentIndexRaw(updater as any);
  };

  // ✅ 오토플레이(예고편 시청 중엔 중단)
  useEffect(() => {
    if (activeMovies.length <= 1) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;

    if (trailerOpen) return;

    timerRef.current = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % activeMovies.length, "auto");
    }, AUTO_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [activeMovies.length, currentIndex, trailerOpen]);

  const goToPrevious = () => {
    if (trailerOpen) return;
    if (activeMovies.length <= 1) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setIndex(
      (prev) => (prev - 1 + activeMovies.length) % activeMovies.length,
      "nav"
    );
  };

  const goToNext = () => {
    if (trailerOpen) return;
    if (activeMovies.length <= 1) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setIndex((prev) => (prev + 1) % activeMovies.length, "nav");
  };

  const jumpTo = (index: number) => {
    if (trailerOpen) return;
    if (activeMovies.length <= 1) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setIndex(index, "thumb");
  };

  const metaKey = useMemo(() => {
    if (!currentMovie) return null;
    const mt = inferMediaType(currentMovie);
    return `${mt}:${currentMovie.id}`;
  }, [currentMovie]);

  const needsMeta = useMemo(() => {
    if (!currentMovie) return false;

    const hasProviders =
      Array.isArray(currentMovie.providers) &&
      currentMovie.providers.length > 0;

    const rawAge = (currentMovie.ageRating || "").trim();
    const hasAge = !!rawAge && rawAge !== "-" && rawAge !== "—";

    const mt = inferMediaType(currentMovie);
    const needsNowPlaying =
      mt === "movie" && typeof currentMovie.isNowPlaying !== "boolean";

    return !(hasProviders && hasAge) || needsNowPlaying;
  }, [currentMovie]);

  useEffect(() => {
    let mounted = true;

    if (!metaKey || !currentMovie) {
      setHeroMeta(null);
      return;
    }

    const cached = metaCache.get(metaKey);
    if (cached) {
      setHeroMeta(cached);
      return;
    }

    if (!needsMeta) {
      setHeroMeta(null);
      return;
    }

    if (!inflight.has(metaKey)) {
      const mt = inferMediaType(currentMovie);

      inflight.set(
        metaKey,
        apiGet<any>(`/tmdb/meta/${mt}/${currentMovie.id}`, { region: "KR" })
          .then((r) => {
            const providers = normalizeProviders(
              r?.providers ?? r?.providerList ?? []
            );
            const ageRating = pickAgeFromResponse(r);
            const isNowPlaying = pickNowPlayingFromResponse(r);
            const safe = { providers, ageRating, isNowPlaying };
            metaCache.set(metaKey, safe);
            return safe;
          })
          .catch((e) => {
            if ((import.meta as any).env?.DEV) {
              console.warn(
                "[FavoritesCarousel] meta fetch failed:",
                metaKey,
                e
              );
            }
            const safe = {
              providers: [],
              ageRating: "—" as const,
              isNowPlaying: undefined,
            };
            metaCache.set(metaKey, safe);
            return safe;
          })
          .finally(() => {
            inflight.delete(metaKey);
          })
      );
    }

    inflight.get(metaKey)!.then((r) => {
      if (!mounted) return;
      setHeroMeta(r);
    });

    return () => {
      mounted = false;
    };
  }, [metaKey, needsMeta, currentMovie]);

  useEffect(() => {
    let mounted = true;

    if (!currentMovie) {
      setHeroOttOnly(false);
      return;
    }

    const mt = inferMediaType(currentMovie);
    if (mt !== "movie") {
      setHeroOttOnly(false);
      return;
    }

    const inNowPlaying = !!screening?.nowPlaying?.has(currentMovie.id);
    const explicitNow =
      currentMovie.isNowPlaying === true || heroMeta?.isNowPlaying === true;

    if (!inNowPlaying && !explicitNow) {
      setHeroOttOnly(false);
      return;
    }

    const key = `${currentMovie.id}:KR`;
    const cached = _ottOnlyCache.get(key);
    if (typeof cached === "boolean") {
      setHeroOttOnly(cached);
      return;
    }

    isOttOnlyMovie(currentMovie.id, "KR").then((v) => {
      if (!mounted) return;
      setHeroOttOnly(v);
    });

    return () => {
      mounted = false;
    };
  }, [currentMovie, screening, heroMeta?.isNowPlaying]);

  const providers =
    (Array.isArray(currentMovie?.providers) && currentMovie!.providers!.length
      ? currentMovie!.providers
      : heroMeta?.providers) ?? [];

  const providerLogos = providers
    .map((p) => {
      const name = p.provider_name ?? p.providerName ?? p.name ?? "";
      const lp = p.logo_path ?? p.logoPath ?? p.logo ?? null;
      return { name, path: lp };
    })
    .filter((x) => !!x.name && !!x.path);

  const MAX_PROVIDER = 4;
  const visibleProviders = providerLogos.slice(0, MAX_PROVIDER);
  const hiddenCount = Math.max(
    0,
    providerLogos.length - visibleProviders.length
  );

  const ageValue = normalizeAge(
    currentMovie?.ageRating || heroMeta?.ageRating || "—"
  );
  const showAge = ageValue !== "—";

  const typeText = currentMovie ? typeLabelOf(currentMovie) : "Movie";
  const airingChip =
    currentMovie &&
    getAiringChip(currentMovie, heroMeta?.isNowPlaying, screening, heroOttOnly);

  const hasBackdrop = !!(
    currentMovie?.backdrop_path || currentMovie?.poster_path
  );

  const yearText = (() => {
    const raw =
      currentMovie?.release_date || currentMovie?.first_air_date || "";
    if (!raw) return null;
    const y = new Date(raw).getFullYear();
    return Number.isFinite(y) ? String(y) : null;
  })();

  return {
    loggedIn,
    trendLoading,

    activeMovies,
    currentMovie,

    currentIndex,
    setIndex,
    indexOriginRef,

    goToPrevious,
    goToNext,
    jumpTo,

    screening,
    heroMeta,
    heroOttOnly,

    providers,
    visibleProviders,
    hiddenCount,

    ageValue,
    showAge,
    typeText,
    airingChip,
    hasBackdrop,
    yearText,

    trailerOpen,
  };
}
