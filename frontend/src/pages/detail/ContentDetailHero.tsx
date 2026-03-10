// frontend/src/pages/detail/ContentDetailHero.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Play, Share2, Star, Volume2, VolumeX, X } from "lucide-react";

import { Button } from "../../components/ui/button";
import { getBackdropUrl, getPosterUrl } from "../../lib/tmdb";
import {
  AgeBadge,
  Chip,
  getDisplayTitle,
} from "../../features/favorites/components/favoritesCarousel.shared";

import type { DetailBase, MediaType, ProviderItem } from "./contentDetail.data";
import { TitleLogoOrText } from "./ContentTitleLogo";
import { getLogoSrcByProviderName } from "../../assets/logo";
import { apiPost } from "../../lib/apiClient";
import { AUTH_KEYS } from "../../lib/auth";

import {
  peekResolvedMeta,
  requestResolvedMeta,
  type ResolvedMeta,
} from "../../lib/metaClient";

const OPEN_CONTENT_ISSUE_EVENT = "pickmovie-open-content-issue-report";

/* =========================
   ✅ 규칙 반영
   - 프론트에서 시즌 air_date로 "출시년도" 덮어쓰기 금지 → yearText 그대로 표시
   - 프론트에서 TV 시즌/언어별 포스터 선택 로직 금지
     → Hero 포스터는 백엔드 meta.contentCardPosterPath 우선(없으면 detail.poster_path)
   - "옛 포스터 잔상" 제거: preload 후에만 렌더
   - ✅ 시즌 뱃지: "가장 최근 방영 년도"(meta / seasonContext.year)
   - ✅ (요구사항) 시즌 선택 시: 뱃지/히어로 년도/포스터는 선택 시즌 기준으로 반영
========================= */

type SeasonNavContext = {
  seasonNo: number;
  name?: string;
  poster_path?: string | null;
  air_date?: string | null;
  overview?: string | null;
  vote_average?: number | null;
  year?: number | null;
};

type ReporterProfile = {
  id: number | null;
  name: string;
  email: string;
};

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

