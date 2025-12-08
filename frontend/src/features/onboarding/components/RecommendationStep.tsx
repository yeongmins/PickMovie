// 온보딩 마지막 단계: TMDB에서 실제 영화 데이터를 가져와
// 사용자 취향 기반으로 매칭 점수를 계산하고 추천 목록을 보여주는 화면

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../../../components/ui/button";
import { Heart, Star, Loader2 } from "lucide-react";
import { UserPreferences } from "../Onboarding";
import { Logo } from "../../../components/icons/Logo";
import { MovieDetailModal } from "../../movies/components/MovieDetailModal";
import {
  discoverMovies,
  getPosterUrl,
  calculateMatchScore,
  GENRE_IDS,
  LANGUAGE_CODES,
  type TMDBMovie,
} from "../../../lib/tmdb";

interface RecommendationStepProps {
  preferences: UserPreferences; // 온보딩에서 모아둔 취향 정보 전체
  onComplete: (preferences: UserPreferences, favorites: number[]) => void; // 온보딩 전체 완료 콜백
  onRestart: () => void; // 조건이 너무 빡세서 재시작할 때 사용
  initialFavorites?: number[]; // 온보딩 중 기존 찜 목록이 있다면 넘겨받음
}

// TMDB 응답 타입에 매칭 점수 필드를 추가한 타입
interface MovieWithScore extends TMDBMovie {
  matchScore: number;
}

// ✅ 한국어 제목 우선 표시 헬퍼
const getDisplayTitle = (movie: TMDBMovie) =>
  movie.title ||
  movie.name ||
  movie.original_title ||
  movie.original_name ||
  "제목 정보 없음";

