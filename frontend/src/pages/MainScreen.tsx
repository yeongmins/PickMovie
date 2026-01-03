// frontend/src/pages/MainScreen.tsx
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Footer } from "../components/layout/Footer";

import type { UserPreferences } from "../features/onboarding/Onboarding";
import type { FavoriteItem } from "../App";

import { apiGet } from "../lib/apiClient";
import {
  getPopularMovies,
  getPopularTVShows,
  getTopRatedMovies,
  getNowPlayingMovies,
  discoverMovies,
  getMovieDetails,
  getTVDetails,
  calculateMatchScore,
  getPosterUrl,
  normalizeTVToMovie,
  GENRE_IDS,
  type TMDBMovie,
} from "../lib/tmdb";

const Header = lazy(() =>
  import("../components/layout/Header").then((m) => ({ default: m.Header }))
);

const FavoritesCarousel = lazy(() =>
  import("../features/favorites/components/FavoritesCarousel").then((m) => ({
    default: m.FavoritesCarousel,
  }))
);

const MovieRow = lazy(() =>
  import("../features/movies/components/MovieRow").then((m) => ({
    default: m.MovieRow,
  }))
);

const MovieDetailModal = lazy(() =>
  import("../features/movies/components/MovieDetailModal").then((m) => ({
    default: m.MovieDetailModal,
  }))
);

const TrailerOverlay = lazy(() =>
  import("../features/favorites/components/TrailerOverlay").then((m) => ({
    default: m.TrailerOverlay,
  }))
);

type Section = "home" | "popular-movies" | "popular-tv";
type MediaType = "movie" | "tv";

export interface MainScreenProps {
  userPreferences: UserPreferences;
  favorites: FavoriteItem[];
  onReanalyze?: () => void;
  onToggleFavorite?: (movieId: number, mediaType?: MediaType) => void;
  initialSection: Section;
  isAuthed?: boolean;
}

export interface MovieWithScore extends TMDBMovie {
  matchScore?: number;
}

const sectionVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
};

function withMatchScore(
  movie: TMDBMovie,
  prefs: UserPreferences
): MovieWithScore {
  return { ...movie, matchScore: calculateMatchScore(movie, prefs) };
}