function getSeasonNoFromSearch(search: string): number {
  try {
    const sp = new URLSearchParams(search);
    const raw = sp.get("season");
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    const v = Math.floor(n);
    return v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function ytCommand(
  iframe: HTMLIFrameElement | null,
  func: string,
  args: any[] = [],
) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "*",
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

/* ✅ ORIGINAL만 유지 (TMDB 로고만 사용) */
function ProviderPill({ provider }: { provider: ProviderItem | null }) {
  if (!provider) return null;

  const providerName =
    provider.provider_name ||
    (provider as any).providerName ||
    (provider as any).name ||
    "";

  const logoSrc = getLogoSrcByProviderName(providerName);
  const hasLogo = !!logoSrc;

  return (
    <span
      title="OTT 오리지널(제작/방영 기준)"
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[5px] bg-black/45 backdrop-blur-md"
    >
      {hasLogo ? (
        <span className="w-[20px] h-[20px] rounded-[5px] overflow-hidden flex items-center justify-center">
          <img
            src={logoSrc}
            alt={providerName}
            className="w-full h-full object-contain scale-[1.3]"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
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
  hiddenBadge,

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
  hiddenBadge?: boolean;

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
  const location = useLocation();
  const [reportOpen, setReportOpen] = useState(false);
  const [reporterProfile, setReporterProfile] = useState<ReporterProfile>({
    id: null,
    name: "",
    email: "",
  });
  const [reportMessage, setReportMessage] = useState("");
  const [reportDetail, setReportDetail] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportCompleteOpen, setReportCompleteOpen] = useState(false);

  // ✅ TV 시즌 선택 상태(쿼리 기반)
  const seasonNo = useMemo(() => {
    if (mediaType !== "tv") return 0;
    return getSeasonNoFromSearch(location.search);
  }, [mediaType, location.search]);

  const seasonContext = useMemo(() => {
    const st = location.state as any;
    return (st?.seasonContext as SeasonNavContext | undefined) ?? undefined;
  }, [location.state]);

  // ✅ meta 단일 소스(백엔드 값 우선)
  const [meta, setMeta] = useState<ResolvedMeta | null>(() => {
    return peekResolvedMeta(mediaType as any, detail.id) ?? null;
  });

  useEffect(() => {
    let alive = true;

    const cached = peekResolvedMeta(mediaType as any, detail.id) ?? null;
    if (cached) setMeta(cached);

    requestResolvedMeta(mediaType as any, detail.id)
      .then((m) => {
        if (!alive) return;
        setMeta(m ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setMeta((prev) => prev ?? null);
      });

    return () => {
      alive = false;
    };
  }, [mediaType, detail.id]);

  useEffect(() => {
    if (!reportOpen) return;
    try {
      const raw = localStorage.getItem(AUTH_KEYS.USER);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        id?: number;
        username?: string;
        nickname?: string | null;
        email?: string | null;
      };
      const uid = Number(parsed?.id);
      const nextName = String(parsed?.nickname ?? parsed?.username ?? "").trim();
      const nextEmail = String(parsed?.email ?? "").trim();
      setReporterProfile({
        id: Number.isFinite(uid) && uid > 0 ? Math.trunc(uid) : null,
        name: nextName,
        email: nextEmail,
      });
    } catch {}
  }, [reportOpen]);

  useEffect(() => {
    const openReport = () => {
      if (!isAuthed) return;
      setReportError(null);
      setReportOpen(true);
    };
    window.addEventListener(OPEN_CONTENT_ISSUE_EVENT, openReport);
    return () => window.removeEventListener(OPEN_CONTENT_ISSUE_EVENT, openReport);
  }, [isAuthed]);

  useEffect(() => {
    if (!reportOpen && !reportCompleteOpen) return;

    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - html.clientWidth;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    const blockWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const blockTouch = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const blockKeys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (reportOpen) {
          setReportOpen(false);
          return;
        }
        if (reportCompleteOpen) {
          setReportCompleteOpen(false);
        }
        return;
      }
      const blocked = [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
      ];
      if (blocked.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("wheel", blockWheel, { passive: false });
    window.addEventListener("touchmove", blockTouch, { passive: false });
    window.addEventListener("keydown", blockKeys, true);

    return () => {
      window.removeEventListener("wheel", blockWheel as any);
      window.removeEventListener("touchmove", blockTouch as any);
      window.removeEventListener("keydown", blockKeys, true);
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [reportOpen, reportCompleteOpen, reportBusy]);

  // ✅ (요구사항) 히어로 년도: 시즌 선택 시 선택 시즌 년도 표시
  // - TV 시즌 선택: seasonContext.year 우선
  // - 그 외: 기존 yearText 그대로
  const heroYearText = useMemo(() => {
    if (mediaType !== "tv") return yearText;
    if (seasonNo > 0) {
      const y = Number(seasonContext?.year);
      if (Number.isFinite(y) && y > 0) return String(y);
    }
    return yearText;
  }, [mediaType, seasonNo, seasonContext?.year, yearText]);

  // ✅ (요구사항) 히어로 평점: 시즌 선택 시 시즌 평점이 있으면 그걸 표시
  const heroVoteAverage = useMemo(() => {
    if (mediaType !== "tv") return detail.vote_average ?? 0;
    if (seasonNo > 0 && typeof seasonContext?.vote_average === "number") {
      return seasonContext.vote_average;
    }
    return detail.vote_average ?? 0;
  }, [mediaType, seasonNo, seasonContext?.vote_average, detail.vote_average]);

  // ✅ (요구사항) 포스터: 시즌 선택이면 선택 시즌 포스터 우선
  // - 시즌 선택: seasonContext.poster_path (SeriesSeasonCards에서 전달)
  // - 첫 진입: meta.contentCardPosterPath (최신 시즌 포스터)
  // - fallback: detail.poster_path
  const posterPathWanted = useMemo(() => {
    if (mediaType === "tv" && seasonNo > 0) {
      const sp = (seasonContext?.poster_path ?? null) as string | null;
      if (sp) return sp;
    }
    const p = (meta?.contentCardPosterPath ?? null) as string | null;
    return p ?? detail.poster_path ?? null;
  }, [
    mediaType,
    seasonNo,
    seasonContext?.poster_path,
    meta?.contentCardPosterPath,
    detail.poster_path,
  ]);

  const [posterPathResolved, setPosterPathResolved] = useState<string | null>(
    null,
  );
  const [posterReady, setPosterReady] = useState(false);

  useEffect(() => {
    let alive = true;

    setPosterPathResolved(null);
    setPosterReady(false);

    void (async () => {
      const bestPath = posterPathWanted;
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
  }, [posterPathWanted]);

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
    [detail, mediaType],
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
    if (!isAuthed) return;
    onToggleFavorite(detail.id, mediaType);
  };

  /* =========================
     ✅ 포스터 자동 숨김(디자인 유지)
  ========================= */
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const posterColRef = useRef<HTMLDivElement>(null);
  const overlayMaskRef = useRef<HTMLDivElement>(null);
  const buttonsHoleRef = useRef<HTMLDivElement>(null);

  const [showPoster, setShowPoster] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let raf = 0;
    const mdQuery = window.matchMedia?.("(min-width: 768px)");

    const estPosterSize = () => {
      const h = Math.max(260, Math.min(window.innerHeight * 0.52, 560));
      const w = (h * 2) / 3;
      return { w, h };
    };

    const compute = () => {
      const mdUp = mdQuery ? mdQuery.matches : window.innerWidth >= 768;

      if (!mdUp) {
        setShowPoster(true);
        return;
      }

      if (trailerOpen) return;

      const sectionEl = sectionRef.current;
      const gridEl = gridRef.current;
      const leftEl = leftColRef.current;

      if (!sectionEl || !gridEl || !leftEl) return;

      const sr = sectionEl.getBoundingClientRect();

      const posterEl = posterColRef.current;
      if (posterEl) {
        const pr = posterEl.getBoundingClientRect();
        const lr = leftEl.getBoundingClientRect();

        const pad = 6;
        const clipped =
          pr.left < sr.left + pad ||
          pr.right > sr.right - pad ||
          pr.top < sr.top + pad ||
          pr.bottom > sr.bottom - pad;

        const collide = lr.right > pr.left - 12;

        setShowPoster(!(clipped || collide));
        return;
      }

      const gr = gridEl.getBoundingClientRect();
      const { w: posterW, h: posterH } = estPosterSize();
      const gapW = 32;
      const textSpace = gr.width - posterW - gapW;

      const fitsWidth = textSpace >= 420;
      const fitsHeight = sr.height >= posterH + 40;

      if (fitsWidth && fitsHeight) setShowPoster(true);
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    schedule();

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;

    if (ro) {
      const s = sectionRef.current;
      const g = gridRef.current;
      const l = leftColRef.current;
      if (s) ro.observe(s);
      if (g) ro.observe(g);
      if (l) ro.observe(l);
    }

    const onResize = () => schedule();
    window.addEventListener("resize", onResize);

    if (mdQuery) {
      const onMQ = () => schedule();
      try {
        mdQuery.addEventListener("change", onMQ);
        (document as any)?.fonts?.ready?.then(schedule).catch(() => {});
        return () => {
          if (raf) cancelAnimationFrame(raf);
          ro?.disconnect();
          window.removeEventListener("resize", onResize);
          mdQuery.removeEventListener("change", onMQ);
        };
      } catch {
        // Safari fallback
      }
    }

    (document as any)?.fonts?.ready?.then(schedule).catch(() => {});

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [
    trailerOpen,
    title,
    typeText,
    heroYearText,
    genreText,
    runtime,
    posterReady,
    posterSrcSet?.src1x,
  ]);

  useLayoutEffect(() => {
    const sectionEl = sectionRef.current;
    const overlayEl = overlayMaskRef.current;
    const holeEl = buttonsHoleRef.current;

    if (!sectionEl || !overlayEl || !holeEl) return;

    let raf = 0;

    const update = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sr = sectionEl.getBoundingClientRect();
        const br = holeEl.getBoundingClientRect();

        const padX = 14;
        const padY = 12;

        const hx = br.left - sr.left - padX;
        const hy = br.top - sr.top - padY;
        const hw = br.width + padX * 2;
        const hh = br.height + padY * 2;

        overlayEl.style.setProperty("--hx", `${Math.max(0, hx)}px`);
        overlayEl.style.setProperty("--hy", `${Math.max(0, hy)}px`);
        overlayEl.style.setProperty("--hw", `${Math.max(0, hw)}px`);
        overlayEl.style.setProperty("--hh", `${Math.max(0, hh)}px`);
      });
    };

    update();

    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;

    ro?.observe(sectionEl);
    ro?.observe(holeEl);

    window.addEventListener("resize", update);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [
    trailerOpen,
    trailerKey,
    isFavorite,
    typeText,
    heroYearText,
    posterReady,
    posterSrcSet?.src1x,
  ]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden rounded-t-[10px] rounded-b-none"
      style={{ height: "clamp(460px, 68vh, 720px)" }}
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

        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(11,11,16,1) 0%, rgba(11,11,16,0.55) 55%, rgba(11,11,16,0) 100%)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 z-0 shadow-[inset_0_0_260px_rgba(11,11,16,0.72)]" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(11,11,16,1) 0%, rgba(11,11,16,0) 100%)",
          }}
        />
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
        <div className="w-full -translate-y-6 sm:-translate-y-8">
          <div
            ref={gridRef}
            className="w-full grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-8 items-end"
          >
            <div ref={leftColRef} className="min-w-0 max-w-[720px]">
              <div className="flex items-center flex-wrap gap-2 mb-3">
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

                {hiddenBadge ? (
                  <span className="h-6 rounded-md bg-rose-500/25 px-2.5 text-xs font-extrabold text-rose-200 inline-flex items-center">
                    비노출
                  </span>
                ) : null}
              </div>

              <div className="max-w-[720px]">
                <TitleLogoOrText
                  detail={detail}
                  mediaType={mediaType}
                  seasonNo={seasonNo}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 shrink-0">
                  <Star className="w-4 h-4 fill-current text-yellow-400" />
                  <span className="text-sm font-bold text-white">
                    {(heroVoteAverage ?? 0).toFixed(1)}
                  </span>
                </div>

                {heroYearText ? (
                  <span className="text-white text-sm font-bold">
                    {heroYearText}
                  </span>
                ) : null}

                {genreText ? (
                  <span className="text-sm text-white font-bold">
                    {genreText}
                  </span>
                ) : null}

                {runtime ? (
                  <span className="text-sm text-white font-bold">
                    {runtime}
                  </span>
                ) : null}
              </div>

              <div className="relative z-[60] mt-4">
                {!trailerOpen ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      size="lg"
                      className={`backdrop-blur-md text-white transition-all shadow-lg ${
                        !isAuthed
                          ? "bg-white/15 text-white/60 cursor-not-allowed"
                          : isFavorite
                          ? "bg-red-500/55 hover:bg-red-500/70"
                          : "bg-red-500/30 hover:bg-red-500/50"
                      }`}
                      onClick={onClickFavorite}
                      disabled={!isAuthed}
                      title={!isAuthed ? "로그인 후 찜 가능" : undefined}
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
                            className={`w-5 h-5 mr-2 ${
                              isFavorite ? "text-red-400" : "text-white/70"
                            }`}
                            fill={isFavorite ? "currentColor" : "none"}
                          />
                        </motion.span>
                      </AnimatePresence>

                      <span className="font-semibold">
                        {!isAuthed ? "로그인 후 찜 가능" : isFavorite ? "찜 해제" : "찜 하기"}
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
                      <span className="font-semibold">공유</span>
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

            {!trailerOpen && showPoster ? (
              <div
                ref={posterColRef}
                className="hidden md:block shrink-0"
                style={{
                  height: "clamp(260px, 52vh, 560px)",
                  width: "calc(clamp(260px, 52vh, 560px) * 2 / 3)",
                }}
              >
                {!posterReady ? (
                  <div
                    className="rounded-xl bg-white/10 animate-pulse w-full h-full"
                    style={{ boxShadow: "0 18px 48px rgba(0,0,0,0.42)" }}
                  />
                ) : posterSrcSet ? (
                  <motion.img
                    key={`hero-poster:${mediaType}:${detail.id}:${posterSrcSet.src1x}`}
                    src={posterSrcSet.src1x}
                    srcSet={`${posterSrcSet.src1x} 1x, ${posterSrcSet.src2x} 2x`}
                    alt={title}
                    className="rounded-xl object-cover w-full h-full max-w-none"
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

      <AnimatePresence>
        {reportOpen ? (
          <>
            <motion.div
              className="fixed inset-0 z-[9997] bg-black/65 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={() => {
                if (reportBusy) return;
                setReportOpen(false);
              }}
            />
            <motion.div
              className="fixed inset-0 z-[9998] flex items-center justify-center px-4"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={() => setReportOpen(false)}
            >
              <div
                className="w-full max-w-[520px] rounded-2xl bg-[#111621]/95 p-4 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <h4 className="text-sm font-semibold text-white">오류 제보</h4>
                <p className="mt-1 text-xs text-white/65">
                  해당 컨텐츠의 문제점/오류가 있다면 제보를 남겨주세요.
                </p>

                <div className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/75">
                  제보자: {reporterProfile.name || "회원"} {reporterProfile.email ? `(${reporterProfile.email})` : ""}
                </div>

                <input
                  value={reportMessage}
                  onChange={(e) => setReportMessage(e.target.value)}
                  placeholder="오류 제목 (예: 포스터가 잘못 노출됩니다)"
                  className="mt-2 h-9 w-full rounded-lg bg-white/10 px-3 text-sm text-white outline-none"
                />

                <textarea
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="오류 내용, 재현 방법 등을 입력해주세요."
                  className="mt-2 h-24 w-full resize-none rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none"
                />

                {reportError ? <p className="mt-2 text-xs text-rose-300">{reportError}</p> : null}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
                    onClick={() => {
                      setReportOpen(false);
                    }}
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    disabled={reportBusy}
                    className="h-9 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-sm font-semibold disabled:opacity-60"
                    onClick={async () => {
                      const message = reportMessage.trim();
                      const detailText = reportDetail.trim();
                      if (!message) {
                        setReportError("오류 제목을 입력해주세요.");
                        return;
                      }
                      setReportBusy(true);
                      setReportError(null);
                      try {
                        let visitorId = "";
                        try {
                          visitorId = String(
                            localStorage.getItem("pickmovie_analyze_visitor_id") ?? "",
                          )
                            .trim()
                            .slice(0, 120);
                        } catch {}

                        await apiPost<{ ok: true }>("/analytics/content-issues", {
                          mediaType,
                          tmdbId: Number(detail.id),
                          contentTitle: title,
                          issueMessage: message,
                          issueDetail: detailText,
                          reporterUserId: reporterProfile.id,
                          reporterName: reporterProfile.name,
                          reporterEmail: reporterProfile.email,
                          visitorId,
                        });
                        setReportMessage("");
                        setReportDetail("");
                        setReportOpen(false);
                        setReportCompleteOpen(true);
                      } catch {
                        setReportError("오류 제보 접수에 실패했습니다. 잠시 후 다시 시도해주세요.");
                      } finally {
                        setReportBusy(false);
                      }
                    }}
                  >
                    {reportBusy ? "접수 중..." : "오류 제보"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {reportCompleteOpen ? (
          <>
            <motion.div
              className="fixed inset-0 z-[9997] bg-black/65 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={() => setReportCompleteOpen(false)}
            />
            <motion.div
              className="fixed inset-0 z-[9998] flex items-center justify-center px-4"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={() => setReportCompleteOpen(false)}
            >
              <div
                className="w-full max-w-[420px] rounded-2xl bg-[#111621]/95 p-4 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <h4 className="text-sm font-semibold text-white">오류 제보 접수 완료</h4>
                <p className="mt-2 text-sm text-white/75">
                  제보해주신 내용은 검토 후 개선에 반영하겠습니다.
                </p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-sm font-semibold"
                    onClick={() => setReportCompleteOpen(false)}
                  >
                    확인
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
