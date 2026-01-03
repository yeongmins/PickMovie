// frontend/src/components/content/ContentCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Heart, Star, X } from "lucide-react";
import { getPosterUrl } from "../../lib/tmdb";
import { apiGet } from "../../lib/apiClient";

type MediaType = "movie" | "tv";

export type ProviderBadge = {
  provider_name?: string;
  logo_path?: string | null;

  providerName?: string;
  logoPath?: string | null;

  name?: string;
  logo?: string | null;
};

export type ContentCardItem = {
  id: number;

  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;

  poster_path: string | null;
  vote_average?: number;

  release_date?: string;
  first_air_date?: string;

  media_type?: MediaType;
  genre_ids?: number[];

  isNowPlaying?: boolean;

  // ✅ 상영 예정(페이지에서 명시적으로 주면 최우선)
  isUpcoming?: boolean;

  providers?: ProviderBadge[];
  platform?: string;
  ageRating?: string;

  matchScore?: number;

  // ✅ 트렌드 배지(메인/트렌드 Row에서 주입)
  trendRank?: number;
  trendScore?: number;

  // ✅ 추천 이유(선택)
  recommendReason?: string;

  // ✅ 매칭 배지를 picky 외 화면에서도 보여주고 싶을 때
  showMatchBadge?: boolean;
};

export type ContentCardProps = {
  item: ContentCardItem;
  isFavorite: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;

  onRemove?: () => void;
  context?: "default" | "picky";
  onPosterError?: () => void;

  className?: string;

  // ✅ 로그인 안 하면 하트 숨김
  canFavorite?: boolean;
};

const TMDB_LOGO_CDN = "https://image.tmdb.org/t/p/";
const logoUrl = (path: string, size: "w92" | "w185" = "w92") =>
  `${TMDB_LOGO_CDN}${size}${path}`;

// ✅ metaCache: 성공/실패 캐시 + TTL(실패 영구 고정 방지)
type MetaPayload = {
  providers: ProviderBadge[];
  ageRating: string;
  isNowPlaying?: boolean;
  isUpcoming?: boolean;
  fetchedAt: number;
  isError?: boolean;
};

const metaCache = new Map<string, MetaPayload>();
const inflight = new Map<string, Promise<MetaPayload>>();

const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

function isLoggedInFallback(): boolean {
  try {
    return (
      !!localStorage.getItem(AUTH_KEYS.ACCESS) ||
      !!localStorage.getItem(AUTH_KEYS.USER)
    );
  } catch {
    return false;
  }
}

function getDisplayTitle(item: ContentCardItem) {
  return (
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    "제목 정보 없음"
  );
}

function isKoreanTitle(item: ContentCardItem): boolean {
  const t = String(getDisplayTitle(item) || "").trim();
  if (!t || t === "제목 정보 없음") return false;
  return /[가-힣]/.test(t);
}

function inferMediaType(item: ContentCardItem): MediaType {
  if (item.media_type === "tv") return "tv";
  if (item.media_type === "movie") return "movie";
  if (item.first_air_date && !item.release_date) return "tv";
  return "movie";
}

function typeLabelOf(item: ContentCardItem): "Movie" | "TV" | "Ani" {
  const isAni = Array.isArray(item.genre_ids) && item.genre_ids.includes(16);
  if (isAni) return "Ani";
  if (item.media_type === "tv") return "TV";
  return "Movie";
}

function yearOf(item: ContentCardItem) {
  const d = item.release_date || item.first_air_date || "";
  if (!d) return "";
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? String(y) : "";
}

function normalizeAge(age?: string) {
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

function AgeBadge({ value }: { value: string }) {
  const v = normalizeAge(value);
  if (!v || v === "—") return null;

  return (
    <div
      className={[
        "w-[22px] h-[22px] rounded-[4px]",
        "flex items-center justify-center",
        "text-white font-extrabold",
        "shadow-sm",
        ageBadgeClass(v),
      ].join(" ")}
      aria-label={`연령등급 ${v}`}
      title={`연령등급 ${v}`}
    >
      <span className={v === "ALL" ? "text-[9px]" : "text-[12px]"}>{v}</span>
    </div>
  );
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
    r?.isNowPlaying ??
    r?.nowPlaying ??
    r?.is_now_playing ??
    r?.now_playing ??
    undefined;

  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  }
  return undefined;
}

function pickUpcomingFromResponse(r: any): boolean | undefined {
  const v =
    r?.isUpcoming ??
    r?.upcoming ??
    r?.is_upcoming ??
    r?.comingSoon ??
    r?.is_coming_soon ??
    undefined;

  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  }
  return undefined;
}

