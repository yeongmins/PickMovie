// frontend/src/features/favorites/components/FavoritesCarousel.tsx
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
  getDisplayTitle,
  logoUrl,
  useFavoritesHeroState,
} from "./favoritesCarousel.shared";

type CarouselLayout = "fullscreen" | "embedded";

/* =========================
   ✅ Title Logo (TMDB logos) - 상세페이지 로직과 동일 적용
========================= */

function titleLogoCdnUrl(
  filePath: string,
  size: "w500" | "w780" | "original" = "w500",
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

type LogoChoice = {
  filePath: string | null;
  invert: boolean; // 흰 로고 우선, 검정만 있으면 invert로 흰색화
};

const _titleLogoCache = new Map<string, LogoChoice>();
const _titleLogoInFlight = new Map<string, Promise<LogoChoice>>();

function normalizeMediaType(v: unknown): "movie" | "tv" {
  return v === "tv" ? "tv" : "movie";
}

function pickKoreanCandidates(logos?: TmdbImageAsset[]) {
  const list = Array.isArray(logos) ? logos : [];
  const ko = list.filter((l) => l.iso_639_1 === "ko");
  if (!ko.length) return [];

  ko.sort((a, b) => {
    const vc = (b.vote_count ?? 0) - (a.vote_count ?? 0);
    if (vc !== 0) return vc;
    return b.width * b.height - a.width * a.height;
  });

  return ko.slice(0, 6);
}

/**
 * 로고 밝기 측정(가능할 때만):
 * - CORS/네트워크 등에 의해 실패할 수 있음 → 그 경우 fallback
 */
async function measureLogoBrightness(filePath: string): Promise<number | null> {
  try {
    const src = titleLogoCdnUrl(filePath, "w500");
    const res = await fetch(src);
    const blob = await res.blob();

    const bmp =
      "createImageBitmap" in window ? await createImageBitmap(blob) : null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const w = bmp ? bmp.width : 0;
    const h = bmp ? bmp.height : 0;
    if (!w || !h) return null;

    canvas.width = Math.min(w, 320);
    canvas.height = Math.max(1, Math.round((canvas.width * h) / w));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp!, 0, 0, canvas.width, canvas.height);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let sum = 0;
    let cnt = 0;

    // 빠르게 샘플링(격자)
    const step = 8;
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const i = (y * canvas.width + x) * 4;
        const a = img[i + 3];
        if (a < 20) continue;

        const r = img[i];
        const g = img[i + 1];
        const b = img[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        sum += lum;
        cnt += 1;
      }
    }

    if (!cnt) return null;
    return sum / cnt; // 0..255
  } catch {
    return null;
  }
}

async function pickBestKoreanLogoChoice(
  mediaType: "movie" | "tv",
  id: number,
): Promise<LogoChoice> {
  try {
    const data = await apiGet<TmdbImagesResponse>(
      `/tmdb/images/${mediaType}/${id}`,
      {
        include_image_language: "ko",
      },
    );

    const candidates = pickKoreanCandidates(data?.logos);

    if (!candidates.length) return { filePath: null, invert: false };

    // “흰색 로고 우선”
    // - 후보 중 가장 밝은 로고 선택
    // - 측정 실패하면 1등 후보로 fallback
    const top = candidates.slice(0, 4);
    const brightnessList = await Promise.all(
      top.map(async (c) => {
        const b = await measureLogoBrightness(c.file_path);
        return { filePath: c.file_path, b };
      }),
    );

    const measurable = brightnessList.filter(
      (x) => typeof x.b === "number",
    ) as Array<{ filePath: string; b: number }>;

    if (measurable.length) {
      measurable.sort((a, b) => b.b - a.b);
      const best = measurable[0];

      // 밝기가 너무 낮으면(검정 로고 가능성) invert로 흰색화
      const invert = best.b < 80;
      return { filePath: best.filePath, invert };
    }

    // fallback: 첫 후보
    return { filePath: candidates[0].file_path, invert: true };
  } catch {
    return { filePath: null, invert: false };
  }
}

async function fetchTitleLogoChoice(
  mediaType: "movie" | "tv",
  id: number,
): Promise<LogoChoice> {
  const key = `${mediaType}:${id}`;

  if (_titleLogoCache.has(key)) return _titleLogoCache.get(key)!;

  const inflight = _titleLogoInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const choice = await pickBestKoreanLogoChoice(mediaType, id);
      _titleLogoCache.set(key, choice);
      return choice;
    } catch {
      const choice: LogoChoice = { filePath: null, invert: false };
      _titleLogoCache.set(key, choice);
      return choice;
    } finally {
      _titleLogoInFlight.delete(key);
    }
  })();

  _titleLogoInFlight.set(key, p);
  return p;
}

