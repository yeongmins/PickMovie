// frontend/src/pages/detail/ContentDetailHero.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Play, Share2, Star, Volume2, VolumeX, X } from "lucide-react";

import { Button } from "../../components/ui/button";
import { apiGet } from "../../lib/apiClient";
import { getBackdropUrl, getPosterUrl } from "../../lib/tmdb";
import {
  AgeBadge,
  Chip,
  getDisplayTitle,
  logoUrl,
} from "../../features/favorites/components/favoritesCarousel.shared";

import type { DetailBase, MediaType, ProviderItem } from "./contentDetail.data";
import { tmdbDirect } from "./contentDetail.data";
import { TitleLogoOrText } from "./ContentTitleLogo";

/* =========================
   ✅ 최신 포스터: ko 우선, 없으면 en
   + TV는 최신 시즌 포스터가 있으면 그걸 우선
   + "옛 포스터 잔상" 제거: preload 후에만 렌더
========================= */

type TmdbImageAsset = {
  file_path: string;
  iso_639_1: string | null;
  width: number;
  height: number;
  vote_average: number;
  vote_count: number;
};

type TmdbImagesResponse = {
  posters?: TmdbImageAsset[];
};

const _detailPosterCache = new Map<string, string | null>();
const _detailPosterInFlight = new Map<string, Promise<string | null>>();

function pickBestPosterFilePath(posters?: TmdbImageAsset[]) {
  const list = Array.isArray(posters) ? posters : [];
  if (!list.length) return null;

  const pickFrom = (lang: "ko" | "en" | "null") => {
    const filtered =
      lang === "null"
        ? list.filter((p) => p.iso_639_1 == null)
        : list.filter((p) => p.iso_639_1 === lang);

    if (!filtered.length) return null;

    filtered.sort((a, b) => {
      const vc = (b.vote_count ?? 0) - (a.vote_count ?? 0);
      if (vc !== 0) return vc;
      return b.width * b.height - a.width * a.height;
    });

    return filtered[0]?.file_path ?? null;
  };

  return (
    pickFrom("ko") ??
    pickFrom("en") ??
    pickFrom("null") ??
    list[0]?.file_path ??
    null
  );
}

async function fetchImagesSafe(
  mediaType: MediaType,
  id: number
): Promise<TmdbImagesResponse | null> {
  try {
    return await apiGet<TmdbImagesResponse>(`/tmdb/images/${mediaType}/${id}`, {
      include_image_language: "ko,en,null",
    });
  } catch {
    return await tmdbDirect<TmdbImagesResponse>(`/${mediaType}/${id}/images`, {
      include_image_language: "ko,en,null",
    });
  }
}

function pickLatestSeasonPosterFromDetail(detail: any): string | null {
  const seasons = Array.isArray(detail?.seasons) ? detail.seasons : [];
  if (!seasons.length) return null;

  const list = seasons
    .filter(
      (s: any) => typeof s?.season_number === "number" && s.season_number > 0
    )
    .map((s: any) => {
      const t = Date.parse(String(s?.air_date || "").trim());
      const date = Number.isFinite(t) ? t : -1;
      const sn = typeof s?.season_number === "number" ? s.season_number : -1;
      return { s, date, sn };
    })
    .sort((a: any, b: any) => {
      if (b.date !== a.date) return b.date - a.date;
      return b.sn - a.sn;
    });

  const latest = list[0]?.s;
  const p = (latest?.poster_path as string | null) ?? null;
  return p;
}

async function resolveBestPosterPath(
  mediaType: MediaType,
  detail: DetailBase
): Promise<string | null> {
  const key = `${mediaType}:${detail.id}`;
  if (_detailPosterCache.has(key)) return _detailPosterCache.get(key) ?? null;

  const inflight = _detailPosterInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      if (mediaType === "tv") {
        const seasonPoster = pickLatestSeasonPosterFromDetail(detail as any);
        if (seasonPoster) {
          _detailPosterCache.set(key, seasonPoster);
          return seasonPoster;
        }
      }

      const images = await fetchImagesSafe(mediaType, detail.id);
      const best = pickBestPosterFilePath(images?.posters);
      const finalPath = best ?? detail.poster_path ?? null;

      _detailPosterCache.set(key, finalPath);
      return finalPath;
    } catch {
      const finalPath = detail.poster_path ?? null;
      _detailPosterCache.set(key, finalPath);
      return finalPath;
    } finally {
      _detailPosterInFlight.delete(key);
    }
  })();

  _detailPosterInFlight.set(key, p);
  return p;
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

