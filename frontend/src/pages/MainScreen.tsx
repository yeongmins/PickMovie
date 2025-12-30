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

// Lazy Components
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

// ✅ 신규가입자용 온보딩 모달 제어 키
// - 회원가입 성공 시(로그인 직후) 아래 NEW_USER_FLAG 를 "1"로 세팅해두면,
//   메인(home) 진입 시 1회만 모달이 뜹니다.
const NEW_USER_FLAG = "pickmovie_new_signup"; // "1"이면 신규가입자 플래그로 간주
const ONBOARDING_PROMPT_SEEN = "pickmovie_onboarding_prompt_seen"; // "1"이면 다시 안뜸

// ✅ 한국 기준 옵션
const KR = { region: "KR", language: "ko-KR" } as const;

// ✅ lib/tmdb 함수 시그니처가 달라도 깨지지 않게
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
          {/* overlay */}
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={onLater}
          />

          {/* modal */}
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

  // ✅ auth 상태
  const [loggedIn, setLoggedIn] = useState<boolean>(() => isLoggedInFallback());

  // Data States
  const [favoriteMovies, setFavoriteMovies] = useState<MovieWithScore[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularTV, setPopularTV] = useState<TMDBMovie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<TMDBMovie[]>([]);
  const [latestMovies, setLatestMovies] = useState<TMDBMovie[]>([]);

  // ✅ (요구 1) 내 찜/데이터 기반 "당신을 위한 추천"
  const [forYouMovies, setForYouMovies] = useState<TMDBMovie[]>([]);
  const [forYouLoading, setForYouLoading] = useState(false);
  const forYouOnceRef = useRef(false);

  // ✅ (요구 2) PickMovie 인기차트 Top 20
  const [trendMoviesRaw, setTrendMoviesRaw] = useState<TMDBMovie[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  // ✅ (요구 4) 신규가입자 온보딩 모달
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);

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

  // ✅ 신규가입자: 메인(home) 진입 시 1회만 온보딩 모달 노출
  useEffect(() => {
    if (!loggedIn) {
      setShowOnboardingPrompt(false);
      return;
    }
    if (currentSection !== "home") {
      setShowOnboardingPrompt(false);
      return;
    }

    try {
      const isNew = localStorage.getItem(NEW_USER_FLAG) === "1";
      const seen = localStorage.getItem(ONBOARDING_PROMPT_SEEN) === "1";
      if (isNew && !seen) setShowOnboardingPrompt(true);
      else setShowOnboardingPrompt(false);
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
    else navigate("/onboarding"); // 라우팅이 다르면 이 경로만 바꿔줘
  }, [dismissOnboardingPrompt, onReanalyze, navigate]);

  // ✅ 상단 찜 캐러셀용 (찜 상세)
  const loadFavoriteMoviesDetails = useCallback(async () => {
    if (!favorites.length) {
      setFavoriteMovies([]);
      return;
    }

    try {
      const detailPromises = favorites.map(async (item) => {
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
      });

      const settled = await Promise.all(detailPromises);
      setFavoriteMovies(settled.filter((m): m is MovieWithScore => m !== null));
    } catch (error) {
      console.error(error);
    }
  }, [favorites, userPreferences]);

  // ✅ 공통 Row 데이터 로드 (인기/TV/평점/최신)
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
        (popular || []).map((m) => ({
          ...(m as any),
          media_type: "movie",
        }))
      );

      setPopularTV(
        (tv || []).map((t) => ({ ...(t as any), media_type: "tv" }))
      );

      setTopRatedMovies(
        (topRated || []).map((m) => ({
          ...(m as any),
          media_type: "movie",
        }))
      );

      setLatestMovies(
        (latest || []).map((m) => ({
          ...(m as any),
          media_type: "movie",
        }))
      );
    } catch (error) {
      console.error(error);
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

  // ✅ (요구 2) PickMovie 인기차트 Top 20 로드
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

              return {
                ...(d as any),
                media_type: "movie",
              } as any;
            } catch {
              return null;
            }
          })
        );

        if (!mounted) return;

        const cleaned = details.filter(Boolean).map((m: any) => ({ ...m }));
        setTrendMoviesRaw(cleaned as any[]);
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

  const trendMovies = useMemo(() => {
    return trendMoviesRaw || [];
  }, [trendMoviesRaw]);

  // ✅ (요구 1) 로그인 + 내 찜/데이터 기반 "당신을 위한 추천"
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
        // 1) 찜에서 장르 추출(상세 기반)
        const counts = new Map<number, number>();
        for (const f of favoriteMovies) {
          const ids = extractGenreIdsFromAny(f);
          for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
        }

        // 2) prefs 장르도 약간 보조(정밀분석 결과가 있다면)
        const prefIds = (userPreferences?.genres || [])
          .map((g) => GENRE_IDS[g])
          .filter(Boolean) as number[];

        // 3) Top 장르 선택
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

        // 4) discover로 후보 수집(2페이지)
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

        // 5) 중복 제거 + 찜 제외
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
          .map((m) => ({
            ...(m as any),
            media_type: "movie",
          })) as any[];

        // 6) 찜 장르 겹침 기반으로 점수 보강(“내 찜 기반” 체감 강화)
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

            // 0~20 가중 (찜 기반 체감)
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
  }, [loggedIn, currentSection, favorites.length, favoriteMovies.length]);

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

      {/* 상단 큰 캐러셀 */}
      {currentSection === "home" && (
        <section className="relative z-20">
          <Suspense fallback={<div className="h-[260px]" />}>
            <FavoritesCarousel
              movies={favoriteMovies as any}
              onMovieClick={handleMovieClick}
              onToggleFavorite={(id, type) => toggleFav(id, type)}
            />
          </Suspense>
        </section>
      )}

      <main className="page-fade-in pb-20 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            variants={sectionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* 홈 */}
            {currentSection === "home" && (
              <>
                {/* =======================================================
                    ✅ (요구 1) "당신을 위한 추천" — 하단 캐러셀 최상단 배치
                    ======================================================= */}
                {loggedIn && (
                  <>
                    <RowHeader
                      className="mt-10"
                      title="당신을 위한 추천"
                      desc="내 찜/플레이리스트 내역과 내 데이터를 기반으로 생성됐어요."
                    />

                    {forYouLoading ? (
                      <div className="mx-auto w-full px-4 mt-4">
                        <div className="h-24 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-sm text-white/60">
                          추천을 생성 중이에요…{" "}
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        </div>
                      </div>
                    ) : !canBuildForYou ? (
                      <div className="mx-auto w-full px-4 mt-4">
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

                {/* =======================================================
                    ✅ (요구 2) "✨ PickMovie 인기 영화" — 로그인 시에만 노출
                    ======================================================= */}
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
                    ) : trendMovies.length === 0 ? (
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
                          movies={trendMovies as any}
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
                  desc="TMDB 인기 지표를 기반으로 한국 지역에서 많이 보는 영화예요."
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
                  desc="요즘 반응 좋은 TV 프로그램을 모아 보여드려요."
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
                  desc="현재 상영중인 작품 중심으로 빠르게 모아봤어요."
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

            {/* 인기 영화 */}
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

            {/* 인기 TV */}
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

      {/* Footer */}
      <footer className="bg-[#111118]">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10 py-10">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className="text-lg font-semibold">PickMovie</div>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">
                취향 기반 추천 + Picky AI 검색으로 지금 보고 싶은 콘텐츠를
                빠르게 찾는 서비스입니다.
              </p>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">
                Data / APIs
              </div>
              <ul className="mt-2 space-y-2 text-sm text-white/60">
                <li>• TMDB API (영화/TV 메타데이터, 포스터, 평점, 장르)</li>
                <li>• KOBIS API (박스오피스/영화 정보 데이터)</li>
                <li>• Naver API (트렌드/검색 데이터)</li>
                <li>• YouTube Data API (예고편/영상 데이터)</li>
                <li>• Google Gemini API (Picky 자연어 취향 분석/추천 보조)</li>
              </ul>

              <div className="mt-4 text-xs text-white/40 leading-relaxed">
                This product uses the TMDB API but is not endorsed or certified
                by TMDB.
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">Contact</div>
              <div className="mt-2 text-sm text-white/60">
                문의:{" "}
                <a
                  className="text-purple-300 hover:text-purple-200 underline underline-offset-4"
                  href="mailto:yeongmins123@gmail.com"
                >
                  yeongmins123@gmail.com
                </a>
              </div>
              <div className="mt-3 text-xs text-white/40">
                오류/개선 제안은 이메일로 편하게 보내주세요.
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/35">
            <span>© {new Date().getFullYear()} PickMovie</span>
            <span>Sources: TMDB / KOBIS / Naver / YouTube / Google Gemini</span>
          </div>
        </div>
      </footer>

      {/* 모달 */}
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
