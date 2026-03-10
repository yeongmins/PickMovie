// frontend/src/pages/detail/ContentDetailModal.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, Pencil, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

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
  refreshResolvedMeta,
  setResolvedMetaCache,
  requestResolvedMeta,
  type ResolvedMeta,
} from "../../lib/metaClient";
import { apiDelete, apiPatch, apiPost } from "../../lib/apiClient";
import { applySeo } from "../../lib/seo";

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

/** 중첩 모달에서도 안전한 body scroll lock (카운팅 방식) */
function lockBodyScroll() {
  if (typeof document === "undefined") return () => {};
  const attr = "data-pm-scroll-lock";
  const cur = Number(document.body.getAttribute(attr) || "0") || 0;
  const next = cur + 1;

  document.body.setAttribute(attr, String(next));
  if (cur === 0) document.body.style.overflow = "hidden";

  return () => {
    const now = Number(document.body.getAttribute(attr) || "0") || 0;
    const dec = Math.max(0, now - 1);

    if (dec === 0) {
      document.body.style.overflow = "";
      document.body.removeAttribute(attr);
    } else {
      document.body.setAttribute(attr, String(dec));
    }
  };
}

type ReleaseStatusKind = "now" | "upcoming" | "rerun" | null;

type FavoriteItem = { id: number; mediaType: "movie" | "tv" };

// SeriesSeasonCards에서 전달하는 seed
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

type AdminEditForm = {
  title: string;
  originalTitle: string;
  overview: string;
  runtime: string;
  releaseDate: string;
  rerunDate: string;
  forceHidden: boolean;
  contentKind: string;
  releaseStatus: string;
  ageRating: string;
  heroReleaseYear: string;
  contentInfoReleaseYear: string;
};

type AdminEditField = keyof AdminEditForm;
type AdminEditValidation = { message: string; field: AdminEditField | null };

function safeText(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeIsoDate(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y) return null;
  if (dt.getUTCMonth() + 1 !== m) return null;
  if (dt.getUTCDate() !== d) return null;
  return s;
}

function toDateInputValue(v: string): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

function toYearInputValue(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const ymdHead = s.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (ymdHead?.[1]) return ymdHead[1];
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1800) return String(Math.trunc(n));
  if (/^\d{4}$/.test(s)) return s;
  return "";
}

function validateAdminEditInput(form: AdminEditForm): AdminEditValidation | null {
  const releaseDateRaw = form.releaseDate.trim();
  if (releaseDateRaw) {
    if (!normalizeIsoDate(releaseDateRaw)) {
      return {
        message: "개봉/방영일의 날짜 형식이 올바르지 않습니다.",
        field: "releaseDate",
      };
    }
  }

  const rerunDateRaw = form.rerunDate.trim();
  if (rerunDateRaw) {
    if (!normalizeIsoDate(rerunDateRaw)) {
      return {
        message: "재개봉일의 날짜 형식이 올바르지 않습니다.",
        field: "rerunDate",
      };
    }
  }

  const runtimeRaw = form.runtime.trim();
  if (runtimeRaw) {
    const normalized = runtimeRaw.toLowerCase();
    if (normalized === "undefined" || normalized === "null" || normalized === "nan") {
      return {
        message: "러닝타임(분)은 유효한 숫자만 입력 가능합니다.",
        field: "runtime",
      };
    }
    if (!/^\d+$/.test(runtimeRaw)) {
      return {
        message: "러닝타임(분)은 숫자만 입력 가능합니다.",
        field: "runtime",
      };
    }
    const runtimeNum = Number(runtimeRaw);
    if (!Number.isFinite(runtimeNum) || runtimeNum <= 0) {
      return {
        message: "러닝타임(분)은 1 이상의 숫자여야 합니다.",
        field: "runtime",
      };
    }
  }

  const heroYearRaw = form.heroReleaseYear.trim();
  if (heroYearRaw) {
    if (!/^\d+$/.test(heroYearRaw)) {
      return { message: "출시년도는 숫자만 입력 가능합니다.", field: "heroReleaseYear" };
    }
    if (!/^\d{4}$/.test(heroYearRaw)) {
      return {
        message: "출시년도는 4자리 숫자(YYYY) 형식이어야 합니다.",
        field: "heroReleaseYear",
      };
    }
    const yearNum = Number(heroYearRaw);
    if (!Number.isFinite(yearNum) || yearNum < 1800) {
      return { message: "출시년도는 1800 이상이어야 합니다.", field: "heroReleaseYear" };
    }
  }

  const infoYearRaw = form.contentInfoReleaseYear.trim();
  if (infoYearRaw) {
    if (!/^\d+$/.test(infoYearRaw)) {
      return {
        message: "출시년도(컨텐츠 정보)는 숫자만 입력 가능합니다.",
        field: "contentInfoReleaseYear",
      };
    }
    if (!/^\d{4}$/.test(infoYearRaw)) {
      return {
        message: "출시년도(컨텐츠 정보)는 4자리 숫자(YYYY) 형식이어야 합니다.",
        field: "contentInfoReleaseYear",
      };
    }
    const yearNum = Number(infoYearRaw);
    if (!Number.isFinite(yearNum) || yearNum < 1800) {
      return {
        message: "출시년도(컨텐츠 정보)는 1800 이상이어야 합니다.",
        field: "contentInfoReleaseYear",
      };
    }
  }

  return null;
}

