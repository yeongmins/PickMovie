// 홈/목록 화면에서 가로 스크롤되는 영화 리스트 컴포넌트
// - 좌우 버튼으로 스크롤
// - 포스터 로드 실패 시 해당 영화는 숨김 처리

import { useState, useRef, useMemo } from "react";
import { Heart, Star, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { getPosterUrl } from "../../../lib/tmdb";

interface Movie {
  id: number;
  title?: string;               // 🔹 필수 → 선택
  name?: string;                // 🔹 TV 이름 허용
  poster_path: string | null;
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

const POSTER_SIZE = "w342";

const getDisplayTitle = (movie: any) => {
  return (
    movie.title ||         // ✅ ko-KR 번역 제목
    movie.name ||          // ✅ TV용 번역 제목
    movie.original_title || // 번역 없을 때 원제
    movie.original_name ||
    '제목 정보 없음'
  );
};

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

  // 이미지 로드 실패한 영화 id 목록
  const [hiddenMovieIds, setHiddenMovieIds] = useState<number[]>([]);

  // 원본 movies에서
  // 1) id 기준 중복 제거
  // 2) poster_path 없는 영화 제거
  const uniqueMovies = useMemo(() => {
    const deduped = Array.from(new Map(movies.map((m) => [m.id, m])).values());
    return deduped.filter((movie) => !!movie.poster_path);
  }, [movies]);

  // 좌/우 스크롤 버튼 클릭 시 스크롤 이동
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

  // 보여줄 영화가 하나도 없으면 섹션 자체를 렌더링하지 않음
  if (uniqueMovies.length === 0) return null;

  return (
    <div className="mb-10 group/row relative">
      <h2 className="text-white mb-2 px-6 text-2xl tracking-tight font-semibold">
        {title}
      </h2>

      <div className="relative">
        {/* 왼쪽 스크롤 버튼 (스크롤이 시작 지점이면 숨김) */}
        {scrollPosition > 0 && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-0 bottom-0 z-20 w-16 bg-gradient-to-r from-[#1a1a24] to-transparent flex items-center justify-start pl-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
            aria-label={`${title} 왼쪽으로 스크롤`}
          >
            <ChevronLeft className="w-10 h-10 text-white drop-shadow-lg" />
          </button>
        )}

        {/* 실제 스크롤 영역 */}
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-6 scroll-smooth py-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          onScroll={(e) => setScrollPosition(e.currentTarget.scrollLeft)}
        >
          {uniqueMovies.map((movie) => {
            // 이미지 로드 실패로 숨기기로 한 영화는 렌더링 스킵
            if (hiddenMovieIds.includes(movie.id)) return null;

            const posterUrl = getPosterUrl(
              movie.poster_path as string,
              POSTER_SIZE
            );

            const year =
              movie.release_date || movie.first_air_date
                ? new Date(
                    movie.release_date || movie.first_air_date || ""
                  ).getFullYear()
                : undefined;

            return (
              <div
                key={movie.id}
                className="flex-shrink-0 w-[200px] group/card cursor-pointer transition-transform duration-300 hover:scale-[1.03]"
                onClick={() => onMovieClick(movie)}
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2">
                  <div className="absolute inset-0 rounded-lg overflow-hidden border-2 border-transparent group-hover/card:border-purple-500 transition-all">
                    <img
                      src={posterUrl}
                      alt={getDisplayTitle(movie)}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={() => {
                        // 포스터 로드 실패 시 hidden 목록에 추가하여 이후 렌더링에서 제외
                        setHiddenMovieIds((prev) =>
                          prev.includes(movie.id)
                            ? prev
                            : [...prev, movie.id]
                        );
                      }}
                    />

                    {/* Hover 그라디언트 오버레이 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />

                    {/* 찜 토글 버튼 (카드 우측 상단) */}
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

                    {/* 온보딩 매칭 점수 배지 (필요할 때만) */}
                    {showMatchScore && movie.matchScore !== undefined && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600/90 backdrop-blur-sm rounded text-white text-xs font-semibold">
                        {movie.matchScore}%
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="text-white mb-1 truncate text-sm">
                  {getDisplayTitle(movie)}
                </h3>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current text-yellow-400" />
                    {movie.vote_average.toFixed(1)}
                  </span>
                  {year && (
                    <>
                      <span>·</span>
                      <span>{year}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 오른쪽 스크롤 버튼 (항상 출력, 대신 opacity로 제어) */}
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
