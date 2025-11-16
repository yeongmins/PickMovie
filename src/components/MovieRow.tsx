// MovieRow.tsx
import { useState, useRef, useMemo } from "react";
import { Heart, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { getPosterUrl } from "../utils/tmdb";

interface Movie {
  id: number;
  title: string;
  poster_path: string | null; // ⬅️ TMDB에서 null 올 수 있으니까 이렇게!
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  matchScore?: number;
  media_type?: "movie" | "tv";
}

interface MovieRowProps {
  title: string;
  movies: Movie[];
  favorites: number[];
  onToggleFavorite: (movieId: number, mediaType?: "movie" | "tv") => void;
  onMovieClick: (movie: Movie) => void;
  showMatchScore?: boolean;
}

export function MovieRow({
  title,
  movies,
  favorites,
  onToggleFavorite,
  onMovieClick,
  showMatchScore = false,
}: MovieRowProps) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // ⬇️ 이미지 로드 실패한 영화의 id 저장
  const [hiddenMovieIds, setHiddenMovieIds] = useState<number[]>([]);

  // 1️⃣ ID 기준으로 중복 제거
  // 2️⃣ poster_path 없는 영화 제거
  const uniqueMovies = useMemo(() => {
    const deduped = Array.from(new Map(movies.map((m) => [m.id, m])).values());
    return deduped.filter((movie) => !!movie.poster_path);
  }, [movies]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    const newPosition =
      direction === "left"
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;

    container.scrollTo({ left: newPosition, behavior: "smooth" });
    setScrollPosition(newPosition);
  };

  // 포스터 있는 영화도 없고, 실패한 것들까지 제거되고 나면 전체 섹션 숨김
  if (uniqueMovies.length === 0) return null;

  return (
    <div className="mb-10 group/row relative">
      <h2 className="text-white mb-4 px-6 text-2xl tracking-tight">{title}</h2>

      <div className="relative">
        {/* Left scroll button */}
        {scrollPosition > 0 && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-0 bottom-0 z-20 w-16 bg-gradient-to-r from-[#1a1a24] to-transparent flex items-center justify-start pl-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
            aria-label={`${title} 왼쪽으로 스크롤`}
          >
            <ChevronLeft className="w-10 h-10 text-white drop-shadow-lg" />
          </button>
        )}

        {/* Scroll container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-6 scroll-smooth py-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {uniqueMovies.map((movie) => {
            // onError로 숨기기로 한 영화라면 렌더링 스킵
            if (hiddenMovieIds.includes(movie.id)) return null;

            const posterUrl = getPosterUrl(movie.poster_path as string, "w500");

            return (
              <div
                key={movie.id}
                className="flex-shrink-0 w-[200px] group/card cursor-pointer"
                onClick={() => onMovieClick(movie)}
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 transition-transform duration-300 group-hover/card:scale-105">
                  <div className="absolute inset-0 rounded-lg overflow-hidden border-2 border-transparent group-hover/card:border-purple-500 transition-all">
                    <img
                      src={posterUrl}
                      alt={movie.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={() => {
                        // 이미지 로드 실패 시 이 영화는 숨길 목록에 추가
                        setHiddenMovieIds((prev) =>
                          prev.includes(movie.id)
                            ? prev
                            : [...prev, movie.id]
                        );
                      }}
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />

                    {/* Heart button */}
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(movie.id, movie.media_type);
                      }}
                      variant="ghost"
                      className="absolute top-2 right-2 w-8 h-8 p-0 bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-all opacity-0 group-hover/card:opacity-100"
                      aria-label={
                        favorites.includes(movie.id) ? "찜 해제" : "찜하기"
                      }
                    >
                      <Heart
                        className={`w-4 h-4 transition-all ${
                          favorites.includes(movie.id)
                            ? "fill-current text-red-500"
                            : "text-white"
                        }`}
                      />
                    </Button>

                    {/* Match score badge */}
                    {showMatchScore && movie.matchScore !== undefined && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs">
                        {movie.matchScore}%
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="text-white mb-1 truncate text-sm">
                  {movie.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current text-yellow-400" />
                    {movie.vote_average.toFixed(1)}
                  </span>
                  {(movie.release_date || movie.first_air_date) && (
                    <>
                      <span>·</span>
                      <span>
                        {new Date(
                          movie.release_date || movie.first_air_date || ""
                        ).getFullYear()}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right scroll button */}
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-20 w-16 bg-gradient-to-l from-[#1a1a24] to-transparent flex items-center justify-end pr-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label={`${title} 오른쪽으로 스크롤`}
        >
          <ChevronRight className="w-10 h-10 text-white drop-shadow-lg" />
        </button>
      </div>
    </div>
  );
}
