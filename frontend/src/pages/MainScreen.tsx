// 메인 화면:
// - 헤더 + 검색
// - 홈(추천/인기/최신/TV) 섹션
// - 내 찜 목록, 인기 영화, 인기 TV 섹션
// - 영화 카드 클릭 시 상세 모달 표시
// - 사용자 취향에 따른 matchScore 계산 및 정렬

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
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

// 큰 컴포넌트들은 lazy-load로 분리해서 초기 로딩 성능 개선
const Header = lazy(() =>
  import("../components/layout/Header").then((mod) => ({ default: mod.Header }))
);

const FavoritesCarousel = lazy(() =>
  import("../features/favorites/components/FavoritesCarousel").then((mod) => ({
    default: mod.FavoritesCarousel,
  }))
);

const MovieRow = lazy(() =>
  import("../features/movies/components/MovieRow").then((mod) => ({
    default: mod.MovieRow,
  }))
);

const MovieDetailModal = lazy(() =>
  import("../features/movies/components/MovieDetailModal").then((mod) => ({
    default: mod.MovieDetailModal,
  }))
);

interface MainScreenProps {
  userPreferences: UserPreferences; // 온보딩에서 저장된 취향 정보
  favorites: FavoriteItem[]; // 전역 찜 리스트 (id + mediaType)
  onReanalyze?: () => void; // "취향 재분석" 눌렀을 때 온보딩으로 보내는 콜백
  onToggleFavorite?: (movieId: number, mediaType?: "movie" | "tv") => void;
  initialSection: "home" | "favorites" | "popular-movies" | "popular-tv";
}

interface MovieWithScore extends TMDBMovie {
  matchScore?: number; // 사용자 취향과의 매칭 점수 (0~100)
}

const IS_DEV = import.meta.env.DEV;

// =========================
// 애니메이션 variants
// =========================

const sectionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

// =========================
// 헬퍼 함수들
// =========================

// TMDB 영화 + 사용자 취향 → matchScore 필드 추가
function withMatchScore(
  movie: TMDBMovie,
  prefs: UserPreferences
): MovieWithScore {
  return {
    ...movie,
    matchScore: calculateMatchScore(movie, prefs),
  };
}

