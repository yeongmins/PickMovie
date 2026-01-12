// frontend/src/pages/detail/ContentDetailModal.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { motion } from "framer-motion";

import { apiGet } from "../../lib/apiClient";
import {
  detectOriginalProvider,
  fetchAge,
  fetchDetailSafe,
  fetchProvidersKR,
  fetchTrailerKey,
  isAnime,
  normalizeMediaType,
  yearTextFrom,
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

import { DetailFavoritesProvider } from "./detailFavorites.context";
import { fetchTVSeasonDetail, type TmdbTvSeasonDetail } from "../../lib/tmdb";

/* =========================
   ✅ 재개봉 판정(중요)
========================= */

type TmdbReleaseDateItem = {
  release_date?: string;
  type?: number;
};

type TmdbReleaseDatesResult = {
  iso_3166_1?: string;
  release_dates?: TmdbReleaseDateItem[];
};

type TmdbReleaseDatesResponse = {
  results?: TmdbReleaseDatesResult[];
};

export type MovieRerunInfo = {
  hasMultipleTheatrical: boolean;
  originalTheatricalDate: string; // YYYY-MM-DD
  rerunTheatricalDate: string; // YYYY-MM-DD
};

const _detailRerunCache = new Map<string, MovieRerunInfo>();
const _detailRerunInFlight = new Map<string, Promise<MovieRerunInfo>>();

function toYmd(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function extractTheatricalDates(
  res: TmdbReleaseDatesResponse | null,
  region: string
): string[] {
  const list = Array.isArray(res?.results) ? res!.results! : [];
  const bucket =
    list.find(
      (x) => String(x?.iso_3166_1 || "").toUpperCase() === region.toUpperCase()
    ) ?? null;

  const dates = Array.isArray(bucket?.release_dates)
    ? bucket!.release_dates!
    : [];

  const theatrical = dates
    .filter((d) => {
      const t = Number(d?.type);
      return t === 2 || t === 3;
    })
    .map((d) => toYmd(d?.release_date))
    .filter(Boolean);

  const uniq = Array.from(new Set(theatrical));
  uniq.sort((a, b) => a.localeCompare(b));
  return uniq;
}

async function loadMovieRerunInfoNoThreshold(
  id: number,
  region: string
): Promise<MovieRerunInfo> {
  const key = `${id}:${region.toUpperCase()}`;
  const cached = _detailRerunCache.get(key);
  if (cached) return cached;

  const inflight = _detailRerunInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const res = await apiGet<TmdbReleaseDatesResponse>(
        `/tmdb/proxy/movie/${id}/release_dates`
      );
      const theatricalDates = extractTheatricalDates(res, region);

      const info: MovieRerunInfo = {
        hasMultipleTheatrical: theatricalDates.length >= 2,
        originalTheatricalDate: theatricalDates[0] ?? "",
        rerunTheatricalDate:
          theatricalDates.length >= 2
            ? theatricalDates[theatricalDates.length - 1] ?? ""
            : "",
      };

      _detailRerunCache.set(key, info);
      return info;
    } catch {
      const info: MovieRerunInfo = {
        hasMultipleTheatrical: false,
        originalTheatricalDate: "",
        rerunTheatricalDate: "",
      };
      _detailRerunCache.set(key, info);
      return info;
    } finally {
      _detailRerunInFlight.delete(key);
    }
  })();

  _detailRerunInFlight.set(key, p);
  return p;
}

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
  seasonNo: number
): TmdbTvSeasonDetail | null {
  const ctx = (st as any)?.seasonContext as SeasonNavContext | undefined;
  if (!ctx) return null;
  if (Number(ctx.seasonNo) !== Number(seasonNo)) return null;

  // 타입은 lib/tmdb에 있지만 여기서 쓰는 필드만 seed로 넣고 캐스팅
  return {
    name: ctx.name ?? undefined,
    poster_path: ctx.poster_path ?? null,
    air_date: ctx.air_date ?? null,
    overview: ctx.overview ?? "",
    vote_average: typeof ctx.vote_average === "number" ? ctx.vote_average : 0,
  } as any;
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

  // ✅ season query
  const seasonNo = useMemo(
    () => (mediaType === "tv" ? getSeasonNoFromSearch(location.search) : 0),
    [mediaType, location.search]
  );

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

  const [screening, setScreening] = useState<ScreeningSets | null>(() =>
    peekScreeningSets()
  );
  const [heroOttOnly, setHeroOttOnly] = useState<boolean>(() => {
    if (mediaType !== "movie" || !Number.isFinite(id) || id <= 0) return false;
    return peekOttOnlyMovie(id, "KR") ?? false;
  });

  const [rerunInfo, setRerunInfo] = useState<MovieRerunInfo>(() => ({
    hasMultipleTheatrical: false,
    originalTheatricalDate: "",
    rerunTheatricalDate: "",
  }));

  // ✅ 시즌 상세 (TV)
  const [seasonDetail, setSeasonDetail] = useState<TmdbTvSeasonDetail | null>(
    null
  );

  // ✅ 모달 스크롤 컨테이너 ref (시즌 이동 시 히어로로 올라가기)
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // ✅ 시즌/컨텐츠가 바뀌면 위로 올리고(빠르게), 트레일러도 닫기
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
    let mounted = true;

    setRerunInfo({
      hasMultipleTheatrical: false,
      originalTheatricalDate: "",
      rerunTheatricalDate: "",
    });

    if (mediaType !== "movie" || !Number.isFinite(id) || id <= 0) {
      return () => void (mounted = false);
    }

    void (async () => {
      const info = await loadMovieRerunInfoNoThreshold(id, "KR");
      if (!mounted) return;
      setRerunInfo(info);
    })();

    return () => {
      mounted = false;
    };
  }, [mediaType, id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  // ✅ base detail 로딩 (id/mediaType 기준)
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

  // ✅ season query가 바뀌면 시즌 상세 로딩
  useEffect(() => {
    let alive = true;

    // ✅ 클릭 직후에도 포스터/연도 등이 바로 바뀌도록 seed 먼저 주입
    const seed = seasonSeedFromState(location.state, seasonNo);

    setSeasonDetail(seed ?? null);

    if (mediaType !== "tv") return () => void (alive = false);
    if (!Number.isFinite(id) || id <= 0) return () => void (alive = false);
    if (!seasonNo) return () => void (alive = false);

    void (async () => {
      const s = await fetchTVSeasonDetail(id, seasonNo, { language: "ko-KR" });
      if (!alive) return;
      // ✅ fetch 실패(null)면 seed 유지
      if (s) setSeasonDetail(s);
    })();

    return () => {
      alive = false;
    };
  }, [mediaType, id, seasonNo, location.state]);

  // ✅ 시즌이 선택되면 "렌더용 detail"을 시즌 값으로 덮어씌움 (디자인/컴포넌트 변경 없이)
  const renderDetail: DetailBase | null = useMemo(() => {
    if (!detail) return null;
    if (mediaType !== "tv" || !seasonNo || !seasonDetail) return detail;

    const seasonOverview = String((seasonDetail as any)?.overview ?? "").trim();

    return {
      ...detail,
      // ✅ 시즌 포스터/시즌 개요/시즌 첫방일/시즌 평점 우선
      poster_path: seasonDetail.poster_path ?? detail.poster_path ?? null,
      overview: seasonOverview || detail.overview,
      vote_average:
        typeof (seasonDetail as any).vote_average === "number"
          ? (seasonDetail as any).vote_average
          : detail.vote_average,

      // ✅ 히어로에서 시즌 배지/분기용
      __seasonNo: seasonNo,
      __seasonName: (seasonDetail as any).name ?? undefined,
    } as any;
  }, [detail, mediaType, seasonNo, seasonDetail]);

  // ✅ 시즌 로딩 중이면 바디도 loading으로 (스켈레톤/로딩 UI는 기존 컴포넌트가 알아서)
  const seasonLoading = useMemo(() => {
    return mediaType === "tv" && seasonNo > 0 && seasonDetail === null;
  }, [mediaType, seasonNo, seasonDetail]);

  const statusKind: ReleaseStatusKind | null = useMemo(() => {
    if (!renderDetail) return null;

    const base = getReleaseStatusKind({
      mediaType,
      id: renderDetail.id,
      releaseDate: (renderDetail as any)?.release_date,
      firstAirDate: (renderDetail as any)?.first_air_date,
      sets: screening,
      ottOnly: heroOttOnly,
    });

    if (
      mediaType === "movie" &&
      rerunInfo.hasMultipleTheatrical &&
      (base === "now" || base === "upcoming")
    ) {
      return "rerun";
    }

    return base;
  }, [
    renderDetail,
    mediaType,
    screening,
    heroOttOnly,
    rerunInfo.hasMultipleTheatrical,
  ]);

  useEffect(() => {
    let mounted = true;

    if (mediaType !== "movie" || !renderDetail?.id) {
      setHeroOttOnly(false);
      return () => void (mounted = false);
    }

    if (statusKind !== "now" && statusKind !== "rerun") {
      setHeroOttOnly(false);
      return () => void (mounted = false);
    }

    const cached = peekOttOnlyMovie(renderDetail.id, "KR");
    if (typeof cached === "boolean") {
      setHeroOttOnly(cached);
      return () => void (mounted = false);
    }

    isOttOnlyMovie(renderDetail.id, "KR").then((v) => {
      if (!mounted) return;
      setHeroOttOnly(v);
    });

    return () => {
      mounted = false;
    };
  }, [mediaType, renderDetail?.id, statusKind]);

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
    if (!renderDetail) return mediaType === "tv" ? "TV" : "Movie";
    if (isAnime(renderDetail.genres)) return "Ani";
    return mediaType === "tv" ? "TV" : "Movie";
  }, [renderDetail, mediaType]);

  const yearText = useMemo(() => {
    if (!renderDetail) return "";

    // ✅ TV: 시즌 선택이면 해당 시즌 air_date 우선
    if (mediaType === "tv" && seasonNo && (seasonDetail as any)?.air_date) {
      const y = String((seasonDetail as any).air_date)
        .trim()
        .slice(0, 4);
      if (/^\d{4}$/.test(y)) return y;
    }

    // ✅ TV: 시즌 미선택(처음 진입)일 때는 "최신 시즌 기준 연도"
    if (mediaType === "tv") {
      const y = yearTextFrom(renderDetail as any, "tv");
      if (y) return y;
    }

    if (mediaType === "movie" && statusKind === "rerun") {
      const src =
        rerunInfo.originalTheatricalDate ||
        (renderDetail as any)?.kr_first_release_date ||
        (renderDetail as any)?.global_release_date ||
        "";

      const y = String(src).trim().slice(0, 4);
      if (/^\d{4}$/.test(y)) return y;

      return getUnifiedYearFromDetail(renderDetail as any, mediaType);
    }

    return getUnifiedYearFromDetail(renderDetail as any, mediaType);
  }, [
    renderDetail,
    mediaType,
    statusKind,
    rerunInfo.originalTheatricalDate,
    seasonNo,
    (seasonDetail as any)?.air_date,
  ]);

  const providerOriginal: ProviderItem | null = useMemo(() => {
    if (!renderDetail) return null;
    return detectOriginalProvider(renderDetail, providersKR);
  }, [renderDetail, providersKR]);

  const theatricalChip = useMemo(() => {
    if (!renderDetail) return null;
    if (!statusKind) return null;

    const label =
      statusKind === "now"
        ? "상영중"
        : statusKind === "upcoming"
        ? "상영예정"
        : "재개봉";

    return { label, tone: "dark" as const };
  }, [renderDetail, statusKind]);

  // ✅ 바디는 시즌별 갱신, 히어로(로고 포함)는 컨텐츠 단위로만 유지
  const renderKey = `${mediaType}:${id}:${seasonNo || 0}`; // Body용(시즌별)
  const heroKey = `${mediaType}:${id}`; // Hero용(시즌 바뀌어도 유지)

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

            <ContentDetailBody
              key={`body:${renderKey}`}
              loading={loading || seasonLoading}
              detail={renderDetail}
              mediaType={mediaType}
              providersKR={providersKR}
              statusKindOverride={statusKind}
              rerunInfo={rerunInfo}
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
