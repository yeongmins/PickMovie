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
import { useNavigate, useLocation } from "react-router-dom";
import { PageFooter } from "../components/layout/Footer";

import type { UserPreferences } from "../features/onboarding/Onboarding";
import type { FavoriteItem } from "../App";

import { apiGet, apiPost } from "../lib/apiClient";
import { AUTH_EVENT, isLoggedInFallback } from "../lib/auth";
import {
  getPopularMovies,
  getPopularTVShows,
  getTopRatedMovies,
  getNowPlayingMovies,
  calculateMatchScore,
  normalizeTVToMovie,
  type TMDBMovie,
} from "../lib/tmdb";

const Header = lazy(() =>
  import("../components/layout/Header").then((m) => ({ default: m.Header })),
);

const FavoritesCarousel = lazy(() =>
  import("../features/favorites/components/FavoritesCarousel").then((m) => ({
    default: m.FavoritesCarousel,
  })),
);

const ContentRow = lazy(() =>
  import("../components/content/ContentRow").then((m) => ({
    default: m.ContentRow,
  })),
);

const TrailerOverlay = lazy(() =>
  import("../features/favorites/components/TrailerOverlay").then((m) => ({
    default: m.TrailerOverlay,
  })),
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

type HomeCollectionKey =
  | "POPULAR_MOVIE"
  | "POPULAR_TV"
  | "TRENDING_MOVIE"
  | "TRENDING_TV"
  | "BOXOFFICE_TOP10";

type HomeChartItem = { mediaType: MediaType; tmdbId: number; rank: number };
type HomeChartItemHydrated = HomeChartItem & {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
};
type RawBoxOfficeItem = { rank: number; movieCd: string; movieNm: string };
type BoxOfficeAttempt = {
  url: string;
  ok: boolean;
  status?: number;
  message?: string;
  itemCount?: number;
  rawCount?: number;
};

type HomeChartsResponse = {
  collections: Array<{
    key: HomeCollectionKey;
    generatedAt: string;
    items: HomeChartItemHydrated[];
  }>;
};

const sectionVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
};

function withMatchScore(
  movie: TMDBMovie,
  prefs: UserPreferences,
): MovieWithScore {
  return { ...movie, matchScore: calculateMatchScore(movie, prefs) };
}

function unwrapList<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (Array.isArray(v?.results)) return v.results as T[];
  if (Array.isArray(v?.items)) return v.items as T[];
  if (Array.isArray(v?.data)) return v.data as T[];
  return [];
}

const NEW_USER_FLAG = "pickmovie_new_signup";
const ONBOARDING_PROMPT_SEEN = "pickmovie_onboarding_prompt_seen";
const KR = { region: "KR", language: "ko-KR" } as const;
const PICK_REASON_TREND = "PickMovie 트렌드를 반영한 추천";

type TrendSignalItem = {
  rank: number;
  score: number;
};

function trendRankTo01(rank?: number): number {
  if (!Number.isFinite(rank as number)) return 0;
  const r = Math.max(1, Math.min(100, Number(rank)));
  return (101 - r) / 100;
}

function buildTrendBoostedList(
  items: TMDBMovie[],
  opts: {
    mediaType: MediaType;
    movieTrendMap: Record<number, TrendSignalItem>;
    tvTrendRankMap: Record<number, number>;
    reason: string;
    extraNowPlayingBoost?: boolean;
    trendWeight?: number;
    qualityWeight?: number;
  },
): TMDBMovie[] {
  const trendWeight = Number.isFinite(opts.trendWeight)
    ? Number(opts.trendWeight)
    : 0.82;
  const qualityWeight = Number.isFinite(opts.qualityWeight)
    ? Number(opts.qualityWeight)
    : 0.1;

  const scored = items.map((m) => {
    const id = Number((m as any)?.id);
    const movieTrend = opts.movieTrendMap[id];
    const tvRank = opts.tvTrendRankMap[id];

    const trend01 =
      opts.mediaType === "movie"
        ? movieTrend
          ? 0.75 * trendRankTo01(movieTrend.rank) +
            0.25 * Math.max(0, Math.min(1, (movieTrend.score || 0) / 2.5))
          : 0
        : trendRankTo01(tvRank);

    const quality01 = Math.max(
      0,
      Math.min(1, ((Number((m as any)?.vote_average) || 0) - 5) / 5),
    );

    const status01 =
      opts.extraNowPlayingBoost && (m as any)?.isNowPlaying ? 0.12 : 0;

    const pickScore =
      trendWeight * trend01 + qualityWeight * quality01 + status01;
    return {
      ...(m as any),
      media_type: (m as any)?.media_type ?? opts.mediaType,
      recommendReason: opts.reason,
      _pickScore: pickScore,
    };
  });

  scored.sort((a: any, b: any) => (b._pickScore ?? 0) - (a._pickScore ?? 0));
  return scored.map(({ _pickScore, ...rest }: any) => rest as TMDBMovie);
}

