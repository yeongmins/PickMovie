import { useState, useEffect, useCallback } from 'react';
import { Header } from './Header';
import { FavoritesCarousel } from './FavoritesCarousel';
import { MovieRow } from './MovieRow';
import { MovieDetailModal } from './MovieDetailModal';
import { Button } from './ui/button';
import { AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { UserPreferences } from './Onboarding';
import { FavoriteItem } from '../App';
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
  type TMDBMovie
} from '../utils/tmdb';

interface MainScreenProps {
  userPreferences: UserPreferences;
  favorites: FavoriteItem[];
  onReanalyze?: () => void;
  onToggleFavorite?: (movieId: number, mediaType?: 'movie' | 'tv') => void;
}

interface MovieWithScore extends TMDBMovie {
  matchScore?: number;
}

export function MainScreen({ userPreferences, favorites, onReanalyze, onToggleFavorite }: MainScreenProps) {
  const [currentSection, setCurrentSection] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Movie data states
  const [favoriteMovies, setFavoriteMovies] = useState<MovieWithScore[]>([]);
  const [recommendedMovies, setRecommendedMovies] = useState<MovieWithScore[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularTV, setPopularTV] = useState<TMDBMovie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<TMDBMovie[]>([]);
  const [latestMovies, setLatestMovies] = useState<TMDBMovie[]>([]);
  const [genreMovies, setGenreMovies] = useState<MovieWithScore[]>([]);

  // 컴포넌트 마운트/언마운트 감지 (개발 환경에서만)
  useEffect(() => {
    const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    if (isDev) {
      console.log('✅ MainScreen mounted');
    }
    return () => {
      if (isDev) {
        console.log('❌ MainScreen unmounted');
      }
    };
  }, []);

  // favorites 변경 감지 (개발 환경에서만)
  useEffect(() => {
    const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    if (isDev) {
      console.log('[MainScreen] favorites updated:', favorites);
    }
  }, [favorites]);

  const loadFavoriteMoviesDetails = useCallback(async () => {
    const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    if (isDev) {
      console.log('[loadFavoriteMoviesDetails] CALLED with favorites:', favorites);
    }

    try {
      // mediaType에 따라 올바른 API 호출
      const movieDetailsPromises = favorites.map(item => {
        if (isDev) {
          console.log(`[loadFavoriteMoviesDetails] Processing item:`, item);
        }

        if (item.mediaType === 'tv') {
          return getTVDetails(item.id).then(detail => {
            if (!detail) return null;
            // TV 데이터를 영화 형식으로 정규화
            return {
              ...detail,
              title: detail.name,
              release_date: detail.first_air_date,
              runtime: detail.episode_run_time?.[0] || 120,
              media_type: 'tv' as const, // mediaType 추가
            };
          }).catch(() => null);
        } else {
          return getMovieDetails(item.id).then(detail => {
            if (!detail) return null;
            return {
              ...detail,
              media_type: 'movie' as const, // mediaType 추가
            };
          }).catch(() => null);
        }
      });
      
      const details = await Promise.all(movieDetailsPromises);
      
      const moviesWithScore = details
        .filter((detail): detail is NonNullable<typeof detail> => detail !== null)
        .map(detail => {
          // genres 배열을 genre_ids로 변환
          const genreIds = detail.genres?.map(g => g.id) || [];
          
          return {
            id: detail.id,
            title: detail.title || (detail as any).name,
            poster_path: detail.poster_path || '',
            backdrop_path: detail.backdrop_path || '',
            vote_average: detail.vote_average || 0,
            overview: detail.overview || '',
            release_date: detail.release_date || (detail as any).first_air_date || '',
            genre_ids: genreIds,
            popularity: detail.popularity || 0,
            adult: detail.adult || false,
            original_language: detail.original_language || '',
            media_type: detail.media_type, // mediaType 보존
            matchScore: calculateMatchScore({
              id: detail.id,
              title: detail.title || (detail as any).name,
              overview: detail.overview || '',
              poster_path: detail.poster_path || '',
              backdrop_path: detail.backdrop_path || '',
              vote_average: detail.vote_average || 0,
              release_date: detail.release_date || (detail as any).first_air_date || '',
              genre_ids: genreIds,
              popularity: detail.popularity || 0,
              adult: detail.adult || false,
              original_language: detail.original_language || '',
            }, userPreferences),
          };
        });
      
      if (isDev) {
        console.log('[loadFavoriteMoviesDetails] RESULT moviesWithScore:', moviesWithScore);
      }

      setFavoriteMovies(moviesWithScore);
    } catch (error) {
      console.error('Failed to load favorite movies:', error);
      setFavoriteMovies([]);
    }
  }, [favorites, userPreferences]);

  const toggleFavorite = useCallback((movieId: number, mediaType?: 'movie' | 'tv') => {
    if (onToggleFavorite) {
      onToggleFavorite(movieId, mediaType);
    }
  }, [onToggleFavorite]);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (favorites.length > 0) {
      loadFavoriteMoviesDetails();
    } else {
      setFavoriteMovies([]);
    }
  }, [favorites, loadFavoriteMoviesDetails]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [popular, tv, topRated, latest, recommended, genre] = await Promise.all([
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
      setGenreMovies(genre);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPopularMovies = async (): Promise<TMDBMovie[]> => {
    const [page1, page2, page3] = await Promise.all([
      getPopularMovies(1),
      getPopularMovies(2),
      getPopularMovies(3),
    ]);
    return [...page1, ...page2, ...page3];
  };

  const loadPopularTVShows = async (): Promise<TMDBMovie[]> => {
    const [page1, page2, page3] = await Promise.all([
      getPopularTVShows(1),
      getPopularTVShows(2),
      getPopularTVShows(3),
    ]);
    // TV 데이터를 영화 형식으로 정규화하고 media_type 추가
    return [...page1, ...page2, ...page3].map(tv => normalizeTVToMovie(tv));
  };

  const loadTopRatedMovies = async (): Promise<TMDBMovie[]> => {
    const [page1, page2, page3] = await Promise.all([
      getTopRatedMovies(1),
      getTopRatedMovies(2),
      getTopRatedMovies(3),
    ]);
    return [...page1, ...page2, ...page3];
  };

  const loadNowPlayingMovies = async (): Promise<TMDBMovie[]> => {
    const [page1, page2, page3] = await Promise.all([
      getNowPlayingMovies(1),
      getNowPlayingMovies(2),
      getNowPlayingMovies(3),
    ]);
    return [...page1, ...page2, ...page3];
  };

  const loadRecommendedMovies = async (): Promise<MovieWithScore[]> => {
    const genreIds = userPreferences.genres
      .map(g => GENRE_IDS[g])
      .filter(Boolean);

    // 여러 페이지 가져오기 (1~5페이지로 증가)
    const [page1, page2, page3, page4, page5] = await Promise.all([
      discoverMovies({ genres: genreIds, page: 1 }),
      discoverMovies({ genres: genreIds, page: 2 }),
      discoverMovies({ genres: genreIds, page: 3 }),
      discoverMovies({ genres: genreIds, page: 4 }),
      discoverMovies({ genres: genreIds, page: 5 }),
    ]);
    
    const allMovies = [...page1, ...page2, ...page3, ...page4, ...page5];
    
    return allMovies.map(movie => ({
      ...movie,
      matchScore: calculateMatchScore(movie, userPreferences),
    })).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)).slice(0, 80);
  };

  const loadGenreBasedMovies = async (): Promise<MovieWithScore[]> => {
    if (userPreferences.genres.length === 0) return [];
    
    const mainGenre = userPreferences.genres[0];
    const genreId = GENRE_IDS[mainGenre];
    if (!genreId) return [];

    const movies = await discoverMovies({ genres: [genreId], page: 1 });
    
    return movies.map(movie => ({
      ...movie,
      matchScore: calculateMatchScore(movie, userPreferences),
    })).slice(0, 20);
  };

  const handleMovieClick = async (movie: any) => {
    // 유효성 검사: movie.id가 없으면 함수 종료
    if (!movie || !movie.id) {
      console.warn('Invalid movie data:', movie);
      return;
    }

    // TMDB API에서 상세 정보를 바로 가져오기
    try {
      const details = movie.media_type === 'tv' ? await getTVDetails(movie.id) : await getMovieDetails(movie.id);
      
      // details가 null이어도 괜찮음 (출연진 정보가 없는 경우)
      const movieData = {
        id: movie.id,
        title: movie.title || movie.name || details?.title || details?.name || '제목 없음',
        poster: getPosterUrl(movie.poster_path || details?.poster_path),
        rating: movie.vote_average || details?.vote_average || 0,
        year: new Date(movie.release_date || movie.first_air_date || details?.release_date || details?.first_air_date || '').getFullYear(),
        genre: details?.genres?.[0]?.name || userPreferences.genres[0] || '드라마',
        matchScore: movie.matchScore || 50,
        runtime: details?.runtime || details?.episode_run_time?.[0] || 120,
        director: details?.credits?.crew?.find((person: any) => person.job === 'Director')?.name || '정보 없음',
        cast: details?.credits?.cast?.slice(0, 5).map((actor: any) => actor.name) || [],
        description: movie.overview || details?.overview || '줄거리 정보가 없습니다.',
        tmdbId: movie.id,
        mediaType: movie.media_type || 'movie', // mediaType 추가
      };
      setSelectedMovie(movieData);
    } catch (error) {
      console.error('Failed to load movie details:', error);
      // 폴백: 기본 데이터 사용 (출연진 없어도 모달 표시)
      const movieData = {
        id: movie.id,
        title: movie.title || movie.name || '제목 없음',
        poster: getPosterUrl(movie.poster_path),
        rating: movie.vote_average || 0,
        year: new Date(movie.release_date || movie.first_air_date || '').getFullYear(),
        genre: userPreferences.genres[0] || '드라마',
        matchScore: movie.matchScore || 50,
        runtime: 120,
        director: '정보 없음',
        cast: [],
        description: movie.overview || '줄거리 정보가 없습니다.',
        tmdbId: movie.id,
        mediaType: movie.media_type || 'movie', // mediaType 추가
      };
      setSelectedMovie(movieData);
    }
  };

  const getFilteredContent = () => {
    if (searchQuery.trim()) {
      // Filter all movies by search query
      const query = searchQuery.toLowerCase();
      const allMovies = [
        ...recommendedMovies,
        ...popularMovies,
        ...topRatedMovies,
        ...latestMovies,
      ];
      
      // Remove duplicates by ID and filter
      const uniqueMovies = Array.from(
        new Map(allMovies.map(movie => [movie.id, movie])).values()
      );
      
      return uniqueMovies.filter(movie => 
        movie.title?.toLowerCase().includes(query) ||
        movie.name?.toLowerCase().includes(query)
      );
    }
    return null;
  };

  const filteredContent = getFilteredContent();

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
    <div className="min-h-screen bg-[#1a1a24]">
      <Header
        onNavigate={setCurrentSection}
        currentSection={currentSection}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <main className="pb-20">
        {/* Search Results */}
        {filteredContent && (
          <div className="pt-6">
            <h2 className="text-white mb-4 px-6 text-2xl">
              검색 결과: "{searchQuery}"
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-6">
              {filteredContent.map(movie => (
                <div
                  key={movie.id}
                  className="group cursor-pointer"
                  onClick={() => handleMovieClick(movie)}
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                    <img
                      src={getPosterUrl(movie.poster_path, 'w300')}
                      alt={movie.title || movie.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h4 className="text-white text-sm truncate">{movie.title || movie.name}</h4>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Home Section */}
        {!filteredContent && currentSection === 'home' && (
          <>
            {/* Favorites Carousel */}
            <div className="pt-6">
              <FavoritesCarousel
                movies={favoriteMovies}
                onMovieClick={handleMovieClick}
                onToggleFavorite={toggleFavorite}
              />
            </div>

            {/* Movie Rows */}
            <MovieRow
              title="당신을 위한 추천"
              movies={recommendedMovies}
              favorites={favorites.map(f => f.id)}
              onToggleFavorite={toggleFavorite}
              onMovieClick={handleMovieClick}
              showMatchScore={true}
            />

            <MovieRow
              title="인기 영화"
              movies={popularMovies}
              favorites={favorites.map(f => f.id)}
              onToggleFavorite={toggleFavorite}
              onMovieClick={handleMovieClick}
            />

            <MovieRow
              title="인기 TV 프로그램"
              movies={popularTV}
              favorites={favorites.map(f => f.id)}
              onToggleFavorite={toggleFavorite}
              onMovieClick={handleMovieClick}
            />

            <MovieRow
              title="최신 개봉작"
              movies={latestMovies}
              favorites={favorites.map(f => f.id)}
              onToggleFavorite={toggleFavorite}
              onMovieClick={handleMovieClick}
            />

            <MovieRow
              title="높은 평점 영화"
              movies={topRatedMovies}
              favorites={favorites.map(f => f.id)}
              onToggleFavorite={toggleFavorite}
              onMovieClick={handleMovieClick}
            />

            {userPreferences.genres.length > 0 && (
              <MovieRow
                title={`${userPreferences.genres[0]} 추천`}
                movies={genreMovies}
                favorites={favorites.map(f => f.id)}
                onToggleFavorite={toggleFavorite}
                onMovieClick={handleMovieClick}
                showMatchScore={true}
              />
            )}

            {/* Reanalyze Button */}
            <div className="text-center mt-16 mb-10 px-6">
              <div className="max-w-md mx-auto">
                <h3 className="text-white text-xl mb-4">
                  새로운 추천을 받아보세요
                </h3>
                <Button
                  onClick={onReanalyze}
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-12 py-6 text-lg"
                >
                  취향 재분석하기
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Favorites Section */}
        {!filteredContent && currentSection === 'favorites' && (
          <div className="pt-6">
            <h2 className="text-white mb-6 px-6 text-2xl">내 찜 목록</h2>
            {favoriteMovies.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-6">
                {favoriteMovies.map(movie => (
                  <div
                    key={movie.id}
                    className="group cursor-pointer"
                    onClick={() => handleMovieClick(movie)}
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                      <img
                        src={getPosterUrl(movie.poster_path, 'w300')}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                      {movie.matchScore && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs">
                          {movie.matchScore}%
                        </div>
                      )}
                    </div>
                    <h4 className="text-white text-sm truncate">{movie.title}</h4>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg">아직 찜한 영화가 없습니다</p>
              </div>
            )}
          </div>
        )}

        {/* Popular Movies Section */}
        {!filteredContent && currentSection === 'popular-movies' && (
          <div className="pt-6">
            <h2 className="text-white mb-6 px-6 text-2xl">인기 영화</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-6">
              {popularMovies.map(movie => (
                <div
                  key={movie.id}
                  className="group cursor-pointer"
                  onClick={() => handleMovieClick(movie)}
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                    <img
                      src={getPosterUrl(movie.poster_path, 'w300')}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h4 className="text-white text-sm truncate">{movie.title}</h4>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Popular TV Section */}
        {!filteredContent && currentSection === 'popular-tv' && (
          <div className="pt-6">
            <h2 className="text-white mb-6 px-6 text-2xl">인기 TV 컨텐츠</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-6">
              {popularTV.map(show => (
                <div
                  key={show.id}
                  className="group cursor-pointer"
                  onClick={() => handleMovieClick(show)}
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                    <img
                      src={getPosterUrl(show.poster_path, 'w300')}
                      alt={show.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h4 className="text-white text-sm truncate">{show.name}</h4>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Movie Detail Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <MovieDetailModal
            movie={selectedMovie}
            onClose={() => setSelectedMovie(null)}
            isFavorite={favorites.some(f => f.id === selectedMovie.id)}
            onToggleFavorite={() => toggleFavorite(selectedMovie.id, selectedMovie.mediaType)}
            onMovieChange={(newMovie) => setSelectedMovie(newMovie)}
            userPreferences={userPreferences}
          />
        )}
      </AnimatePresence>
    </div>
  );
}