/* =========================
   기존 로직
========================= */

function ytCommand(
  iframe: HTMLIFrameElement | null,
  func: string,
  args: any[] = []
) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "*"
  );
}

function runtimeText(detail: DetailBase, mediaType: MediaType) {
  if (mediaType === "tv") {
    const v = Array.isArray(detail.episode_run_time)
      ? detail.episode_run_time[0]
      : undefined;
    return typeof v === "number" && v > 0 ? `${v}분` : "";
  }
  return typeof detail.runtime === "number" && detail.runtime > 0
    ? `${detail.runtime}분`
    : "";
}

function YouTubeTrailer({
  videoKey,
  iframeRef,
  onLoad,
}: {
  videoKey: string;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onLoad?: () => void;
}) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : undefined;

  const src = `https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&mute=0&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&fs=0&disablekb=1&iv_load_policy=3&cc_load_policy=0&loop=1&playlist=${videoKey}${
    origin ? `&origin=${encodeURIComponent(origin)}` : ""
  }`;

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 pointer-events-none">
        <iframe
          ref={iframeRef}
          src={src}
          title="Trailer"
          allow="autoplay; encrypted-media"
          className="w-full h-full"
          onLoad={onLoad}
        />
      </div>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 right-0 top-0 h-14 bg-gradient-to-b from-black/70 via-black/25 to-transparent" />
        <div className="absolute bottom-0 right-0 h-24 w-44 bg-gradient-to-l from-black/75 via-black/25 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
    </div>
  );
}

/* ✅ ORIGINAL만 유지 */
function ProviderPill({ provider }: { provider: ProviderItem | null }) {
  if (!provider) return null;
  const hasLogo = !!provider.logo_path;

  return (
    <span
      title="OTT 오리지널(제작/방영 기준)"
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/35 border border-white/10 backdrop-blur-md"
    >
      {hasLogo ? (
        <span className="w-[18px] h-[18px] rounded-[4px] overflow-hidden bg-black/25 flex items-center justify-center">
          <img
            src={logoUrl(provider.logo_path!, "w92")}
            srcSet={`${logoUrl(provider.logo_path!, "w92")} 1x, ${logoUrl(
              provider.logo_path!,
              "w185"
            )} 2x`}
            alt={provider.provider_name}
            className="w-full h-full object-contain"
            loading="lazy"
            decoding="async"
          />
        </span>
      ) : (
        <span className="w-[18px] h-[18px] rounded-[4px] bg-white/10" />
      )}

      <span className="text-[12px] font-extrabold tracking-wide text-white/90">
        ORIGINAL
      </span>
    </span>
  );
}