type TitleLogoState =
  | { status: "checking"; choice: LogoChoice }
  | { status: "ready"; choice: LogoChoice };

function useTitleLogo(mediaType: "movie" | "tv", id: number): TitleLogoState {
  const key = `${mediaType}:${id}`;

  const [state, setState] = useState<TitleLogoState>(() => {
    if (_titleLogoCache.has(key)) {
      return { status: "ready", choice: _titleLogoCache.get(key)! };
    }
    return { status: "checking", choice: { filePath: null, invert: false } };
  });

  useEffect(() => {
    let alive = true;

    if (_titleLogoCache.has(key)) {
      setState({ status: "ready", choice: _titleLogoCache.get(key)! });
      return;
    }

    setState({ status: "checking", choice: { filePath: null, invert: false } });

    void (async () => {
      const next = await fetchTitleLogoChoice(mediaType, id);
      if (!alive) return;
      setState({ status: "ready", choice: next });
    })();

    return () => {
      alive = false;
    };
  }, [key, mediaType, id]);

  return state;
}

function TitleLogoOrText({ movie }: { movie: any }) {
  const title = getDisplayTitle(movie as any);
  // 25자(문자 기준) 넘어가면 더 줄이기
  const titleLen = Array.from(title).length; // 한글/이모지 안전하게
  const fallbackFontEm =
    titleLen > 40 ? 0.84 : titleLen > 32 ? 0.92 : titleLen > 25 ? 1.0 : 1.08;

  const mediaType = normalizeMediaType((movie as any)?.media_type);

  const logo = useTitleLogo(mediaType, (movie as any).id);

  const hasLogo = logo.status === "ready" && !!logo.choice.filePath;
  const noLogo = logo.status === "ready" && !logo.choice.filePath;
  const checking = logo.status === "checking";

  const filePath = hasLogo ? logo.choice.filePath! : null;
  const src1x = filePath ? titleLogoCdnUrl(filePath, "w500") : null;
  const src2x = filePath ? titleLogoCdnUrl(filePath, "w780") : null;

  // 로고 로딩 실패 시 텍스트로 안전하게 fallback
  const [logoReady, setLogoReady] = useState(false);
  const [forceText, setForceText] = useState(false);

  useEffect(() => {
    setLogoReady(false);
    setForceText(false);
  }, [(movie as any).id, filePath, logo.choice.invert]);

  const visibleFilter = `${
    logo.choice.invert ? "invert(1) " : ""
  }drop-shadow(0 10px 18px rgba(0,0,0,0.35))`;

  const hiddenFilter = `${
    logo.choice.invert ? "invert(1) " : ""
  }blur(10px) drop-shadow(0 10px 18px rgba(0,0,0,0.22))`;

  return (
    <h1
      className="text-white mb-4 font-semibold carousel-title"
      style={{ display: "flex", alignItems: "flex-end" }}
    >
      {checking ? <span aria-hidden="true" style={{ opacity: 0 }} /> : null}

      {hasLogo && src1x && !forceText ? (
        <>
          <span className="sr-only">{title}</span>
          <motion.img
            key={`title-logo:${mediaType}:${(movie as any).id}:${filePath}:${
              logo.choice.invert ? "inv" : "nor"
            }`}
            src={src1x}
            srcSet={src2x ? `${src1x} 1x, ${src2x} 2x` : undefined}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setLogoReady(true)}
            onError={() => {
              setLogoReady(false);
              setForceText(true); // 로고가 안 뜨면 빈칸 방지
            }}
            initial={false}
            animate={{
              opacity: logoReady ? 1 : 0,
              filter: logoReady ? visibleFilter : hiddenFilter,
            }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{
              display: "block",
              maxWidth: "100%",
              width: "auto",
              height: "auto",
              maxHeight: 96,
              objectFit: "contain",
              transform: "translateZ(0)",
              willChange: "opacity, filter",
            }}
          />
        </>
      ) : null}

      {noLogo || forceText ? (
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
              fontSize: `${fallbackFontEm}em`,
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

/**
 * (중요) Hooks 에러 방지:
 * - useFavoritesHeroState 내부가 movies 길이에 따라 훅 흐름이 달라질 수 있어서
 * - "movies가 비어있을 때는 아예 훅을 호출하지 않고" (컴포넌트 자체를 안 마운트)
 * - movies가 준비된 이후에만 Inner를 마운트해서 훅 호출 순서를 안정화
 */
function FavoritesCarouselInner(
  props: FavoritesCarouselProps & {
    layout?: CarouselLayout;
    onTrailerClick?: (movie: any) => void;
    movies: any[]; // 여기서는 항상 배열(비어있지 않음) 보장
  },
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

    ageValue,
    showAge,
    typeText,
    airingChip,
    hasBackdrop,
    yearText,

    trailerOpen,
  } = useFavoritesHeroState(movies);

  const displayYearText = yearText && yearText !== "—" ? yearText : "";

  // Inner에서는 movies가 존재하더라도, 필터 결과(activeMovies)가 0일 수는 있음(안전)
  if (activeMovies.length === 0) {
    if (!loggedIn) {
      return (
        <div
          className={[
            "relative w-full overflow-hidden",
            heightClass,
            "bg-[#10131b] flex items-center justify-center",
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
          "bg-[#10131b] flex items-center justify-center",
        ].join(" ")}
      >
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">아직 찜한 컨텐츠가 없습니다</p>
          <p className="text-gray-500 text-sm mt-2">
            마음에 드는 컨텐츠를 찜하거나 분석하기를 눌러보세요!
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
          "bg-[#10131b] flex items-center justify-center",
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
                  "original",
                )}
                alt={getDisplayTitle(currentMovie)}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-black via-black/70 to-transparent" />
            )}

            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#10131b] via-transparent to-transparent" />
          </div>

          <div className="relative h-full flex items-center px-12 carousel-content">
            <div className="max-w-2xl mt-10">
              <div className="flex items-center gap-2 mb-3">
                {loggedIn ? (
                  <>
                    <Heart className="w-5 h-5 fill-current text-red-500" />
                    <span className="text-purple-200 text-sm font-semibold">
                      내 찜 목록
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-purple-200" />
                    <span className="text-purple-200 text-sm font-semibold">
                      PickMovie 인기 차트
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
                  <span className="text-white font-bold">
                    {(currentMovie.vote_average ?? 0).toFixed(1)}
                  </span>
                </div>

                {displayYearText && (
                  <span className="text-white text-sm font-bold">
                    {displayYearText}
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
                                "w185",
                              )} 2x`}
                              alt={p.name}
                              className="w-full h-full object-contain"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                        ))}
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
                  className="bg-white/15 backdrop-blur-md text-white hover:bg-white/30 transition-all shadow-lg"
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
                    className="bg-red-500/20 backdrop-blur-md  text-white hover:bg-red-500/30 hover:border-red-400/50 transition-all shadow-lg"
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
                  className="bg-white/15 backdrop-blur-md text-white hover:bg-white/30 transition-all shadow-lg"
                >
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  <span className="font-semibold">예고편 보기</span>
                </Button>
              </div>
            </div>
          </div>
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

function isLoggedInFallback(): boolean {
  try {
    return (
      !!localStorage.getItem("pickmovie_access_token") ||
      !!localStorage.getItem("pickmovie_user")
    );
  } catch {
    return false;
  }
}

export function FavoritesCarousel(
  props: FavoritesCarouselProps & {
    layout?: CarouselLayout;
    onTrailerClick?: (movie: any) => void;
  },
) {
  const { movies, layout = "fullscreen" } = props;

  const heightClass =
    layout === "embedded" ? "h-full min-h-0" : "h-[85svh] min-h-[85svh]";

  // movies가 undefined/null로 들어오는 순간이 있으면 "로딩"으로 간주
  const trendLoading = movies == null;
  const moviesSafe = Array.isArray(movies) ? movies : [];

  // movies가 비어있을 때는 Inner를 아예 마운트하지 않음 (Hooks 안정화)
  if (moviesSafe.length === 0) {
    const loggedIn = isLoggedInFallback();

    if (!loggedIn) {
      return (
        <div
          className={[
            "relative w-full overflow-hidden",
            heightClass,
            "bg-[#10131b] flex items-center justify-center",
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
          "bg-[#10131b] flex items-center justify-center",
        ].join(" ")}
      >
        <div className="text-center">
          <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">아직 찜을 한 컨텐츠가 없습니다</p>
          <p className="text-gray-500 text-sm mt-2">
            마음에 드는 컨텐츠를 찜하거나 분석하기를 눌러보세요!
          </p>
        </div>
      </div>
    );
  }

  return <FavoritesCarouselInner {...props} movies={moviesSafe} />;
}