function buildGenreString(details: any): string {
  const list = details?.genres;
  if (Array.isArray(list) && list.length) {
    return list
      .map((g: any) => g?.name)
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

const AUTH_EVENT = "pickmovie-auth-changed";

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

const NEW_USER_FLAG = "pickmovie_new_signup";
const ONBOARDING_PROMPT_SEEN = "pickmovie_onboarding_prompt_seen";
const KR = { region: "KR", language: "ko-KR" } as const;

async function safeCall<T>(fn: any, args: any): Promise<T> {
  try {
    return (await fn(args)) as T;
  } catch {
    return (await fn()) as T;
  }
}

function extractGenreIdsFromAny(item: any): number[] {
  const a = Array.isArray(item?.genre_ids) ? item.genre_ids : [];
  const b = Array.isArray(item?.genres)
    ? item.genres.map((g: any) => g?.id).filter((x: any) => Number.isFinite(x))
    : [];
  const merged = [...a, ...b].filter((x) => typeof x === "number" && x > 0);
  return Array.from(new Set(merged));
}

function RowHeader({
  title,
  desc,
  className,
}: {
  title: string;
  desc: string;
  className?: string;
}) {
  return (
    <div className={["mx-auto w-full px-6 mt-10", className ?? ""].join(" ")}>
      <h2 className="text-white text-xl tracking-tight font-semibold">
        {title}
      </h2>
      <div className="mt-1 text-sm text-white/55">{desc}</div>
    </div>
  );
}

function OnboardingPromptModal({
  open,
  onStart,
  onLater,
}: {
  open: boolean;
  onStart: () => void;
  onLater: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={onLater}
          />

          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 10, scale: 0.985, filter: "blur(10px)" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative w-full max-w-[720px] rounded-2xl border border-white/10 bg-[#1a1a24]/90 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="p-6 sm:p-7">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-xl">✨</span>
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white">
                    정밀 분석(온보딩)을 하면 추천이 더 정확해져요
                  </div>
                  <div className="mt-1 text-sm text-white/60 leading-relaxed">
                    1분만 투자하면{" "}
                    <span className="text-white/85 font-semibold">
                      취향 기반 추천
                    </span>
                    과{" "}
                    <span className="text-white/85 font-semibold">
                      Picky 검색 품질
                    </span>
                    이 확 올라가요. (선택사항)
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onLater}
                  className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/80 transition"
                >
                  나중에
                </button>
                <button
                  type="button"
                  onClick={onStart}
                  className="h-10 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white transition shadow-sm"
                >
                  정밀 분석 시작
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MainScreen({
  userPreferences,
  favorites,
  onToggleFavorite,
  onReanalyze,
  initialSection,
}: MainScreenProps) {
  const navigate = useNavigate();
  const currentSection = initialSection;

  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState<boolean>(() => isLoggedInFallback());

  const [favoriteMovies, setFavoriteMovies] = useState<MovieWithScore[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularTV, setPopularTV] = useState<TMDBMovie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<TMDBMovie[]>([]);
  const [latestMovies, setLatestMovies] = useState<TMDBMovie[]>([]);

  const [forYouMovies, setForYouMovies] = useState<TMDBMovie[]>([]);
  const [forYouLoading, setForYouLoading] = useState(false);
  const forYouOnceRef = useRef(false);

  const [trendMoviesRaw, setTrendMoviesRaw] = useState<TMDBMovie[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);

  const [trailerTarget, setTrailerTarget] = useState<{
    id: number;
    mediaType: MediaType;
    title?: string;
  } | null>(null);

  const favoriteKeySet = useMemo(() => {
    return new Set(favorites.map((f) => `${f.mediaType}:${f.id}`));
  }, [favorites]);

  const favoriteIdList = useMemo(() => favorites.map((f) => f.id), [favorites]);

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
    window.scrollTo(0, 0);
  }, [currentSection]);

  useEffect(() => {
    if (!loggedIn || currentSection !== "home") {
      setShowOnboardingPrompt(false);
      return;
    }

    try {
      const isNew = localStorage.getItem(NEW_USER_FLAG) === "1";
      const seen = localStorage.getItem(ONBOARDING_PROMPT_SEEN) === "1";
      setShowOnboardingPrompt(isNew && !seen);
    } catch {
      setShowOnboardingPrompt(false);
    }
  }, [loggedIn, currentSection]);

  const dismissOnboardingPrompt = useCallback(() => {
    setShowOnboardingPrompt(false);
    try {
      localStorage.setItem(ONBOARDING_PROMPT_SEEN, "1");
      localStorage.setItem(NEW_USER_FLAG, "0");
    } catch {}
  }, []);

  const startOnboarding = useCallback(() => {
    dismissOnboardingPrompt();
    if (onReanalyze) onReanalyze();
    else navigate("/onboarding");
  }, [dismissOnboardingPrompt, onReanalyze, navigate]);

  const loadFavoriteMoviesDetails = useCallback(async () => {
    if (!favorites.length) {
      setFavoriteMovies([]);
      return;
    }

    const settled = await Promise.all(
      favorites.map(async (item) => {
        try {
          const detail =
            item.mediaType === "tv"
              ? await getTVDetails(item.id)
              : await getMovieDetails(item.id);

          if (!detail) return null;

          const baseMovie =
            item.mediaType === "tv" ? normalizeTVToMovie(detail) : detail;
          const fixed = { ...(baseMovie as any), media_type: item.mediaType };
          return withMatchScore(fixed as TMDBMovie, userPreferences);
        } catch {
          return null;
        }
      })
    );

    setFavoriteMovies(settled.filter((m): m is MovieWithScore => m !== null));
  }, [favorites, userPreferences]);

  const loadAllData = useCallback(async () => {
    setLoading(true);

    try {
      const [popular, tv, topRated, latest] = await Promise.all([
        safeCall<TMDBMovie[]>(getPopularMovies, KR),
        safeCall<TMDBMovie[]>(getPopularTVShows, KR),
        safeCall<TMDBMovie[]>(getTopRatedMovies, KR),
        safeCall<TMDBMovie[]>(getNowPlayingMovies, KR),
      ]);

      setPopularMovies(
        (popular || []).map((m) => ({ ...(m as any), media_type: "movie" }))
      );
      setPopularTV(
        (tv || []).map((t) => ({ ...(t as any), media_type: "tv" }))
      );
      setTopRatedMovies(
        (topRated || []).map((m) => ({ ...(m as any), media_type: "movie" }))
      );
      setLatestMovies(
        (latest || []).map((m) => ({ ...(m as any), media_type: "movie" }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    loadFavoriteMoviesDetails();
  }, [loadFavoriteMoviesDetails]);

  useEffect(() => {
    if (currentSection !== "home") return;

    if (!loggedIn) {
      setTrendMoviesRaw([]);
      setTrendLoading(false);
      return;
    }

    let mounted = true;
    setTrendLoading(true);

    (async () => {
      try {
        const r = await apiGet<{
          date: string;
          items: Array<{
            tmdbId: number | null;
            keyword: string;
            rank: number;
            score: number;
          }>;
        }>("/trends/kr", { limit: 20 });

        const items = Array.isArray(r?.items) ? r.items : [];
        const targets = items
          .filter((x) => typeof x.tmdbId === "number" && x.tmdbId)
          .slice(0, 20);

        const details = await Promise.all(
          targets.map(async (it) => {
            try {
              const d = await getMovieDetails(it.tmdbId as number);
              if (!d) return null;
              return { ...(d as any), media_type: "movie" } as any;
            } catch {
              return null;
            }
          })
        );

        if (!mounted) return;
        setTrendMoviesRaw(details.filter(Boolean) as any[]);
      } catch {
        if (mounted) setTrendMoviesRaw([]);
      } finally {
        if (mounted) setTrendLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [currentSection, loggedIn]);

  useEffect(() => {
    if (forYouOnceRef.current) return;
    if (!loggedIn || currentSection !== "home") return;

    const MIN_FAV = 5;
    if (favorites.length < MIN_FAV || favoriteMovies.length < 1) return;

    let mounted = true;
    setForYouLoading(true);
    forYouOnceRef.current = true;

    (async () => {
      try {
        const counts = new Map<number, number>();
        for (const f of favoriteMovies) {
          const ids = extractGenreIdsFromAny(f);
          for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
        }

        const prefIds = (userPreferences?.genres || [])
          .map((g) => GENRE_IDS[g])
          .filter(Boolean) as number[];

        const topFromFav = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id)
          .slice(0, 5);

        const seedGenreIds = Array.from(
          new Set([...topFromFav, ...prefIds])
        ).slice(0, 6);
        if (!seedGenreIds.length) {
          if (mounted) setForYouMovies([]);
          return;
        }

        const [p1, p2] = await Promise.all([
          safeCall<TMDBMovie[]>(discoverMovies, {
            genres: seedGenreIds,
            page: 1,
            ...KR,
          }),
          safeCall<TMDBMovie[]>(discoverMovies, {
            genres: seedGenreIds,
            page: 2,
            ...KR,
          }),
        ]);

        const pool = [...(p1 || []), ...(p2 || [])];

        const seen = new Set<number>();
        const favMovieIds = new Set(
          favorites.filter((x) => x.mediaType === "movie").map((x) => x.id)
        );

        const candidates = pool
          .filter((m) => m && typeof (m as any).id === "number")
          .filter((m) => !favMovieIds.has((m as any).id))
          .filter((m) => {
            const id = (m as any).id;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .map((m) => ({ ...(m as any), media_type: "movie" })) as any[];

        const favGenreSet = new Set<number>();
        for (const f of favoriteMovies) {
          extractGenreIdsFromAny(f).forEach((id) => favGenreSet.add(id));
        }

        const scored = candidates
          .map((m: any) => {
            const base = calculateMatchScore(m as TMDBMovie, userPreferences);
            const gids = extractGenreIdsFromAny(m);
            const overlap =
              gids.length > 0
                ? gids.filter((id) => favGenreSet.has(id)).length / gids.length
                : 0;

            const boosted = Math.max(0, Math.min(99, base + overlap * 20));

            return {
              ...(m as any),
              matchScore: boosted,
              showMatchBadge: true,
              recommendReason: "내 찜/플레이리스트 패턴 기반",
            };
          })
          .sort((a: any, b: any) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
          .slice(0, 20);

        if (mounted) setForYouMovies(scored);
      } catch {
        if (mounted) setForYouMovies([]);
      } finally {
        if (mounted) setForYouLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loggedIn, currentSection, favorites, favoriteMovies, userPreferences]);

  const handleMovieClick = useCallback(
    async (movie: any) => {
      try {
        const mt: MediaType = (movie.media_type || "movie") as MediaType;

        const details =
          mt === "tv"
            ? await getTVDetails(movie.id)
            : await getMovieDetails(movie.id);
        const merged = { ...movie, ...(details || {}) };
        const genre = buildGenreString(details);

        setSelectedMovie({
          ...merged,
          genre,
          poster: getPosterUrl(
            merged.poster_path || details?.poster_path,
            "w500"
          ),
          tmdbId: movie.id,
          mediaType: mt,
          vote_average:
            typeof merged.vote_average === "number" ? merged.vote_average : 0,
          matchScore: calculateMatchScore(merged as TMDBMovie, userPreferences),
        });
      } catch (e) {
        console.error(e);
      }
    },
    [userPreferences]
  );

  const toggleFav = useCallback(
    (id: number, type?: MediaType) => {
      onToggleFavorite?.(id, (type || "movie") as MediaType);
    },
    [onToggleFavorite]
  );

  const openTrailerFromCarousel = useCallback((movie: any) => {
    const mt: MediaType = (movie?.media_type || "movie") as MediaType;
    const title =
      movie?.title ??
      movie?.name ??
      movie?.original_title ??
      movie?.original_name ??
      "";
    setTrailerTarget({ id: Number(movie.id), mediaType: mt, title });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a24] flex items-center justify-center">
        <Loader2
          className="w-12 h-12 animate-spin text-purple-400"
          aria-label="로딩 중"
        />
      </div>
    );
  }

  const MIN_FAV_FOR_YOU = 5;
  const canBuildForYou = loggedIn && favorites.length >= MIN_FAV_FOR_YOU;

  return (
    <div className="min-h-screen bg-[#1a1a24] text-white overflow-x-hidden flex flex-col">
      <Suspense fallback={<div className="h-16" />}>
        <Header currentSection={currentSection} />
      </Suspense>

      <OnboardingPromptModal
        open={showOnboardingPrompt}
        onStart={startOnboarding}
        onLater={dismissOnboardingPrompt}
      />

      <Suspense fallback={null}>
        <TrailerOverlay
          open={!!trailerTarget}
          target={trailerTarget}
          onClose={() => setTrailerTarget(null)}
          topInset={60}
        />
      </Suspense>

      {currentSection === "home" && (
        <section className="relative z-20 h-[80svh] min-h-[80svh] flex flex-col">
          <div className="flex-1 min-h-0 relative">
            <Suspense fallback={<div className="h-[80svh]" />}>
              <FavoritesCarousel
                movies={favoriteMovies as any}
                onMovieClick={handleMovieClick as any}
                onToggleFavorite={(id, type) => toggleFav(id, type)}
                onTrailerClick={openTrailerFromCarousel}
              />
            </Suspense>
          </div>
        </section>
      )}

      <main className="page-fade-in flex-1 z-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            variants={sectionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {currentSection === "home" && (
              <>
                {loggedIn && (
                  <>
                    <RowHeader
                      className="mt-10"
                      title="❤️ 당신을 위한 추천"
                      desc="내 찜/플레이리스트 기반으로 생성된 추천 목록입니다."
                    />

                    {forYouLoading ? (
                      <div className="mx-auto w-full px-4 mt-4">
                        <div className="h-24 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-sm text-white/60">
                          새로고침 시 생성됩니다...{" "}
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        </div>
                      </div>
                    ) : !canBuildForYou ? (
                      <div className="mx-auto w-full px-6 mt-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                          찜을{" "}
                          <span className="text-white/85 font-semibold">
                            {MIN_FAV_FOR_YOU}개
                          </span>{" "}
                          이상 추가하면 “당신을 위한 추천”이 더 정확해져요.
                        </div>
                      </div>
                    ) : forYouMovies.length === 0 ? (
                      <div className="mx-auto w-full px-4 mt-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                          추천을 만들지 못했어요. 잠시 후 다시 시도해 주세요.
                        </div>
                      </div>
                    ) : (
                      <Suspense fallback={<div className="h-40" />}>
                        <MovieRow
                          title=""
                          movies={forYouMovies as any}
                          favorites={favoriteIdList}
                          favoriteKeySet={favoriteKeySet}
                          onToggleFavorite={(id: number, type?: MediaType) =>
                            toggleFav(id, type)
                          }
                          onMovieClick={handleMovieClick}
                        />
                      </Suspense>
                    )}
                  </>
                )}

                {loggedIn && (
                  <>
                    <RowHeader
                      className="mt-10"
                      title="✨ PickMovie 인기 영화"
                      desc="PickMovie의 알고리즘을 적용한 인기 영화입니다."
                    />

                    {trendLoading ? (
                      <div className="mx-auto w-full px-4 mt-4">
                        <div className="h-24 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-sm text-white/60">
                          인기차트를 불러오는 중…{" "}
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        </div>
                      </div>
                    ) : trendMoviesRaw.length === 0 ? (
                      <div className="mx-auto w-full px-4 mt-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                          인기차트를 불러오지 못했어요. 잠시 후 다시 시도해
                          주세요.
                        </div>
                      </div>
                    ) : (
                      <Suspense fallback={<div className="h-40" />}>
                        <MovieRow
                          title=""
                          movies={trendMoviesRaw as any}
                          favorites={favoriteIdList}
                          favoriteKeySet={favoriteKeySet}
                          onToggleFavorite={(id: number, type?: MediaType) =>
                            toggleFav(id, type)
                          }
                          onMovieClick={handleMovieClick}
                        />
                      </Suspense>
                    )}
                  </>
                )}

                <RowHeader
                  className="mt-10"
                  title="🔥 인기 영화"
                  desc="TMDB 인기 지표를 기반으로 한국 지역에서 많이 보는 영화입니다."
                />
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title=""
                    movies={popularMovies as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>

                <RowHeader
                  className="mt-10"
                  title="📺 인기 TV 프로그램"
                  desc="TMDB 인기 지표를 기반으로 한국 지역에서 많이 보는 TV 콘텐츠입니다."
                />
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title=""
                    movies={popularTV as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>

                <RowHeader
                  className="mt-10"
                  title="🎬 최신 개봉작"
                  desc="현재 상영 중 / 재개봉 중인 작품입니다."
                />
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title=""
                    movies={latestMovies as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>
              </>
            )}

            {currentSection === "popular-movies" && (
              <section className="pt-24">
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="🔥 인기 영화"
                    movies={popularMovies as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>

                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="⭐ 평점 높은 영화"
                    movies={topRatedMovies as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>
              </section>
            )}

            {currentSection === "popular-tv" && (
              <section className="pt-24">
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="📺 인기 TV 프로그램"
                    movies={popularTV as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer />

      <AnimatePresence>
        {selectedMovie && (
          <Suspense fallback={null}>
            <MovieDetailModal
              movie={selectedMovie}
              onClose={() => setSelectedMovie(null)}
              isFavorite={favoriteKeySet.has(
                `${selectedMovie.mediaType}:${selectedMovie.id}`
              )}
              onToggleFavorite={() =>
                toggleFav(selectedMovie.id, selectedMovie.mediaType)
              }
              userPreferences={userPreferences}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
