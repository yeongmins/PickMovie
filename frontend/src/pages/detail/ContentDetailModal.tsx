// frontend/src/pages/detail/ContentDetailModal.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { motion } from "framer-motion";

import {
  detectOriginalProvider,
  fetchAge,
  fetchDetailSafe,
  fetchProvidersKR,
  fetchTrailerKey,
  isAnime,
  normalizeMediaType,
  type DetailBase,
  type MediaType,
  type ProviderItem,
  type WatchProviderRegion,
} from "./contentDetail.data";

import { ContentDetailHero } from "./ContentDetailHero";
import { ContentDetailBody } from "./ContentDetailBody";

import {
  getReleaseStatusKind,
  getUnifiedYearFromDetail,
  isOttOnlyMovie,
  loadScreeningSets,
  peekOttOnlyMovie,
  peekScreeningSets,
  type ReleaseStatusKind,
  type ScreeningSets,
} from "../../lib/contentMeta";

function locationToPath(loc: any): string | null {
  if (!loc) return null;
  const p = String(loc?.pathname ?? "").trim();
  if (!p) return null;
  const s = String(loc?.search ?? "");
  const h = String(loc?.hash ?? "");
  return `${p}${s}${h}`;
}

type FavoriteItem = { id: number; mediaType: "movie" | "tv" };

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

  // ✅ “상세 → 배우 → 상세 …” 어떤 경로든 X 누르면 한 번에 모달 탈출
  const closeTargetPath = useMemo(() => {
    const st = location.state as any;
    const root = st?.rootLocation ?? st?.backgroundLocation ?? null;
    return locationToPath(root) ?? "/";
  }, [location.state]);

  const [detail, setDetail] = useState<DetailBase | null>(null);
  const [loading, setLoading] = useState(true);

  const [providersKR, setProvidersKR] = useState<WatchProviderRegion | null>(
    null
  );
  const [trailerKey, setTrailerKey] = useState<string | null>(null);

  const [ageValue, setAgeValue] = useState<string | null>(null);

  const [trailerOpen, setTrailerOpen] = useState(false);
  const [trailerMuted, setTrailerMuted] = useState(false);

  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  // ✅ 상영중/상영예정/재개봉 통일용
  const [screening, setScreening] = useState<ScreeningSets | null>(() =>
    peekScreeningSets()
  );
  const [heroOttOnly, setHeroOttOnly] = useState<boolean>(() => {
    if (mediaType !== "movie" || !Number.isFinite(id) || id <= 0) return false;
    return peekOttOnlyMovie(id, "KR") ?? false;
  });

  // body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ✅ ScreeningSets 로드(공유 캐시)
  useEffect(() => {
    let mounted = true;
    loadScreeningSets()
      .then((s) => {
        if (!mounted) return;
        setScreening(s);
      })
      .catch(() => {
        if (!mounted) return;
        setScreening((prev) => prev ?? null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    setTrailerOpen(false);
    setClosing(true);
  }, []);

  // ✅ ESC: 예고편 열려있으면 예고편 먼저 닫기 -> (추가 ESC) 모달 닫기
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

  // ✅ 상세 데이터 로딩
  useEffect(() => {
    let alive = true;

    setTrailerOpen(false);
    setTrailerMuted(false);
    setProvidersKR(null);
    setTrailerKey(null);
    setAgeValue(null);
    setDetail(null);
    setLoading(true);

    if (!Number.isFinite(id) || id <= 0) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    void (async () => {
      try {
        const data = await fetchDetailSafe(mediaType, id);
        if (!alive) return;

        if (!data) {
          setLoading(false);
          return;
        }

        setDetail(data);
        setLoading(false);

        const [p, t, a] = await Promise.all([
          fetchProvidersKR(mediaType, id),
          fetchTrailerKey(mediaType, id),
          fetchAge(mediaType, id, data?.adult),
        ]);

        if (!alive) return;

        setProvidersKR(p);
        setTrailerKey(t);
        setAgeValue(String(a));
      } catch {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [mediaType, id]);

  // ✅ OTT-only 판단(공유 캐시) : 상영중/재개봉 후보일 때만 체크
  const statusKind: ReleaseStatusKind | null = useMemo(() => {
    if (!detail) return null;
    return getReleaseStatusKind({
      mediaType,
      id: detail.id,
      releaseDate: (detail as any)?.release_date,
      firstAirDate: (detail as any)?.first_air_date,
      sets: screening,
      ottOnly: heroOttOnly,
    });
  }, [detail, mediaType, screening, heroOttOnly]);

  useEffect(() => {
    let mounted = true;

    if (mediaType !== "movie" || !detail?.id) {
      setHeroOttOnly(false);
      return () => void (mounted = false);
    }

    if (statusKind !== "now" && statusKind !== "rerun") {
      setHeroOttOnly(false);
      return () => void (mounted = false);
    }

    const cached = peekOttOnlyMovie(detail.id, "KR");
    if (typeof cached === "boolean") {
      setHeroOttOnly(cached);
      return () => void (mounted = false);
    }

    isOttOnlyMovie(detail.id, "KR").then((v) => {
      if (!mounted) return;
      setHeroOttOnly(v);
    });

    return () => {
      mounted = false;
    };
  }, [mediaType, detail?.id, statusKind]);

  const isFavorite = useMemo(() => {
    return favorites.some((f) => f?.id === id && f?.mediaType === mediaType);
  }, [favorites, id, mediaType]);

  const handleToggleFavorite = useCallback(
    (contentId: number, mt?: "movie" | "tv") => {
      onToggleFavorite(contentId, mt);
    },
    [onToggleFavorite]
  );

  const typeText = useMemo(() => {
    if (!detail) return mediaType === "tv" ? "TV" : "Movie";
    if (isAnime(detail.genres)) return "Ani";
    return mediaType === "tv" ? "TV" : "Movie";
  }, [detail, mediaType]);

  // ✅ 출시년도 통일(상세: TV는 최신 시즌 연도 우선)
  const yearText = useMemo(() => {
    if (!detail) return "";
    return getUnifiedYearFromDetail(detail as any, mediaType);
  }, [detail, mediaType]);

  // ✅ ORIGINAL만 유지
  const providerOriginal: ProviderItem | null = useMemo(() => {
    if (!detail) return null;
    return detectOriginalProvider(detail, providersKR);
  }, [detail, providersKR]);

  // ✅ 상영중/상영예정/재개봉 통일 라벨(상세 히어로 Chip에 그대로 넣음)
  const theatricalChip = useMemo(() => {
    if (!detail) return null;
    if (!statusKind) return null;

    const label =
      statusKind === "now"
        ? "상영중"
        : statusKind === "upcoming"
        ? "상영예정"
        : "재개봉";

    return { label, tone: "dark" as const };
  }, [detail, statusKind]);

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

        <div className="h-full overflow-y-auto overscroll-contain">
          {detail ? (
            <ContentDetailHero
              detail={detail}
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

          <ContentDetailBody
            loading={loading}
            detail={detail}
            mediaType={mediaType}
            providersKR={providersKR}
          />
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