function applyDetailOverride(
  base: DetailBase,
  mediaType: MediaType,
  meta: ResolvedMeta | null,
): DetailBase {
  const override = meta?.detailOverride ?? null;
  if (!override) return base;

  const title = safeText(override.title);
  const originalTitle = safeText(override.originalTitle);
  const overview = safeText(override.overview);
  const releaseDate = safeText(override.releaseDate);
  const runtime = typeof override.runtime === "number" ? override.runtime : null;

  const next: DetailBase = { ...base };
  if (title) {
    if (mediaType === "tv") next.name = title;
    else next.title = title;
  }
  if (originalTitle) {
    if (mediaType === "tv") next.original_name = originalTitle;
    else next.original_title = originalTitle;
  }
  if (overview) next.overview = overview;
  if (runtime && runtime > 0) {
    if (mediaType === "tv") next.episode_run_time = [runtime];
    else next.runtime = runtime;
  }
  if (releaseDate) {
    if (mediaType === "tv") next.first_air_date = releaseDate;
    else next.release_date = releaseDate;
  }
  return next;
}

export default function ContentDetailModal({
  favorites,
  onToggleFavorite,
  isAuthed,
  isAdmin,
}: {
  favorites: FavoriteItem[];
  onToggleFavorite: (id: number, mediaType?: "movie" | "tv") => void;
  isAuthed: boolean;
  isAdmin: boolean;
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

  // underlay 모드: 배우 모달 아래에 깔릴 때 backdrop을 투명 처리
  const isUnderPersonOverlay = useMemo(() => {
    const st = location.state as any;
    return st?.__underlay === "person";
  }, [location.state]);

  // Search 위에서 열린 상세는 배경을 최대한 유지
  const isOverSearchOverlay = useMemo(() => {
    const st = location.state as any;
    const bg = st?.backgroundLocation;
    return String(bg?.pathname ?? "") === "/search";
  }, [location.state]);

  const closeTarget = useMemo(() => {
    const st = location.state as any;
    const root = st?.rootLocation ?? st?.backgroundLocation ?? null;
    return {
      path: locationToPath(root) ?? "/",
      state: root?.state ?? null,
    };
  }, [location.state]);

  const [detail, setDetail] = useState<DetailBase | null>(null);
  const [loading, setLoading] = useState(true);

  const [trailerKey, setTrailerKey] = useState<string | null>(null);

  const [trailerOpen, setTrailerOpen] = useState(false);
  const [trailerMuted, setTrailerMuted] = useState(false);

  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const heroYearMenuRef = useRef<HTMLDivElement | null>(null);
  const infoYearMenuRef = useRef<HTMLDivElement | null>(null);

  // meta (단일 소스)
  const [meta, setMeta] = useState<ResolvedMeta | null>(() => {
    if (!Number.isFinite(id) || id <= 0) return null;
    return peekResolvedMeta(mediaType as any, id) ?? null;
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<AdminEditField, string>>
  >({});
  const [shakeField, setShakeField] = useState<AdminEditField | null>(null);
  const [yearMenuOpen, setYearMenuOpen] = useState<"hero" | "info" | null>(
    null,
  );
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState<AdminEditForm>({
    title: "",
    originalTitle: "",
    overview: "",
    runtime: "",
    releaseDate: "",
    rerunDate: "",
    forceHidden: false,
    contentKind: "MOVIE",
    releaseStatus: "NONE",
    ageRating: "UNKNOWN",
    heroReleaseYear: "",
    contentInfoReleaseYear: "",
  });

  // 시즌 상세 (TV)
  const [seasonDetail, setSeasonDetail] = useState<TmdbTvSeasonDetail | null>(
    null,
  );
  const seasonLoading = useMemo(() => {
    return mediaType === "tv" && seasonNo > 0 && seasonDetail === null;
  }, [mediaType, seasonNo, seasonDetail]);

  useEffect(() => {
    setTrailerOpen(false);
    setTrailerMuted(false);
    setEditOpen(false);
    setEditError(null);
    setYearMenuOpen(null);
    setResetConfirmOpen(false);

    const el = scrollerRef.current;
    if (el) {
      el.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [mediaType, id, seasonNo]);

  useEffect(() => {
    if (!editOpen) {
      setYearMenuOpen(null);
      setResetConfirmOpen(false);
      setFieldErrors({});
      setShakeField(null);
    }
  }, [editOpen]);

  useEffect(() => {
    if (!yearMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const heroEl = heroYearMenuRef.current;
      const infoEl = infoYearMenuRef.current;
      if (!(e.target instanceof Node)) return;
      if (yearMenuOpen === "hero" && heroEl && !heroEl.contains(e.target)) {
        setYearMenuOpen(null);
      }
      if (yearMenuOpen === "info" && infoEl && !infoEl.contains(e.target)) {
        setYearMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [yearMenuOpen]);

  const clearFieldError = useCallback((field: AdminEditField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const triggerFieldShake = useCallback((field: AdminEditField) => {
    setShakeField(null);
    requestAnimationFrame(() => setShakeField(field));
  }, []);

  // 중첩 모달 스크롤락 안전 처리
  useEffect(() => {
    const unlock = lockBodyScroll();
    return () => unlock();
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

      if (yearMenuOpen) {
        setYearMenuOpen(null);
        return;
      }
      if (resetConfirmOpen) {
        setResetConfirmOpen(false);
        return;
      }
      if (editOpen) {
        setEditOpen(false);
        return;
      }
      if (trailerOpen) {
        setTrailerOpen(false);
        return;
      }
      requestClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, trailerOpen, editOpen, resetConfirmOpen, yearMenuOpen]);

  // base detail + meta 로딩
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

  // season query가 바뀌면 시즌 상세 로딩
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

  // 시즌 선택이면 렌더용 detail을 시즌 값으로 덮어씌움 (기존 기능 유지)
  const renderDetail: DetailBase | null = useMemo(() => {
    if (!detail) return null;
    if (mediaType !== "tv" || !seasonNo || !seasonDetail)
      return applyDetailOverride(detail, mediaType, meta);

    const seasonOverview = String((seasonDetail as any)?.overview ?? "").trim();

    const seasonMerged = {
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
    return applyDetailOverride(seasonMerged, mediaType, meta);
  }, [detail, mediaType, seasonNo, seasonDetail, meta]);

  // statusKind/year/age/type: meta 단일 소스
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
  const hiddenForViewer = useMemo(() => {
    return !!meta?.adminHidden;
  }, [meta?.adminHidden]);

  useEffect(() => {
    if (isAdmin) return;
    if (!hiddenForViewer) return;
    requestClose();
  }, [hiddenForViewer, requestClose, isAdmin]);

  // providers: meta.providers 기반으로만 (detectOriginalProvider 유지)
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

  const openEditModal = useCallback(() => {
    if (!isAdmin || !detail) return;
    const override = meta?.detailOverride ?? null;
    const isTv = mediaType === "tv";
    const runtimeSeed =
      typeof override?.runtime === "number"
        ? override.runtime
        : isTv && Array.isArray(detail.episode_run_time)
          ? typeof detail.episode_run_time[0] === "number"
            ? detail.episode_run_time[0]
            : null
          : typeof detail.runtime === "number"
            ? detail.runtime
            : null;
    setEditError(null);
    setEditForm({
      title: safeText(override?.title) || safeText(isTv ? detail.name : detail.title),
      originalTitle:
        safeText(override?.originalTitle) ||
        safeText(isTv ? detail.original_name : detail.original_title),
      overview: safeText(override?.overview) || safeText(detail.overview),
      runtime: runtimeSeed == null ? "" : String(runtimeSeed),
      releaseDate: toDateInputValue(
        safeText(override?.releaseDate) ||
          safeText(meta?.contentInfoReleaseYmd) ||
          safeText(isTv ? detail.first_air_date : detail.release_date),
      ),
      rerunDate: toDateInputValue(
        safeText(meta?.theatrical?.rerunTheatricalDate),
      ),
      forceHidden: Boolean(meta?.adminHidden),
      contentKind: String(meta?.contentKind ?? "MOVIE").toUpperCase() || "MOVIE",
      releaseStatus:
        String(meta?.releaseStatus ?? "NONE").toUpperCase() || "NONE",
      ageRating: String(meta?.ageRating ?? "UNKNOWN").toUpperCase() || "UNKNOWN",
      heroReleaseYear:
        toYearInputValue(meta?.unifiedYearLabel) ||
        toYearInputValue(meta?.releaseYear),
      contentInfoReleaseYear:
        toYearInputValue(meta?.contentInfoReleaseYear) ||
        toYearInputValue(meta?.contentInfoReleaseYmd),
    });
    setEditOpen(true);
  }, [isAdmin, detail, meta, mediaType]);

  const releaseYearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years: string[] = [];
    for (let y = current + 2; y >= 1900; y -= 1) years.push(String(y));
    return years;
  }, []);

  const saveAdminEdits = useCallback(async () => {
    if (!isAdmin || !Number.isFinite(id) || id <= 0) return;
    const normalizedForm: AdminEditForm = {
      title: String(editForm.title ?? ""),
      originalTitle: String(editForm.originalTitle ?? ""),
      overview: String(editForm.overview ?? ""),
      runtime: String(editForm.runtime ?? ""),
      releaseDate: String(editForm.releaseDate ?? ""),
      rerunDate: String(editForm.rerunDate ?? ""),
      forceHidden: Boolean(editForm.forceHidden),
      contentKind: String(editForm.contentKind ?? "MOVIE").toUpperCase(),
      releaseStatus: String(editForm.releaseStatus ?? "NONE").toUpperCase(),
      ageRating: String(editForm.ageRating ?? "UNKNOWN").toUpperCase(),
      heroReleaseYear: String(editForm.heroReleaseYear ?? ""),
      contentInfoReleaseYear: String(editForm.contentInfoReleaseYear ?? ""),
    };

    const validation = validateAdminEditInput(normalizedForm);
    if (validation) {
      setEditError(validation.message);
      if (validation.field) {
        setFieldErrors({ [validation.field]: validation.message });
        triggerFieldShake(validation.field);
      }
      return;
    }

    const runtimeNum = Number(normalizedForm.runtime);
    const heroReleaseYearNum = Number(normalizedForm.heroReleaseYear);
    const contentInfoReleaseYearNum = Number(normalizedForm.contentInfoReleaseYear);
    const releaseDateIso = normalizedForm.releaseDate.trim()
      ? normalizeIsoDate(normalizedForm.releaseDate.trim())
      : null;
    const rerunDateIso = normalizedForm.rerunDate.trim()
      ? normalizeIsoDate(normalizedForm.rerunDate.trim())
      : null;
    const contentKind = ["MOVIE", "TV", "ANI"].includes(
      normalizedForm.contentKind,
    )
      ? normalizedForm.contentKind
      : "MOVIE";
    const releaseStatus = [
      "NOW_SHOWING",
      "UPCOMING",
      "RE_RELEASE",
      "NONE",
    ].includes(normalizedForm.releaseStatus)
      ? normalizedForm.releaseStatus
      : "NONE";
    const ageRating = ["ALL", "12", "15", "19", "UNKNOWN"].includes(
      normalizedForm.ageRating,
    )
      ? normalizedForm.ageRating
      : "UNKNOWN";

    const body = {
      title: normalizedForm.title.trim() || null,
      originalTitle: normalizedForm.originalTitle.trim() || null,
      overview: normalizedForm.overview.trim() || null,
      runtime:
        normalizedForm.runtime.trim() === ""
          ? null
          : Number.isFinite(runtimeNum) && runtimeNum > 0
            ? Math.trunc(runtimeNum)
            : null,
      releaseDate: releaseDateIso,
      rerunTheatricalDate: rerunDateIso,
      forceHidden: normalizedForm.forceHidden,
      contentKind,
      releaseStatus,
      ageRating,
      releaseYear:
        normalizedForm.heroReleaseYear.trim() === ""
          ? null
          : Number.isFinite(heroReleaseYearNum) && heroReleaseYearNum >= 1800
            ? Math.trunc(heroReleaseYearNum)
            : null,
      contentInfoReleaseYear:
        normalizedForm.contentInfoReleaseYear.trim() === ""
          ? null
          : Number.isFinite(contentInfoReleaseYearNum) &&
              contentInfoReleaseYearNum >= 1800
            ? Math.trunc(contentInfoReleaseYearNum)
            : null,
      unifiedYearLabel:
        normalizedForm.heroReleaseYear.trim() === ""
          ? null
          : Number.isFinite(heroReleaseYearNum) && heroReleaseYearNum >= 1800
            ? String(Math.trunc(heroReleaseYearNum))
            : null,
    };

    setEditSaving(true);
    setEditError(null);
    setFieldErrors({});
    try {
      try {
        await apiPatch<{ ok: true }>(`/admin/meta/${mediaType}/${id}`, body);
      } catch (e: any) {
        if (Number(e?.status) === 404) {
          await apiPost<{ ok: true }>(`/admin/meta/${mediaType}/${id}`, body);
        } else {
          throw e;
        }
      }
      const refreshed = await refreshResolvedMeta(mediaType as any, id);
      if (refreshed) {
        setMeta(refreshed);
        setResolvedMetaCache(mediaType as any, id, refreshed);
      }
      setDetail((prev) => {
        if (!prev) return prev;
        return applyDetailOverride(
          {
            ...prev,
            ...(mediaType === "tv"
              ? { name: body.title ?? prev.name, original_name: body.originalTitle ?? prev.original_name }
              : {
                  title: body.title ?? prev.title,
                  original_title: body.originalTitle ?? prev.original_title,
                }),
            overview: body.overview ?? prev.overview,
            ...(mediaType === "tv"
              ? {
                  episode_run_time:
                    body.runtime && body.runtime > 0 ? [body.runtime] : prev.episode_run_time,
                  first_air_date: body.releaseDate ?? prev.first_air_date,
                }
              : {
                  runtime: body.runtime && body.runtime > 0 ? body.runtime : prev.runtime,
                  release_date: body.releaseDate ?? prev.release_date,
                }),
          },
          mediaType,
          refreshed ?? meta,
        );
      });
      setEditOpen(false);
      window.location.reload();
    } catch (e: any) {
      setEditError(
        String(e?.message || "수정 저장에 실패했습니다. 관리자 권한을 확인해주세요."),
      );
    } finally {
      setEditSaving(false);
    }
  }, [isAdmin, id, editForm, mediaType, meta, triggerFieldShake]);

  const resetToTmdbDefaults = useCallback(async () => {
    if (!isAdmin || !Number.isFinite(id) || id <= 0) return;
    setEditSaving(true);
    setEditError(null);
    try {
      let resetDone = false;
      try {
        await apiPost<{ ok: true }>(`/admin/meta/${mediaType}/${id}/reset`, {});
        resetDone = true;
      } catch (e: any) {
        if (Number(e?.status) !== 404) throw e;
      }

      if (!resetDone) {
        try {
          await apiDelete<{ ok: true }>(`/admin/meta/${mediaType}/${id}`);
          resetDone = true;
        } catch (e: any) {
          if (Number(e?.status) !== 404) throw e;
        }
      }

      if (!resetDone) {
        setEditError(
          "초기화 API를 찾을 수 없습니다. 백엔드 서버를 재시작한 뒤 다시 시도해주세요.",
        );
        return;
      }

      const freshDetail = await fetchDetailSafe(mediaType, id);
      if (freshDetail) setDetail(freshDetail);

      const refreshed = await refreshResolvedMeta(mediaType as any, id);
      if (refreshed) {
        setMeta(refreshed);
        setResolvedMetaCache(mediaType as any, id, refreshed);
      }

      setResetConfirmOpen(false);
      setEditOpen(false);
      window.location.reload();
    } catch (e: any) {
      setEditError(String(e?.message || "초기화에 실패했습니다."));
    } finally {
      setEditSaving(false);
    }
  }, [isAdmin, id, mediaType]);

  const renderKey = `${mediaType}:${id}:${seasonNo || 0}`;
  const heroKey = `${mediaType}:${id}`;

  useEffect(() => {
    const contentTitle = String(
      renderDetail?.title || renderDetail?.name || "콘텐츠",
    ).trim();
    const overview = String(renderDetail?.overview || "").trim();
    const dateText = String(
      renderDetail?.release_date || renderDetail?.first_air_date || "",
    ).trim();
    const schemaType = mediaType === "tv" ? "TVSeries" : "Movie";

    applySeo({
      title: `${contentTitle} 상세 정보 | PickMovie`,
      description:
        overview ||
        "PickMovie에서 콘텐츠 상세 정보, 출연진, 리뷰, 시청 가능 OTT 정보를 확인하세요.",
      path: `/title/${mediaType}/${id}`,
      keywords: `PickMovie, 픽무비, ${contentTitle}, ${mediaType === "tv" ? "TV" : "영화"} 상세 정보`,
      type: "article",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": schemaType,
        name: contentTitle,
        description: overview || undefined,
        datePublished: dateText || undefined,
        url: `https://pickmovie.net/title/${mediaType}/${id}`,
      },
    });
  }, [
    id,
    mediaType,
    renderDetail?.first_air_date,
    renderDetail?.name,
    renderDetail?.overview,
    renderDetail?.release_date,
    renderDetail?.title,
  ]);

  return (
    <div className="fixed inset-0 z-[999]" data-pm-detail-modal="true">
      <motion.div
        className={[
          "absolute inset-0",
          isUnderPersonOverlay
            ? "bg-transparent"
            : isOverSearchOverlay
              ? "bg-black/15"
              : "bg-black/70 backdrop-blur-[2px]",
        ].join(" ")}
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
        role="dialog"
        aria-modal="true"
        aria-label="콘텐츠 상세 정보"
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: closing ? 60 : 0, opacity: closing ? 0 : 1 }}
        transition={
          closing
            ? { duration: 0.18, ease: "easeInOut" }
            : { type: "spring", stiffness: 240, damping: 22, mass: 0.9 }
        }
        onAnimationComplete={() => {
          if (!closing) return;
          // 중첩 상세(시즌/시리즈)에서도 항상 루트 목적지로 복귀
          // - navigate(-1)은 이전 history가 또 다른 /title 인 경우 overlay가 남아 터치가 막힐 수 있음
          navigate(closeTarget.path, {
            replace: true,
            state: closeTarget.state ?? undefined,
          });
        }}
      >
        <div className="absolute right-4 top-4 z-40 flex items-center gap-2">
          {isAdmin ? (
            <button
              type="button"
              aria-label="컨텐츠 편집"
              onClick={openEditModal}
              className="w-10 h-10 rounded-full bg-black/35 hover:bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
            >
              <Pencil className="w-4 h-4" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="닫기"
            onClick={requestClose}
            className="w-10 h-10 rounded-full bg-black/35 hover:bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                hiddenBadge={Boolean(meta?.adminHidden)}
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
                style={{ height: "clamp(460px, 68vh, 720px)" }}
              />
            )}

            <ContentDetailBody
              key={`body:${renderKey}`}
              loading={loading || seasonLoading}
              detail={renderDetail}
              mediaType={mediaType}
              isAuthed={isAuthed}
              statusKindOverride={statusKind}
            />
          </DetailFavoritesProvider>
        </div>

        <AnimatePresence>
          {isAdmin && editOpen ? (
            <motion.div
              className="absolute inset-0 z-[90] bg-black/45 backdrop-blur-[2px] flex items-start justify-end p-4 sm:p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={() => setEditOpen(false)}
            >
              <motion.div
                className="w-full max-w-[520px] rounded-2xl bg-[#0f1118] shadow-2xl overflow-hidden"
                initial={{ opacity: 0, x: 24, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, y: 8, scale: 0.985 }}
                transition={{ type: "spring", stiffness: 360, damping: 32, mass: 0.9 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 flex items-center justify-between">
                  <h3 className="text-white font-bold text-base">컨텐츠 정보 편집</h3>
                  <button
                    type="button"
                    className="text-white/75 hover:text-white"
                    onClick={() => setEditOpen(false)}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form
                  id="admin-detail-edit-form"
                  className="p-4 space-y-3 max-h-[72vh] overflow-y-auto"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveAdminEdits();
                  }}
                >
                  <label className="block">
                    <div className="text-white/70 text-xs mb-1">제목</div>
                    <input
                      value={editForm.title}
                      onChange={(e) => {
                        clearFieldError("title");
                        setEditForm((p) => ({ ...p, title: e.target.value }));
                      }}
                      className="w-full h-10 rounded-xl bg-white/10 border-0 px-3 text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <div className="text-white/70 text-xs mb-1">원제</div>
                    <input
                      value={editForm.originalTitle}
                      onChange={(e) => {
                        clearFieldError("originalTitle");
                        setEditForm((p) => ({ ...p, originalTitle: e.target.value }));
                      }}
                      className="w-full h-10 rounded-xl bg-white/10 border-0 px-3 text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <div className="text-white/70 text-xs mb-1">줄거리</div>
                    <textarea
                      value={editForm.overview}
                      onChange={(e) => {
                        clearFieldError("overview");
                        setEditForm((p) => ({ ...p, overview: e.target.value }));
                      }}
                      className="w-full h-24 rounded-xl bg-white/10 border-0 px-3 py-2 text-white outline-none resize-none"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <div className="text-white/70 text-xs mb-1">개봉/방영일</div>
                      <input
                        type="date"
                        value={editForm.releaseDate}
                        onChange={(e) => {
                          clearFieldError("releaseDate");
                          setEditForm((p) => ({
                            ...p,
                            releaseDate: e.target.value,
                          }));
                        }}
                        className={[
                          "w-full h-10 rounded-xl bg-white/10 px-3 text-white outline-none",
                          fieldErrors.releaseDate
                            ? "border border-rose-400/90 ring-1 ring-rose-300/70"
                            : "border-0",
                          shakeField === "releaseDate" ? "pm-shake" : "",
                        ].join(" ")}
                      />
                    </label>
                    <label className="block">
                      <div className="text-white/70 text-xs mb-1">재개봉일</div>
                      <input
                        type="date"
                        value={editForm.rerunDate}
                        onChange={(e) => {
                          clearFieldError("rerunDate");
                          setEditForm((p) => ({
                            ...p,
                            rerunDate: e.target.value,
                          }));
                        }}
                        className={[
                          "w-full h-10 rounded-xl bg-white/10 px-3 text-white outline-none",
                          fieldErrors.rerunDate
                            ? "border border-rose-400/90 ring-1 ring-rose-300/70"
                            : "border-0",
                          shakeField === "rerunDate" ? "pm-shake" : "",
                        ].join(" ")}
                      />
                    </label>

                    <label className="block">
                      <div className="text-white/70 text-xs mb-1">러닝타임(분)</div>
                      <input
                        value={editForm.runtime}
                        onChange={(e) => {
                          clearFieldError("runtime");
                          setEditForm((p) => ({ ...p, runtime: e.target.value }));
                        }}
                        inputMode="numeric"
                        className={[
                          "w-full h-10 rounded-xl bg-white/10 px-3 text-white outline-none",
                          fieldErrors.runtime
                            ? "border border-rose-400/90 ring-1 ring-rose-300/70"
                            : "border-0",
                          shakeField === "runtime" ? "pm-shake" : "",
                        ].join(" ")}
                      />
                    </label>
                    <label className="block">
                      <div className="text-white/70 text-xs mb-1">컨텐츠 유형</div>
                      <div className="relative">
                        <select
                          value={editForm.contentKind}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, contentKind: e.target.value }))
                          }
                          className="w-full h-10 rounded-xl bg-white/10 border-0 pl-3 pr-10 text-white outline-none appearance-none"
                        >
                          <option value="MOVIE">MOVIE</option>
                          <option value="TV">TV</option>
                          <option value="ANI">ANI</option>
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                          <ChevronDown className="w-4 h-4 text-white/70" />
                        </span>
                      </div>
                    </label>

                    <label className="block">
                      <div className="text-white/70 text-xs mb-1">연령</div>
                      <div className="relative">
                        <select
                          value={editForm.ageRating}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, ageRating: e.target.value }))
                          }
                          className="w-full h-10 rounded-xl bg-white/10 border-0 pl-3 pr-10 text-white outline-none appearance-none"
                        >
                          <option value="ALL">ALL</option>
                          <option value="12">12</option>
                          <option value="15">15</option>
                          <option value="19">19</option>
                          <option value="UNKNOWN">UNKNOWN</option>
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                          <ChevronDown className="w-4 h-4 text-white/70" />
                        </span>
                      </div>
                    </label>
                    <label className="block">
                      <div className="text-white/70 text-xs mb-1">개봉여부</div>
                      <div className="relative">
                        <select
                          value={editForm.releaseStatus}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, releaseStatus: e.target.value }))
                          }
                          className="w-full h-10 rounded-xl bg-white/10 border-0 pl-3 pr-10 text-white outline-none appearance-none"
                        >
                          <option value="NOW_SHOWING">상영중</option>
                          <option value="UPCOMING">상영예정</option>
                          <option value="RE_RELEASE">재개봉</option>
                          <option value="NONE">해당없음</option>
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                          <ChevronDown className="w-4 h-4 text-white/70" />
                        </span>
                      </div>
                    </label>

                    <div className="block">
                      <div className="text-white/70 text-xs mb-1">출시년도</div>
                      <div ref={heroYearMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setYearMenuOpen((v) => (v === "hero" ? null : "hero"))
                          }
                          className={[
                            "w-full h-10 rounded-xl bg-white/10 pl-3 pr-10 text-white text-left",
                            fieldErrors.heroReleaseYear
                              ? "border border-rose-400/90 ring-1 ring-rose-300/70"
                              : "border-0",
                            shakeField === "heroReleaseYear" ? "pm-shake" : "",
                          ].join(" ")}
                        >
                          {editForm.heroReleaseYear || "선택 안함"}
                        </button>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                          <ChevronDown className="w-4 h-4 text-white/70" />
                        </span>

                        {yearMenuOpen === "hero" ? (
                          <div
                            className="absolute bottom-full z-[120] mb-1 w-full max-h-48 overflow-y-auto rounded-xl bg-[#151a24] shadow-lg"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearFieldError("heroReleaseYear");
                                setEditForm((p) => ({ ...p, heroReleaseYear: "" }));
                                setYearMenuOpen(null);
                              }}
                            >
                              선택 안함
                            </button>
                            {releaseYearOptions.map((y) => (
                              <button
                                key={y}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  clearFieldError("heroReleaseYear");
                                  setEditForm((p) => ({ ...p, heroReleaseYear: y }));
                                  setYearMenuOpen(null);
                                }}
                              >
                                {y}년
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="block">
                      <div className="text-white/70 text-xs mb-1">출시년도(컨텐츠 정보)</div>
                      <div ref={infoYearMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setYearMenuOpen((v) => (v === "info" ? null : "info"))
                          }
                          className={[
                            "w-full h-10 rounded-xl bg-white/10 pl-3 pr-10 text-white text-left",
                            fieldErrors.contentInfoReleaseYear
                              ? "border border-rose-400/90 ring-1 ring-rose-300/70"
                              : "border-0",
                            shakeField === "contentInfoReleaseYear" ? "pm-shake" : "",
                          ].join(" ")}
                        >
                          {editForm.contentInfoReleaseYear || "선택 안함"}
                        </button>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                          <ChevronDown className="w-4 h-4 text-white/70" />
                        </span>

                        {yearMenuOpen === "info" ? (
                          <div
                            className="absolute bottom-full z-[120] mb-1 w-full max-h-48 overflow-y-auto rounded-xl bg-[#151a24] shadow-lg"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearFieldError("contentInfoReleaseYear");
                                setEditForm((p) => ({
                                  ...p,
                                  contentInfoReleaseYear: "",
                                }));
                                setYearMenuOpen(null);
                              }}
                            >
                              선택 안함
                            </button>
                            {releaseYearOptions.map((y) => (
                              <button
                                key={`info:${y}`}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  clearFieldError("contentInfoReleaseYear");
                                  setEditForm((p) => ({
                                    ...p,
                                    contentInfoReleaseYear: y,
                                  }));
                                  setYearMenuOpen(null);
                                }}
                              >
                                {y}년
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </form>

                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-h-[20px] text-sm text-red-300">
                    {editError ?? ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditForm((p) => ({
                          ...p,
                          forceHidden: !p.forceHidden,
                        }))
                      }
                      className={[
                        "h-10 px-4 rounded-xl text-white whitespace-nowrap",
                        editForm.forceHidden
                          ? "bg-emerald-600/80"
                          : "bg-rose-600/80",
                      ].join(" ")}
                      disabled={editSaving}
                    >
                      {editForm.forceHidden ? "노출" : "비노출"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetConfirmOpen(true)}
                      className="h-10 px-4 rounded-xl bg-white/10 text-white whitespace-nowrap"
                      disabled={editSaving}
                    >
                      초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditOpen(false)}
                      className="h-10 px-4 rounded-xl bg-white/10 text-white whitespace-nowrap"
                      disabled={editSaving}
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      form="admin-detail-edit-form"
                      className="h-10 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 text-white font-semibold disabled:opacity-60 whitespace-nowrap"
                      disabled={editSaving}
                    >
                      {editSaving ? "저장 중..." : "저장"}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {resetConfirmOpen ? (
                    <motion.div
                      className="absolute inset-0 z-[130] bg-black/55 flex items-center justify-center p-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14, ease: "easeOut" }}
                    >
                      <motion.div
                        className="w-full max-w-[360px] rounded-2xl bg-[#151a24] p-4"
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 14, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                        <h4 className="text-white font-bold text-base">
                          초기화 하시겠습니까?
                        </h4>
                        <p className="mt-2 text-sm text-white/70">
                          초기화 시 초기값으로 돌아가게 됩니다.
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            type="button"
                            className="h-9 px-4 rounded-lg bg-white/10 text-white"
                            onClick={() => setResetConfirmOpen(false)}
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            className="h-9 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold"
                            onClick={() => void resetToTmdbDefaults()}
                            disabled={editSaving}
                          >
                            확인
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <style>{`
        @keyframes pm-shake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
          100% { transform: translateX(0); }
        }
        .pm-shake {
          animation: pm-shake 0.28s ease-in-out;
        }
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
