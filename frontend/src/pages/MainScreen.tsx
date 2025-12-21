// frontend/src/pages/MainScreen.tsx
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { ContentCard } from "../components/content/ContentCard";
import type { UserPreferences } from "../features/onboarding/Onboarding";
import type { FavoriteItem } from "../App";

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

export function MainScreen({
  userPreferences,
  favorites,
  onToggleFavorite,
  initialSection,
}: MainScreenProps) {
  const currentSection = initialSection;

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

  // ✅ movie/tv 충돌 방지용 keySet
  const favoriteKeySet = useMemo(() => {
    return new Set(favorites.map((f) => `${f.mediaType}:${f.id}`));
  }, [favorites]);

  // (기존 MovieRow 호환 유지용) id만 뽑은 배열도 제공 가능
  const favoriteIdList = useMemo(() => favorites.map((f) => f.id), [favorites]);

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
      const [popular, tv, topRated, latest, rec] = await Promise.all([
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

  // 검색 필터 (검색 범위를 추천+인기영화+인기TV로만)
  const filteredContent = searchQuery
    ? [...recommendedMovies, ...popularMovies, ...popularTV].filter((m: any) =>
        (m.title || m.name || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : null;

  const currentViewKey = filteredContent ? "search" : currentSection;

  return (
    <div className="min-h-screen bg-[#1a1a24] text-white overflow-x-hidden">
      <Suspense fallback={<div className="h-16" />}>
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      </Suspense>

      {currentSection === "home" && !filteredContent && (
        <section className="relative z-20">
          <Suspense fallback={<div className="h-[260px]" />}>
            <FavoritesCarousel
              movies={favoriteMovies}
              onMovieClick={handleMovieClick}
              onToggleFavorite={(id, type) => toggleFav(id, type)}
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
              <section className="pt-24">
                <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10">
                  <h2 className="text-xl mb-4">검색 결과</h2>

                  {/* ✅ 여백 과다/모바일 비율 깨짐 방지: auto-fit + minmax */}
                  <div className="grid gap-4 justify-center [grid-template-columns:repeat(auto-fit,minmax(160px,240px))]">
                    {filteredContent.map((m: any) => {
                      const mt = (m.media_type || "movie") as MediaType;
                      const k = `${mt}:${m.id}`;
                      return (
                        <ContentCard
                          key={k}
                          item={m}
                          isFavorite={favoriteKeySet.has(k)}
                          onClick={() => handleMovieClick(m)}
                          onToggleFavorite={() => toggleFav(m.id, mt)}
                          context="default"
                        />
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* 홈 섹션 */}
            {!filteredContent && currentSection === "home" && (
              <>
                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="당신을 위한 추천"
                    movies={recommendedMovies as any}
                    favorites={favoriteIdList} // 기존 호환
                    favoriteKeySet={favoriteKeySet} // ✅ 충돌 방지 + 정확한 하트 표시
                    onToggleFavorite={(id: number, type?: MediaType) =>
                      toggleFav(id, type)
                    }
                    onMovieClick={handleMovieClick}
                    showMatchScore={false}
                  />
                </Suspense>

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

                <Suspense fallback={<div className="h-40" />}>
                  <MovieRow
                    title="🎬 최신 개봉작"
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

            {/* 인기 영화 섹션 */}
            {!filteredContent && currentSection === "popular-movies" && (
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

            {/* 인기 TV 섹션 */}
            {!filteredContent && currentSection === "popular-tv" && (
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
