// MainScreen.tsx
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { UserPreferences } from "./Onboarding";
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
} from "../utils/tmdb";

// lazy-load 컴포넌트들
const Header = lazy(() =>
  import("./Header").then((mod) => ({ default: mod.Header }))
);

const FavoritesCarousel = lazy(() =>
  import("./FavoritesCarousel").then((mod) => ({
    default: mod.FavoritesCarousel,
  }))
);

const MovieRow = lazy(() =>
  import("./MovieRow").then((mod) => ({ default: mod.MovieRow }))
);

const MovieDetailModal = lazy(() =>
  import("./MovieDetailModal").then((mod) => ({
    default: mod.MovieDetailModal,
  }))
);

interface MainScreenProps {
  userPreferences: UserPreferences;
  favorites: FavoriteItem[];
  onReanalyze?: () => void;
  onToggleFavorite?: (movieId: number, mediaType?: "movie" | "tv") => void;
  initialSection: "home" | "favorites" | "popular-movies" | "popular-tv";
}

interface MovieWithScore extends TMDBMovie {
  matchScore?: number;
}

const IS_DEV = import.meta.env.DEV;

// =========================
// 헬퍼들
// =========================

// TMDB Movie + 사용자 취향 → 점수 계산
function withMatchScore(
  movie: TMDBMovie,
  prefs: UserPreferences
): MovieWithScore {
  return {
    ...movie,
    matchScore: calculateMatchScore(movie, prefs),
  };
}

// 안전한 년도 파싱
function getYear(dateString?: string): number | undefined {
  if (!dateString) return undefined;
  const time = Date.parse(dateString);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).getFullYear();
}

