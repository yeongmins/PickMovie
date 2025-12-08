// 영화/TV 상세 정보 모달
// - TMDB에서 상세 정보를 가져와서 모달로 보여줌
// - 비슷한 콘텐츠 리스트 + 취향 기반 매칭 점수까지 계산

import { useState, useEffect, useRef } from "react";
import { X, Star, Heart, User } from "lucide-react";
import { motion } from "framer-motion";
import {
  getContentDetails,
  getPosterUrl,
  calculateMatchScore,
  type MovieDetails,
  type TVDetails,
} from "../../../lib/tmdb"; // ⬅️ lib 위치 기준 경로

interface Movie {
  id: number;
  title: string;
  poster: string;
  rating: number;
  year: number;
  genre: string;
  matchScore: number;
  description?: string;
  runtime?: number;
  director?: string;
  cast?: string[];
  tmdbId?: number;
  mediaType?: "movie" | "tv";
}

interface MovieDetailModalProps {
  movie: Movie;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onMovieChange?: (movie: Movie) => void; // 비슷한 콘텐츠 클릭 시 상세 모달 내용 교체
  userPreferences?: {
    genres: string[];
    runtime?: string;
    releaseYear?: string;
    country?: string;
    excludes: string[];
  };
}

export function MovieDetailModal({
  movie,
  onClose,
  isFavorite,
  onToggleFavorite,
  onMovieChange,
  userPreferences,
}: MovieDetailModalProps) {
  // TMDB에서 가져온 상세 정보 (영화/TV 둘 다 가능)
  const [details, setDetails] = useState<MovieDetails | TVDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const modalContentRef = useRef<HTMLDivElement>(null);

  // 모달이 열려 있는 동안 body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  // 선택된 영화가 바뀔 때마다 TMDB 상세 정보 재요청
  useEffect(() => {
    const loadDetails = async () => {
      const tmdbId = movie.tmdbId || movie.id;
      if (!tmdbId) return;

      setLoading(true);
      try {
        const contentDetails = await getContentDetails(
          tmdbId,
          movie.mediaType || "movie"
        );
        setDetails(contentDetails);
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [movie.id, movie.tmdbId, movie.mediaType]);

  // 영화가 변경될 때마다 모달 스크롤을 맨 위로 초기화
  useEffect(() => {
    const modalContent = modalContentRef.current;
    if (modalContent) {
      modalContent.scrollTop = 0;
    }
  }, [movie.id]);

  // 장르 이름 문자열 (상세 정보가 있으면 그 값 사용)
  const genreNames =
    details?.genres?.map((g) => g.name).join(", ") || movie.genre;

  // 감독 정보 (현재 UI에서는 사용 X, 필요 시 확장용)
  const director =
    (details as any)?.credits?.crew?.find((p: any) => p.job === "Director")
      ?.name || "정보 없음";

  // 출연진(캐스트) 상위 8명만 사용
  const cast = (details as any)?.credits?.cast?.slice(0, 8) ?? [];

  // 러닝타임(영화 or TV 에피소드 길이 중 하나 선택)
  const runtime =
    (details as any)?.runtime ??
    (details as any)?.episode_run_time?.[0] ??
    movie.runtime ??
    120;

  // TMDB에서 전달된 비슷한 콘텐츠 원본 리스트
  const similarMoviesRaw =
    (details as any)?.similar?.results?.slice(0, 8) ?? [];

  // 비슷한 콘텐츠 정제:
  // 1) id 기준 중복 제거
  // 2) poster_path 없는 항목 제거
  const similarMovies = similarMoviesRaw
    .filter((m: any) => m && m.id)
    .filter(
      (m: any, index: number, self: any[]) =>
        index === self.findIndex((x) => x.id === m.id)
    )
    .filter((m: any) => !!m.poster_path);

  // 비슷한 콘텐츠에 매칭 점수 붙이기
  const similarMoviesWithScore = similarMovies.map((similar: any) => {
    let matchScore = 0;
    if (userPreferences) {
      const rawScore = calculateMatchScore(similar, userPreferences);
      matchScore = Number.isFinite(rawScore) ? rawScore : 0;
    }
    return { ...similar, matchScore };
  });

  // "비슷한 콘텐츠" 카드 클릭 시 모달 내 영화 정보를 해당 작품으로 변경
  const handleSimilarMovieClick = (similar: any) => {
    if (!similar || !similar.id) {
      console.warn("Invalid similar movie data:", similar);
      return;
    }

    if (onMovieChange) {
      const safeMatchScore = userPreferences
        ? calculateMatchScore(similar, userPreferences)
        : 50;

      const newMovie: Movie = {
        id: similar.id,
        title: similar.title || similar.name || "제목 없음",
        poster: getPosterUrl(similar.poster_path),
        rating: similar.vote_average || 0,
        year: new Date(
          similar.release_date || similar.first_air_date || ""
        ).getFullYear(),
        genre: details?.genres?.[0]?.name || movie.genre,
        matchScore: safeMatchScore,
        description: similar.overview || "",
        runtime: runtime,
        tmdbId: similar.id,
        mediaType: similar.media_type || movie.mediaType || "movie",
      };
      onMovieChange(newMovie);
    }
  };

  return (
    <motion.div
      // 모달 전체 배경 페이드인/아웃
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        ref={modalContentRef}
        // 모달 카드의 등장 애니메이션
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative bg-[#1a1a24] rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()} // 배경 클릭만 닫히도록 버블링 방지
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors duration-200"
          aria-label="영화 상세 닫기"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* 상단 히어로 영역 (블러 처리된 포스터 + 기본 정보) */}
        <div className="relative h-72 bg-gradient-to-b from-gray-900 to-[#1a1a24] overflow-hidden">
          <img
            src={movie.poster}
            alt={movie.title}
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a24] via-[#1a1a24]/80 to-transparent" />

          {/* 포스터 + 타이틀 오버레이 */}
          <div className="absolute bottom-0 left-0 right-0 p-8 flex gap-6 detail-padding">
            {/* 왼쪽 포스터 */}
            <div className="w-32 h-48 rounded-lg overflow-hidden flex-shrink-0 hidden sm:block">
              <img
                src={movie.poster}
                alt={movie.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            {/* 오른쪽 타이틀/메타 정보 */}
            <div className="flex-1 flex flex-col justify-end">
              <h2 className="text-white mb-3 text-3xl font-semibold detail-title">
                {movie.title}
              </h2>

              {/* 매칭 점수, 평점, 연도, 장르, 러닝타임 배지 */}
              <div className="flex flex-wrap items-center gap-3 mb-3 detail-gap">
                <div className="px-3 py-1 bg-green-600/80 backdrop-blur-sm rounded text-white text-sm font-semibold">
                  {movie.matchScore}% 매칭
                </div>
                <div className="flex items-center gap-1.5 text-gray-300 text-sm">
                  <Star className="w-4 h-4 fill-current text-yellow-400" />
                  <span className="font-semibold">
                    {movie.rating.toFixed(1)}
                  </span>
                </div>
                <span className="text-gray-400 text-sm">{movie.year}년</span>
                <span className="text-gray-400 text-sm">{genreNames}</span>
                <span className="text-gray-400 text-sm">{runtime}분</span>
              </div>

              {/* 찜 버튼 */}
              <div className="flex gap-3">
                <button
                  onClick={onToggleFavorite}
                  className={`px-5 py-2 rounded-lg border-2 transition-colors flex items-center gap-2 ${
                    isFavorite
                      ? "border-red-500 bg-red-500/10 hover:bg-red-500/20"
                      : "border-white/20 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 ${
                      isFavorite ? "fill-current text-red-500" : "text-white"
                    }`}
                  />
                  <span className="text-white text-sm font-medium">
                    {isFavorite ? "찜 완료" : "찜하기"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 내용 영역 */}
        <div className="p-8 detail-padding">
          {/* 줄거리 섹션 */}
          <div className="mb-8">
            <h3 className="text-white mb-3 text-lg font-semibold">줄거리</h3>
            <p className="text-gray-300 leading-relaxed text-sm">
              {details?.overview ||
                movie.description ||
                "이 영화는 당신의 취향에 맞춰 추천된 작품입니다. 흥미진진한 스토리와 뛰어난 연출로 많은 관객들의 사랑을 받은 명작입니다."}
            </p>
          </div>

          {/* 메타데이터 (장르/개봉/러닝타임/출연진 텍스트) */}
          <div className="space-y-4 mb-8 text-sm">
            <div className="flex gap-4">
              <span className="text-gray-500 w-24 flex-shrink-0">장르</span>
              <span className="text-gray-300">{genreNames}</span>
            </div>

            <div className="flex gap-4">
              <span className="text-gray-500 w-24 flex-shrink-0">개봉</span>
              <span className="text-gray-300">{movie.year}년</span>
            </div>

            <div className="flex gap-4">
              <span className="text-gray-500 w-24 flex-shrink-0">
                러닝타임
              </span>
              <span className="text-gray-300">{runtime}분</span>
            </div>

            {cast.length > 0 && (
              <div className="flex gap-4">
                <span className="text-gray-500 w-24 flex-shrink-0">출연</span>
                <span className="text-gray-300">
                  {cast.map((c: any) => c.name).join(", ")}
                </span>
              </div>
            )}
          </div>

          {/* 출연진 썸네일 그리드 */}
          {cast.length > 0 && (
            <div className="mb-8">
              <h3 className="text-white mb-4 text-lg font-semibold">
                주요 출연진
              </h3>
              <div className="grid grid-cols-4 gap-4 detail-gap">
                {cast.map((actor: any) => (
                  <div key={actor.id} className="text-center">
                    <div className="w-full aspect-square bg-white/5 rounded-lg mb-2 overflow-hidden">
                      {actor.profile_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w200${actor.profile_path}`}
                          alt={actor.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-8 h-8 text-gray-600" />
                        </div>
                      )}
                    </div>
                    <p className="text-gray-300 text-xs truncate font-medium">
                      {actor.name}
                    </p>
                    <p className="text-gray-500 text-xs truncate">
                      {actor.character}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 비슷한 콘텐츠 리스트 */}
          {similarMoviesWithScore.length > 0 && (
            <div>
              <h3 className="text-white mb-4 text-lg font-semibold">
                비슷한 콘텐츠
              </h3>
              <div className="grid grid-cols-4 gap-4 detail-gap">
                {similarMoviesWithScore.map((similar: any) => {
                  const posterUrl = getPosterUrl(similar.poster_path, "w200");

                  // posterUrl이 없으면 카드 자체 렌더링 X
                  if (!posterUrl) return null;

                  return (
                    <div
                      key={similar.id}
                      className="group cursor-pointer"
                      onClick={() => handleSimilarMovieClick(similar)}
                    >
                      <div className="relative aspect-[2/3] bg-white/5 rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500/50 transition-all">
                        <img
                          src={posterUrl}
                          alt={similar.title || similar.name}
                          loading="lazy"
                          className="w-full h-full object-cover transition-opacity group-hover:opacity-80"
                          onError={(e) => {
                            // 이미지가 깨지면 해당 카드만 안 보이도록 처리
                            (
                              e.currentTarget.parentElement as HTMLElement
                            ).style.display = "none";
                          }}
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs font-semibold">
                          {similar.matchScore}%
                        </div>
                      </div>
                      <p className="text-gray-300 text-xs truncate font-medium">
                        {similar.title || similar.name}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Star className="w-3 h-3 fill-current text-yellow-400" />
                        {similar.vote_average.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 로딩만 남았을 때 보여주는 인디케이터 */}
          {loading &&
            cast.length === 0 &&
            similarMoviesWithScore.length === 0 && (
              <div className="text-center py-8">
                <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm mt-2">
                  상세 정보를 불러오는 중...
                </p>
              </div>
            )}
        </div>
      </motion.div>
    </motion.div>
  );
}
