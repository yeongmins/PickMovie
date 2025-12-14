// frontend/src/pages/MainScreen.tsx

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { ContentCard } from "../components/content/ContentCard";
import { UserPreferences } from "../features/onboarding/Onboarding";
import { FavoriteItem } from "../App";
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

export interface MainScreenProps {
  userPreferences: UserPreferences;
  favorites: FavoriteItem[];
  onReanalyze?: () => void;
  onToggleFavorite?: (movieId: number, mediaType?: "movie" | "tv") => void;
  initialSection: "home" | "favorites" | "popular-movies" | "popular-tv";
}

export interface MovieWithScore extends TMDBMovie {
  matchScore?: number;
}

type Section = "home" | "favorites" | "popular-movies" | "popular-tv";

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

export function MainScreen({
  userPreferences,
  favorites,
  onReanalyze,
  onToggleFavorite,
  initialSection,
}: MainScreenProps) {
  const navigate = useNavigate();
  const [currentSection, setCurrentSection] = useState<Section>(initialSection);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Data States
  const [favoriteMovies, setFavoriteMovies] = useState<MovieWithScore[]>([]);
  const [recommendedMovies, setRecommendedMovies] = useState<MovieWithScore[]>(
    []
  );
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularTV, setPopularTV] = useState<TMDBMovie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<TMDBMovie[]>([]);
  const [latestMovies, setLatestMovies] = useState<TMDBMovie[]>([]);
  const [genreMovies, setGenreMovies] = useState<MovieWithScore[]>([]);

  const favoriteIds = useMemo(() => favorites.map((f) => f.id), [favorites]);
  const [showAllFavorites, setShowAllFavorites] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentSection]);

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

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [popular, tv, topRated, latest, rec, genre] = await Promise.all([
        getPopularMovies(),
        getPopularTVShows(),
        getTopRatedMovies(),
        getNowPlayingMovies(),
        (async () => {
          const genreIds = userPreferences.genres
            .map((g) => GENRE_IDS[g])
            .filter(Boolean);

          if (!genreIds.length) return [];
          const movies = await discoverMovies({ genres: genreIds, page: 1 });
          return movies.map((m) =>
            withMatchScore(
              { ...(m as any), media_type: "movie" } as TMDBMovie,
              userPreferences
            )
          );
        })(),
        (async () => {
          if (!userPreferences.genres.length) return [];
          const gid = GENRE_IDS[userPreferences.genres[0]];
          if (!gid) return [];
          const movies = await discoverMovies({ genres: [gid], page: 1 });
          return movies
            .map((m) =>
              withMatchScore(
                { ...(m as any), media_type: "movie" } as TMDBMovie,
                userPreferences
              )
            )
            .slice(0, 20);
        })(),
      ]);

      setPopularMovies(
        popular.map((m) => ({ ...(m as any), media_type: "movie" }))
      );
      setPopularTV(tv.map((t) => ({ ...(t as any), media_type: "tv" })));
      setTopRatedMovies(
        topRated.map((m) => ({ ...(m as any), media_type: "movie" }))
      );
      setLatestMovies(
        latest.map((m) => ({
          ...(m as any),
          media_type: "movie",
          isNowPlaying: true,
        }))
      );
      setRecommendedMovies(rec);
      setGenreMovies(genre);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [userPreferences]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    loadFavoriteMoviesDetails();
  }, [loadFavoriteMoviesDetails]);

  const handleMovieClick = useCallback(
    async (movie: any) => {
      try {
        const details =
          movie.media_type === "tv"
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
          mediaType: movie.media_type || "movie",
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

  const handleNavigate = useCallback(
    (section: string) => {
      const s = section as Section | "picky";
      if (s === "picky") {
        navigate("/picky");
        return;
      }
      setCurrentSection(s as Section);
      navigate(s === "home" ? "/" : `/${s}`);
    },
    [navigate]
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

  // 검색 필터
  const filteredContent = searchQuery
    ? [...recommendedMovies, ...popularMovies, ...popularTV].filter((m) =>
        (m.title || m.name || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : null;

  const currentViewKey = filteredContent ? "search" : currentSection;

  const favoritesToShow = showAllFavorites
    ? favoriteMovies
    : favoriteMovies.slice(0, 12);

  return (
    <div className="min-h-screen bg-[#1a1a24] text-white">
      <Suspense fallback={<div className="h-16" />}>
        <Header
          currentSection={currentSection}
          onNavigate={handleNavigate}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </Suspense>

      {currentSection === "home" && !filteredContent && (
        <section className="relative z-20">
          <Suspense fallback={<div className="h-[260px]" />}>
            <FavoritesCarousel
              movies={favoriteMovies}
              onMovieClick={handleMovieClick}
              onToggleFavorite={(id, type) => onToggleFavorite?.(id, type)}
            />
          </Suspense>
        </section>
      )}

      <main className="page-fade-in pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentViewKey}
            variants={sectionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* 검색 결과 */}
            {filteredContent && (
              <section className="pt-20 px-6">
                <h2 className="text-xl mb-4">검색 결과</h2>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  {filteredContent.map((m: any) => (
                    <ContentCard
                      key={`${m.media_type || "movie"}:${m.id}`}
                      item={m}
                      isFavorite={favoriteIds.includes(m.id)}
                      onClick={() => handleMovieClick(m)}
                      onToggleFavorite={() =>
                        onToggleFavorite?.(m.id, m.media_type || "movie")
                      }
                      context="default"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 홈 섹션 */}
            {!filteredContent && currentSection === "home" && (
              <>
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="당신을 위한 추천"
                    movies={recommendedMovies}
                    favorites={favoriteIds}
                    onToggleFavorite={(id, type) =>
                      onToggleFavorite?.(id, type)
                    }
                    onMovieClick={handleMovieClick}
                    showMatchScore={false}
                  />
                </Suspense>

                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="🔥 인기 영화"
                    movies={popularMovies}
                    favorites={favoriteIds}
                    onToggleFavorite={(id, type) =>
                      onToggleFavorite?.(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>

                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="📺 인기 TV 프로그램"
                    movies={popularTV}
                    favorites={favoriteIds}
                    onToggleFavorite={(id, type) =>
                      onToggleFavorite?.(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>

                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="🎬 최신 개봉작"
                    movies={latestMovies}
                    favorites={favoriteIds}
                    onToggleFavorite={(id, type) =>
                      onToggleFavorite?.(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>
              </>
            )}

            {/* 찜 섹션(여기도 카드 통일) */}
            {!filteredContent && currentSection === "favorites" && (
              <section className="pt-24 px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold">찜/플레이리스트</h1>
                    <p className="text-gray-400 mt-1">
                      찜한 컨텐츠 {favoriteMovies.length}개
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAllFavorites((v) => !v)}
                    className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-sm transition-colors"
                    aria-expanded={showAllFavorites}
                  >
                    {showAllFavorites ? "접기" : "전체 목록 보기"}
                  </button>
                </div>

                <motion.div layout className="mt-8">
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={showAllFavorites ? "all" : "preview"}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4"
                    >
                      {favoritesToShow.map((m: any) => (
                        <ContentCard
                          key={`${m.media_type || "movie"}:${m.id}`}
                          item={m}
                          isFavorite={favoriteIds.includes(m.id)}
                          onClick={() => handleMovieClick(m)}
                          onToggleFavorite={() =>
                            onToggleFavorite?.(m.id, m.media_type || "movie")
                          }
                          context="default"
                        />
                      ))}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </section>
            )}

            {/* 인기 영화 섹션 */}
            {!filteredContent && currentSection === "popular-movies" && (
              <section className="pt-20">
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="🔥 인기 영화"
                    movies={popularMovies}
                    favorites={favoriteIds}
                    onToggleFavorite={(id, type) =>
                      onToggleFavorite?.(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>

                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="⭐ 평점 높은 영화"
                    movies={topRatedMovies}
                    favorites={favoriteIds}
                    onToggleFavorite={(id, type) =>
                      onToggleFavorite?.(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>
              </section>
            )}

            {/* 인기 TV 섹션 */}
            {!filteredContent && currentSection === "popular-tv" && (
              <section className="pt-20">
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="📺 인기 TV 프로그램"
                    movies={popularTV}
                    favorites={favoriteIds}
                    onToggleFavorite={(id, type) =>
                      onToggleFavorite?.(id, type)
                    }
                    onMovieClick={handleMovieClick}
                  />
                </Suspense>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 모달 */}
      <AnimatePresence>
        {selectedMovie && (
          <Suspense fallback={null}>
            <MovieDetailModal
              movie={selectedMovie}
              onClose={() => setSelectedMovie(null)}
              isFavorite={favorites.some((f) => f.id === selectedMovie.id)}
              onToggleFavorite={() =>
                onToggleFavorite?.(selectedMovie.id, selectedMovie.mediaType)
              }
              userPreferences={userPreferences}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