export function MainScreen({
  userPreferences,
  favorites,
  onReanalyze,
  onToggleFavorite,
  initialSection,
}: MainScreenProps) {
  const navigate = useNavigate();

  const [currentSection, setCurrentSection] = useState<string>(initialSection);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (IS_DEV) {
      console.log("✅ MainScreen mounted");
    }
    return () => {
      if (IS_DEV) {
        console.log("❌ MainScreen unmounted");
      }
    };
  }, []);

  useEffect(() => {
    if (IS_DEV) {
      console.log("[MainScreen] favorites updated:", favorites);
    }
  }, [favorites]);

  // =========================
  // 즐겨찾기 상세 로더
  // =========================
  const loadFavoriteMoviesDetails = useCallback(async () => {
    if (!favorites.length) {
      setFavoriteMovies([]);
      return;
    }

    if (IS_DEV) {
      console.log(
        "[loadFavoriteMoviesDetails] CALLED with favorites:",
        favorites
      );
    }

    try {
      const detailPromises = favorites.map(async (item) => {
        try {
          if (item.mediaType === "tv") {
            const detail = await getTVDetails(item.id);
            if (!detail) return null;

            const baseMovie: TMDBMovie = {
              id: detail.id,
              title: detail.name,
              overview: detail.overview || "",
              poster_path: detail.poster_path ?? null,
              backdrop_path: detail.backdrop_path ?? null,
              vote_average: detail.vote_average || 0,
              release_date: detail.first_air_date || "",
              genre_ids: detail.genres?.map((g) => g.id) || [],
              popularity: detail.popularity || 0,
              adult: detail.adult || false,
              original_language: detail.original_language || "",
              media_type: "tv",
            };

            return withMatchScore(baseMovie, userPreferences);
          } else {
            const detail = await getMovieDetails(item.id);
            if (!detail) return null;

            const baseMovie: TMDBMovie = {
              id: detail.id,
              title: detail.title,
              overview: detail.overview || "",
              poster_path: detail.poster_path ?? null,
              backdrop_path: detail.backdrop_path ?? null,
              vote_average: detail.vote_average || 0,
              release_date: detail.release_date || "",
              genre_ids: detail.genres?.map((g) => g.id) || [],
              popularity: detail.popularity || 0,
              adult: detail.adult || false,
              original_language: detail.original_language || "",
              media_type: "movie",
            };

            return withMatchScore(baseMovie, userPreferences);
          }
        } catch (err) {
          if (IS_DEV) {
            console.warn("[loadFavoriteMoviesDetails] single item failed", err);
          }
          return null;
        }
      });

      const settled = await Promise.all(detailPromises);
      const moviesWithScore = settled.filter(
        (m): m is MovieWithScore => m !== null
      );

      setFavoriteMovies(moviesWithScore);
    } catch (error) {
      console.error("Failed to load favorite movies:", error);
      setFavoriteMovies([]);
    }
  }, [favorites, userPreferences]);

  const toggleFavorite = useCallback(
    (movieId: number, mediaType?: "movie" | "tv") => {
      onToggleFavorite?.(movieId, mediaType);
    },
    [onToggleFavorite]
  );

  // =========================
  // 데이터 로더들
  // =========================

  const loadPopularMovies = async (): Promise<TMDBMovie[]> => {
    // 모바일 메모리 부담 줄이기 위해 페이지/개수 축소
    const pages = await Promise.all([
      getPopularMovies(1),
      getPopularMovies(2),
    ]);

    const merged = pages.flat();
    const unique = Array.from(new Map(merged.map((m) => [m.id, m])).values());
    return unique.slice(0, 40);
  };

  const loadPopularTVShows = async (): Promise<TMDBMovie[]> => {
    const pages = await Promise.all([
      getPopularTVShows(1),
      getPopularTVShows(2),
    ]);

    const mergedTV = pages.flat();
    const normalized = mergedTV.map((tv) => normalizeTVToMovie(tv));
    const unique = Array.from(
      new Map(normalized.map((m) => [m.id, m])).values()
    );
    return unique.slice(0, 40);
  };

  const loadTopRatedMovies = async (): Promise<TMDBMovie[]> => {
    const page1 = await getTopRatedMovies(1);
    return page1.slice(0, 40);
  };

  const loadNowPlayingMovies = async (): Promise<TMDBMovie[]> => {
    const page1 = await getNowPlayingMovies(1);
    return page1.slice(0, 40);
  };

  const loadRecommendedMovies = async (): Promise<MovieWithScore[]> => {
    const genreIds = userPreferences.genres
      .map((g) => GENRE_IDS[g])
      .filter(Boolean);

    if (!genreIds.length) return [];

    const [page1, page2] = await Promise.all([
      discoverMovies({ genres: genreIds, page: 1 }),
      discoverMovies({ genres: genreIds, page: 2 }),
    ]);

    const allMovies = [...page1, ...page2];

    return allMovies
      .map((movie) => withMatchScore(movie, userPreferences))
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 40);
  };

  const loadGenreBasedMovies = async (): Promise<MovieWithScore[]> => {
    if (userPreferences.genres.length === 0) return [];

    const mainGenre = userPreferences.genres[0];
    const genreId = GENRE_IDS[mainGenre];
    if (!genreId) return [];

    const movies = await discoverMovies({ genres: [genreId], page: 1 });

    return movies
      .map((movie) => withMatchScore(movie, userPreferences))
      .slice(0, 20);
  };

  // =========================
  // 전체 데이터 로딩
  // =========================
  const loadAllData = useCallback(async () => {
    setLoading(true);

    try {
      const [
        popular,
        tv,
        topRated,
        latest,
        recommended,
        genreBasedMovies,
      ] = await Promise.all([
        loadPopularMovies(),
        loadPopularTVShows(),
        loadTopRatedMovies(),
        loadNowPlayingMovies(),
        loadRecommendedMovies(),
        loadGenreBasedMovies(),
      ]);

      setPopularMovies(popular);
      setPopularTV(tv);
      setTopRatedMovies(topRated);
      setLatestMovies(latest);
      setRecommendedMovies(recommended);
      setGenreMovies(genreBasedMovies);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, [userPreferences]);

  // 初로드 & 취향 바뀔 때 다시 로드
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // 즐겨찾기 상세 로딩
  useEffect(() => {
    loadFavoriteMoviesDetails();
  }, [loadFavoriteMoviesDetails]);

  // =========================
  // 상호작용 핸들러들
  // =========================
  const handleMovieClick = async (movie: any) => {
    if (!movie || !movie.id) {
      console.warn("Invalid movie data:", movie);
      return;
    }

    try {
      const details =
        movie.media_type === "tv"
          ? await getTVDetails(movie.id)
          : await getMovieDetails(movie.id);

      const year =
        getYear(
          movie.release_date ||
            movie.first_air_date ||
            (details as any)?.release_date ||
            (details as any)?.first_air_date
        ) ?? new Date().getFullYear();

      const genresFromDetails = (details as any)?.genres ?? [];
      const primaryGenreName =
        genresFromDetails[0]?.name || userPreferences.genres[0] || "드라마";

      const movieData = {
        id: movie.id,
        title:
          movie.title ||
          movie.name ||
          (details as any)?.title ||
          (details as any)?.name ||
          "제목 없음",
        poster: getPosterUrl(
          movie.poster_path || (details as any)?.poster_path,
          "w342"
        ),
        rating: movie.vote_average || (details as any)?.vote_average || 0,
        year,
        genre: primaryGenreName,
        matchScore: movie.matchScore || 50,
        runtime:
          (details as any)?.runtime ||
          (details as any)?.episode_run_time?.[0] ||
          120,
        director:
          (details as any)?.credits?.crew?.find(
            (person: any) => person.job === "Director"
          )?.name || "정보 없음",
        cast:
          (details as any)?.credits?.cast
            ?.slice(0, 5)
            .map((actor: any) => actor.name) || [],
        description:
          movie.overview ||
          (details as any)?.overview ||
          "줄거리 정보가 없습니다.",
        tmdbId: movie.id,
        mediaType: movie.media_type || "movie",
      };

      setSelectedMovie(movieData);
    } catch (error) {
      console.error("Failed to load movie details:", error);

      const year =
        getYear(movie.release_date || movie.first_air_date) ??
        new Date().getFullYear();

      const fallbackData = {
        id: movie.id,
        title: movie.title || movie.name || "제목 없음",
        poster: getPosterUrl(movie.poster_path, "w342"),
        rating: movie.vote_average || 0,
        year,
        genre: userPreferences.genres[0] || "드라마",
        matchScore: movie.matchScore || 50,
        runtime: 120,
        director: "정보 없음",
        cast: [],
        description: movie.overview || "줄거리 정보가 없습니다.",
        tmdbId: movie.id,
        mediaType: movie.media_type || "movie",
      };
      setSelectedMovie(fallbackData);
    }
  };

  const filteredContent = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase();
    const allMovies = [
      ...recommendedMovies,
      ...popularMovies,
      ...topRatedMovies,
      ...latestMovies,
    ];

    const uniqueMovies = Array.from(
      new Map(allMovies.map((movie) => [movie.id, movie])).values()
    );

    return uniqueMovies.filter((movie) => {
      const title = movie.title || (movie as any).name || "";
      return title.toLowerCase().includes(query);
    });
  }, [
    searchQuery,
    recommendedMovies,
    popularMovies,
    topRatedMovies,
    latestMovies,
  ]);

  // 라우팅 + 섹션 전환
  const handleNavigate = (section: string) => {
    setCurrentSection(section);

    switch (section) {
      case "favorites":
        navigate("/favorites");
        break;
      case "popular-movies":
        navigate("/popular-movies");
        break;
      case "popular-tv":
        navigate("/popular-tv");
        break;
      default:
        navigate("/");
        break;
    }
  };

  const hasHeroCarousel = currentSection === "home" && !filteredContent;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a24] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-400 mx-auto mb-4" />
          <p className="text-white text-xl">영화 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a24] text-white">
      {/* 헤더 */}
      <Suspense
        fallback={
          <div className="h-16 flex items-center px-6 text-white/60">
            Loading...
          </div>
        }
      >
        <Header
          onNavigate={handleNavigate}
          currentSection={currentSection}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </Suspense>

      {/* 홈 + 검색 중이 아닐 때만 캐러셀(히어로) 노출 */}
      {hasHeroCarousel && (
        <section className="relative z-20">
          <Suspense
            fallback={
              <div className="h-[260px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            }
          >
            <FavoritesCarousel
              movies={favoriteMovies}
              onMovieClick={handleMovieClick}
              onToggleFavorite={toggleFavorite}
            />
          </Suspense>
        </section>
      )}

      {/* =========================
          아래 컨텐츠 섹션
         ========================= */}
      <main className="page-fade-in pb-20">
        {/* Search Results */}
        {filteredContent && (
          <section className="pt-20" aria-label="검색 결과">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-6">
              {filteredContent.map((movie) => {
                const title =
                  movie.title || (movie as any).name || "제목 없음";
                const posterUrl = getPosterUrl(movie.poster_path, "w342");

                return (
                  <div
                    key={movie.id}
                    role="button"
                    tabIndex={0}
                    className="group cursor-pointer text-left outline-none"
                    onClick={() => handleMovieClick(movie)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleMovieClick(movie);
                    }}
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                      {posterUrl ? (
                        <img
                          loading="lazy"
                          src={posterUrl}
                          alt={title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">
                          No Image
                        </div>
                      )}
                    </div>

                    <p className="text-sm truncate text-white">{title}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Home Section */}
        {!filteredContent && currentSection === "home" && (
          <>
            <Suspense
              fallback={
                <div className="h-[220px] my-4 bg-neutral-900/40 rounded-lg" />
              }
            >
              <MovieRow
                title="당신을 위한 추천"
                movies={recommendedMovies}
                favorites={favoriteIds}
                onToggleFavorite={toggleFavorite}
                onMovieClick={handleMovieClick}
                showMatchScore={true}
              />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-[220px] my-4 bg-neutral-900/40 rounded-lg" />
              }
            >
              <MovieRow
                title="인기 영화"
                movies={popularMovies}
                favorites={favoriteIds}
                onToggleFavorite={toggleFavorite}
                onMovieClick={handleMovieClick}
              />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-[220px] my-4 bg-neutral-900/40 rounded-lg" />
              }
            >
              <MovieRow
                title="인기 TV 프로그램"
                movies={popularTV}
                favorites={favoriteIds}
                onToggleFavorite={toggleFavorite}
                onMovieClick={handleMovieClick}
              />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-[220px] my-4 bg-neutral-900/40 rounded-lg" />
              }
            >
              <MovieRow
                title="최신 개봉작"
                movies={latestMovies}
                favorites={favoriteIds}
                onToggleFavorite={toggleFavorite}
                onMovieClick={handleMovieClick}
              />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-[220px] my-4 bg-neutral-900/40 rounded-lg" />
              }
            >
              <MovieRow
                title="높은 평점 영화"
                movies={topRatedMovies}
                favorites={favoriteIds}
                onToggleFavorite={toggleFavorite}
                onMovieClick={handleMovieClick}
              />
            </Suspense>

            {userPreferences.genres.length > 0 && (
              <Suspense
                fallback={
                  <div className="h-[220px] my-4 bg-neutral-900/40 rounded-lg" />
                }
              >
                <MovieRow
                  title={`${userPreferences.genres[0]} 추천`}
                  movies={genreMovies}
                  favorites={favoriteIds}
                  onToggleFavorite={toggleFavorite}
                  onMovieClick={handleMovieClick}
                  showMatchScore={true}
                />
              </Suspense>
            )}

            {/* Reanalyze Button */}
            <section className="text-center px-6">
              <div className="max-w-md mx-auto">
                <h2 className="text-white text-xl mb-4">
                  새로운 추천을 받아보세요
                </h2>
                <Button
                  onClick={onReanalyze}
                  size="lg"
                  className="pick-cta pick-cta-more-wide bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border-none transition-opacity"
                >
                  취향 재분석하기
                </Button>
              </div>
            </section>
          </>
        )}

        {/* Favorites Section */}
        {!filteredContent && currentSection === "favorites" && (
          <section className="pt-24" aria-label="내 찜 목록">
            <h2 className="text-white mb-4 px-6 text-2xl font-semibold">
              내 찜 목록
            </h2>
            {favoriteMovies.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-6">
                {favoriteMovies.map((movie) => (
                  <button
                    key={movie.id}
                    className="group cursor-pointer text-left"
                    onClick={() => handleMovieClick(movie)}
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                      <img
                        loading="lazy"
                        src={getPosterUrl(movie.poster_path, "w342") || ""}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                      {movie.matchScore && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs">
                          {movie.matchScore}%
                        </div>
                      )}
                    </div>
                    <h3 className="text-white text-sm truncate">
                      {movie.title}
                    </h3>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg">
                  아직 찜한 영화가 없습니다
                </p>
              </div>
            )}
          </section>
        )}

        {/* Popular Movies Section */}
        {!filteredContent && currentSection === "popular-movies" && (
          <section className="pt-24" aria-label="인기 영화">
            <h2 className="text-white mb-4 px-6 text-2xl font-semibold">
              인기 영화
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-6">
              {popularMovies.map((movie) => (
                <button
                  key={movie.id}
                  className="group cursor-pointer text-left"
                  onClick={() => handleMovieClick(movie)}
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                    <img
                      loading="lazy"
                      src={getPosterUrl(movie.poster_path, "w342") || ""}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="text-white text-sm truncate">{movie.title}</h3>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Popular TV Section */}
        {!filteredContent && currentSection === "popular-tv" && (
          <section className="pt-24" aria-label="인기 TV 컨텐츠">
            <h2 className="text-white mb-4 px-6 text-2xl font-semibold">
              인기 TV 컨텐츠
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-6">
              {popularTV.map((show) => (
                <button
                  key={show.id}
                  className="group cursor-pointer text-left"
                  onClick={() => handleMovieClick(show)}
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                    <img
                      loading="lazy"
                      src={getPosterUrl(show.poster_path, "w342") || ""}
                      alt={show.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="text-white text-sm truncate">{show.name}</h3>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Movie Detail Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <Suspense fallback={null}>
            <MovieDetailModal
              movie={selectedMovie}
              onClose={() => setSelectedMovie(null)}
              isFavorite={favorites.some((f) => f.id === selectedMovie.id)}
              onToggleFavorite={() =>
                toggleFavorite(selectedMovie.id, selectedMovie.mediaType)
              }
              onMovieChange={(newMovie) => setSelectedMovie(newMovie)}
              userPreferences={userPreferences}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
