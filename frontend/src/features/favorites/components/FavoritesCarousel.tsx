// src/features/favorites/components/FavoritesCarousel.tsx
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Heart,
  Star,
  Info,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Play,
} from "lucide-react";

import { Button } from "../../../components/ui/button";
import { apiGet } from "../../../lib/apiClient";
import { getBackdropUrl } from "../../../lib/tmdb";

import {
  AgeBadge,
  Chip,
  FavoritesCarouselProps,
  RankBadge,
  ScrollMouseHint,
  getDisplayTitle,
  logoUrl,
  useFavoritesHeroState,
} from "./favoritesCarousel.shared";

type CarouselLayout = "fullscreen" | "embedded";

/* =========================
   ✅ Title Logo (TMDB logos)
========================= */

function titleLogoCdnUrl(
  filePath: string,
  size: "w500" | "w780" | "original" = "w500"
) {
  return `https://image.tmdb.org/t/p/${size}${filePath}`;
}

type TmdbImageAsset = {
  file_path: string;
  iso_639_1: string | null;
  width: number;
  height: number;
  vote_average: number;
  vote_count: number;
};

type TmdbImagesResponse = {
  logos?: TmdbImageAsset[];
};

const _titleLogoCache = new Map<string, string | null>();
const _titleLogoInFlight = new Map<string, Promise<string | null>>();

function normalizeMediaType(v: unknown): "movie" | "tv" {
  return v === "tv" ? "tv" : "movie";
}

function pickBestKoreanLogoFilePath(
  logos: TmdbImageAsset[] | undefined
): string | null {
  if (!logos?.length) return null;

  const ko = logos.filter((l) => l.iso_639_1 === "ko");
  if (!ko.length) return null;

  ko.sort((a, b) => {
    const vc = (b.vote_count ?? 0) - (a.vote_count ?? 0);
    if (vc !== 0) return vc;
    return b.width * b.height - a.width * a.height;
  });

  return ko[0]?.file_path ?? null;
}

async function fetchTitleLogoFilePath(
  mediaType: "movie" | "tv",
  id: number
): Promise<string | null> {
  const key = `${mediaType}:${id}`;

  if (_titleLogoCache.has(key)) return _titleLogoCache.get(key) ?? null;

  const inflight = _titleLogoInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const data = await apiGet<TmdbImagesResponse>(
        `/tmdb/images/${mediaType}/${id}`,
        { include_image_language: "ko" }
      );
      const filePath = pickBestKoreanLogoFilePath(data?.logos);
      _titleLogoCache.set(key, filePath);
      return filePath;
    } catch {
      _titleLogoCache.set(key, null);
      return null;
    } finally {
      _titleLogoInFlight.delete(key);
    }
  })();

  _titleLogoInFlight.set(key, p);
  return p;
}

type TitleLogoState =
  | { status: "checking"; filePath: null }
  | { status: "ready"; filePath: string | null };

function useTitleLogo(mediaType: "movie" | "tv", id: number): TitleLogoState {
  const key = `${mediaType}:${id}`;

  const [state, setState] = useState<TitleLogoState>(() => {
    if (_titleLogoCache.has(key)) {
      return { status: "ready", filePath: _titleLogoCache.get(key) ?? null };
    }
    return { status: "checking", filePath: null };
  });

  useEffect(() => {
    let alive = true;

    if (_titleLogoCache.has(key)) {
      setState({ status: "ready", filePath: _titleLogoCache.get(key) ?? null });
      return;
    }

    setState({ status: "checking", filePath: null });

    void (async () => {
      const next = await fetchTitleLogoFilePath(mediaType, id);
      if (!alive) return;
      setState({ status: "ready", filePath: next });
    })();

    return () => {
      alive = false;
    };
  }, [key, mediaType, id]);

  return state;
}

