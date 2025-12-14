// frontend/src/features/movies/components/MovieDetailModal.tsx
// ✅ Fix:
// 1) movie.rating / similar.vote_average 같은 값이 undefined일 때 toFixed 크래시 방지
// 2) getPosterUrl size "w200" -> (TMDBImageSize 허용) "w185" 로 변경
// 3) movie.genre 필수 -> optional로 변경 (Picky/MainScreen에서 genre 누락 타입 에러 제거)

import { useState, useEffect, useRef, useMemo } from "react";
import { X, Star, Heart, User } from "lucide-react";
import { motion } from "framer-motion";
import {
  getContentDetails,
  getPosterUrl,
  calculateMatchScore,
  type MovieDetails,
  type TVDetails,
} from "../../../lib/tmdb";

type MediaType = "movie" | "tv";

export interface ModalMovie {
  id: number;
  title?: string;
  poster?: string; // full url 가능
  poster_path?: string | null; // TMDB path 가능
  rating?: number; // vote_average 대응
  vote_average?: number; // TMDB raw
  year?: number;
  genre?: string; // ✅ optional
  matchScore?: number;
  description?: string;
  runtime?: number;
  tmdbId?: number;
  mediaType?: MediaType;
  media_type?: MediaType;
}

interface MovieDetailModalProps {
  movie: ModalMovie;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onMovieChange?: (movie: ModalMovie) => void;
  userPreferences?: {
    genres: string[];
    runtime?: string;
    releaseYear?: string;
    country?: string;
    excludes: string[];
  };
}

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeYearFromDates(date?: string) {
  if (!date) return undefined;
  const d = new Date(date);
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : undefined;
}

