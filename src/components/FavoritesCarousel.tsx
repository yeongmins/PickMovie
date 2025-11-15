import { useState, useEffect } from 'react';
import { Heart, Star, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { getPosterUrl } from '../utils/tmdb';

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  backdrop_path?: string;
  vote_average: number;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  matchScore?: number;
  media_type?: 'movie' | 'tv'; // mediaType 추가
}

interface FavoritesCarouselProps {
  movies: Movie[];
  onMovieClick: (movie: Movie) => void;
  onToggleFavorite: (movieId: number, mediaType?: 'movie' | 'tv') => void;
}

export function FavoritesCarousel({ movies, onMovieClick, onToggleFavorite }: FavoritesCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlayKey, setAutoPlayKey] = useState(0); // 자동 재생 타이머를 리셋하기 위한 키

  // movies 배열이 변경되면 currentIndex를 0으로 리셋
  useEffect(() => {
    setCurrentIndex(0);
  }, [movies.length]);

  useEffect(() => {
    if (movies.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % movies.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [movies.length, autoPlayKey]); // autoPlayKey가 변경될 때마다 타이머 재시작

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + movies.length) % movies.length);
    setAutoPlayKey(prev => prev + 1); // 타이머 리셋
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % movies.length);
    setAutoPlayKey(prev => prev + 1); // 타이머 리셋
  };

  if (movies.length === 0) {
    return (
      <div className="relative h-[500px] bg-gradient-to-b from-purple-900/20 to-transparent rounded-xl mb-10 mx-6 flex items-center justify-center border border-white/10">
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">아직 찜한 영화가 없습니다</p>
          <p className="text-gray-500 text-sm mt-2">마음에 드는 영화를 찜해보세요!</p>
        </div>
      </div>
    );
  }

  const currentMovie = movies[currentIndex];

  // currentMovie가 undefined인 경우 방어 코드
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

  return (
    <div className="relative h-[500px] mb-10 mx-6 rounded-xl overflow-hidden group">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentMovie.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          {/* Background image */}
          <div className="absolute inset-0">
            <img
              src={getPosterUrl(currentMovie.backdrop_path || currentMovie.poster_path, 'original')}
              alt={currentMovie.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a24] via-transparent to-transparent" />
          </div>

          {/* Content */}
          <div className="relative h-full flex items-center px-12">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="w-5 h-5 fill-current text-red-500" />
                <span className="text-purple-300 text-sm">내 찜 목록</span>
              </div>

              <h1 className="text-white text-5xl mb-4">
                {currentMovie.title}
              </h1>

              <div className="flex items-center gap-4 mb-4 text-sm">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-current text-yellow-400" />
                  <span className="text-white">{currentMovie.vote_average.toFixed(1)}</span>
                </div>
                {(currentMovie.release_date || currentMovie.first_air_date) && (
                  <span className="text-gray-300">
                    {new Date(currentMovie.release_date || currentMovie.first_air_date || '').getFullYear()}
                  </span>
                )}
                {currentMovie.matchScore && (
                  <div className="px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs">
                    {currentMovie.matchScore}% 매칭
                  </div>
                )}
              </div>

              {currentMovie.overview && (
                <p className="text-gray-300 text-sm leading-relaxed mb-6 line-clamp-3">
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
                <Button
                  onClick={() => onToggleFavorite(currentMovie.id, currentMovie.media_type)}
                  size="lg"
                  className="bg-red-500/20 backdrop-blur-md border border-red-400/30 text-white hover:bg-red-500/30 hover:border-red-400/50 transition-all shadow-lg"
                >
                  <Heart className="w-5 h-5 mr-2 fill-current text-red-400" />
                  <span className="font-semibold">찜 해제</span>
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation arrows */}
      {movies.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </>
      )}

      {/* Indicators */}
      {movies.length > 1 && (
        <div className="absolute bottom-6 right-6 flex gap-2 z-10">
          {movies.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`h-1 rounded-full transition-all ${
                index === currentIndex
                  ? 'w-8 bg-white'
                  : 'w-4 bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}