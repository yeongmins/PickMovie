import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { Heart, Star, Loader2 } from "lucide-react";
import { UserPreferences } from "./Onboarding";
import { Logo } from "./Logo";
import { MovieDetailModal } from "./MovieDetailModal";
import {
  discoverMovies,
  getPosterUrl,
  calculateMatchScore,
  GENRE_IDS,
  LANGUAGE_CODES,
  type TMDBMovie,
} from "../utils/tmdb";

interface RecommendationStepProps {
  preferences: UserPreferences;
  onComplete: (preferences: UserPreferences, favorites: number[]) => void;
  onRestart: () => void;
  initialFavorites?: number[]; // 기존 찜 목록 받기
}

interface MovieWithScore extends TMDBMovie {
  matchScore: number;
}

export function RecommendationStep({
  preferences,
  onComplete,
  onRestart,
  initialFavorites,
}: RecommendationStepProps) {
  const [favorites, setFavorites] = useState<number[]>(initialFavorites || []);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [movies, setMovies] = useState<MovieWithScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovies();
  }, [preferences]);

  const loadMovies = async () => {
    setLoading(true);
    try {
      // TMDB 장르 ID 변환
      const genreIds = preferences.genres
        .map((g) => GENRE_IDS[g])
        .filter(Boolean);

      // 언어 코드 변환
      const language = LANGUAGE_CODES[preferences.country] || "";

      // 연도 처리
      let year = "";
      if (preferences.releaseYear === "2024년") year = "2024";
      else if (preferences.releaseYear === "2023년") year = "2023";
      else if (preferences.releaseYear === "2022년") year = "2022";

      // TMDB API로 영화 가져오기 (여러 페이지)
      const [page1, page2, page3] = await Promise.all([
        discoverMovies({ genres: genreIds, language, year, page: 1 }),
        discoverMovies({ genres: genreIds, language, year, page: 2 }),
        discoverMovies({ genres: genreIds, language, year, page: 3 }),
      ]);

      const allMovies = [...page1, ...page2, ...page3];

      // 매칭 점수 계산 및 정렬
      const moviesWithScores: MovieWithScore[] = allMovies.map((movie) => ({
        ...movie,
        matchScore: calculateMatchScore(movie, preferences),
      }));

      // 점수순으로 정렬하고 상위 20개 선택
      const topMovies = moviesWithScores
        .filter((m) => m.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 20);

      setMovies(topMovies);
    } catch (error) {
      console.error("Failed to load movies:", error);
      // 에러 시 빈 배열
      setMovies([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = (movieId: number) => {
    setFavorites((prev: number[]) =>
      prev.includes(movieId)
        ? prev.filter((id) => id !== movieId)
        : [...prev, movieId]
    );
  };

  const handleMovieClick = (movie: MovieWithScore) => {
    // TMDB 데이터를 기존 모달 형식에 맞게 변환
    setSelectedMovie({
      id: movie.id,
      title: movie.title,
      poster: getPosterUrl(movie.poster_path),
      rating: movie.vote_average,
      year: new Date(movie.release_date).getFullYear(),
      genre: preferences.genres[0] || "드라마",
      matchScore: movie.matchScore,
      runtime: 120, // TMDB에서 상세 정보 가져올 때 업데이트
      director: "정보 로딩 중...",
      cast: [],
      description: movie.overview || "줄거리 정보가 없습니다.",
      tmdbId: movie.id, // TMDB ID 추가
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#1a1a24]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-400 mx-auto mb-4" />
          <p className="text-white text-xl">영화 데이터를 불러오는 중...</p>
          <p className="text-gray-400 text-sm mt-2">
            TMDB에서 최적의 영화를 검색하고 있습니다
          </p>
        </div>
      </div>
    );
  }

  if (movies.length === 0) {
    // 조건 분석
    const issues: string[] = [];
    if (preferences.genres.length > 5) {
      issues.push("선택한 장르가 너무 많습니다 (3-4개 추천)");
    }
    if (
      preferences.country !== "상관없음" &&
      preferences.country !== "" &&
      preferences.releaseYear &&
      preferences.releaseYear !== "상관없음"
    ) {
      issues.push("특정 국가와 특정 연도를 함께 선택하면 결과가 제한됩니다");
    }
    if (preferences.excludes.length > 2) {
      issues.push("제외 조건이 너무 많습니다");
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#1a1a24]">
        <div className="text-center max-w-lg">
          <div className="text-6xl mb-6">😅</div>
          <p className="text-white text-2xl mb-4">검색 결과가 없습니다</p>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            선택하신 조건에 맞는 영화를 찾을 수 없습니다.
            <br />
            조건이 너무 까다로울 수 있어요.
          </p>

          {issues.length > 0 && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-5 mb-6 text-left">
              <h3 className="text-purple-300 font-semibold mb-3 flex items-center gap-2">
                <span>💡</span> 이런 점을 확인해보세요
              </h3>
              <ul className="space-y-2">
                {issues.map((issue, index) => (
                  <li
                    key={index}
                    className="text-gray-300 text-sm flex items-start gap-2"
                  >
                    <span className="text-purple-400 mt-0.5">•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6 text-left">
            <h3 className="text-white font-semibold mb-3">✨ 추천 설정</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <span>장르는 2-3개 정도만 선택해보세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <span>국가나 개봉연도를 "상관없음"으로 설정해보세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <span>제외 조건을 줄여보세요</span>
              </li>
            </ul>
          </div>

          <Button
            onClick={onRestart}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            다시 시작하기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen p-6 pb-20 relative bg-[#1a1a24] flex items-center justify-center"
    >
      {/* Cinema spotlight effect */}
      {/* <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-b from-purple-600/15 to-transparent rounded-full blur-3xl pointer-events-none" /> */}

      <div className="max-w-5xl mx-auto relative z-10 w-full">
        {/* Header */}
        <div className="text-center mb-10 pt-8">
          <Logo size="md" className="justify-center mb-4" />
          <div className="inline-block px-5 py-2 bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-400/50 rounded-full text-purple-100 mb-3 text-sm">
            ✨ 취향 분석 완료
          </div>
          <h1 className="text-white mb-3 text-3xl">
            당신의 취향에 딱 맞는 영화를 찾았어요!
          </h1>
          <p className="text-gray-300 text-sm">
            {preferences.genres.length}개 장르 · {preferences.moods.length}개
            무드 기반으로 선정되었습니다
          </p>
          <p className="text-purple-300 text-xs mt-2">
            총 {movies.length}개의 영화를 찾았습니다
          </p>
        </div>

        {/* Movie Grid */}
        <div className="mb-10">
          <h3 className="text-white mb-5 text-xl font-bold">추천 영화 목록</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {movies.map((movie: MovieWithScore) => (
              <div
                key={movie.id}
                className="group cursor-pointer"
                onClick={() => handleMovieClick(movie)}
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                  <img
                    src={getPosterUrl(movie.poster_path)}
                    alt={movie.title}
                    className="w-full h-full object-cover transition-opacity duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                  {/* Heart button */}
                  <Button
                    size="sm"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      toggleFavorite(movie.id);
                    }}
                    variant="ghost"
                    className="absolute top-2 right-2 w-7 h-7 p-0 bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-all"
                  >
                    <Heart
                      className={`w-3 h-3 transition-all ${
                        favorites.includes(movie.id)
                          ? "fill-current text-red-500"
                          : "text-white"
                      }`}
                    />
                  </Button>

                  {/* Match score badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs">
                    {movie.matchScore}% 매칭
                  </div>
                </div>

                <h4 className="text-white mb-1 truncate text-sm">
                  {movie.title}
                </h4>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current text-yellow-400" />
                    {movie.vote_average.toFixed(1)}
                  </span>
                  <span>·</span>
                  <span>{new Date(movie.release_date).getFullYear()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="text-center">
          <Button
            onClick={() => onComplete(preferences, favorites)}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-10"
          >
            더 많은 영화 보러가기 🎬
          </Button>
          <p className="text-gray-400 text-xs mt-3">
            {favorites.length}개의 영화를 찜했습니다
          </p>
        </div>
      </div>

      {/* Movie Detail Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <MovieDetailModal
            movie={selectedMovie}
            onClose={() => setSelectedMovie(null)}
            isFavorite={favorites.includes(selectedMovie.id)}
            onToggleFavorite={() => toggleFavorite(selectedMovie.id)}
            onMovieChange={(newMovie: any) => setSelectedMovie(newMovie)}
            userPreferences={preferences}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