/**
 * ✅ 동시성 제한 (기존 UI 유지, 폭주 방지)
 */
async function pMapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let idx = 0;

  const workers = new Array(Math.max(1, Math.min(limit, items.length)))
    .fill(0)
    .map(async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await mapper(items[cur], cur);
      }
    });

  await Promise.all(workers);
  return out;
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
    <div className={["mx-auto w-full px-6", className ?? ""].join(" ")}>
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
                      Search 검색 품질
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

function buildDetailPath(mediaType: MediaType, id: number) {
  return `/title/${mediaType}/${id}`;
}

export function MainScreen({
  userPreferences,
  favorites,
  onToggleFavorite,
  onReanalyze,
  initialSection,
}: MainScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentSection = initialSection;

  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState<boolean>(() => isLoggedInFallback());

  const [favoriteMovies, setFavoriteMovies] = useState<MovieWithScore[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularTV, setPopularTV] = useState<TMDBMovie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<TMDBMovie[]>([]);
  const [latestMovies, setLatestMovies] = useState<TMDBMovie[]>([]);

  // ✅ 비로그인 상단(히어로) = PickMovie 인기차트 Top10
  const [anonHeroMovies, setAnonHeroMovies] = useState<TMDBMovie[]>([]);
  const [anonHeroLoading, setAnonHeroLoading] = useState(false);

  // ✅ 하단 박스오피스 Top10(실제 박스오피스)
  const [boxOfficeMovies, setBoxOfficeMovies] = useState<TMDBMovie[]>([]);
  const [boxOfficeLoading, setBoxOfficeLoading] = useState(false);

  // ✅ (추가) 박스오피스 섹션 desc (백엔드 displayDateLabel 그대로 사용)
  const [boxOfficeDesc, setBoxOfficeDesc] =
    useState<string>("Top10 차트입니다.");
  const [boxOfficeRawItems, setBoxOfficeRawItems] = useState<
    RawBoxOfficeItem[]
  >([]);

  const [forYouMovies, setForYouMovies] = useState<TMDBMovie[]>([]);
  const [forYouLoading, setForYouLoading] = useState(false);
  const forYouRequestSigRef = useRef<string>("");

  const [trendMoviesRaw, setTrendMoviesRaw] = useState<TMDBMovie[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [movieTrendMap, setMovieTrendMap] = useState<
    Record<number, TrendSignalItem>
  >({});
  const [tvTrendRankMap, setTvTrendRankMap] = useState<Record<number, number>>(
    {},
  );

  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);

  const [trailerTarget, setTrailerTarget] = useState<{
    id: number;
    mediaType: MediaType;
    title?: string;
  } | null>(null);

  // ✅ 디테일 캐시(중복 호출 제거)
  const detailCacheRef = useRef<Map<string, any>>(new Map());
  const homeChartsRef = useRef<HomeChartsResponse | null>(null);

  const favoriteKeySet = useMemo(() => {
    return new Set(favorites.map((f) => `${f.mediaType}:${f.id}`));
  }, [favorites]);

  const favoriteIdList = useMemo(() => favorites.map((f) => f.id), [favorites]);

  const popularMoviesPick = useMemo(
    () =>
      buildTrendBoostedList(popularMovies, {
        mediaType: "movie",
        movieTrendMap,
        tvTrendRankMap,
        reason: PICK_REASON_TREND,
      }),
    [popularMovies, movieTrendMap, tvTrendRankMap],
  );

  const popularTvPick = useMemo(
    () =>
      buildTrendBoostedList(popularTV, {
        mediaType: "tv",
        movieTrendMap,
        tvTrendRankMap,
        reason: PICK_REASON_TREND,
      }),
    [popularTV, movieTrendMap, tvTrendRankMap],
  );

  const latestMoviesPick = useMemo(
    () =>
      buildTrendBoostedList(latestMovies, {
        mediaType: "movie",
        movieTrendMap,
        tvTrendRankMap,
        reason: "PickMovie 트렌드와 상영 상태를 반영한 추천",
        extraNowPlayingBoost: true,
        trendWeight: 0.95,
        qualityWeight: 0.04,
      }),
    [latestMovies, movieTrendMap, tvTrendRankMap],
  );

  const fetchDetailCached = useCallback(
    async (
      mediaType: MediaType,
      id: number,
      opts?: { policyBypass?: "boxoffice" },
    ) => {
      const bypass = opts?.policyBypass ? `:${opts.policyBypass}` : "";
      const key = `${mediaType}:${id}${bypass}`;
      const cached = detailCacheRef.current.get(key);
      if (cached) return cached;

      const d = await apiGet<any>(`/tmdb/proxy/${mediaType}/${id}`, {
        ...KR,
        ...(opts?.policyBypass ? { policyBypass: opts.policyBypass } : {}),
      });
      if (d) detailCacheRef.current.set(key, d);
      return d;
    },
    [],
  );

  const hydrateSnapshotItems = useCallback(
    async (items: HomeChartItemHydrated[]) => {
      const sorted = [...items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      const settled = new Array<any | null>(sorted.length).fill(null);
      const missing: Array<{ idx: number; item: HomeChartItemHydrated }> = [];

      for (let i = 0; i < sorted.length; i += 1) {
        const it = sorted[i];
        if (typeof it.title === "string" || typeof it.name === "string") {
          settled[i] = {
            id: it.tmdbId,
            media_type: it.mediaType,
            trendRank: it.rank,
            title: it.title,
            name: it.name,
            original_title: it.original_title,
            original_name: it.original_name,
            overview: it.overview ?? "",
            poster_path: it.poster_path ?? null,
            backdrop_path: it.backdrop_path ?? null,
            vote_average: it.vote_average ?? 0,
            release_date: it.release_date,
            first_air_date: it.first_air_date,
          } as any;
        } else {
          missing.push({ idx: i, item: it });
        }
      }

      if (missing.length > 0) {
        const fetched = await pMapLimit(
          missing,
          6,
          async ({ item }): Promise<any | null> => {
            try {
              const d = await fetchDetailCached(item.mediaType, item.tmdbId);
              if (!d) return null;
              return {
                ...(d as any),
                media_type: item.mediaType,
                trendRank: item.rank,
              } as any;
            } catch {
              return null;
            }
          },
        );
        for (let i = 0; i < missing.length; i += 1) {
          settled[missing[i].idx] = fetched[i];
        }
      }

      return settled.filter(Boolean) as any[];
    },
    [fetchDetailCached],
  );

  const loadHomeChartsSnapshot = useCallback(async () => {
    if (homeChartsRef.current) return homeChartsRef.current;

    const tryUrls = ["/home/charts", "/charts/home", "/charts"];
    for (const url of tryUrls) {
      try {
        const r = await apiGet<HomeChartsResponse>(url, { limit: 50 });
        if (r?.collections && Array.isArray(r.collections)) {
          homeChartsRef.current = r;
          return r;
        }
      } catch {
        // continue
      }
    }

    homeChartsRef.current = null;
    return null;
  }, []);

  const loadAnonHeroTop10 = useCallback(async () => {
    if (currentSection !== "home") return;

    setAnonHeroLoading(true);
    try {
      const r = await apiGet<{
        items?: Array<{
          tmdbId: number | null;
          mediaType?: "movie" | "tv" | "anime";
          tmdbType?: "movie" | "tv" | null;
          rank: number;
          score: number;
        }>;
      }>("/trends/kr", { limit: 20 });

      const items = Array.isArray(r?.items) ? r.items : [];
      const targets = items
        .filter((x) => typeof x.tmdbId === "number" && x.tmdbId)
        .slice(0, 10);

      const details = await pMapLimit(
        targets,
        6,
        async (it): Promise<any | null> => {
          try {
            const type: MediaType =
              it.tmdbType === "tv"
                ? "tv"
                : it.tmdbType === "movie"
                  ? "movie"
                  : it.mediaType === "tv"
                    ? "tv"
                    : "movie";
            const d = await fetchDetailCached(type, it.tmdbId as number);
            if (!d) return null;
            return {
              ...(d as any),
              media_type: type,
              trendRank: it.rank,
              trendScore: it.score,
              recommendReason: PICK_REASON_TREND,
            } as any;
          } catch {
            return null;
          }
        },
      );

      const picked = details.filter(Boolean) as any[];
      if (picked.length > 0) {
        setAnonHeroMovies(picked as any);
        return;
      }

      const charts = await loadHomeChartsSnapshot();
      const snapshotItems =
        charts?.collections?.find((c) => c.key === "TRENDING_MOVIE")?.items ??
        charts?.collections?.find((c) => c.key === "POPULAR_MOVIE")?.items ??
        [];
      const hydrated =
        snapshotItems.length > 0
          ? await hydrateSnapshotItems(snapshotItems.slice(0, 10))
          : [];

      if (hydrated.length > 0) {
        setAnonHeroMovies(
          hydrated.map((x) => ({
            ...(x as any),
            recommendReason: PICK_REASON_TREND,
          })) as any,
        );
        return;
      }

      const fallback = popularMoviesPick.slice(0, 10).map((m) => ({
        ...(m as any),
        media_type: "movie",
      }));
      setAnonHeroMovies(fallback as any);
    } catch {
      const fallback = popularMoviesPick.slice(0, 10).map((m) => ({
        ...(m as any),
        media_type: "movie",
      }));
      setAnonHeroMovies(fallback as any);
    } finally {
      setAnonHeroLoading(false);
    }
  }, [
    currentSection,
    fetchDetailCached,
    loadHomeChartsSnapshot,
    hydrateSnapshotItems,
    popularMoviesPick,
  ]);

  const loadRealBoxOfficeTop10 = useCallback(async () => {
    if (currentSection !== "home") return;

    setBoxOfficeLoading(true);
    try {
      // ✅ “실제 박스오피스 Top10” (백엔드에서 KOBIS 기반으로 내려주는 Top10 전용)
      // (서버 라우트명이 프로젝트마다 다를 수 있어 후보를 순차 시도)
      const tryUrls = [
        "/charts/boxoffice/top10",
        "/charts/boxoffice/kr/top10",
        "/boxoffice/top10",
      ];

      let items: HomeChartItem[] = [];
      let displayDateLabel = "";
      let rawItems: RawBoxOfficeItem[] = [];
      const attempts: BoxOfficeAttempt[] = [];

      for (const url of tryUrls) {
        try {
          const r = await apiGet<any>(url, { limit: 10 });

          // ✅ (추가) 백엔드에서 내려주는 표시용 날짜 라벨
          const label = String(r?.displayDateLabel ?? "").trim();
          if (label) displayDateLabel = label;

          if (Array.isArray(r?.rawItems)) {
            rawItems = r.rawItems
              .map((x: any, idx: number) => ({
                rank:
                  typeof x?.rank === "number" && x.rank > 0 ? x.rank : idx + 1,
                movieCd: String(x?.movieCd ?? "").trim(),
                movieNm: String(x?.movieNm ?? "").trim(),
              }))
              .filter((x: RawBoxOfficeItem) => !!x.movieNm);
          }

          const list =
            (Array.isArray(r?.items) ? r.items : null) ??
            (Array.isArray(r?.data) ? r.data : null) ??
            (Array.isArray(r) ? r : null);

          attempts.push({
            url,
            ok: true,
            itemCount: Array.isArray(list) ? list.length : 0,
            rawCount: Array.isArray(r?.rawItems) ? r.rawItems.length : 0,
          });

          if (Array.isArray(list) && list.length) {
            // { mediaType, tmdbId, rank } 형태를 기대
            items = list as HomeChartItem[];
            break;
          }
        } catch (e: any) {
          attempts.push({
            url,
            ok: false,
            status: Number(e?.status) || undefined,
            message: String(e?.message ?? "unknown error"),
          });
        }
      }

      // ✅ (추가) RowHeader desc 업데이트
      if (displayDateLabel) {
        setBoxOfficeDesc(`${displayDateLabel} 기준 Top10 차트입니다.`);
      } else {
        setBoxOfficeDesc("Top10 차트입니다.");
      }
      setBoxOfficeRawItems(rawItems);

      if (!items.length) {
        setBoxOfficeMovies([]);
        console.error("[BoxOffice] no mapped items from API", {
          attempts,
          displayDateLabel,
          rawItemsCount: rawItems.length,
          hint:
            rawItems.length > 0
              ? "KOBIS raw exists but TMDB mapping returned 0"
              : "KOBIS API/route returned empty",
        });
        return;
      }

      // ✅ 박스오피스는 영화만
      const normalized = items
        .filter((x) => typeof x?.tmdbId === "number" && x.tmdbId)
        .slice(0, 10)
        .map((x, i) => ({
          mediaType: "movie" as const,
          tmdbId: x.tmdbId,
          rank: typeof x.rank === "number" ? x.rank : i + 1,
        }));

      const detailFailedIds: number[] = [];
      const details = await pMapLimit(
        normalized,
        6,
        async (it): Promise<any | null> => {
          try {
            const d = await fetchDetailCached("movie", it.tmdbId, {
              policyBypass: "boxoffice",
            });
            if (!d) return null;
            return {
              ...(d as any),
              media_type: "movie",
              trendRank: it.rank, // ✅ 카드에 #순위 표시용
            } as any;
          } catch {
            detailFailedIds.push(it.tmdbId);
            return null;
          }
        },
      );

      const resolved = details.filter(Boolean) as any[];
      setBoxOfficeMovies(resolved);

      if (normalized.length > 0 && resolved.length === 0) {
        console.error("[BoxOffice] TMDB detail hydrate failed", {
          mappedCount: normalized.length,
          detailFailedIds,
          displayDateLabel,
        });
      }
    } catch (e: any) {
      setBoxOfficeMovies([]);
      setBoxOfficeRawItems([]);
      setBoxOfficeDesc("Top10 차트입니다.");
      console.error("[BoxOffice] unexpected loader failure", {
        message: String(e?.message ?? "unknown error"),
        status: Number(e?.status) || undefined,
      });
    } finally {
      setBoxOfficeLoading(false);
    }
  }, [currentSection, fetchDetailCached]);

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

    const settled = await pMapLimit(
      favorites,
      6,
      async (item): Promise<MovieWithScore | null> => {
        try {
          const detail = await fetchDetailCached(
            item.mediaType as MediaType,
            item.id,
          );
          if (!detail) return null;

          const baseMovie =
            item.mediaType === "tv" ? normalizeTVToMovie(detail) : detail;

          const fixed = { ...(baseMovie as any), media_type: item.mediaType };
          return withMatchScore(fixed as TMDBMovie, userPreferences);
        } catch {
          return null;
        }
      },
    );

    setFavoriteMovies(settled.filter((m): m is MovieWithScore => m !== null));
  }, [favorites, userPreferences, fetchDetailCached]);

  async function safeCall<T>(
    fn: (...args: any[]) => Promise<T>,
    args?: any,
  ): Promise<T> {
    try {
      return args !== undefined ? await fn(args) : await fn();
    } catch {
      return await fn();
    }
  }

  const loadAllData = useCallback(async () => {
    setLoading(true);

    try {
      const [popularRes, tvRes, topRatedRes, latestRes] = await Promise.all([
        safeCall<any>(getPopularMovies, KR),
        safeCall<any>(getPopularTVShows, KR),
        safeCall<any>(getTopRatedMovies, KR),
        safeCall<any>(getNowPlayingMovies, KR),
      ]);

      const popular = unwrapList<TMDBMovie>(popularRes);
      const tv = unwrapList<TMDBMovie>(tvRes);
      const topRated = unwrapList<TMDBMovie>(topRatedRes);
      const latest = unwrapList<TMDBMovie>(latestRes);

      setPopularMovies(
        popular.map((m) => ({ ...(m as any), media_type: "movie" })),
      );
      setPopularTV(tv.map((t) => ({ ...(t as any), media_type: "tv" })));
      setTopRatedMovies(
        topRated.map((m) => ({ ...(m as any), media_type: "movie" })),
      );
      setLatestMovies(
        latest.map((m) => ({ ...(m as any), media_type: "movie" })),
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

  // ✅ 비로그인 히어로 Top10 로드
  useEffect(() => {
    void loadAnonHeroTop10();
  }, [loadAnonHeroTop10]);

  // ✅ 박스오피스 Top10 로드 (home에서 항상)
  useEffect(() => {
    void loadRealBoxOfficeTop10();
  }, [loadRealBoxOfficeTop10]);

  // ✅ 트렌드 로드: PickMovie 인기차트 + 섹션 보정용 시그널 생성
  useEffect(() => {
    if (currentSection !== "home") return;

    let mounted = true;
    if (loggedIn) setTrendLoading(true);

    (async () => {
      try {
        const r = await apiGet<{
          date: string;
          items: Array<{
            tmdbId: number | null;
            keyword: string;
            mediaType?: "movie" | "tv" | "anime";
            tmdbType?: "movie" | "tv" | null;
            rank: number;
            score: number;
          }>;
        }>("/trends/kr", { limit: 20 });

        const items = Array.isArray(r?.items) ? r.items : [];
        const movieSignal: Record<number, TrendSignalItem> = {};
        const tvSignal: Record<number, number> = {};
        for (const it of items) {
          if (typeof it?.tmdbId !== "number" || !it.tmdbId) continue;
          const type =
            it.tmdbType === "tv"
              ? "tv"
              : it.tmdbType === "movie"
                ? "movie"
                : it.mediaType === "tv"
                  ? "tv"
                  : "movie";
          if (type === "tv") {
            tvSignal[it.tmdbId] = Number(it.rank) || 999;
          } else {
            movieSignal[it.tmdbId] = {
              rank: Number(it.rank) || 999,
              score: Number(it.score) || 0,
            };
          }
        }

        if (mounted) {
          setMovieTrendMap(movieSignal);
          setTvTrendRankMap(tvSignal);
        }

        const targets = items
          .filter((x) => typeof x.tmdbId === "number" && x.tmdbId)
          .slice(0, 20);

        const details = await pMapLimit(
          targets,
          6,
          async (it): Promise<any | null> => {
            try {
              const type: MediaType =
                it.tmdbType === "tv"
                  ? "tv"
                  : it.tmdbType === "movie"
                    ? "movie"
                    : it.mediaType === "tv"
                      ? "tv"
                      : "movie";
              const d = await fetchDetailCached(type, it.tmdbId as number);
              if (!d) return null;
              return {
                ...(d as any),
                media_type: type,
                trendRank: it.rank,
                trendScore: it.score,
                recommendReason: PICK_REASON_TREND,
              } as any;
            } catch {
              return null;
            }
          },
        );

        const picked =
          details.filter(Boolean).length > 0
            ? (details.filter(Boolean) as any[])
            : await hydrateSnapshotItems(
                (homeChartsRef.current?.collections?.find(
                  (c) => c.key === "TRENDING_MOVIE",
                )?.items ?? []) as any,
              );

        const charts = await loadHomeChartsSnapshot();
        if (mounted && Object.keys(tvSignal).length === 0) {
          const tvItems =
            charts?.collections?.find((c) => c.key === "TRENDING_TV")?.items ??
            [];
          const tvMap: Record<number, number> = {};
          for (const tv of tvItems) {
            if (typeof tv?.tmdbId !== "number") continue;
            tvMap[tv.tmdbId] = Number(tv.rank) || 999;
          }
          setTvTrendRankMap(tvMap);
        }

        if (!mounted) return;
        if (loggedIn) {
          setTrendMoviesRaw(
            (picked as any[]).map((x) => ({
              ...(x as any),
              recommendReason: (x as any)?.recommendReason ?? PICK_REASON_TREND,
            })) as any,
          );
        }
      } catch {
        if (mounted) {
          if (loggedIn) setTrendMoviesRaw([]);
          setMovieTrendMap({});
          setTvTrendRankMap({});
        }
      } finally {
        if (mounted && loggedIn) setTrendLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [
    currentSection,
    loggedIn,
    fetchDetailCached,
    hydrateSnapshotItems,
    loadHomeChartsSnapshot,
  ]);

  // ✅ for-you는 백엔드에서 전부 계산, 프론트는 결과 렌더링만 담당
  useEffect(() => {
    if (!loggedIn || currentSection !== "home") return;

    const MIN_FAV = 5;
    if (favorites.length < MIN_FAV) return;

    const requestSig = JSON.stringify({
      fav: favorites
        .map((x) => `${x.mediaType}:${x.id}`)
        .sort()
        .join(","),
      prefGenres: (userPreferences?.genres || []).slice().sort().join(","),
      prefReleaseYear: userPreferences?.releaseYear ?? "",
    });
    if (forYouRequestSigRef.current === requestSig) return;

    let mounted = true;
    setForYouLoading(true);
    forYouRequestSigRef.current = requestSig;

    (async () => {
      try {
        const res = await apiPost<{ items?: TMDBMovie[] }>(
          "/auth/recommendations/for-you",
          {
            limit: 20,
            region: "KR",
            language: "ko-KR",
            preferences: {
              genres: userPreferences?.genres || [],
              releaseYear: userPreferences?.releaseYear || "",
            },
          },
          { timeoutMs: 12000, retry: 1, retryDelayMs: 180 },
        );
        if (!mounted) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        setForYouMovies(items as any);
      } catch {
        forYouRequestSigRef.current = "";
        if (mounted) setForYouMovies([]);
      } finally {
        if (mounted) setForYouLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loggedIn, currentSection, favorites, userPreferences]);

  const openContentDetail = useCallback(
    (movie: any) => {
      const id = Number(movie?.id);
      if (!Number.isFinite(id)) return;

      const mt: MediaType =
        movie?.media_type === "tv"
          ? "tv"
          : movie?.media_type === "movie"
            ? "movie"
            : movie?.first_air_date
              ? "tv"
              : "movie";

      navigate(buildDetailPath(mt, id), {
        state: { backgroundLocation: location },
      });
    },
    [navigate, location],
  );

  const toggleFav = useCallback(
    (id: number, type?: MediaType) => {
      onToggleFavorite?.(id, (type || "movie") as MediaType);
    },
    [onToggleFavorite],
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
        onStart={() => {
          try {
            localStorage.setItem(ONBOARDING_PROMPT_SEEN, "1");
            localStorage.setItem(NEW_USER_FLAG, "0");
          } catch {}
          if (onReanalyze) onReanalyze();
          else navigate("/onboarding");
        }}
        onLater={() => {
          setShowOnboardingPrompt(false);
          try {
            localStorage.setItem(ONBOARDING_PROMPT_SEEN, "1");
            localStorage.setItem(NEW_USER_FLAG, "0");
          } catch {}
        }}
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
            {!loggedIn && anonHeroLoading ? (
              <div className="h-[80svh] flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-purple-400" />
              </div>
            ) : (
              <FavoritesCarousel
                movies={(loggedIn ? favoriteMovies : anonHeroMovies) as any}
                onMovieClick={openContentDetail as any}
                onToggleFavorite={(id, type) => {
                  if (!loggedIn) {
                    navigate("/login");
                    return;
                  }
                  toggleFav(id, type);
                }}
                onTrailerClick={openTrailerFromCarousel}
              />
            )}
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
                      title="당신을 위한 추천"
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
                          <span>이상 추가 시 </span>
                          <span className="text-white/85 font-semibold">
                            당신을 위한 추천
                          </span>
                          이 생성됩니다.
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
                        <ContentRow
                          title=""
                          movies={forYouMovies as any}
                          favorites={favoriteIdList}
                          favoriteKeySet={favoriteKeySet}
                          onToggleFavorite={(id: number, type?: MediaType) =>
                            toggleFav(id, type)
                          }
                          onMovieClick={openContentDetail as any}
                          showMatchScore
                          showRecommendReason
                        />
                      </Suspense>
                    )}
                  </>
                )}

                {loggedIn && (
                  <>
                    <RowHeader
                      className="mt-5"
                      title="PickMovie 인기 차트"
                      desc="PickMovie 트렌드 점수를 반영한 인기 차트입니다."
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
                        <ContentRow
                          title=""
                          movies={trendMoviesRaw as any}
                          favorites={favoriteIdList}
                          favoriteKeySet={favoriteKeySet}
                          onToggleFavorite={(id: number, type?: MediaType) =>
                            toggleFav(id, type)
                          }
                          onMovieClick={openContentDetail as any}
                        />
                      </Suspense>
                    )}
                  </>
                )}

                <RowHeader
                  className="mt-5"
                  title="인기 영화"
                  desc="TMDB에서 많이 찾고 있는 영화들을 한눈에 모아봤어요."
                />
                <Suspense fallback={<div className="h-40" />}>
                  <ContentRow
                    title=""
                    movies={popularMoviesPick as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={openContentDetail as any}
                  />
                </Suspense>

                <RowHeader
                  className="mt-5"
                  title="인기 TV 프로그램"
                  desc="요즘 TMDB에서 반응 좋은 TV 프로그램을 중심으로 보여드립니다."
                />
                <Suspense fallback={<div className="h-40" />}>
                  <ContentRow
                    title=""
                    movies={popularTvPick as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={openContentDetail as any}
                  />
                </Suspense>

                <RowHeader
                  className="mt-5"
                  title="최신 개봉작"
                  desc="TMDB 기준으로 최근 공개된 작품들 중 지금 보기 좋은 타이틀을 담았습니다."
                />
                <Suspense fallback={<div className="h-40" />}>
                  <ContentRow
                    title=""
                    movies={latestMoviesPick as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={openContentDetail as any}
                  />
                </Suspense>

                {/* ✅ 하단: 실제 박스오피스 TOP 10 */}
                <RowHeader
                  className="mt-8"
                  title="박스오피스 TOP 10"
                  desc={boxOfficeDesc}
                />

                {boxOfficeLoading ? (
                  <div className="mx-auto w-full px-4 mt-4">
                    <div className="h-24 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-sm text-white/60">
                      박스오피스를 불러오는 중…{" "}
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    </div>
                  </div>
                ) : boxOfficeMovies.length === 0 ? (
                  <div className="mx-auto w-full px-4 mt-4">
                    {boxOfficeRawItems.length > 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="text-sm text-white/75 mb-3">
                          TMDB 매핑 지연으로 KOBIS 원본 순위를 표시합니다.
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {boxOfficeRawItems.slice(0, 10).map((it) => (
                            <div
                              key={`${it.rank}:${it.movieCd}:${it.movieNm}`}
                              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                            >
                              <span className="text-white/55 mr-2">
                                #{it.rank}
                              </span>
                              <span className="text-white/90">
                                {it.movieNm}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                        오늘의 박스오피스 차트가 없습니다. 잠시 후 다시
                        시도해보세요.
                      </div>
                    )}
                  </div>
                ) : (
                  <Suspense fallback={<div className="h-40" />}>
                    <ContentRow
                      title=""
                      movies={boxOfficeMovies as any}
                      favorites={favoriteIdList}
                      favoriteKeySet={favoriteKeySet}
                      onToggleFavorite={(id: number, type?: MediaType) => {
                        if (!loggedIn) {
                          navigate("/login");
                          return;
                        }
                        toggleFav(id, type);
                      }}
                      onMovieClick={openContentDetail as any}
                    />
                  </Suspense>
                )}
              </>
            )}

            {currentSection === "popular-movies" && (
              <section className="pt-24">
                <Suspense fallback={<div className="h-40" />}>
                  <ContentRow
                    title="인기 영화"
                    movies={popularMoviesPick as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={openContentDetail as any}
                  />
                </Suspense>

                <Suspense fallback={<div className="h-40" />}>
                  <ContentRow
                    title="평점 높은 영화"
                    movies={topRatedMovies as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={openContentDetail as any}
                  />
                </Suspense>
              </section>
            )}

            {currentSection === "popular-tv" && (
              <section className="pt-24">
                <Suspense fallback={<div className="h-40" />}>
                  <ContentRow
                    title="인기 TV 프로그램"
                    movies={popularTvPick as any}
                    favorites={favoriteIdList}
                    favoriteKeySet={favoriteKeySet}
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={openContentDetail as any}
                  />
                </Suspense>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <PageFooter />
    </div>
  );
}
