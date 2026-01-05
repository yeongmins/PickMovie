// frontend/src/pages/detail/ContentDetailHero.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
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

  // ✅ 한글 포스터 우선 → 영어 → 언어 없음
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
  // 1) backend
  try {
    return await apiGet<TmdbImagesResponse>(`/tmdb/images/${mediaType}/${id}`, {
      // TMDB 규칙: "ko,en,null" 가능
      include_image_language: "ko,en,null",
    });
  } catch {
    // 2) direct
    return await tmdbDirect<TmdbImagesResponse>(`/${mediaType}/${id}/images`, {
      include_image_language: "ko,en,null",
    });
  }
}

// ✅ TV 최신 시즌 포스터(있으면 최우선)
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
      // ✅ TV: 최신 시즌 포스터가 있으면 그걸 우선
      if (mediaType === "tv") {
        const seasonPoster = pickLatestSeasonPosterFromDetail(detail as any);
        if (seasonPoster) {
          _detailPosterCache.set(key, seasonPoster);
          return seasonPoster;
        }
      }

      // ✅ images에서 ko→en 우선
      const images = await fetchImagesSafe(mediaType, detail.id);
      const best = pickBestPosterFilePath(images?.posters);

      // 그래도 없으면 기존 detail.poster_path fallback
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
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
      </div>
    </div>
  );
}

function ProviderPill({
  provider,
  label,
  title,
}: {
  provider: ProviderItem | null;
  label: "ORIGINAL" | "ONLY";
  title?: string;
}) {
  if (!provider) return null;

  const hasLogo = !!provider.logo_path;

  return (
    <span
      title={title}
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
        {label}
      </span>
    </span>
  );
}

export function ContentDetailHero({
  detail,
  mediaType,

  providerOriginal,
  providerExclusive,
  theatricalChip,
  typeText,
  yearText,
  ageValue,

  trailerKey,
  trailerOpen,
  trailerMuted,
  setTrailerOpen,
  setTrailerMuted,
}: {
  detail: DetailBase;
  mediaType: MediaType;

  providerOriginal: ProviderItem | null;
  providerExclusive: ProviderItem | null;

  theatricalChip: { label: string; tone: "dark" } | null;

  typeText: string;
  yearText: string;

  ageValue: string | null;

  trailerKey: string | null;
  trailerOpen: boolean;
  trailerMuted: boolean;
  setTrailerOpen: (v: boolean) => void;
  setTrailerMuted: (v: boolean) => void;
}) {
  const title = getDisplayTitle(detail as any);

  // ✅ "옛 포스터 잔상" 제거용: 최신 포스터를 preload 후에만 렌더
  const [posterPathResolved, setPosterPathResolved] = useState<string | null>(
    null
  );
  const [posterReady, setPosterReady] = useState(false);

  useEffect(() => {
    let alive = true;

    // ✅ id 바뀔 때마다 "옛 포스터"를 절대 보여주지 않도록 초기화
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

      // ✅ preload 끝난 후에만 실제로 poster를 렌더
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
    // backdrop은 detail에 있으면 그걸 바로 사용(대부분 깜빡임 없음)
    if (detail.backdrop_path)
      return getBackdropUrl(detail.backdrop_path, "original");
    // backdrop이 없으면 "최신 포스터"를 backdrop 대용으로(잔상 방지 위해 resolved만 사용)
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

  const isOttOriginal = !!providerOriginal;
  const isOttExclusive = !isOttOriginal && !!providerExclusive;

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

  return (
    <section
      className="relative w-full overflow-hidden rounded-t-[10px] rounded-b-none"
      style={{ height: "clamp(420px, 62vh, 680px)" }}
    >
      {/* ✅ 히어로 배경 + 비네팅 */}
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
      </div>

      {/* ✅ 예고편 레이어 */}
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
            {/* ✅ 1) 타입 / 상영칩 / ORIGINAL(or ONLY) / 연령 */}
            <div className="flex items-center flex-wrap gap-1 mb-3">
              <Chip tone="dark">{typeText}</Chip>

              {!isOttOriginal && !isOttExclusive && theatricalChip ? (
                <Chip tone={theatricalChip.tone}>{theatricalChip.label}</Chip>
              ) : null}

              {isOttOriginal ? (
                <ProviderPill
                  provider={providerOriginal}
                  label="ORIGINAL"
                  title="OTT 오리지널(제작/방영 기준)"
                />
              ) : isOttExclusive ? (
                <ProviderPill
                  provider={providerExclusive}
                  label="ONLY"
                  title="국내 OTT 단독 스트리밍(독점)"
                />
              ) : null}

              {ageValue === null ? (
                <div className="h-6 w-10 rounded-md bg-white/10 animate-pulse" />
              ) : (
                <AgeBadge value={ageValue} />
              )}
            </div>

            {/* ✅ 3) 제목 */}
            <div className="max-w-[720px]">
              <TitleLogoOrText detail={detail} mediaType={mediaType} />
            </div>

            {/* ✅ 4) 별점 / 년도 / 장르 / 런타임 */}
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

            {/* ✅ 5) 버튼 */}
            <div className="mt-4">
              {!trailerOpen ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    size="lg"
                    className="bg-white/10 hover:bg-white/20 text-white border-0"
                  >
                    <Heart className="w-5 h-5 mr-2" />
                    <span className="font-semibold">찜</span>
                  </Button>

                  <Button
                    type="button"
                    size="lg"
                    className="bg-white/10 hover:bg-white/20 text-white border-0"
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
                    <span className="font-semibold">공유</span>
                  </Button>

                  <Button
                    type="button"
                    size="lg"
                    className="bg-white/10 hover:bg-white/20 text-white border-0"
                    onClick={onClickTrailer}
                    disabled={!trailerKey}
                    title={!trailerKey ? "예고편 정보가 없습니다" : undefined}
                  >
                    <Play className="w-5 h-5 mr-2 fill-current" />
                    <span className="font-semibold">예고편 재생</span>
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

          {/* ✅ 오른쪽 포스터: "최신 포스터 준비된 뒤"에만 렌더 */}
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
