// frontend/src/features/movies/components/MovieRow.tsx
import { useState, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ContentCard } from "../../../components/content/ContentCard";

interface Movie {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;

  poster_path: string | null;
  vote_average: number;

  release_date?: string;
  first_air_date?: string;

  matchScore?: number;
  media_type?: "movie" | "tv";
  genre_ids?: number[];

  // 7항목 슬롯(없으면 카드에서 '—')
  providers?: any[];
  platform?: string;
  ageRating?: string;
  isNowPlaying?: boolean;
}

interface MovieRowProps {
  title: string;
  movies: Movie[];

  // ✅ 호환/확장: 기존 number[]도 받고, movie/tv 충돌 방지용 Set<string>도 받을 수 있게
  favorites?: number[];
  favoriteKeySet?: Set<string>;

  onToggleFavorite: (movieId: number, mediaType?: "movie" | "tv") => void;
  onMovieClick: (movie: Movie) => void;

  // ✅ TS 오류 방지(필요하면 내려도 되고, Row에서는 사용 안 해도 됨)
  showMatchScore?: boolean;
}

export function MovieRow({
  title,
  movies,
  favorites = [],
  favoriteKeySet,
  onToggleFavorite,
  onMovieClick,
}: MovieRowProps) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [hiddenMovieIds, setHiddenMovieIds] = useState<number[]>([]);

  const uniqueMovies = useMemo(() => {
    const deduped = Array.from(new Map(movies.map((m) => [m.id, m])).values());
    return deduped.filter((movie) => !!movie.poster_path);
  }, [movies]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.85;
    const newPosition =
      direction === "left"
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;

    container.scrollTo({ left: newPosition, behavior: "smooth" });
    setScrollPosition(newPosition);
  };

  if (uniqueMovies.length === 0) return null;

  // ✅ (개선 1) 메인 캐러셀 좌/우 padding 최적화: lg:px-10 → lg:px-6
  const sectionPad = "px-4 sm:px-6 lg:px-6";

  return (
    <div className="mb-10 group/row relative">
      <h2
        className={`text-white mb-2 ${sectionPad} text-2xl tracking-tight font-semibold`}
      >
        {title}
      </h2>

      <div className="relative">
        {scrollPosition > 0 && (
          <button
            onClick={() => scroll("left")}
            className={`absolute left-0 top-0 bottom-0 z-20 w-12 sm:w-14 bg-gradient-to-r from-[#1a1a24] to-transparent flex items-center justify-start pl-2 opacity-0 group-hover/row:opacity-100 transition-opacity`}
            aria-label={`${title} 왼쪽으로 스크롤`}
          >
            <ChevronLeft className="w-10 h-10 text-white drop-shadow-lg" />
          </button>
        )}

        <div
          ref={scrollContainerRef}
          className={`flex gap-3 overflow-x-auto scrollbar-hide ${sectionPad} scroll-smooth py-2`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          onScroll={(e) => setScrollPosition(e.currentTarget.scrollLeft)}
        >
          {uniqueMovies.map((movie) => {
            if (hiddenMovieIds.includes(movie.id)) return null;

            const mt = (movie.media_type || "movie") as "movie" | "tv";
            const key = `${mt}:${movie.id}`;
            const isFav = favoriteKeySet
              ? favoriteKeySet.has(key)
              : favorites.includes(movie.id);

            return (
              <div
                key={`${mt}:${movie.id}`}
                className="flex-shrink-0 w-[160px] sm:w-[180px] md:w-[200px] lg:w-[220px] transition-transform duration-300 hover:scale-[1.03]"
              >
                <ContentCard
                  item={movie}
                  isFavorite={isFav}
                  onClick={() => onMovieClick(movie)}
                  onToggleFavorite={() => onToggleFavorite(movie.id, mt)}
                  context="default"
                  onPosterError={() => {
                    setHiddenMovieIds((prev) =>
                      prev.includes(movie.id) ? prev : [...prev, movie.id]
                    );
                  }}
                />
              </div>
            );
          })}
        </div>

        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-20 w-12 sm:w-14 bg-gradient-to-l from-[#1a1a24] to-transparent flex items-center justify-end pr-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label={`${title} 오른쪽으로 스크롤`}
        >
          <ChevronRight className="w-10 h-10 text-white drop-shadow-lg" />
        </button>
      </div>
    </div>
  );
}
