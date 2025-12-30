// src/features/favorites/components/FavoritesCarousel.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Star,
  Info,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trophy,
  Medal,
} from "lucide-react";

import { Button } from "../../../components/ui/button";
import { apiGet } from "../../../lib/apiClient";
import { getBackdropUrl, getMovieDetails } from "../../../lib/tmdb";

type MediaType = "movie" | "tv";

type ProviderBadge = {
  provider_name?: string;
  logo_path?: string | null;

  providerName?: string;
  logoPath?: string | null;

  name?: string;
  logo?: string | null;
};

interface Movie {
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

interface FavoritesCarouselProps {
  movies: Movie[];
  onMovieClick: (movie: Movie) => void;
  onToggleFavorite: (movieId: number, mediaType?: MediaType) => void;
}

const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

const AUTH_EVENT = "pickmovie-auth-changed";

const TRENDS_ENDPOINT = "/trends/kr";
const TRENDS_LIMIT = 10;

const AUTO_MS = 9000;

const TMDB_LOGO_CDN = "https://image.tmdb.org/t/p/";
const logoUrl = (path: string, size: "w92" | "w185" = "w92") =>
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

const getDisplayTitle = (movie: any) => {
  return (
    movie.title ||
    movie.name ||
    movie.original_title ||
    movie.original_name ||
    "제목 정보 없음"
  );
};

function inferMediaType(item: any): MediaType {
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

function typeLabelOf(item: any): "Movie" | "TV" | "Ani" {
  if (isAni(item)) return "Ani";
  return inferMediaType(item) === "tv" ? "TV" : "Movie";
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

function Chip({
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

/**
 * - 영화: "상영중" / "상영예정"만 표시
 * - TV/OTT: "상영예정"만 표시(그 외는 표시 X)
 */
function getAiringChip(
  item: Movie,
  metaNowPlaying?: boolean
): { label: string; tone: "green" | "blue" } | null {
  const mt = inferMediaType(item);

  const NOW = { label: "상영중", tone: "green" as const };
  const UPCOMING = { label: "상영예정", tone: "blue" as const };

  const today = new Date();

  if (mt === "movie") {
    const rel = parseYmdToDate(item.release_date);

    const hasExplicit =
      typeof item.isNowPlaying === "boolean" ||
      typeof metaNowPlaying === "boolean";
    const explicitNow = item.isNowPlaying === true || metaNowPlaying === true;

    if (rel) {
      const diff = daysDiff(today, rel);
      if (diff < 0) return UPCOMING;

      if (hasExplicit) return explicitNow ? NOW : null;

      // 플래그 없으면 휴리스틱(최근 90일 = 상영중 추정)
      const likelyNowPlaying = diff <= 90;
      return likelyNowPlaying ? NOW : null;
    }

    if (hasExplicit) return explicitNow ? NOW : null;
    return null;
  }

  // TV/OTT: 상영예정만
  const first = parseYmdToDate(item.first_air_date);
  if (first && daysDiff(today, first) < 0) return UPCOMING;

  return null;
}

function RankBadge({ rank }: { rank: number }) {
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

export function FavoritesCarousel({
  movies,
  onMovieClick,
  onToggleFavorite,
}: FavoritesCarouselProps) {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => isLoggedInFallback());
  const [trendMovies, setTrendMovies] = useState<Movie[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<number | null>(null);

  const [heroMeta, setHeroMeta] = useState<{
    providers: ProviderBadge[];
    ageRating: string;
    isNowPlaying?: boolean;
  } | null>(null);

  // ✅ auth 변경 감지
  useEffect(() => {
    const sync = () => setLoggedIn(isLoggedInFallback());
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // ✅ 비로그인 트렌드 로드
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
          const tmdbId = it.tmdbId ?? null;

          if (tmdbId && Number.isFinite(tmdbId)) {
            let detail = detailCache.get(tmdbId);
            if (!detail) {
              try {
                detail = await getMovieDetails(tmdbId);
                detailCache.set(tmdbId, detail);
              } catch {
                detail = null;
              }
            }

            if (detail) {
              mapped.push({
                ...(detail as any),
                id: detail.id ?? tmdbId,
                media_type: "movie",
                trendRank: it.rank,
                trendScore: it.score,
              });
              continue;
            }
          }

          mapped.push({
            id: Number(tmdbId ?? it.rank),
            title: it.keyword,
            poster_path: null,
            backdrop_path: null,
            overview: "",
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
    return loggedIn ? movies : trendMovies;
  }, [loggedIn, movies, trendMovies]);

  const currentMovie: Movie | null = useMemo(() => {
    return activeMovies[currentIndex] ?? null;
  }, [activeMovies, currentIndex]);

  // ✅ 목록 바뀌면 인덱스 리셋
  useEffect(() => {
    setCurrentIndex(0);
  }, [activeMovies.length]);

  // ✅ 자동 넘김
  useEffect(() => {
    if (activeMovies.length <= 1) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % activeMovies.length);
    }, AUTO_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [activeMovies.length, currentIndex]);

  const goToPrevious = () => {
    if (activeMovies.length <= 1) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setCurrentIndex(
      (prev) => (prev - 1 + activeMovies.length) % activeMovies.length
    );
  };

  const goToNext = () => {
    if (activeMovies.length <= 1) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setCurrentIndex((prev) => (prev + 1) % activeMovies.length);
  };

  const jumpTo = (index: number) => {
    if (activeMovies.length <= 1) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setCurrentIndex(index);
  };

  // ✅ hero meta 로드(OTT/연령/상영중)
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

  // ===== 렌더 =====

  if (activeMovies.length === 0) {
    if (!loggedIn) {
      return (
        <div className="relative h-[600px] bg-gradient-to-b from-purple-900/20 to-transparent mb-5 flex items-center justify-center">
          <div className="text-center">
            <Sparkles className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">
              {trendLoading
                ? "오늘의 인기 차트를 불러오는 중..."
                : "오늘의 인기 차트가 없습니다"}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {trendLoading
                ? "잠시만 기다려주세요!"
                : "잠시 후 다시 시도해보세요."}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="relative h-[600px] bg-gradient-to-b from-purple-900/20 to-transparent mb-5 flex items-center justify-center">
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">아직 찜한 영화가 없습니다</p>
          <p className="text-gray-500 text-sm mt-2">
            마음에 드는 영화를 찜해보세요!
          </p>
        </div>
      </div>
    );
  }

  if (!currentMovie) {
    return (
      <div className="relative h-[500px] bg-gradient-to-b from-purple-900/20 to-transparent rounded-xl mb-10 mx-6 flex items-center justify-center border border-white/10">
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">영화 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const providers =
    (Array.isArray(currentMovie.providers) && currentMovie.providers.length
      ? currentMovie.providers
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
    currentMovie.ageRating || heroMeta?.ageRating || "—"
  );
  const showAge = ageValue !== "—";

  const typeText = typeLabelOf(currentMovie);
  const airingChip = getAiringChip(currentMovie, heroMeta?.isNowPlaying);

  const hasBackdrop = !!(
    currentMovie.backdrop_path || currentMovie.poster_path
  );

  const yearText = (() => {
    const raw = currentMovie.release_date || currentMovie.first_air_date || "";
    if (!raw) return null;
    const y = new Date(raw).getFullYear();
    return Number.isFinite(y) ? String(y) : null;
  })();

  return (
    <div className="relative h-main-carousel mb-5 overflow-hidden group z-30">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${loggedIn ? "fav" : "trend"}:${currentMovie.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0">
            {hasBackdrop ? (
              <img
                src={getBackdropUrl(
                  currentMovie.backdrop_path ||
                    currentMovie.poster_path ||
                    null,
                  "original"
                )}
                alt={getDisplayTitle(currentMovie)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-black via-black/70 to-transparent" />
            )}

            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a24] via-transparent to-transparent" />
          </div>

          <div className="relative h-full flex items-center px-12 carousel-content">
            <div className="max-w-2xl mt-10">
              <div className="flex items-center gap-2 mb-3">
                {loggedIn ? (
                  <>
                    <Heart className="w-5 h-5 fill-current text-red-500" />
                    <span className="text-purple-300 text-sm font-semibold">
                      내 찜 목록
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-purple-300" />
                    <span className="text-purple-300 text-sm font-semibold">
                      오늘의 PickMovie 인기 차트
                    </span>
                    {typeof currentMovie.trendRank === "number" && (
                      <div className="ml-2">
                        <RankBadge rank={currentMovie.trendRank} />
                      </div>
                    )}
                  </>
                )}
              </div>

              <h1 className="text-white mb-4 font-semibold carousel-title">
                {getDisplayTitle(currentMovie)}
              </h1>

              {/* ✅ 요청: 배지/메타를 '출시년도 바로 오른쪽'에 배치 */}
              <div className="flex items-center gap-4 mb-4 text-sm carousel-middle">
                <div className="flex items-center gap-1 shrink-0">
                  <Star className="w-4 h-4 fill-current text-yellow-400" />
                  <span className="text-white font-semibold">
                    {(currentMovie.vote_average ?? 0).toFixed(1)}
                  </span>
                </div>

                {yearText && (
                  <span className="text-gray-300 font-semibold shrink-0">
                    {yearText}
                  </span>
                )}

                {/* meta 영역: year 오른쪽에 붙어서, 길면 가로 스크롤 */}
                <div className="min-w-0 flex-1 overflow-x-auto">
                  <div className="flex items-center gap-2 flex-nowrap w-max">
                    <Chip tone="dark">{typeText}</Chip>
                    {airingChip && (
                      <Chip tone={airingChip.tone}>{airingChip.label}</Chip>
                    )}
                    {showAge && <AgeBadge value={ageValue} />}

                    {visibleProviders.length > 0 && (
                      <div className="flex items-center gap-1 flex-nowrap">
                        {visibleProviders.map((p) => (
                          <div
                            key={p.name}
                            className="w-[25px] h-[25px] rounded-[4px] bg-black/40 backdrop-blur-sm overflow-hidden flex items-center justify-center shadow-sm shrink-0"
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
                          <span className="h-[26px] rounded-[5px] bg-black/40 backdrop-blur-sm px-2 text-[12px] font-extrabold text-white/90 flex items-center shadow-sm border border-white/10 shrink-0">
                            +{hiddenCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {currentMovie.overview && (
                <p className="text-gray-300 text-sm leading-relaxed mb-6 line-clamp-3 mobile-xs">
                  {currentMovie.overview}
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => onMovieClick(currentMovie)}
                  size="lg"
                  className="bg-white/20 backdrop-blur-md border border-white/30 text-white hover:bg-white/30 hover:border-white/50 transition-all shadow-lg"
                >
                  <Info className="w-5 h-5 mr-2" />
                  <span className="font-semibold">상세 정보</span>
                </Button>

                {loggedIn ? (
                  <Button
                    onClick={() =>
                      onToggleFavorite(currentMovie.id, currentMovie.media_type)
                    }
                    size="lg"
                    className="bg-red-500/20 backdrop-blur-md border border-red-400/30 text-white hover:bg-red-500/30 hover:border-red-400/50 transition-all shadow-lg"
                  >
                    <Heart className="w-5 h-5 mr-2 fill-current text-red-400" />
                    <span className="font-semibold">찜 해제</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    disabled
                    className="bg-black/20 backdrop-blur-md border border-white/10 text-white/60 shadow-lg cursor-not-allowed"
                    title="로그인하면 찜 기능을 사용할 수 있어요"
                  >
                    <Heart className="w-5 h-5 mr-2" />
                    <span className="font-semibold">로그인 후 찜 가능</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {activeMovies.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            aria-label="이전 슬라이드"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={goToNext}
            aria-label="다음 슬라이드"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </>
      )}

      {activeMovies.length > 1 && (
        <div className="absolute bottom-6 right-6 flex gap-2 z-10">
          {activeMovies.map((_, index) => (
            <button
              key={index}
              onClick={() => jumpTo(index)}
              aria-label={`슬라이드 ${index + 1}`}
              className={`h-1 rounded-full transition-all ${
                index === currentIndex
                  ? "w-8 bg-white"
                  : "w-4 bg-white/40 hover:bg-white/60"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