export function ContentDetailHero({
  detail,
  mediaType,

  providerOriginal,
  theatricalChip,
  typeText,
  yearText,
  ageValue,

  trailerKey,
  trailerOpen,
  trailerMuted,
  setTrailerOpen,
  setTrailerMuted,

  isAuthed,
  isFavorite,
  onToggleFavorite,
}: {
  detail: DetailBase;
  mediaType: MediaType;

  providerOriginal: ProviderItem | null;
  theatricalChip: { label: string; tone: "dark" } | null;

  typeText: string;
  yearText: string;
  ageValue: string | null;

  trailerKey: string | null;
  trailerOpen: boolean;
  trailerMuted: boolean;
  setTrailerOpen: (v: boolean) => void;
  setTrailerMuted: (v: boolean) => void;

  isAuthed: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: number, mediaType?: "movie" | "tv") => void;
}) {
  const title = getDisplayTitle(detail as any);

  const [posterPathResolved, setPosterPathResolved] = useState<string | null>(
    null
  );
  const [posterReady, setPosterReady] = useState(false);

  useEffect(() => {
    let alive = true;

    setPosterPathResolved(null);
    setPosterReady(false);

    void (async () => {
      const bestPath = await resolveBestPosterPath(mediaType, detail);
      if (!alive) return;

      if (!bestPath) {
        setPosterPathResolved(null);
        setPosterReady(true);
        return;
      }

      const src1x = getPosterUrl(bestPath, "w500");
      if (!src1x) {
        setPosterPathResolved(null);
        setPosterReady(true);
        return;
      }

      await preloadImage(src1x);
      if (!alive) return;

      setPosterPathResolved(bestPath);
      setPosterReady(true);
    })();

    return () => {
      alive = false;
    };
  }, [mediaType, detail.id]);

  const heroBackdropSrc = useMemo(() => {
    if (detail.backdrop_path)
      return getBackdropUrl(detail.backdrop_path, "original");
    if (posterPathResolved)
      return getBackdropUrl(posterPathResolved, "original");
    return "";
  }, [detail.backdrop_path, posterPathResolved]);

  const posterSrcSet = useMemo(() => {
    if (!posterPathResolved) return null;
    const src1x = getPosterUrl(posterPathResolved, "w500");
    const src2x = getPosterUrl(posterPathResolved, "w780");
    if (!src1x) return null;
    return { src1x, src2x: src2x ?? src1x };
  }, [posterPathResolved]);

  const genreText = useMemo(() => {
    return (detail.genres ?? [])
      .map((x) => x?.name)
      .filter(Boolean)
      .join(" · ");
  }, [detail.genres]);

  const runtime = useMemo(
    () => runtimeText(detail, mediaType),
    [detail, mediaType]
  );

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [layerMounted, setLayerMounted] = useState(false);

  useEffect(() => {
    if (trailerOpen && trailerKey) {
      setLayerMounted(true);
      return;
    }
    if (!trailerOpen && layerMounted) {
      const t = window.setTimeout(() => setLayerMounted(false), 220);
      return () => window.clearTimeout(t);
    }
  }, [trailerOpen, trailerKey, layerMounted]);

  const applyMuteState = (muted: boolean) => {
    const cmd = muted ? "mute" : "unMute";
    ytCommand(iframeRef.current, cmd);
    window.setTimeout(() => ytCommand(iframeRef.current, cmd), 120);
  };

  const onTrailerIframeLoad = () => {
    applyMuteState(trailerMuted);
    ytCommand(iframeRef.current, "playVideo");
  };

  const onClickTrailer = () => {
    if (!trailerKey) return;
    setTrailerMuted(false);
    setTrailerOpen(true);
  };

  const onCloseTrailer = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ytCommand(iframeRef.current, "stopVideo");
    setTrailerOpen(false);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const next = !trailerMuted;
    setTrailerMuted(next);
    applyMuteState(next);
  };

  const onClickFavorite = () => {
    onToggleFavorite(detail.id, mediaType);
  };

  return (
    <section
      className="relative w-full overflow-hidden rounded-t-[10px] rounded-b-none"
      style={{ height: "clamp(420px, 62vh, 680px)" }}
    >
      <div className="absolute inset-0">
        {heroBackdropSrc ? (
          <img
            key={`hero-bg:${mediaType}:${detail.id}:${heroBackdropSrc}`}
            src={heroBackdropSrc}
            alt={title}
            className="w-full h-full object-cover object-center"
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-black via-black/70 to-transparent" />
        )}

        <div className="pointer-events-none absolute inset-0 bg-black/22" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/85 via-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_260px_rgba(0,0,0,0.72)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#0b0b10] via-[#0b0b10]/70 to-transparent" />
      </div>

      {layerMounted && trailerKey ? (
        <motion.div
          className="absolute inset-0 z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: trailerOpen ? 1 : 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <div className="absolute inset-0 bg-black/25" />
          {trailerOpen ? (
            <YouTubeTrailer
              videoKey={trailerKey}
              iframeRef={iframeRef}
              onLoad={onTrailerIframeLoad}
            />
          ) : null}
        </motion.div>
      ) : null}

      <div className="relative z-30 h-full px-4 sm:px-8 pb-8 sm:pb-10 flex items-end">
        <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 md:gap-8 items-end">
          <div className="max-w-[720px]">
            <div className="flex items-center flex-wrap gap-1 mb-3">
              <Chip tone="dark">{typeText}</Chip>

              {theatricalChip ? (
                <Chip tone={theatricalChip.tone}>{theatricalChip.label}</Chip>
              ) : null}

              {providerOriginal ? (
                <ProviderPill provider={providerOriginal} />
              ) : null}

              {ageValue === null ? (
                <div className="h-6 w-10 rounded-md bg-white/10 animate-pulse" />
              ) : (
                <AgeBadge value={ageValue} />
              )}
            </div>

            <div className="max-w-[720px]">
              <TitleLogoOrText detail={detail} mediaType={mediaType} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 shrink-0">
                <Star className="w-4 h-4 fill-current text-yellow-400" />
                <span className="text-sm font-bold text-white">
                  {(detail.vote_average ?? 0).toFixed(1)}
                </span>
              </div>

              {yearText ? (
                <span className="text-white text-sm font-bold">{yearText}</span>
              ) : null}

              {genreText ? (
                <span className="text-sm text-white font-bold">
                  {genreText}
                </span>
              ) : null}

              {runtime ? (
                <span className="text-sm text-white font-bold">{runtime}</span>
              ) : null}
            </div>

            <div className="mt-4">
              {!trailerOpen ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    size="lg"
                    className="bg-white/15 hover:bg-white/30 text-white border-0"
                    onClick={onClickFavorite}
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={isFavorite ? "fav-on" : "fav-off"}
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.85, opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 520,
                          damping: 28,
                        }}
                        className="mr-2 inline-flex"
                      >
                        <Heart
                          className="w-5 h-5"
                          fill={isFavorite ? "currentColor" : "none"}
                        />
                      </motion.span>
                    </AnimatePresence>

                    <span className="font-bold">
                      {isFavorite ? "찜 해제" : "찜 하기"}
                    </span>
                  </Button>

                  <Button
                    type="button"
                    size="lg"
                    className="bg-white/15 hover:bg-white/30 text-white border-0"
                    onClick={() => {
                      const url = window.location.href;
                      if (navigator.share) {
                        void navigator.share({ title, url });
                      } else {
                        void navigator.clipboard?.writeText(url);
                      }
                    }}
                  >
                    <Share2 className="w-5 h-5 mr-2" />
                    <span className="font-bold">공유</span>
                  </Button>

                  <Button
                    type="button"
                    size="lg"
                    className="bg-white/15 hover:bg-white/30 text-white border-0"
                    onClick={onClickTrailer}
                    disabled={!trailerKey}
                    title={!trailerKey ? "예고편 정보가 없습니다" : undefined}
                  >
                    <Play className="w-5 h-5 mr-2 fill-current" />
                    <span className="font-bold">예고편 재생</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="lg"
                    className="bg-black/35 hover:bg-white/20 text-white border-0"
                    onClick={toggleMute}
                  >
                    {trailerMuted ? (
                      <VolumeX className="w-5 h-5 mr-2" />
                    ) : (
                      <Volume2 className="w-5 h-5 mr-2" />
                    )}
                    <span className="font-semibold">
                      {trailerMuted ? "음소거" : "소리"}
                    </span>
                  </Button>

                  <Button
                    type="button"
                    size="lg"
                    className="bg-black/35 hover:bg-white/20 text-white border-0"
                    onClick={onCloseTrailer}
                  >
                    <X className="w-5 h-5 mr-2" />
                    <span className="font-semibold">예고편 닫기</span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {!trailerOpen ? (
            <div className="hidden md:block shrink-0">
              {!posterReady ? (
                <div
                  className="rounded-xl bg-white/10 animate-pulse h-[clamp(260px,52vh,560px)] aspect-[2/3]"
                  style={{ boxShadow: "0 18px 48px rgba(0,0,0,0.42)" }}
                />
              ) : posterSrcSet ? (
                <motion.img
                  key={`hero-poster:${mediaType}:${detail.id}:${posterSrcSet.src1x}`}
                  src={posterSrcSet.src1x}
                  srcSet={`${posterSrcSet.src1x} 1x, ${posterSrcSet.src2x} 2x`}
                  alt={title}
                  className="rounded-xl object-cover h-[clamp(260px,52vh,560px)] aspect-[2/3]"
                  style={{ boxShadow: "0 18px 48px rgba(0,0,0,0.42)" }}
                  loading="lazy"
                  decoding="async"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {trailerOpen ? (
        <button
          type="button"
          aria-label="예고편 닫기"
          onClick={onCloseTrailer}
          className="absolute right-4 top-4 z-40 w-10 h-10 rounded-full bg-black/35 hover:bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
        >
          <X className="w-5 h-5" />
        </button>
      ) : null}
    </section>
  );
}