// YYYY-MM-DD 문자열에서 안전하게 연도만 추출
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

  // 현재 상단 탭 상태 (home / favorites / popular-movies / popular-tv)
  const [currentSection, setCurrentSection] = useState<string>(initialSection);
  // 검색어 입력값
  const [searchQuery, setSearchQuery] = useState("");
  // 모달에 표시할 선택된 영화 정보
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  // 전체 데이터 로딩 상태
  const [loading, setLoading] = useState(true);

  // 찜한 영화들의 실제 TMDB 상세 정보 (matchScore 포함)
  const [favoriteMovies, setFavoriteMovies] = useState<MovieWithScore[]>([]);
  // 사용자 취향 기반 추천 영화
  const [recommendedMovies, setRecommendedMovies] = useState<MovieWithScore[]>(
    []
  );
  // 인기 영화 / 인기 TV / 높은 평점 / 최신 개봉 / 특정 장르 추천 등
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularTV, setPopularTV] = useState<TMDBMovie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<TMDBMovie[]>([]);
  const [latestMovies, setLatestMovies] = useState<TMDBMovie[]>([]);
  const [genreMovies, setGenreMovies] = useState<MovieWithScore[]>([]);

  // favorites 배열에서 id만 따로 추출 (MovieRow 찜 버튼에 사용)
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
  // 찜 상세 정보 로딩
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
      // 찜 목록의 각 id에 대해 영화/TV 상세 정보 API 호출
      const detailPromises = favorites.map(async (item) => {
        try {
          if (item.mediaType === "tv") {
            const detail = await getTVDetails(item.id);
            if (!detail) return null;

            // TV 상세 응답을 Movie 형태로 변환해서 matchScore 계산
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

  // 메인 화면에서 찜 토글 → App으로 콜백 전달
  const toggleFavorite = useCallback(
    (movieId: number, mediaType?: "movie" | "tv") => {
      onToggleFavorite?.(movieId, mediaType);
    },
    [onToggleFavorite]
  );

  // =========================
  // TMDB 데이터 로더들
  // =========================

  // 인기 영화 여러 페이지 → 중복 제거 후 상위 40개만
  const loadPopularMovies = async (): Promise<TMDBMovie[]> => {
    const pages = await Promise.all([
      getPopularMovies(1),
      getPopularMovies(2),
    ]);

    const merged = pages.flat();
    const unique = Array.from(new Map(merged.map((m) => [m.id, m])).values());
    return unique.slice(0, 40);
  };

  // 인기 TV 프로그램 → Movie 형태로 정규화 후 상위 40개
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

  // 높은 평점 영화
  const loadTopRatedMovies = async (): Promise<TMDBMovie[]> => {
    const page1 = await getTopRatedMovies(1);
    return page1.slice(0, 40);
  };

  // 최신 개봉작 영화
  const loadNowPlayingMovies = async (): Promise<TMDBMovie[]> => {
    const page1 = await getNowPlayingMovies(1);
    return page1.slice(0, 40);
  };

  // 사용자 취향(장르) 기반 추천 영화
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

  // 메인 장르 하나만 골라서 보여주는 섹션
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
      // 인기/최신/추천/장르 추천을 모두 병렬로 가져온다
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

  // 초기 마운트 + 취향이 바뀔 때마다 전체 데이터 재로딩
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // 찜 목록이 바뀔 때마다 상세 정보 재로딩
  useEffect(() => {
    loadFavoriteMoviesDetails();
  }, [loadFavoriteMoviesDetails]);

  // =========================
  // 카드 클릭 → 상세 모달 로직
  // =========================
  const handleMovieClick = async (movie: any) => {
    if (!movie || !movie.id) {
      console.warn("Invalid movie data:", movie);
      return;
    }

    try {
      // 영화인지 TV인지에 따라 상세 API 분기
      const details =
        movie.media_type === "tv"
          ? await getTVDetails(movie.id)
          : await getMovieDetails(movie.id);

      // 연도 계산: 여러 필드 중 하나라도 있으면 사용
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

      // MovieDetailModal에서 사용하기 좋은 형태로 변환
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

      // 상세 정보가 실패했을 경우 최소한의 정보만으로 모달을 띄우는 fallback
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

  // =========================
  // 검색 로직: 현재 로드된 영화들 중에서 제목 포함 여부로 필터
  // =========================
  const filteredContent = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase();
    const allMovies = [
      ...recommendedMovies,
      ...popularMovies,
      ...topRatedMovies,
      ...latestMovies,
    ];

    // id 기준으로 중복 제거
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

  // 상단 헤더에서 메뉴 클릭 → 라우팅 + 상태 동기화
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

  // 홈 + 검색 중이 아닐 때만 상단 히어로 캐러셀 노출
  const hasHeroCarousel = currentSection === "home" && !filteredContent;

  // 섹션 전환 시 애니메이션 key
  const currentViewKey = filteredContent ? "search" : currentSection;

  // 전체 데이터 로딩 중일 때 스피너 반환
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
      {/* 상단 헤더 (검색 + 네비게이션) */}
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

      {/* 홈 섹션이면서 검색 중이 아닐 때만 찜 캐러셀(히어로) 표시 */}
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
          아래 컨텐츠 섹션 (페이드 인/아웃)
         ========================= */}
      <main className="page-fade-in pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentViewKey}
            variants={sectionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {/* 검색 결과 섹션 */}
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

            {/* =========================
                Home Section (추천 + 여러 Row)
               ========================= */}
            {!filteredContent && currentSection === "home" && (
              <>
                {/* 당신을 위한 추천 Row (matchScore 표시) */}
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

                {/* 인기 영화 Row */}
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

                {/* 인기 TV 프로그램 Row */}
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

                {/* 최신 개봉작 Row */}
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

                {/* 높은 평점 영화 Row */}
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

                {/* 사용자의 첫 번째 장르에 대한 맞춤 Row */}
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

                {/* 취향 재분석하기 CTA 섹션 */}
                <section className="text-center px-6">
                  <div className="max-w-md mx-auto">
                    <h2 className="text-white text-xl mb-4 font-medium">
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

            {/* =========================
                Favorites Section
               ========================= */}
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
                            <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs font-semibold">
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

            {/* =========================
                Popular Movies Section
               ========================= */}
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
                      <h3 className="text-white text-sm truncate">
                        {movie.title}
                      </h3>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* =========================
                Popular TV Section
               ========================= */}
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
                      <h3 className="text-white text-sm truncate">
                        {show.name}
                      </h3>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 상세 모달 (MainScreen 버전) */}
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