// ✅ meta도 없을 때 최소 fallback: 개봉 후 56일 이내면 상영중으로 간주
function fallbackLikelyNowPlaying(item: ContentCardItem, mediaType: MediaType) {
  if (mediaType !== "movie") return false;
  const d = (item.release_date || "").trim();
  if (!d) return false;

  const rd = new Date(d);
  if (!Number.isFinite(rd.getTime())) return false;

  const now = new Date();
  if (rd.getTime() > now.getTime()) return false;

  const diffDays = (now.getTime() - rd.getTime()) / 86400000;
  return diffDays <= 56;
}

// ✅ fallback: 개봉일이 미래면 상영 예정으로 간주
function fallbackLikelyUpcoming(item: ContentCardItem, mediaType: MediaType) {
  if (mediaType !== "movie") return false;
  const d = (item.release_date || "").trim();
  if (!d) return false;

  const rd = new Date(d);
  if (!Number.isFinite(rd.getTime())) return false;

  const now = new Date();
  return rd.getTime() > now.getTime();
}

function Chip({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "green" | "purple" | "blue";
}) {
  const base =
    "inline-flex items-center h-[20px] rounded-[5px] text-[10px] font-bold leading-none " +
    "px-[8px] shadow-sm backdrop-blur-sm";

  const cls =
    tone === "green"
      ? "bg-green-500/90 text-white"
      : tone === "purple"
      ? "bg-purple-600/90 text-white"
      : tone === "blue"
      ? "bg-sky-500/90 text-white"
      : "bg-black/45 text-white";

  return <div className={`${base} ${cls}`}>{children}</div>;
}

// =========================
// ✅ "상영중/상영예정" 확정용: now_playing/upcoming ID Set 캐시
// =========================

type ScreeningSets = {
  nowPlaying: Set<number>;
  upcoming: Set<number>;
  fetchedAt: number;
};

let screeningCache: ScreeningSets | null = null;
let screeningInFlight: Promise<ScreeningSets> | null = null;