function TitleLogoOrText({ movie }: { movie: any }) {
  const title = getDisplayTitle(movie as any);
  const mediaType = normalizeMediaType((movie as any)?.media_type);

  const logo = useTitleLogo(mediaType, (movie as any).id);

  const hasLogo = logo.status === "ready" && !!logo.filePath;
  const noLogo = logo.status === "ready" && !logo.filePath;
  const checking = logo.status === "checking";

  const src1x = hasLogo ? titleLogoCdnUrl(logo.filePath!, "w500") : null;
  const src2x = hasLogo ? titleLogoCdnUrl(logo.filePath!, "w780") : null;

  const [logoReady, setLogoReady] = useState(false);

  useEffect(() => {
    setLogoReady(false);
  }, [(movie as any).id, hasLogo ? logo.filePath : null]);

  return (
    <h1
      className="text-white mb-4 font-semibold carousel-title"
      style={{ display: "flex", alignItems: "flex-end" }}
    >
      {checking ? <span aria-hidden="true" style={{ opacity: 0 }} /> : null}

      {hasLogo && src1x ? (
        <>
          <span className="sr-only">{title}</span>
          <motion.img
            key={`title-logo:${mediaType}:${(movie as any).id}:${
              logo.filePath
            }`}
            src={src1x}
            srcSet={src2x ? `${src1x} 1x, ${src2x} 2x` : undefined}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setLogoReady(true)}
            onError={() => setLogoReady(false)}
            initial={false}
            animate={{
              opacity: logoReady ? 1 : 0,
              filter: logoReady ? "blur(0px)" : "blur(10px)",
            }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{
              display: "block",
              maxWidth: "100%",
              width: "auto",
              height: "auto",
              maxHeight: 96,
              objectFit: "contain",
              filter: logoReady
                ? "drop-shadow(0 10px 22px rgba(0,0,0,0.55))"
                : "drop-shadow(0 10px 22px rgba(0,0,0,0.35))",
              transform: "translateZ(0)",
              willChange: "opacity, filter",
            }}
          />
        </>
      ) : null}

      {noLogo ? (
        <motion.span
          key={`fallback-title:${mediaType}:${(movie as any).id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{
            position: "relative",
            display: "inline-block",
            padding: "2px 6px",
            marginLeft: "-6px",
            borderRadius: 10,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "-8px -12px",
              borderRadius: 14,
              background:
                "radial-gradient(closest-side, rgba(0,0,0,0.45), rgba(0,0,0,0.0))",
              filter: "blur(6px)",
              opacity: 0.9,
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              position: "relative",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              fontSize: "1.08em",
              color: "rgba(255,255,255,0.98)",
              transform: "translateY(1px)",
              maxWidth: "min(680px, 90vw)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </span>
        </motion.span>
      ) : null}
    </h1>
  );
}

export function FavoritesCarousel(
  props: FavoritesCarouselProps & {
    layout?: CarouselLayout;
    onTrailerClick?: (movie: any) => void;
  }
) {
  const {
    movies,
    onMovieClick,
    onToggleFavorite,
    onTrailerClick,
    layout = "fullscreen",
  } = props;

  const heightClass =
    layout === "embedded" ? "h-full min-h-0" : "h-[85svh] min-h-[85svh]";

  const {
    loggedIn,
    trendLoading,

    activeMovies,
    currentMovie,

    currentIndex,
    jumpTo,

    goToPrevious,
    goToNext,

    visibleProviders,
    hiddenCount,

    ageValue,
    showAge,
    typeText,
    airingChip,
    hasBackdrop,
    yearText,

    trailerOpen,
  } = useFavoritesHeroState(movies);

  if (activeMovies.length === 0) {
    if (!loggedIn) {
      return (
        <div
          className={[
            "relative w-full overflow-hidden",
            heightClass,
            "bg-gradient-to-b from-purple-900/20 to-transparent flex items-center justify-center",
          ].join(" ")}
        >
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
      <div
        className={[
          "relative w-full overflow-hidden",
          heightClass,
          "bg-gradient-to-b from-purple-900/20 to-transparent flex items-center justify-center",
        ].join(" ")}
      >
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">아직 찜한 컨텐츠가 없습니다</p>
          <p className="text-gray-500 text-sm mt-2">
            마음에 드는 컨텐츠를 찜해보세요!
          </p>
        </div>
      </div>
    );
  }

  if (!currentMovie) {
    return (
      <div
        className={[
          "relative w-full overflow-hidden",
          heightClass,
          "bg-gradient-to-b from-purple-900/20 to-transparent flex items-center justify-center",
        ].join(" ")}
      >
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">영화 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "relative w-full overflow-hidden group z-30",
        heightClass,
      ].join(" ")}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`${loggedIn ? "fav" : "trend"}:${currentMovie.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
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
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-black via-black/70 to-transparent" />
            )}

            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a24] via-transparent to-transparent" />
          </div>

          <div className="relative h-full flex items-center px-12 carousel-content">
            <div className="max-w-2xl mt-10">
              <div className="flex items-center gap-2 mb-3">
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
                    {typeof (currentMovie as any).trendRank === "number" && (
                      <div className="ml-2">
                        <RankBadge rank={(currentMovie as any).trendRank} />
                      </div>
                    )}
                  </>
                )}
              </div>

              <TitleLogoOrText movie={currentMovie as any} />

              <div className="flex items-center gap-4 mb-4 text-sm carousel-middle">
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

                <div className="min-w-0 flex-1 overflow-x-auto">
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
                            className="w-[25px] h-[25px] rounded-[4px] bg-black/40 backdrop-blur-sm overflow-hidden flex items-center justify-center shadow-sm shrink-0"
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
                          <span className="h-[26px] rounded-[5px] bg-black/40 backdrop-blur-sm px-2 text-[12px] font-extrabold text-white/90 flex items-center shadow-sm border border-white/10 shrink-0">
                            +{hiddenCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {currentMovie.overview && (
                <p className="text-gray-300 text-sm leading-relaxed mb-6 line-clamp-3 mobile-xs">
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

                {loggedIn ? (
                  <Button
                    onClick={() =>
                      onToggleFavorite(currentMovie.id, currentMovie.media_type)
                    }
                    size="lg"
                    className="bg-red-500/20 backdrop-blur-md border border-red-400/30 text-white hover:bg-red-500/30 hover:border-red-400/50 transition-all shadow-lg"
                  >
                    <Heart className="w-5 h-5 mr-2 fill-current text-red-400" />
                    <span className="font-semibold">찜 해제</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    disabled
                    className="bg-black/20 backdrop-blur-md border border-white/10 text-white/60 shadow-lg cursor-not-allowed"
                    title="로그인하면 찜 기능을 사용할 수 있어요"
                  >
                    <Heart className="w-5 h-5 mr-2" />
                    <span className="font-semibold">로그인 후 찜 가능</span>
                  </Button>
                )}

                <Button
                  onClick={() => onTrailerClick?.(currentMovie)}
                  size="lg"
                  className="bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 hover:border-white/35 transition-all shadow-lg"
                >
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  <span className="font-semibold">예고편 보기</span>
                </Button>
              </div>
            </div>
          </div>

          {/* (옵션) 마우스 힌트가 필요하면 활성화 */}
          {/* <ScrollMouseHint className="bottom-6" /> */}
        </motion.div>
      </AnimatePresence>

      {activeMovies.length > 1 && !trailerOpen && (
        <>
          <button
            onClick={goToPrevious}
            aria-label="이전 슬라이드"
            className="absolute left-0 top-0 bottom-0 z-20 w-12 sm:w-14 flex items-center justify-start pl-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-10 h-10 text-white drop-shadow-lg" />
          </button>

          <button
            onClick={goToNext}
            aria-label="다음 슬라이드"
            className="absolute right-0 top-0 bottom-0 z-20 w-12 sm:w-14 flex items-center justify-end pr-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-10 h-10 text-white drop-shadow-lg" />
          </button>

          <div className="absolute bottom-11 right-6 z-20 flex items-center gap-2">
            {activeMovies.map((_, i) => {
              const active = i === currentIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => jumpTo(i)}
                  aria-label={`슬라이드 ${i + 1}로 이동`}
                  className={[
                    "h-2 rounded-full transition-all",
                    "bg-white/35 hover:bg-white/55",
                    active ? "w-6 bg-white/85" : "w-2",
                  ].join(" ")}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
