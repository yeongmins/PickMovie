// frontend/src/pages/Search.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search as SearchIcon,
  X,
  Loader2,
  Check,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { ApiError, apiGet, apiPost } from "../lib/apiClient";
import { AUTH_KEYS, dispatchAuthChanged, openAuthModal } from "../lib/auth";
import { requestResolvedMetaBatch } from "../lib/metaClient";

// 서버가 추론/확장/랭킹 전담 -> 프론트는 검색 호출 + 결과 렌더
import { useSearch } from "../features/search/hooks/useSearch";
import type { ResultItem } from "../features/search/api/searchApi";

import { ContentCard } from "../components/content/ContentCard";

export type SearchPageProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  favorites: Array<{ id: number; mediaType: "movie" | "tv" }>;
  onToggleFavorite: (id: number, mediaType: "movie" | "tv") => void;
  onCreatePlaylist?: (
    name: string,
    items: PlaylistItemPayload[],
  ) => Promise<void> | void;
};

type ViewMode = "start" | "results";
type PlaylistItemPayload = { id: number; mediaType: "movie" | "tv" };
type PopularSearchContentItem = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  count: number;
  updatedAt: string;
};

const EXIT_MS = 260;

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

function locationToPath(loc: any): string | null {
  if (!loc || typeof loc !== "object") return null;
  const pathname =
    typeof loc.pathname === "string" && loc.pathname ? loc.pathname : null;
  if (!pathname) return null;
  const search = typeof loc.search === "string" ? loc.search : "";
  const hash = typeof loc.hash === "string" ? loc.hash : "";
  return `${pathname}${search}${hash}`;
}

function isAuthedLocal() {
  try {
    return (
      !!localStorage.getItem("pickmovie_access_token") ||
      !!localStorage.getItem("pickmovie_user")
    );
  } catch {
    return false;
  }
}

function isAdminLocal() {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.USER);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { role?: string | null };
    return String(parsed?.role ?? "").toUpperCase() === "ADMIN";
  } catch {
    return false;
  }
}

const DEFAULT_SENSITIVE_QUERY_KEYWORDS = [
  "성인물",
  "성인 영상",
  "음란",
  "노출",
  "섹스",
  "야동",
  "포르노",
  "자위",
  "강간",
  "씨발",
  "시발",
  "병신",
  "좆",
  "fuck",
  "bitch",
  "asshole",
  "porn",
  "sex",
  "nsfw",
];

function hasSensitiveQuery(raw: string, keywords: string[]): boolean {
  const q = String(raw || "").toLowerCase().trim();
  if (!q) return false;
  return keywords.some((keyword) => q.includes(String(keyword).toLowerCase()));
}

function toPlaylistPayload(items: ResultItem[]): PlaylistItemPayload[] {
  const uniq = new Map<string, PlaylistItemPayload>();

  for (const it of items) {
    const id = Number(it?.id);
    if (!Number.isFinite(id) || id <= 0) continue;

    const mt: "movie" | "tv" =
      it?.media_type === "tv"
        ? "tv"
        : it?.media_type === "movie"
          ? "movie"
          : it?.first_air_date
            ? "tv"
            : "movie";

    uniq.set(`${mt}:${id}`, { id, mediaType: mt });
  }

  return Array.from(uniq.values());
}

function getResultMediaType(item: ResultItem): "movie" | "tv" {
  return item?.media_type === "tv"
    ? "tv"
    : item?.media_type === "movie"
      ? "movie"
      : item?.first_air_date
        ? "tv"
        : "movie";
}

function getResultTitle(item: ResultItem): string {
  return String(item?.title ?? item?.name ?? "").trim();
}