function ensurePosterUrl(poster?: string, poster_path?: string | null) {
  if (poster && typeof poster === "string") {
    if (/^https?:\/\//.test(poster)) return poster;
    // 혹시 path가 들어온 경우도 처리
    return getPosterUrl(poster, "w500") || "";
  }
  if (poster_path) return getPosterUrl(poster_path, "w500") || "";
  return "";
}

export function MovieDetailModal({
  movie,
  onClose,
  isFavorite,
  onToggleFavorite,
  onMovieChange,
  userPreferences,
}: MovieDetailModalProps) {
  const [details, setDetails] = useState<MovieDetails | TVDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const modalContentRef = useRef<HTMLDivElement>(null);

  const mediaType: MediaType = movie.mediaType || movie.media_type || "movie";

  // 모달 열려있는 동안 body 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "unset";
    };
  }, []);

  // ESC 닫기
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // 선택된 컨텐츠 바뀔 때 상세 재요청
  useEffect(() => {
    const loadDetails = async () => {
      const tmdbId = movie.tmdbId || movie.id;
      if (!tmdbId) return;

      setLoading(true);
      try {
        const contentDetails = await getContentDetails(tmdbId, mediaType);
        setDetails(contentDetails);
      } catch (e) {
        console.error(e);
        setDetails(null);
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [movie.id, movie.tmdbId, mediaType]);

  // 영화 변경 시 스크롤 맨 위
  useEffect(() => {
    const el = modalContentRef.current;
    if (el) el.scrollTop = 0;
  }, [movie.id]);

  const posterUrl = useMemo(
    () => ensurePosterUrl(movie.poster, movie.poster_path),
    [movie.poster, movie.poster_path]
  );

  const title = useMemo(
    () =>
      movie.title ||
      (details as any)?.title ||
      (details as any)?.name ||
      "제목 없음",
    [movie.title, details]
  );

  const rating = useMemo(() => {
    // ✅ undefined 방지
    return safeNum(
      movie.rating ?? movie.vote_average ?? (details as any)?.vote_average,
      0
    );
  }, [movie.rating, movie.vote_average, details]);

  const year = useMemo(() => {
    const y = safeNum(movie.year, NaN);
    if (Number.isFinite(y) && y > 0) return y;

    const release =
      (details as any)?.release_date ||
      (details as any)?.first_air_date ||
      (details as any)?.air_date ||
      undefined;

    return safeYearFromDates(release);
  }, [movie.year, details]);

  const matchScore = useMemo(
    () => Math.round(safeNum(movie.matchScore, 0)),
    [movie.matchScore]
  );

  const genreNames =
    (details as any)?.genres
      ?.map((g: any) => g?.name)
      .filter(Boolean)
      .join(", ") ||
    movie.genre ||
    "정보 없음";

  const runtime =
    safeNum((details as any)?.runtime, 0) ||
    safeNum((details as any)?.episode_run_time?.[0], 0) ||
    safeNum(movie.runtime, 0) ||
    120;

  const cast = ((details as any)?.credits?.cast || []).slice(0, 8);

  const similarMoviesRaw = ((details as any)?.similar?.results || []).slice(
    0,
    8
  );

  const similarMovies = similarMoviesRaw
    .filter((m: any) => m && m.id)
    .filter(
      (m: any, idx: number, self: any[]) =>
        idx === self.findIndex((x) => x.id === m.id)
    )
    .filter((m: any) => !!m.poster_path);

  const similarMoviesWithScore = similarMovies.map((similar: any) => {
    let ms = 0;
    if (userPreferences) {
      const raw = calculateMatchScore(similar, userPreferences);
      ms = Number.isFinite(raw) ? raw : 0;
    }
    return { ...similar, matchScore: ms };
  });

  const handleSimilarMovieClick = (similar: any) => {
    if (!similar?.id) return;

    const newTitle = similar.title || similar.name || "제목 없음";
    const newPoster = getPosterUrl(similar.poster_path, "w500") || "";
    const newYear =
      safeYearFromDates(similar.release_date || similar.first_air_date) ??
      undefined;

    const newRating = safeNum(similar.vote_average, 0);

    const safeMs = userPreferences
      ? safeNum(calculateMatchScore(similar, userPreferences), 0)
      : safeNum(similar.matchScore, 0);

    const next: ModalMovie = {
      id: similar.id,
      tmdbId: similar.id,
      title: newTitle,
      poster: newPoster,
      poster_path: similar.poster_path,
      rating: newRating,
      vote_average: newRating,
      year: newYear,
      genre: (details as any)?.genres?.[0]?.name || movie.genre || "",
      matchScore: safeMs,
      description: similar.overview || "",
      runtime,
      mediaType: (similar.media_type as MediaType) || mediaType,
      media_type: (similar.media_type as MediaType) || mediaType,
    };

    onMovieChange?.(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="콘텐츠 상세"
    >
      <motion.div
        ref={modalContentRef}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="relative bg-[#1a1a24] rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors duration-200"
          aria-label="닫기"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Hero */}
        <div className="relative h-72 bg-gradient-to-b from-gray-900 to-[#1a1a24] overflow-hidden">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-black/30" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a24] via-[#1a1a24]/80 to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-8 flex gap-6">
            <div className="w-32 h-48 rounded-lg overflow-hidden flex-shrink-0 hidden sm:block bg-white/5">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>

            <div className="flex-1 flex flex-col justify-end">
              <h2 className="text-white mb-3 text-3xl font-semibold">
                {title}
              </h2>

              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="px-3 py-1 bg-green-600/80 backdrop-blur-sm rounded text-white text-sm font-semibold">
                  {matchScore}% 매칭
                </div>

                <div className="flex items-center gap-1.5 text-gray-300 text-sm">
                  <Star className="w-4 h-4 fill-current text-yellow-400" />
                  <span className="font-semibold">{rating.toFixed(1)}</span>
                </div>

                {year ? (
                  <span className="text-gray-400 text-sm">{year}년</span>
                ) : (
                  <span className="text-gray-500 text-sm">연도 정보 없음</span>
                )}

                <span className="text-gray-400 text-sm">{genreNames}</span>
                <span className="text-gray-400 text-sm">{runtime}분</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onToggleFavorite}
                  className={`px-5 py-2 rounded-lg border-2 transition-colors flex items-center gap-2 ${
                    isFavorite
                      ? "border-red-500 bg-red-500/10 hover:bg-red-500/20"
                      : "border-white/20 bg-white/5 hover:bg-white/10"
                  }`}
                  aria-label={isFavorite ? "찜 해제" : "찜 하기"}
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

        {/* Content */}
        <div className="p-8">
          <div className="mb-8">
            <h3 className="text-white mb-3 text-lg font-semibold">줄거리</h3>
            <p className="text-gray-300 leading-relaxed text-sm">
              {(details as any)?.overview ||
                movie.description ||
                "이 콘텐츠는 당신의 취향에 맞춰 추천된 작품입니다."}
            </p>
          </div>

          <div className="space-y-4 mb-8 text-sm">
            <div className="flex gap-4">
              <span className="text-gray-500 w-24 flex-shrink-0">장르</span>
              <span className="text-gray-300">{genreNames}</span>
            </div>

            <div className="flex gap-4">
              <span className="text-gray-500 w-24 flex-shrink-0">개봉</span>
              <span className="text-gray-300">
                {year ? `${year}년` : "정보 없음"}
              </span>
            </div>

            <div className="flex gap-4">
              <span className="text-gray-500 w-24 flex-shrink-0">러닝타임</span>
              <span className="text-gray-300">{runtime}분</span>
            </div>

            {cast.length > 0 && (
              <div className="flex gap-4">
                <span className="text-gray-500 w-24 flex-shrink-0">출연</span>
                <span className="text-gray-300">
                  {cast
                    .map((c: any) => c?.name)
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}
          </div>

          {cast.length > 0 && (
            <div className="mb-8">
              <h3 className="text-white mb-4 text-lg font-semibold">
                주요 출연진
              </h3>

              <div className="grid grid-cols-4 gap-4">
                {cast.map((actor: any) => (
                  <div key={actor.id} className="text-center">
                    <div className="w-full aspect-square bg-white/5 rounded-lg mb-2 overflow-hidden">
                      {actor.profile_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
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

          {similarMoviesWithScore.length > 0 && (
            <div>
              <h3 className="text-white mb-4 text-lg font-semibold">
                비슷한 콘텐츠
              </h3>

              <div className="grid grid-cols-4 gap-4">
                {similarMoviesWithScore.map((similar: any) => {
                  // ✅ "w200" -> "w185"
                  const poster = getPosterUrl(similar.poster_path, "w185");
                  if (!poster) return null;

                  const simRating = safeNum(similar.vote_average, 0);

                  return (
                    <div
                      key={similar.id}
                      className="group cursor-pointer"
                      onClick={() => handleSimilarMovieClick(similar)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          handleSimilarMovieClick(similar);
                        }
                      }}
                      aria-label={`${similar.title || similar.name} 상세 보기`}
                    >
                      <div className="relative aspect-[2/3] bg-white/5 rounded-lg overflow-hidden mb-2 border-2 border-transparent group-hover:border-purple-500/50 transition-all">
                        <img
                          src={poster}
                          alt={similar.title || similar.name}
                          loading="lazy"
                          className="w-full h-full object-cover transition-opacity group-hover:opacity-80"
                          onError={(e) => {
                            (
                              e.currentTarget.parentElement as HTMLElement
                            ).style.display = "none";
                          }}
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs font-semibold">
                          {Math.round(safeNum(similar.matchScore, 0))}%
                        </div>
                      </div>

                      <p className="text-gray-300 text-xs truncate font-medium">
                        {similar.title || similar.name}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Star className="w-3 h-3 fill-current text-yellow-400" />
                        {simRating.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading &&
            cast.length === 0 &&
            similarMoviesWithScore.length === 0 && (
              <div
                className="text-center py-8"
                role="status"
                aria-live="polite"
              >
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
