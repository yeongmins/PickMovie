// src/features/favorites/components/MobileFavoritesCarousel.tsx
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Star, Info, Sparkles } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { getBackdropUrl } from "../../../lib/tmdb";

import {
  AgeBadge,
  Chip,
  FavoritesCarouselProps,
  RankBadge,
  getDisplayTitle,
  logoUrl,
  useFavoritesHeroState,
} from "./favoritesCarousel.shared";

export function MobileFavoritesCarousel({
  movies,
  onMovieClick,
  onToggleFavorite,
}: FavoritesCarouselProps) {
  const {
    loggedIn,
    trendLoading,

    activeMovies,
    currentMovie,

    currentIndex,
    setIndex,
    indexOriginRef,
    jumpTo,

    visibleProviders,
    hiddenCount,

    ageValue,
    showAge,
    typeText,
    airingChip,
    hasBackdrop,
    yearText,
  } = useFavoritesHeroState(movies);

  const mobileTrackRef = useRef<HTMLDivElement | null>(null);
  const mobileItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const root = mobileTrackRef.current;
    if (!root) return;

    const obs = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; ratio: number } | null = null;

        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const idx = Number((e.target as HTMLElement).dataset.index);
          if (!Number.isFinite(idx)) continue;
          const ratio = e.intersectionRatio ?? 0;
          if (!best || ratio > best.ratio) best = { idx, ratio };
        }

        if (!best) return;
        if (best.idx === currentIndex) return;

        setIndex(best.idx, "scroll");
      },
      { root, threshold: [0.6, 0.75, 0.9] }
    );

    const els = mobileItemRefs.current;
    for (const el of els) {
      if (el) obs.observe(el);
    }

    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMovies.length, currentIndex, setIndex]);

  useEffect(() => {
    if (indexOriginRef.current === "scroll") return;

    const el = mobileItemRefs.current[currentIndex];
    if (!el) return;

    try {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    } catch {
      // ignore
    }
  }, [currentIndex, indexOriginRef]);

  if (activeMovies.length === 0) {
    if (!loggedIn) {
      return (
        <div className="relative h-[100svh] min-h-[100svh] bg-gradient-to-b from-purple-900/20 to-transparent flex items-center justify-center">
          <div className="text-center">
            <Sparkles className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">
              {trendLoading
                ? "오늘의 인기 차트를 불러오는 중..."
                : "오늘의 인기 차트가 없습니다"}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {trendLoading
                ? "잠시만 기다려주세요!"
                : "잠시 후 다시 시도해보세요."}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="relative h-[100svh] min-h-[100svh] bg-gradient-to-b from-purple-900/20 to-transparent flex items-center justify-center">
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">아직 찜한 영화가 없습니다</p>
          <p className="text-gray-500 text-sm mt-2">
            마음에 드는 영화를 찜해보세요!
          </p>
        </div>
      </div>
    );
  }

  if (!currentMovie) {
    return (
      <div className="relative h-[100svh] min-h-[100svh] bg-gradient-to-b from-purple-900/20 to-transparent flex items-center justify-center">
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">영화 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[100svh] overflow-hidden z-30">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${loggedIn ? "fav" : "trend"}:${currentMovie.id}:mobile-bg`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0">
            {hasBackdrop ? (
              <img
                src={getBackdropUrl(
                  currentMovie.backdrop_path ||
                    currentMovie.poster_path ||
                    null,
                  "original"
                )}
                alt={getDisplayTitle(currentMovie)}
                className="w-full h-full object-cover object-center scale-[1.02]"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-black via-black/70 to-transparent" />
            )}

            <div className="absolute inset-0 bg-black/55" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b12] via-black/30 to-black/30" />
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 pt-24 pb-10">
        <div className="px-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {loggedIn ? (
                <>
                  <Heart className="w-5 h-5 fill-current text-red-500" />
                  <span className="text-purple-300 text-sm font-semibold">
                    내 찜 목록
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-purple-300" />
                  <span className="text-purple-300 text-sm font-semibold">
                    오늘의 PickMovie 인기 차트
                  </span>
                  {typeof currentMovie.trendRank === "number" && (
                    <div className="ml-2">
                      <RankBadge rank={currentMovie.trendRank} />
                    </div>
                  )}
                </>
              )}
            </div>

            {activeMovies.length > 1 && (
              <div className="text-white/70 text-xs font-extrabold bg-black/25 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1">
                {currentIndex + 1} / {activeMovies.length}
              </div>
            )}
          </div>
        </div>

        <motion.div
          layout
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="mt-3"
        >
          <div
            ref={mobileTrackRef}
            className={[
              "flex gap-4 overflow-x-auto px-5",
              "snap-x snap-mandatory",
              "scroll-px-5",
              "pb-3",
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            ].join(" ")}
          >
            {activeMovies.map((m, idx) => {
              const imgPath = m.poster_path || m.backdrop_path || null;
              const isActive = idx === currentIndex;

              return (
                <motion.button
                  key={`${loggedIn ? "fav" : "trend"}:${m.id}:${idx}`}
                  ref={(el) => {
                    mobileItemRefs.current[idx] = el;
                  }}
                  data-index={idx}
                  type="button"
                  onClick={() => {
                    setIndex(idx, "thumb");
                    jumpTo(idx);
                  }}
                  layout
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="shrink-0 snap-center outline-none"
                  aria-label={`${idx + 1}번째 콘텐츠: ${getDisplayTitle(m)}`}
                >
                  <motion.div
                    layout
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className={[
                      "rounded-2xl overflow-hidden relative",
                      isActive
                        ? "w-[76vw] max-w-[360px]"
                        : "w-[64vw] max-w-[310px]",
                      "aspect-square",
                      "bg-black/30",
                    ].join(" ")}
                  >
                    {imgPath ? (
                      <img
                        src={getBackdropUrl(imgPath, "w780")}
                        alt={getDisplayTitle(m)}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5" />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

                    <div className="absolute left-3 right-3 bottom-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0" />

                        {!loggedIn && typeof m.trendRank === "number" && (
                          <div className="shrink-0">
                            <div className="text-[12px] font-extrabold text-white bg-black/40 border border-white/10 rounded-full px-2 py-1">
                              {m.trendRank}위
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        <div className="px-5 mt-4">
          <h1 className="text-white text-[22px] font-semibold leading-tight">
            {getDisplayTitle(currentMovie)}
          </h1>

          <div className="flex items-center gap-3 mt-3 text-sm">
            <div className="flex items-center gap-1 shrink-0">
              <Star className="w-4 h-4 fill-current text-yellow-400" />
              <span className="text-white font-semibold">
                {(currentMovie.vote_average ?? 0).toFixed(1)}
              </span>
            </div>

            {yearText && (
              <span className="text-gray-300 font-semibold shrink-0">
                {yearText}
              </span>
            )}

            <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2 flex-nowrap w-max">
                <Chip tone="dark">{typeText}</Chip>
                {airingChip && (
                  <Chip tone={airingChip.tone}>{airingChip.label}</Chip>
                )}
                {showAge && <AgeBadge value={ageValue} />}

                {visibleProviders.length > 0 && (
                  <div className="flex items-center gap-1 flex-nowrap">
                    {visibleProviders.map((p) => (
                      <div
                        key={p.name}
                        className="w-[24px] h-[24px] rounded-[5px] bg-black/35 backdrop-blur-sm overflow-hidden flex items-center justify-center shadow-sm shrink-0 border border-white/10"
                        title={p.name}
                        aria-label={p.name}
                      >
                        <img
                          src={logoUrl(p.path!, "w92")}
                          srcSet={`${logoUrl(p.path!, "w92")} 1x, ${logoUrl(
                            p.path!,
                            "w185"
                          )} 2x`}
                          alt={p.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ))}

                    {hiddenCount > 0 && (
                      <span className="h-[24px] rounded-[6px] bg-black/35 backdrop-blur-sm px-2 text-[12px] font-extrabold text-white/90 flex items-center shadow-sm border border-white/10 shrink-0">
                        +{hiddenCount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {currentMovie.overview && (
            <p className="text-gray-300 text-[13px] leading-relaxed mt-3 line-clamp-2">
              {currentMovie.overview}
            </p>
          )}

          <div className="flex items-center gap-3 mt-5">
            <Button
              onClick={() => onMovieClick(currentMovie)}
              size="lg"
              className="flex-1 bg-white/20 backdrop-blur-md border border-white/25 text-white hover:bg-white/30 hover:border-white/45 transition-all shadow-lg"
            >
              <Info className="w-5 h-5 mr-2" />
              <span className="font-semibold">상세 정보</span>
            </Button>

            {loggedIn ? (
              <Button
                onClick={() =>
                  onToggleFavorite(currentMovie.id, currentMovie.media_type)
                }
                size="lg"
                className="flex-1 bg-red-500/20 backdrop-blur-md border border-red-400/25 text-white hover:bg-red-500/30 hover:border-red-400/45 transition-all shadow-lg"
              >
                <Heart className="w-5 h-5 mr-2 fill-current text-red-400" />
                <span className="font-semibold">찜 해제</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                disabled
                className="flex-1 bg-black/20 backdrop-blur-md border border-white/10 text-white/60 shadow-lg cursor-not-allowed"
                title="로그인하면 찜 기능을 사용할 수 있어요"
              >
                <Heart className="w-5 h-5 mr-2" />
                <span className="font-semibold">로그인 후 찜 가능</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