export default function Search({
  searchQuery,
  onSearchChange,
  favorites,
  onToggleFavorite,
  onCreatePlaylist,
}: SearchPageProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });

  const [closing, setClosing] = useState(false);
  const [mode, setMode] = useState<ViewMode>("start");

  // 실시간 검색 차트
  const [liveChartItems, setLiveChartItems] = useState<PopularSearchContentItem[]>([]);
  const [liveChartLoading, setLiveChartLoading] = useState(false);
  const [trendFetchedAt, setTrendFetchedAt] = useState<Date | null>(null);

  const {
    loading: searchLoading,
    error: searchError,
    hasSearched,
    tags,
    results,
    search,
    clear,
    cancel,
  } = useSearch();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState<Record<string, ResultItem>>({});
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistSubmitting, setPlaylistSubmitting] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [playlistNotice, setPlaylistNotice] = useState<string | null>(null);
  const [isRefreshingChart, setIsRefreshingChart] = useState(false);
  const [sensitiveKeywords, setSensitiveKeywords] = useState<string[]>(
    DEFAULT_SENSITIVE_QUERY_KEYWORDS,
  );
  const isAuthed = isAuthedLocal();
  const isAdmin = isAdminLocal();
  const showSensitiveWarning = useMemo(
    () => !isAdmin && hasSensitiveQuery(searchQuery, sensitiveKeywords),
    [isAdmin, searchQuery, sensitiveKeywords],
  );

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const isDetailOverlayOpen = useCallback(() => {
    if (typeof document === "undefined") return false;
    return !!document.querySelector('[data-pm-detail-modal="true"]');
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsTablet(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const unlock = lockBodyScroll();
    requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => {
      unlock();
    };
  }, []);

  const loadLiveChart = useCallback(async () => {
    setLiveChartLoading(true);
    try {
      const res = await apiGet<{
        items?: Array<{
          tmdbId: number;
          mediaType: string;
          title: string;
          count: number;
          updatedAt: string;
        }>;
      }>("/search/popular-contents", { limit: 10 });

      const normalized = (Array.isArray(res?.items) ? res.items : [])
        .map((it) => ({
          tmdbId: Number(it?.tmdbId),
          mediaType:
            String(it?.mediaType ?? "").toLowerCase() === "tv"
              ? ("tv" as const)
              : ("movie" as const),
          title: String(it?.title ?? "").trim(),
          count: Number(it?.count ?? 0),
          updatedAt: String(it?.updatedAt ?? ""),
        }))
        .filter(
          (it) =>
            Number.isFinite(it.tmdbId) &&
            it.tmdbId > 0 &&
            !!it.title &&
            Number.isFinite(it.count) &&
            it.count > 0,
        )
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        })
        .slice(0, 10);
      setLiveChartItems(normalized);
      setTrendFetchedAt(new Date());
    } catch {
      setLiveChartItems([]);
      setTrendFetchedAt(new Date());
    } finally {
      setLiveChartLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLiveChart();
  }, [loadLiveChart]);

  useEffect(() => {
    let alive = true;
    void apiGet<{ keywords?: string[] }>("/search/policy")
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.keywords)
          ? res.keywords
              .map((x) => String(x ?? "").trim().toLowerCase())
              .filter(Boolean)
          : [];
        if (list.length > 0) setSensitiveKeywords(list);
      })
      .catch(() => {
        // keep default policy when API is unavailable
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadLiveChart();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [loadLiveChart]);

  const overlayRootLocation = useMemo(() => {
    const st = location.state as any;
    return st?.rootLocation ?? st?.backgroundLocation ?? null;
  }, [location.state]);

  const closeTargetPath = useMemo(() => {
    return locationToPath(overlayRootLocation) ?? null;
  }, [overlayRootLocation]);

  const doNavigateClose = useCallback(() => {
    if (closeTargetPath) {
      navigate(closeTargetPath, { replace: true });
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate("/", { replace: true });
  }, [closeTargetPath, navigate]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  useEffect(() => {
    if (!closing) return;
    cancel();
    const t = window.setTimeout(() => doNavigateClose(), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing, doNavigateClose, cancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isDetailOverlayOpen()) return;
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose, isDetailOverlayOpen]);

  const onRootMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (isDetailOverlayOpen()) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current && panelRef.current.contains(t)) return;
      requestClose();
    },
    [requestClose, isDetailOverlayOpen],
  );

  const refreshLiveChart = useCallback(() => {
    setIsRefreshingChart(true);
    void loadLiveChart().finally(() => {
      setIsRefreshingChart(false);
    });
  }, [loadLiveChart]);

  useEffect(() => {
    const q = (searchQuery || "").trim();
    if (!q) {
      setMode("start");
      clear();
      setSelectionMode(false);
      setSelectedMap({});
    }
  }, [searchQuery, clear]);

  useEffect(() => {
    const q = (searchQuery || "").trim();
    if (!q) return;
    if (!hasSearched) return;
    setMode("results");
  }, [searchQuery, hasSearched]);

  useEffect(() => {
    if (!selectionMode) return;

    const validKeys = new Set(
      results.map((it) => {
        const mt = it?.media_type === "tv" ? "tv" : "movie";
        return `${mt}:${Number(it.id)}`;
      }),
    );

    setSelectedMap((prev) => {
      const next: Record<string, ResultItem> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (validKeys.has(k)) next[k] = v;
      }
      return next;
    });
  }, [selectionMode, results]);

  const executeSearch = useCallback(
    async (q: string) => {
      const query = (q || "").trim();
      if (!query || searchLoading) return;

      setMode("results");
      setSelectionMode(false);
      setSelectedMap({});
      setPlaylistModalOpen(false);
      setPlaylistName("");
      setPlaylistError(null);
      await search(query);
    },
    [search, searchLoading],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void executeSearch(searchQuery);
    },
    [executeSearch, searchQuery],
  );

  const clearQuery = useCallback(() => {
    onSearchChange("");
    setPlaylistNotice(null);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [onSearchChange]);

  const openContentDetail = useCallback(
    (item: ResultItem) => {
      const id = Number(item?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const mt = getResultMediaType(item);
      const title = getResultTitle(item);
      if (title)
        void apiPost<{ ok: true }>("/search/popular-contents/hit", {
          tmdbId: id,
          mediaType: mt,
          title,
        })
          .then(() => loadLiveChart())
          .catch(() => {});

      navigate(`/title/${mt}/${id}`, {
        state: { backgroundLocation: location },
      });
    },
    [navigate, location, loadLiveChart],
  );

  const onPickChartContent = useCallback(
    (item: PopularSearchContentItem) => {
      navigate(`/title/${item.mediaType}/${item.tmdbId}`, {
        state: { backgroundLocation: location },
      });
    },
    [navigate, location],
  );

  const favoritesKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const f of favorites || []) {
      const id = Number(f?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const mt = f?.mediaType === "tv" ? "tv" : "movie";
      set.add(`${mt}:${id}`);
    }
    return set;
  }, [favorites]);

  const selectedCount = useMemo(() => Object.keys(selectedMap).length, [selectedMap]);

  const toggleResultSelect = useCallback((item: ResultItem) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) return;

    const mt: "movie" | "tv" =
      item?.media_type === "tv"
        ? "tv"
        : item?.media_type === "movie"
          ? "movie"
          : item?.first_air_date
            ? "tv"
            : "movie";

    const key = `${mt}:${id}`;

    setSelectedMap((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: item };
    });
  }, []);

  const enterSelectionMode = useCallback(() => {
    if (!isAuthed) return;
    setSelectionMode(true);
    setPlaylistNotice(null);
    setPlaylistError(null);
  }, [isAuthed]);

  const cancelSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMap({});
    setPlaylistModalOpen(false);
    setPlaylistName("");
    setPlaylistError(null);
  }, []);

  const openPlaylistModal = useCallback(() => {
    if (!isAuthedLocal()) {
      openAuthModal("login");
      return;
    }

    if (selectedCount === 0) {
      setPlaylistError("추가할 콘텐츠를 먼저 선택해 주세요.");
      return;
    }

    setPlaylistError(null);
    setPlaylistModalOpen(true);
  }, [selectedCount]);

  const createPlaylistFromSelected = useCallback(async () => {
    const trimmed = playlistName.trim();
    if (!trimmed) {
      setPlaylistError("플레이리스트 이름을 입력해 주세요.");
      return;
    }

    const payloadItems = toPlaylistPayload(Object.values(selectedMap));
    if (payloadItems.length === 0) {
      setPlaylistError("선택한 콘텐츠 정보가 올바르지 않습니다.");
      return;
    }

    setPlaylistSubmitting(true);
    setPlaylistError(null);

    try {
      if (onCreatePlaylist) {
        await Promise.resolve(onCreatePlaylist(trimmed, payloadItems));
      } else {
        await apiPost("/auth/playlists/create", {
          name: trimmed,
          items: payloadItems,
        });
      }

      setPlaylistModalOpen(false);
      setPlaylistName("");
      setSelectionMode(false);
      setSelectedMap({});
      setPlaylistNotice(`플레이리스트 \"${trimmed}\"가 생성되었습니다.`);
    } catch (e: any) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        try {
          const refreshed = await apiPost<{ accessToken?: string | null }>(
            "/auth/refresh",
            {},
          );
          const newToken = String(refreshed?.accessToken || "").trim();

          if (newToken) {
            localStorage.setItem(AUTH_KEYS.ACCESS, newToken);
            dispatchAuthChanged();

            await apiPost("/auth/playlists/create", {
              name: trimmed,
              items: payloadItems,
            });

            setPlaylistModalOpen(false);
            setPlaylistName("");
            setSelectionMode(false);
            setSelectedMap({});
            setPlaylistNotice(`플레이리스트 \"${trimmed}\"가 생성되었습니다.`);
            return;
          }
        } catch {
          // ignore and fall through to user-facing error
        }
      }

      const msg =
        typeof e?.message === "string" && e.message.trim()
          ? e.message
          : "플레이리스트 생성에 실패했습니다.";
      setPlaylistError(msg);
    } finally {
      setPlaylistSubmitting(false);
    }
  }, [playlistName, selectedMap, onCreatePlaylist]);

  const goPlaylists = useCallback(() => {
    navigate("/favorites", {
      state: { initialView: "playlists", scrollToTop: true },
    });
  }, [navigate]);

  const containerClass = useMemo(() => {
    const base = ["mx-auto w-full", isTablet ? "px-4 pt-4" : "px-4 pt-6"].join(
      " ",
    );
    if (isTablet) return base;
    return [base, mode === "results" ? "max-w-[1180px]" : "max-w-[650px]"].join(
      " ",
    );
  }, [isTablet, mode]);

  const panelAnimate = useMemo(() => {
    if (closing) {
      return { opacity: 0, y: -10, scale: 0.985, filter: "blur(10px)" };
    }
    return { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" };
  }, [closing, mode]);

  const overlayAnimate = useMemo(() => {
    return closing ? { opacity: 0 } : { opacity: 1 };
  }, [closing]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={overlayAnimate}
      transition={{
        duration: closing ? 0.26 : 0.16,
        ease: closing ? "easeInOut" : "easeOut",
      }}
      className="fixed inset-0 z-[60] overscroll-none"
      aria-modal="true"
      role="dialog"
    >
      <motion.div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{
          duration: closing ? 0.26 : 0.16,
          ease: closing ? "easeInOut" : "easeOut",
        }}
      />

      <div className="relative w-full h-full" onMouseDown={onRootMouseDown}>
        <motion.div
          layout
          transition={{
            type: "spring",
            stiffness: 360,
            damping: 34,
            mass: 0.8,
          }}
          className={containerClass}
        >
          <div ref={panelRef}>
            <div className="h-12 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center gap-2 px-3">
              <button
                type="button"
                onClick={requestClose}
                className="h-9 w-9 rounded-xl hover:bg-white/10 transition flex items-center justify-center text-white/85"
                aria-label="닫기"
              >
                <span className="text-xl leading-none">←</span>
              </button>

              <form onSubmit={onSubmit} className="flex-1 flex items-center">
                <input
                  ref={searchInputRef}
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="작품명을 검색해보세요"
                  className="flex-1 bg-transparent outline-none text-white placeholder-white/50 text-sm"
                />

                {(searchQuery || "").trim().length > 0 && (
                  <button
                    type="button"
                    onClick={clearQuery}
                    onMouseDown={(e) => e.preventDefault()}
                    className="ml-2 h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center text-white/70 hover:text-white/90"
                    aria-label="검색어 전체 지우기"
                    title="전체 지우기"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                <button
                  type="submit"
                  className="ml-2 h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center text-white/85"
                  aria-label="검색 실행"
                >
                  <SearchIcon className="h-5 w-5" />
                </button>
              </form>
            </div>

            <div className={isTablet ? "pt-4 pb-6" : "pt-5 pb-8"}>
              <motion.div
                layout={mode === "results"}
                animate={panelAnimate}
                transition={{
                  layout: {
                    type: "spring",
                    stiffness: 360,
                    damping: 34,
                    mass: 0.8,
                  },
                  opacity: { duration: 0.22, ease: "easeOut" },
                  y: { duration: 0.22, ease: "easeOut" },
                  scale: { duration: 0.34, ease: "easeOut" },
                  filter: { duration: 0.34, ease: "easeOut" },
                }}
                style={{ willChange: "transform, filter" }}
                className="rounded-xl bg-white/5 backdrop-blur-xl overflow-hidden"
              >
                {mode === "start" ? (
                  <StartPanel
                    items={liveChartItems}
                    loading={liveChartLoading}
                    refreshing={isRefreshingChart}
                    trendFetchedAt={trendFetchedAt}
                    onRefresh={refreshLiveChart}
                    onPickContent={onPickChartContent}
                  />
                ) : (
                  <ResultsPanel
                    title="검색 결과"
                    query={(searchQuery || "").trim()}
                    isAuthed={isAuthed}
                    isAdmin={isAdmin}
                    loading={searchLoading}
                    error={searchError}
                    tags={tags}
                    results={results}
                    isTablet={isTablet}
                    onOpenDetail={openContentDetail}
                    selectionMode={selectionMode}
                    selectedMap={selectedMap}
                    onToggleSelect={toggleResultSelect}
                    onEnterSelectionMode={enterSelectionMode}
                    onCancelSelectionMode={cancelSelectionMode}
                    onOpenPlaylistModal={openPlaylistModal}
                    playlistModalOpen={playlistModalOpen}
                    playlistName={playlistName}
                    playlistSubmitting={playlistSubmitting}
                    playlistError={playlistError}
                    playlistNotice={playlistNotice}
                    selectedCount={selectedCount}
                    favoritesKeySet={favoritesKeySet}
                    onToggleFavorite={onToggleFavorite}
                    onChangePlaylistName={setPlaylistName}
                    onClosePlaylistModal={() => {
                      setPlaylistModalOpen(false);
                      setPlaylistError(null);
                    }}
                    onCreatePlaylist={createPlaylistFromSelected}
                    onGoPlaylists={goPlaylists}
                    showSensitiveWarning={showSensitiveWarning}
                  />
                )}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function StartPanel({
  items,
  loading,
  refreshing,
  trendFetchedAt,
  onRefresh,
  onPickContent,
}: {
  items: PopularSearchContentItem[];
  loading: boolean;
  refreshing: boolean;
  trendFetchedAt: Date | null;
  onRefresh: () => void;
  onPickContent: (item: PopularSearchContentItem) => void;
}) {
  const timePart = trendFetchedAt
    ? trendFetchedAt.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";
  const isCollecting = items.length < 10;

  return (
    <div className="p-3 mb-1">
      <div className="flex items-center justify-between px-1">
        <div>
          <div className="text-sm font-semibold text-white/90">실시간 인기 검색 컨텐츠</div>
          {timePart ? (
            <div className="mt-1 text-xs text-white/45">
              {timePart} 기준
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/85 transition flex items-center gap-2 disabled:opacity-70"
          aria-label="차트 새로고침"
          title="차트 새로고침"
          disabled={loading}
        >
          <RefreshCcw
            className={`w-4 h-4 ${loading || refreshing ? "animate-spin" : ""}`}
          />
          새로고침
        </button>
      </div>

      <div className="mt-4">
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-sm text-white/70">
            <RefreshCcw className="h-6 w-6 text-white/60 animate-spin" />
            <div className="mt-3">로딩중입니다</div>
          </div>
        ) : isCollecting ? (
          <div className="py-14 px-3">
            <div className="mx-auto max-w-[560px] rounded-2xl border border-sky-300/35 bg-[linear-gradient(180deg,rgba(22,28,40,0.94),rgba(12,16,24,0.96))] px-6 py-7 text-center shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur">
              <p className="text-base font-semibold text-sky-100">
                실시간 검색 데이터를 수집중입니다
              </p>
              <p className="mt-2 text-sm text-sky-100/70">
                인기 컨텐츠 Top 10이 집계되면 순위를 보여드릴게요.
              </p>
            </div>
          </div>
        ) : (
          <ol className="px-2 mt-1 space-y-2">
            {items.map((item, idx) => (
              <li key={`chart-${item.mediaType}-${item.tmdbId}`}>
                <button
                  type="button"
                  onClick={() => onPickContent(item)}
                  className="w-full text-left flex items-center gap-2 text-base font-semibold leading-snug text-white/90 hover:text-white transition-colors"
                >
                  <span className="shrink-0 tabular-nums text-center min-w-[2ch]">
                    {idx + 1}
                  </span>
                  <span className="truncate">{item.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ResultsPanel({
  title,
  query,
  isAuthed,
  isAdmin,
  loading,
  error,
  tags,
  results,
  isTablet,
  onOpenDetail,
  selectionMode,
  selectedMap,
  onToggleSelect,
  onEnterSelectionMode,
  onCancelSelectionMode,
  onOpenPlaylistModal,
  playlistModalOpen,
  playlistName,
  playlistSubmitting,
  playlistError,
  playlistNotice,
  selectedCount,
  favoritesKeySet,
  onToggleFavorite,
  onChangePlaylistName,
  onClosePlaylistModal,
  onCreatePlaylist,
  onGoPlaylists,
  showSensitiveWarning,
}: {
  title: string;
  query: string;
  isAuthed: boolean;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  tags: string[];
  results: ResultItem[];
  isTablet: boolean;
  onOpenDetail: (item: ResultItem) => void;
  selectionMode: boolean;
  selectedMap: Record<string, ResultItem>;
  onToggleSelect: (item: ResultItem) => void;
  onEnterSelectionMode: () => void;
  onCancelSelectionMode: () => void;
  onOpenPlaylistModal: () => void;
  playlistModalOpen: boolean;
  playlistName: string;
  playlistSubmitting: boolean;
  playlistError: string | null;
  playlistNotice: string | null;
  selectedCount: number;
  favoritesKeySet: Set<string>;
  onToggleFavorite: (id: number, mediaType: "movie" | "tv") => void;
  onChangePlaylistName: (v: string) => void;
  onClosePlaylistModal: () => void;
  onCreatePlaylist: () => void;
  onGoPlaylists: () => void;
  showSensitiveWarning: boolean;
}) {
  const cardsGridClass =
    "grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(200px,200px))]";
  const [adminHiddenKeys, setAdminHiddenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    if (isAdmin) {
      setAdminHiddenKeys(new Set());
      return;
    }

    const load = async () => {
      const reqs = results
        .map((item) => {
          const mt: "movie" | "tv" =
            item?.media_type === "tv"
              ? "tv"
              : item?.media_type === "movie"
                ? "movie"
                : item?.first_air_date
                  ? "tv"
                  : "movie";
          const id = Number(item?.id);
          if (!Number.isFinite(id) || id <= 0) return null;
          return { mediaType: mt, tmdbId: id };
        })
        .filter(Boolean) as Array<{ mediaType: "movie" | "tv"; tmdbId: number }>;

      if (reqs.length === 0) {
        if (alive) setAdminHiddenKeys(new Set());
        return;
      }

      try {
        const metas = await requestResolvedMetaBatch(reqs);
        if (!alive) return;
        const hidden = new Set<string>();
        for (const m of metas) {
          if (!m?.adminHidden) continue;
          hidden.add(`${m.mediaType}:${m.tmdbId}`);
        }
        setAdminHiddenKeys(hidden);
      } catch {
        if (!alive) return;
        setAdminHiddenKeys(new Set());
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [results, isAdmin]);

  const visibleResults = useMemo(() => {
    if (showSensitiveWarning) return [];
    if (isAdmin) return results;
    return results.filter((item) => {
      const mt: "movie" | "tv" =
        item?.media_type === "tv"
          ? "tv"
          : item?.media_type === "movie"
            ? "movie"
            : item?.first_air_date
              ? "tv"
              : "movie";
      const id = Number(item?.id);
      if (!Number.isFinite(id) || id <= 0) return false;
      return !adminHiddenKeys.has(`${mt}:${id}`);
    });
  }, [results, adminHiddenKeys, showSensitiveWarning, isAdmin]);

  return (
    <div className="p-3 relative">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-semibold text-white/90">{title}</div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="text-[11px] text-white/60">
            입력한 검색어
          </div>
          <div className="mt-1 text-base font-semibold text-white/95">
            {query ? query : "검색 결과"}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!selectionMode ? (
            <button
              type="button"
              onClick={onEnterSelectionMode}
              disabled={!isAuthed}
              className={[
                "h-9 px-3 rounded-xl text-xs transition inline-flex items-center gap-2",
                isAuthed
                  ? "bg-white/10 hover:bg-white/15 text-white/90"
                  : "bg-white/5 text-white/45 cursor-not-allowed",
              ].join(" ")}
              aria-label="플레이리스트 추가 모드 시작"
              title={
                isAuthed
                  ? "플레이리스트 추가 모드 시작"
                  : "플레이리스트 추가는 로그인 후 가능합니다"
              }
            >
              <Plus className="h-4 w-4" />
              {isAuthed ? "플레이리스트 추가" : "로그인 후 플레이리스트 추가"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancelSelectionMode}
              className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/90 transition"
              aria-label="선택 취소"
            >
              선택 취소
            </button>
          )}

          {playlistNotice ? (
            <button
              type="button"
              onClick={onGoPlaylists}
              className="h-9 px-3 rounded-xl bg-white text-black hover:bg-white/90 text-xs font-semibold transition"
            >
              플레이리스트 이동
            </button>
          ) : null}
        </div>
      </div>

      {tags.length > 0 && !loading && (
        <div className="mt-3 px-1 flex flex-wrap gap-2">
          {tags.slice(0, 10).map((t) => (
            <span
              key={t}
              className="text-[11px] text-white/70 bg-white/10 rounded-full px-3 py-1"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {playlistNotice ? (
        <div className="mt-3 px-1 flex items-center justify-between gap-3">
          <div className="text-xs text-emerald-300/95">{playlistNotice}</div>
        </div>
      ) : null}

      {selectionMode ? (
        <div className="mt-3 mx-1 rounded-xl bg-white/10 px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-xs text-white/75">
            카드를 선택하고 플레이리스트에 추가하세요.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 px-3 rounded-lg bg-emerald-300/15 text-emerald-100 text-xs font-semibold inline-flex items-center">
              {selectedCount}개 선택
            </div>
            <button
              type="button"
              onClick={onOpenPlaylistModal}
              className="h-8 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-xs font-semibold transition"
            >
              플레이리스트 추가
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={[
          "relative mt-6 pb-6",
          isTablet ? "max-h-[62vh]" : "max-h-[68vh]",
          "overflow-y-auto pr-1",
        ].join(" ")}
      >
        {loading ? (
          <div className="py-10 flex flex-col items-center justify-center text-sm text-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            <div className="mt-3">검색 결과를 찾는 중이에요…</div>
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-white/55">
            검색 중 문제가 발생했어요.
            <div className="mt-2 text-xs text-white/40">{error}</div>
          </div>
        ) : visibleResults.length === 0 ? (
          showSensitiveWarning ? (
            <div className="py-10 px-4">
              <div className="mx-auto max-w-[560px] rounded-2xl border border-amber-300/45 bg-[linear-gradient(180deg,rgba(18,18,24,0.94),rgba(11,11,16,0.96))] px-5 py-4 text-center shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur">
                <p className="text-base font-semibold text-amber-200">
                  검색할 수 없는 검색어입니다.
                </p>
                <p className="mt-1 text-sm text-amber-100/90">
                  다른 검색어를 입력해 주세요.
                </p>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-white/55">
              검색 결과를 찾지 못했어요.
              <br />
              검색어를 조금 더 구체적으로 입력해보세요.
            </div>
          )
        ) : (
          <div className={`${cardsGridClass} mb-4`}>
            {visibleResults.map((item) => {
              const mt: "movie" | "tv" =
                item?.media_type === "tv"
                  ? "tv"
                  : item?.media_type === "movie"
                    ? "movie"
                    : item?.first_air_date
                      ? "tv"
                      : "movie";
              const key = `${mt}:${Number(item.id)}`;
              const isSelected = !!selectedMap[key];

              return (
                <div key={`${item.media_type}:${item.id}`} className="relative w-[200px]">
                  <ContentCard
                    item={item as any}
                    isFavorite={favoritesKeySet.has(key)}
                    onToggleFavorite={() => onToggleFavorite(Number(item.id), mt)}
                    onClick={() => {
                      if (selectionMode) {
                        onToggleSelect(item);
                        return;
                      }
                      onOpenDetail(item);
                    }}
                    context="search"
                    canFavorite={isAuthed && !selectionMode}
                    ignoreAdminHidden={isAdmin}
                  />

                  {selectionMode ? (
                    <div className="absolute right-2 top-2 z-30 pointer-events-none">
                      <div
                        className={[
                          "h-7 w-7 rounded-full flex items-center justify-center",
                          isSelected
                            ? "bg-white text-black"
                            : "bg-black/35 text-white",
                        ].join(" ")}
                      >
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

      </div>

      <AnimatePresence>
        {playlistModalOpen ? (
          <>
            <motion.div
              className="fixed inset-0 z-[79] bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={onClosePlaylistModal}
            />

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.99 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed left-0 right-0 z-[80] px-4"
              style={{ bottom: 72 }}
            >
              <div className="mx-auto w-full max-w-[380px] rounded-2xl bg-[#0b0b10]/95 shadow-2xl backdrop-blur p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-white/90">플레이리스트 생성</div>
                    <div className="mt-1 text-[11px] text-white/60">
                      선택한 콘텐츠를 새 플레이리스트로 저장합니다.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-[11px]"
                    onClick={onClosePlaylistModal}
                  >
                    닫기
                  </button>
                </div>

                <div className="mt-3">
                  <label htmlFor="playlist-name" className="text-[11px] text-white/60">
                    플레이리스트명
                  </label>
                  <input
                    id="playlist-name"
                    value={playlistName}
                    onChange={(e) => onChangePlaylistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (playlistSubmitting) return;
                      onCreatePlaylist();
                    }}
                    placeholder="예: 오늘 볼 작품"
                    className="mt-1.5 w-full h-10 rounded-lg bg-black/35 px-3 text-sm font-semibold text-white/95 placeholder:text-white/35 outline-none caret-white"
                    maxLength={40}
                    autoFocus
                  />
                </div>

                {playlistError ? (
                  <div className="mt-3 text-xs text-rose-300">{playlistError}</div>
                ) : null}

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClosePlaylistModal}
                    className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] text-white/85"
                    disabled={playlistSubmitting}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={onCreatePlaylist}
                    className="h-8 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-[11px] font-semibold inline-flex items-center gap-2"
                    disabled={playlistSubmitting}
                  >
                    {playlistSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    플레이리스트 생성
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