export function RecommendationStep({
  preferences,
  onComplete,
  onRestart,
  initialFavorites,
}: RecommendationStepProps) {
  // 찜 목록: 온보딩 내부에서만 쓰는 임시 favorite 리스트 (id 배열)
  const [favorites, setFavorites] = useState<number[]>(initialFavorites || []);
  // 상세 모달에 띄울 영화 정보
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  // 추천 영화 리스트
  const [movies, setMovies] = useState<MovieWithScore[]>([]);
  // TMDB 로딩 상태
  const [loading, setLoading] = useState(true);

  // 취향(preferences)이 바뀔 때마다 새로 추천 목록 로딩
  useEffect(() => {
    void loadMovies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences]);

  // TMDB에서 영화 여러 페이지 가져와서 점수 계산 후 상위 20개 추리는 함수
  const loadMovies = async () => {
    setLoading(true);
    try {
      // 1) 장르 이름(예: "액션") → TMDB 장르 ID 배열로 변환
      const genreIds = preferences.genres
        .map((g) => GENRE_IDS[g])
        .filter(Boolean) as number[];

      // 2) 국가 텍스트 → 언어 코드(ko, ja 등) 변환
      const language = LANGUAGE_CODES[preferences.country] || "";

      // 3) 개봉 연도 처리 (단일 연도만 필터링에 사용)
      let year = "";
      if (preferences.releaseYear === "2024년") year = "2024";
      else if (preferences.releaseYear === "2023년") year = "2023";
      else if (preferences.releaseYear === "2022년") year = "2022";

      // 4) TMDB discover API로 여러 페이지 병렬 호출
      const [page1, page2, page3] = await Promise.all([
        discoverMovies({ genres: genreIds, language, year, page: 1 }),
        discoverMovies({ genres: genreIds, language, year, page: 2 }),
        discoverMovies({ genres: genreIds, language, year, page: 3 }),
      ]);

      const allMovies = [...page1, ...page2, ...page3];

      // ✅ 같은 영화가 여러 페이지에 있을 수 있으므로 id 기준으로 중복 제거
      const uniqueMovies = Array.from(
        new Map(allMovies.map((m) => [m.id, m])).values()
      ) as TMDBMovie[];

      // 5) 각 영화에 매칭 점수 계산해서 붙이기
      const moviesWithScores: MovieWithScore[] = uniqueMovies.map((movie) => ({
        ...movie,
        matchScore: calculateMatchScore(movie, preferences),
      }));

      // 6) 매칭 점수 기준 내림차순 정렬 후 상위 20개만 사용
      const topMovies = moviesWithScores
        .filter((m) => m.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 20);

      setMovies(topMovies);
    } catch (error) {
      console.error("Failed to load movies:", error);
      // 실패 시 빈 배열로 설정
      setMovies([]);
    } finally {
      setLoading(false);
    }
  };

  // 온보딩 내부에서 쓰는 임시 찜 토글
  const toggleFavorite = (movieId: number) => {
    setFavorites((prev: number[]) =>
      prev.includes(movieId)
        ? prev.filter((id) => id !== movieId)
        : [...prev, movieId]
    );
  };

  // 카드 클릭 시 모달에서 사용할 형태로 데이터 가공
  const handleMovieClick = (movie: MovieWithScore) => {
    // TMDB 원본 데이터 → MovieDetailModal이 요구하는 형태로 변환
    setSelectedMovie({
      id: movie.id,
      title: getDisplayTitle(movie),
      poster: getPosterUrl(movie.poster_path),
      rating: movie.vote_average,
      year: movie.release_date
        ? new Date(movie.release_date).getFullYear()
        : undefined,
      genre: preferences.genres[0] || "드라마",
      matchScore: movie.matchScore,
      runtime: 120, // 상세 정보에서 다시 업데이트 예정 (기본값)
      director: "정보 로딩 중...",
      cast: [],
      description: movie.overview || "줄거리 정보가 없습니다.",
      tmdbId: movie.id, // TMDB 상세 조회에 사용할 ID
    });
  };

  // TMDB 호출 로딩 화면
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

  // 추천 결과가 하나도 없을 때: 조건이 너무 까다로울 때 안내 화면
  if (movies.length === 0) {
    // 사용자의 선택 조건을 분석해서 왜 없는지 힌트 제공
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

          {/* 사용자가 조건을 어떻게 완화하면 좋을지 가이드 */}
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

          {/* 추천 설정 팁 */}
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

          {/* 온보딩 처음부터 다시 시작 */}
          <Button
            onClick={onRestart}
            size="lg"
            className="pick-cta pick-cta-wide bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 border-none transition-opacity"
          >
            다시 시작하기
          </Button>
        </div>
      </div>
    );
  }

  // 정상적으로 추천 결과가 있을 때 화면
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} // 처음 진입 시 아래에서 살짝 올라오듯
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen p-6 pb-20 relative bg-[#1a1a24] flex items-center justify-center"
    >
      <div className="max-w-5xl mx-auto relative z-10 w-full">
        {/* 상단 헤더: 로고 + 설명 + 요약 */}
        <div className="text-center mb-10 pt-8">
          <Logo size="md" className="justify-center mb-3" />
          <div className="inline-block px-5 py-2 bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-400/50 rounded-full text-purple-100 mb-3 text-sm font-medium">
            ✨ 취향 분석 완료
          </div>
          <h1 className="text-white mb-3 text-3xl font-semibold">
            당신의 취향에 딱 맞는 영화를 찾았어요!
          </h1>
          <p className="text-gray-300 text-sm">
            {preferences.genres.length}개 장르 · {preferences.moods.length}개
            무드 기반으로 선정되었습니다
          </p>
          <p className="text-purple-300 text-xs mt-2">
            총 {movies.length}개의 영화를 찾았습니다
          </p>

          {/* ✅ 사용자가 선택한 조건 요약 박스 */}
          {(preferences.genres.length > 0 ||
            preferences.moods.length > 0 ||
            preferences.runtime ||
            preferences.releaseYear ||
            preferences.country ||
            (preferences.excludes && preferences.excludes.length > 0)) && (
            <div className="mt-4 max-w-2xl mx-auto bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-left space-y-3">
              {/* 선택한 장르 요약 */}
              {preferences.genres.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">
                    🎬 선택한 장르
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {preferences.genres.map((g) => (
                      <span
                        key={g}
                        className="px-2 py-1 rounded-full bg-purple-500/15 border border-purple-400/40 text-[11px] text-purple-100"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 선택한 분위기 요약 */}
              {preferences.moods.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">
                    🎭 선택한 분위기
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {preferences.moods.map((m) => (
                      <span
                        key={m}
                        className="px-2 py-1 rounded-full bg-pink-500/15 border border-pink-400/40 text-[11px] text-pink-100"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 추가 조건(러닝타임, 연도, 국가) 요약 */}
              {(preferences.runtime ||
                preferences.releaseYear ||
                preferences.country) && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">⏱ 추가 조건</p>
                  <div className="flex flex-wrap gap-1">
                    {preferences.runtime && (
                      <span className="px-2 py-1 rounded-full bg-white/5 border border-white/15 text-[11px] text-gray-100">
                        러닝타임: {preferences.runtime}
                      </span>
                    )}
                    {preferences.releaseYear && (
                      <span className="px-2 py-1 rounded-full bg-white/5 border border-white/15 text-[11px] text-gray-100">
                        개봉 연도: {preferences.releaseYear}
                      </span>
                    )}
                    {preferences.country && (
                      <span className="px-2 py-1 rounded-full bg-white/5 border border-white/15 text-[11px] text-gray-100">
                        국가: {preferences.country}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 제외 조건 요약 */}
              {preferences.excludes && preferences.excludes.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">
                    🚫 제외한 요소
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {preferences.excludes.map((e) => (
                      <span
                        key={e}
                        className="px-2 py-1 rounded-full bg-red-500/10 border border-red-400/40 text-[11px] text-red-200"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 추천 영화 카드 그리드 */}
        <div className="mb-10">
          <h3 className="text-white mb-5 text-2xl font-bold">추천 영화 목록</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {movies.map((movie: MovieWithScore) => {
              const posterUrl = getPosterUrl(movie.poster_path, "w500");

              return (
                <div
                  key={movie.id} // ✅ 위에서 id 기준으로 중복 제거함
                  className="group cursor-pointer"
                  onClick={() => handleMovieClick(movie)}
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500 transition-all">
                    {posterUrl ? (
                      <img
                        src={posterUrl}
                        alt={getDisplayTitle(movie)}
                        className="w-full h-full object-cover transition-opacity duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">
                        No Image
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* 카드 우상단 찜(하트) 버튼 */}
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

                    {/* 좌상단 매칭 점수 배지 */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs font-semibold">
                      {movie.matchScore}% 매칭
                    </div>
                  </div>

                  <h4 className="text-white mb-1 truncate text-sm">
                    {getDisplayTitle(movie)}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current text-yellow-400" />
                      {movie.vote_average.toFixed(1)}
                    </span>
                    {movie.release_date && (
                      <>
                        <span>·</span>
                        <span>
                          {new Date(movie.release_date).getFullYear()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 온보딩 전체 완료 버튼 (+ 찜 개수 요약) */}
        <div className="text-center">
          <Button
            onClick={() => onComplete(preferences, favorites)}
            size="lg"
            className="pick-cta pick-cta-wide bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white px-10 border-none transition-opacity"
          >
            더 많은 영화 보러가기 🎬
          </Button>
          <p className="text-gray-400 text-xs mt-3">
            {favorites.length}개의 영화를 찜했습니다
          </p>
        </div>
      </div>

      {/* 영화 상세 모달: Similar 추천에서도 이 모달을 재사용 */}
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
