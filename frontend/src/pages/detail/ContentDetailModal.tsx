// frontend/src/pages/detail/ContentDetailModal.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { motion } from "framer-motion";

import {
  detectOriginalProvider,
  fetchDetailSafe,
  fetchTrailerKey,
  normalizeMediaType,
  type DetailBase,
  type MediaType,
  type ProviderItem,
  type WatchProviderRegion,
} from "./contentDetail.data";

import { ContentDetailHero } from "./ContentDetailHero";
import { ContentDetailBody } from "./ContentDetailBody";

import { DetailFavoritesProvider } from "./detailFavorites.context";
import { fetchTVSeasonDetail, type TmdbTvSeasonDetail } from "../../lib/tmdb";
import {
  peekResolvedMeta,
  requestResolvedMeta,
  type ResolvedMeta,
} from "../../lib/metaClient";

function locationToPath(loc: any): string | null {
  if (!loc) return null;
  const p = String(loc?.pathname ?? "").trim();
  if (!p) return null;
  const s = String(loc?.search ?? "");
  const h = String(loc?.hash ?? "");
  return `${p}${s}${h}`;
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

type ReleaseStatusKind = "now" | "upcoming" | "rerun" | null;

type FavoriteItem = { id: number; mediaType: "movie" | "tv" };

// ✅ SeriesSeasonCards에서 전달하는 seed
type SeasonNavContext = {
  seasonNo: number;
  name?: string;
  poster_path?: string | null;
  air_date?: string | null;
  overview?: string | null;
  vote_average?: number | null;
};

function seasonSeedFromState(
  st: any,
  seasonNo: number,
): TmdbTvSeasonDetail | null {
  const ctx = (st as any)?.seasonContext as SeasonNavContext | undefined;
  if (!ctx) return null;
  if (Number(ctx.seasonNo) !== Number(seasonNo)) return null;

  return {
    name: ctx.name ?? undefined,
    poster_path: ctx.poster_path ?? null,
    air_date: ctx.air_date ?? null,
    overview: ctx.overview ?? "",
    vote_average: typeof ctx.vote_average === "number" ? ctx.vote_average : 0,
  } as any;
}

function typeTextFromMeta(meta: ResolvedMeta | null) {
  const ck = String(meta?.contentKind ?? "").toUpperCase();
  if (ck === "ANI") return "Ani";
  if (ck === "TV") return "TV";
  if (ck === "MOVIE") return "Movie";
  return "—";
}

export default function ContentDetailModal({
  favorites,
  onToggleFavorite,
  isAuthed,
}: {
  favorites: FavoriteItem[];
  onToggleFavorite: (id: number, mediaType?: "movie" | "tv") => void;
  isAuthed: boolean;
}) {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  const mediaType = normalizeMediaType(params.mediaType) as MediaType;
  const id = Number(params.id);

  const seasonNo = useMemo(
    () => (mediaType === "tv" ? getSeasonNoFromSearch(location.search) : 0),
    [mediaType, location.search],
  );

  const closeTargetPath = useMemo(() => {
    const st = location.state as any;
    const root = st?.rootLocation ?? st?.backgroundLocation ?? null;
    return locationToPath(root) ?? "/";
  }, [location.state]);

  const [detail, setDetail] = useState<DetailBase | null>(null);
  const [loading, setLoading] = useState(true);

  const [trailerKey, setTrailerKey] = useState<string | null>(null);

  const [trailerOpen, setTrailerOpen] = useState(false);
  const [trailerMuted, setTrailerMuted] = useState(false);

  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // ✅ meta (단일 소스)
  const [meta, setMeta] = useState<ResolvedMeta | null>(() => {
    if (!Number.isFinite(id) || id <= 0) return null;
    return peekResolvedMeta(mediaType as any, id) ?? null;
  });

  // ✅ 시즌 상세 (TV)
  const [seasonDetail, setSeasonDetail] = useState<TmdbTvSeasonDetail | null>(
    null,
  );
  const seasonLoading = useMemo(() => {
    return mediaType === "tv" && seasonNo > 0 && seasonDetail === null;
  }, [mediaType, seasonNo, seasonDetail]);

  useEffect(() => {
    setTrailerOpen(false);
    setTrailerMuted(false);

    const el = scrollerRef.current;
    if (el) {
      el.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [mediaType, id, seasonNo]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    setTrailerOpen(false);
    setClosing(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (trailerOpen) {
        setTrailerOpen(false);
        return;
      }
      requestClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, trailerOpen]);

  // ✅ base detail + meta 로딩
  useEffect(() => {
    let alive = true;

    setTrailerOpen(false);
    setTrailerMuted(false);
    setTrailerKey(null);
    setDetail(null);
    setLoading(true);

    if (!Number.isFinite(id) || id <= 0) {
      setLoading(false);
      return () => void (alive = false);
    }

    void (async () => {
      try {
        // 1) detail
        const data = await fetchDetailSafe(mediaType, id);
        if (!alive) return;

        if (!data) {
          setLoading(false);
          return;
        }

        setDetail(data);
        setLoading(false);

        // 2) meta 단일 소스 (cache 먼저)
        const cached = peekResolvedMeta(mediaType as any, id) ?? null;
        if (cached) setMeta(cached);

        requestResolvedMeta(mediaType as any, id)
          .then((m) => {
            if (!alive) return;
            setMeta(m ?? null);
          })
          .catch(() => {
            if (!alive) return;
            setMeta((prev) => prev ?? null);
          });

        // 3) trailer만
        const t = await fetchTrailerKey(mediaType, id);
        if (!alive) return;
        setTrailerKey(t);
      } catch {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => void (alive = false);
  }, [mediaType, id]);

  // ✅ season query가 바뀌면 시즌 상세 로딩
  useEffect(() => {
    let alive = true;

    const seed = seasonSeedFromState(location.state, seasonNo);
    setSeasonDetail(seed ?? null);

    if (mediaType !== "tv") return () => void (alive = false);
    if (!Number.isFinite(id) || id <= 0) return () => void (alive = false);
    if (!seasonNo) return () => void (alive = false);

    void (async () => {
      const s = await fetchTVSeasonDetail(id, seasonNo, { language: "ko-KR" });
      if (!alive) return;
      if (s) setSeasonDetail(s);
    })();

    return () => void (alive = false);
  }, [mediaType, id, seasonNo, location.state]);

  // ✅ 시즌 선택이면 렌더용 detail을 시즌 값으로 덮어씌움 (기존 기능 유지)
  const renderDetail: DetailBase | null = useMemo(() => {
    if (!detail) return null;
    if (mediaType !== "tv" || !seasonNo || !seasonDetail) return detail;

    const seasonOverview = String((seasonDetail as any)?.overview ?? "").trim();

    return {
      ...detail,
      poster_path: seasonDetail.poster_path ?? detail.poster_path ?? null,
      overview: seasonOverview || detail.overview,
      vote_average:
        typeof (seasonDetail as any).vote_average === "number"
          ? (seasonDetail as any).vote_average
          : detail.vote_average,
      __seasonNo: seasonNo,
      __seasonName: (seasonDetail as any).name ?? undefined,
      first_air_date:
        (seasonDetail as any)?.air_date ?? detail.first_air_date ?? undefined,
    } as any;
  }, [detail, mediaType, seasonNo, seasonDetail]);

  // ✅ statusKind/year/age/type: meta 단일 소스
  const statusKind: ReleaseStatusKind = useMemo(() => {
    return (meta?.statusKind ?? null) as ReleaseStatusKind;
  }, [meta?.statusKind]);

  const yearText = useMemo(() => {
    const y = String(meta?.unifiedYearLabel ?? "").trim();
    return y ? y : "—";
  }, [meta?.unifiedYearLabel]);

  const ageValue = useMemo(() => {
    const a = String(meta?.ageRating ?? "").trim();
    return a ? a : null;
  }, [meta?.ageRating]);

  const typeText = useMemo(() => typeTextFromMeta(meta), [meta]);

  // ✅ providers: meta.providers 기반으로만 (detectOriginalProvider 유지)
  const providersKRFromMeta: WatchProviderRegion | null = useMemo(() => {
    const list = meta?.providers;
    if (!Array.isArray(list) || !list.length) return null;
    return { flatrate: list as any };
  }, [meta?.providers]);

  const providerOriginal: ProviderItem | null = useMemo(() => {
    if (!renderDetail) return null;
    return detectOriginalProvider(renderDetail, providersKRFromMeta);
  }, [renderDetail, providersKRFromMeta]);

  const theatricalChip = useMemo(() => {
    if (!statusKind) return null;

    const label =
      statusKind === "now"
        ? "상영중"
        : statusKind === "upcoming"
          ? "상영예정"
          : "재개봉";

    return { label, tone: "dark" as const };
  }, [statusKind]);

  const isFavorite = useMemo(() => {
    return favorites.some((f) => f?.id === id && f?.mediaType === mediaType);
  }, [favorites, id, mediaType]);

  const handleToggleFavorite = useCallback(
    (contentId: number, mt?: "movie" | "tv") => {
      onToggleFavorite(contentId, mt);
    },
    [onToggleFavorite],
  );

  const renderKey = `${mediaType}:${id}:${seasonNo || 0}`;
  const heroKey = `${mediaType}:${id}`;

  return (
    <div className="fixed inset-0 z-[999]">
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onClick={requestClose}
      />

      <motion.div
        className={[
          "relative mx-auto",
          "w-[min(1120px,94vw)]",
          "h-[96svh] mt-[4svh] mb-0",
          "overflow-hidden",
          "bg-[#0b0b10]",
          "shadow-[0_30px_90px_rgba(0,0,0,0.65)]",
          "rounded-t-[10px] rounded-b-none",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: closing ? 60 : 0, opacity: closing ? 0 : 1 }}
        transition={
          closing
            ? { duration: 0.18, ease: "easeInOut" }
            : { type: "spring", stiffness: 240, damping: 22, mass: 0.9 }
        }
        onAnimationComplete={() => {
          if (!closing) return;
          navigate(closeTargetPath, { replace: true });
        }}
      >
        <button
          type="button"
          aria-label="닫기"
          onClick={requestClose}
          className="absolute right-4 top-4 z-40 w-10 h-10 rounded-full bg-black/35 hover:bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
        >
          <X className="w-5 h-5" />
        </button>

        <div
          ref={scrollerRef}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <DetailFavoritesProvider
            favorites={favorites}
            isAuthed={isAuthed}
            onToggleFavorite={onToggleFavorite}
          >
            {renderDetail ? (
              <ContentDetailHero
                key={`hero:${heroKey}`}
                detail={renderDetail}
                mediaType={mediaType}
                providerOriginal={providerOriginal}
                theatricalChip={theatricalChip}
                typeText={typeText}
                yearText={yearText}
                ageValue={ageValue}
                trailerKey={trailerKey}
                trailerOpen={trailerOpen}
                trailerMuted={trailerMuted}
                setTrailerOpen={setTrailerOpen}
                setTrailerMuted={setTrailerMuted}
                isAuthed={isAuthed}
                isFavorite={isFavorite}
                onToggleFavorite={handleToggleFavorite}
              />
            ) : (
              <div
                className="relative w-full overflow-hidden"
                style={{ height: "clamp(420px, 62vh, 680px)" }}
              >
                <div className="absolute inset-0 bg-black" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b10] via-black/15 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#0b0b10] via-[#0b0b10]/70 to-transparent" />
              </div>
            )}

            {/* ✅ TS 오류 해결: ContentDetailBody는 기존 props만 전달 */}
            <ContentDetailBody
              key={`body:${renderKey}`}
              loading={loading || seasonLoading}
              detail={renderDetail}
              mediaType={mediaType}
              statusKindOverride={statusKind}
            />
          </DetailFavoritesProvider>
        </div>
      </motion.div>

      <style>{`
        @media (max-width: 768px) {
          .fixed.inset-0.z-[999] > div.relative.mx-auto {
            width: 100vw !important;
            height: 100svh !important;
            margin-top: 0 !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