async function loadScreeningSets(): Promise<ScreeningSets> {
  const OK_TTL = 30 * 60 * 1000; // 30분
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

// =========================
// ✅ OTT 전용이면 "상영중" 제거 (TMDB release_dates direct)
// =========================

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

export function ContentCard({
  item,
  isFavorite,
  onClick,
  onToggleFavorite,
  onRemove,
  context = "default",
  onPosterError,
  className,
  canFavorite,
}: ContentCardProps) {
  if (!isKoreanTitle(item)) return null;

  const title = getDisplayTitle(item);
  const rating =
    typeof item.vote_average === "number" ? item.vote_average.toFixed(1) : "—";
  const y = yearOf(item);

  const mediaType = inferMediaType(item);
  const typeText = typeLabelOf(item);

  const posterUrl = getPosterUrl(item.poster_path, "w500");
  const cacheKey = `${mediaType}:${item.id}`;

  const [meta, setMeta] = useState<MetaPayload | null>(() => {
    return metaCache.get(cacheKey) ?? null;
  });

  const [screening, setScreening] = useState<ScreeningSets | null>(() => {
    return screeningCache ?? null;
  });

  const [ottOnly, setOttOnly] = useState<boolean>(() => {
    return _ottOnlyCache.get(`${item.id}:KR`) ?? false;
  });

  // ✅ screening sets 로드 (한 번만)
  useEffect(() => {
    let mounted = true;

    if (mediaType !== "movie") return;

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
  }, [mediaType]);

  // ✅ meta 보강 조건:
  // - providers / age 없으면
  // - movie면 isNowPlaying / isUpcoming이 명시되지 않았다면(meta 우선)
  const needsMeta = useMemo(() => {
    const hasProviders =
      Array.isArray(item.providers) && item.providers.length > 0;

    const rawAge = (item.ageRating || "").trim();
    const hasAge = !!rawAge && rawAge !== "-" && rawAge !== "—";

    const needsNowPlaying =
      mediaType === "movie" && typeof item.isNowPlaying !== "boolean";

    const needsUpcoming =
      mediaType === "movie" && typeof item.isUpcoming !== "boolean";

    return !hasProviders || !hasAge || needsNowPlaying || needsUpcoming;
  }, [
    item.providers,
    item.ageRating,
    item.isNowPlaying,
    item.isUpcoming,
    mediaType,
  ]);

  useEffect(() => {
    let mounted = true;
    if (!needsMeta) return;

    const now = Date.now();
    const cached = metaCache.get(cacheKey);

    // ✅ 성공 캐시는 길게, 실패 캐시는 짧게 재시도
    const OK_TTL = 30 * 60 * 1000; // 30분
    const ERROR_TTL = 60 * 1000; // 60초

    const isFreshOk =
      cached && !cached.isError && now - cached.fetchedAt < OK_TTL;

    const isFreshError =
      cached && cached.isError && now - cached.fetchedAt < ERROR_TTL;

    // 즉시 반영(있으면)
    if (cached) setMeta(cached);

    // 신선하면 fetch 불필요
    if (isFreshOk || isFreshError) return;

    if (!inflight.has(cacheKey)) {
      inflight.set(
        cacheKey,
        apiGet<any>(`/tmdb/meta/${mediaType}/${item.id}`, { region: "KR" })
          .then((r) => {
            const providers = normalizeProviders(
              r?.providers ?? r?.providerList ?? []
            );
            const ageRating = pickAgeFromResponse(r);
            const isNowPlaying = pickNowPlayingFromResponse(r);
            const isUpcoming = pickUpcomingFromResponse(r);

            const safe: MetaPayload = {
              providers,
              ageRating,
              isNowPlaying,
              isUpcoming,
              fetchedAt: Date.now(),
              isError: false,
            };
            metaCache.set(cacheKey, safe);
            return safe;
          })
          .catch((e) => {
            if ((import.meta as any).env?.DEV) {
              console.warn("[ContentCard] meta fetch failed:", cacheKey, e);
            }
            const safe: MetaPayload = {
              providers: [],
              ageRating: "—",
              isNowPlaying: undefined,
              isUpcoming: undefined,
              fetchedAt: Date.now(),
              isError: true,
            };
            metaCache.set(cacheKey, safe);
            return safe;
          })
          .finally(() => {
            inflight.delete(cacheKey);
          })
      );
    }

    inflight.get(cacheKey)!.then((r) => {
      if (!mounted) return;
      setMeta(r);
    });

    return () => {
      mounted = false;
    };
  }, [cacheKey, needsMeta, mediaType, item.id]);

  const providers =
    (Array.isArray(item.providers) && item.providers.length
      ? item.providers
      : meta?.providers) ?? [];

  const ageValue = normalizeAge(item.ageRating || meta?.ageRating || "—");

  const screeningNow =
    mediaType === "movie" ? !!screening?.nowPlaying?.has(item.id) : false;
  const screeningUpcoming =
    mediaType === "movie" ? !!screening?.upcoming?.has(item.id) : false;

  const candidateNowPlaying =
    (typeof item.isNowPlaying === "boolean" ? item.isNowPlaying : undefined) ??
    (typeof meta?.isNowPlaying === "boolean"
      ? meta?.isNowPlaying
      : undefined) ??
    (mediaType === "movie" ? (screeningNow ? true : undefined) : undefined) ??
    fallbackLikelyNowPlaying(item, mediaType);

  // ✅ OTT 전용이면 "상영중" 제거 (candidateNowPlaying이 true일 때만 판단)
  useEffect(() => {
    let mounted = true;

    if (mediaType !== "movie") {
      setOttOnly(false);
      return;
    }
    if (!candidateNowPlaying) {
      setOttOnly(false);
      return;
    }

    const key = `${item.id}:KR`;
    const cached = _ottOnlyCache.get(key);
    if (typeof cached === "boolean") {
      setOttOnly(cached);
      return;
    }

    isOttOnlyMovie(item.id, "KR").then((v) => {
      if (!mounted) return;
      setOttOnly(v);
    });

    return () => {
      mounted = false;
    };
  }, [candidateNowPlaying, mediaType, item.id]);

  const showNowPlaying = !!candidateNowPlaying && !ottOnly;

  const showUpcoming =
    !showNowPlaying &&
    mediaType === "movie" &&
    ((typeof item.isUpcoming === "boolean" ? item.isUpcoming : undefined) ??
      (typeof meta?.isUpcoming === "boolean" ? meta?.isUpcoming : undefined) ??
      (screeningUpcoming ? true : undefined) ??
      fallbackLikelyUpcoming(item, mediaType));

  // ✅ 매칭 배지: picky에서 기본 표시, 그 외 화면은 showMatchBadge=true일 때만 표시
  const showMatch =
    typeof item.matchScore === "number" &&
    Number.isFinite(item.matchScore) &&
    (context === "picky" || item.showMatchBadge === true);

  // ✅ 트렌드 배지
  const showTrend =
    typeof item.trendRank === "number" && Number.isFinite(item.trendRank);

  // ✅ OTT 로고/텍스트
  const providerLogos = providers
    .map((p) => {
      const name = p.provider_name ?? p.providerName ?? p.name ?? "";
      const lp = p.logo_path ?? p.logoPath ?? p.logo ?? null;
      return { name, path: lp };
    })
    .filter((x) => !!x.name && !!x.path);

  const providerNamesOnly = providers
    .map((p) => p.provider_name ?? p.providerName ?? p.name ?? "")
    .map((s) => String(s).trim())
    .filter(Boolean);

  const MAX_PROVIDER_BADGES = 3;
  const visibleProviders = providerLogos.slice(0, MAX_PROVIDER_BADGES);
  const hiddenCount = Math.max(
    0,
    providerLogos.length - visibleProviders.length
  );

  const visibleProviderNames = providerNamesOnly.slice(0, 2);

  const hasProviders = providerLogos.length > 0 || providerNamesOnly.length > 0;
  const hasAge = ageValue !== "—";

  // ✅ 로그인 안 하면 하트 숨김
  const canFav =
    typeof canFavorite === "boolean" ? canFavorite : isLoggedInFallback();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={`group cursor-pointer select-none w-full ${className ?? ""}`}
      aria-label={`${title} 상세 보기`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[5px] bg-white/5 shadow-lg">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="h-full w-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={onPosterError}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white/40 text-sm">
            No Image
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/15" />

        {/* 좌상단 */}
        <div className="absolute top-2 left-2 z-20 flex flex-col items-start">
          {onRemove && (
            <button
              type="button"
              aria-label="플레이리스트에서 제거"
              className="w-[22px] h-[22px] rounded-[4px] bg-black/55 hover:bg-black/70 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-4 w-4 text-white" />
            </button>
          )}

          <div className="self-start">
            <Chip tone="dark">{typeText}</Chip>
          </div>

          {/* ✅ 트렌드 랭킹 배지 */}
          {showTrend && (
            <div
              className="self-start"
              title={`트렌드 점수 ${item.trendScore ?? "-"}`}
            >
              <Chip tone="purple">
                {item.trendRank === 1
                  ? "🥇"
                  : item.trendRank === 2
                  ? "🥈"
                  : item.trendRank === 3
                  ? "🥉"
                  : "🔥"}{" "}
                #{item.trendRank}
              </Chip>
            </div>
          )}

          {showNowPlaying && (
            <div className="self-start">
              <Chip tone="green">상영중</Chip>
            </div>
          )}

          {showUpcoming && (
            <div className="self-start">
              <Chip tone="blue">상영 예정</Chip>
            </div>
          )}

          {/* {showMatch && (
            <div className="self-start">
              <Chip tone="dark">{Math.round(item.matchScore!)}% 매칭</Chip>
            </div>
          )} */}
        </div>

        {/* 우상단 하트 (로그인 시에만 노출) */}
        {canFav && (
          <div className="absolute top-2 right-2 z-20">
            <button
              type="button"
              aria-label="찜 토글"
              className="w-[30px] h-[30px] rounded-[5px] bg-black/55 hover:bg-black/70 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
            >
              <Heart
                className={`h-4 w-4 ${
                  isFavorite ? "fill-red-500 text-red-500" : "text-white"
                }`}
              />
            </button>
          </div>
        )}

        {/* 우하단: OTT/연령 등 */}
        {(hasProviders || hasAge) && (
          <div className="absolute bottom-2 right-2 z-20 flex flex-col items-end gap-1">
            {hasAge && <AgeBadge value={ageValue} />}

            {hasProviders ? (
              providerLogos.length > 0 ? (
                <div className="flex items-center gap-1 flex-nowrap">
                  {visibleProviders.map((p) => (
                    <div
                      key={p.name}
                      className="w-[22px] h-[22px] rounded-[4px] bg-black/45 backdrop-blur-sm overflow-hidden flex items-center justify-center shadow-sm"
                      title={p.name}
                      aria-label={p.name}
                    >
                      <img
                        src={logoUrl(p.path!, "w92")}
                        srcSet={`${logoUrl(p.path!, "w92")} 1x, ${logoUrl(
                          p.path!,
                          "w185"
                        )} 2x`}
                        alt={p.name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ))}

                  {hiddenCount > 0 && (
                    <span className="w-[24px] h-[24px] rounded-[4px] bg-black/45 backdrop-blur-sm px-[6px] text-[12px] font-bold text-white/90 flex items-center shadow-sm">
                      +{hiddenCount}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {visibleProviderNames.map((n) => (
                    <span
                      key={n}
                      className="max-w-[120px] truncate px-2 py-1 rounded-[6px] bg-black/45 backdrop-blur-sm text-[10px] font-semibold text-white/85"
                      title={n}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              )
            ) : null}
          </div>
        )}
      </div>

      {/* 텍스트 */}
      <div className="mt-3 px-1">
        <div className="text-sm font-semibold text-white line-clamp-1">
          {title}
        </div>

        {item.recommendReason && (
          <div className="mt-1 text-[11px] text-white/55 line-clamp-1">
            {item.recommendReason}
          </div>
        )}

        <div className="mt-1 text-xs text-white/70 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            {rating}
          </span>
          <span className="text-white/50">{y || "—"}</span>
        </div>
      </div>
    </div>
  );
}
