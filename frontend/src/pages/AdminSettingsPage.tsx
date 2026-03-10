import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  EyeOff,
  FileText,
  Search,
  Sparkles,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Header } from "../components/layout/Header";
import { PageFooter } from "../components/layout/Footer";
import { AUTH_KEYS, openAuthModal } from "../lib/auth";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../lib/apiClient";
import { setResolvedMetaCache } from "../lib/metaClient";
import { getContentDetails } from "../lib/tmdb";
import {
  ContentCard,
  type ContentCardItem,
  type MediaType,
} from "../components/content/ContentCard";

type StoredUser = {
  id: number;
  username: string;
  nickname: string | null;
  role?: string | null;
};

type OverrideItem = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  contentKind?: string | null;
  overrideTitle?: string | null;
  overrideOriginalTitle?: string | null;
  forceHidden: boolean;
  hasDetailEdits: boolean;
  hasMetaEdits: boolean;
  updatedAt: string;
};

type OverridesResponse = {
  items?: OverrideItem[];
  summary?: {
    total: number;
    hiddenCount: number;
    editedCount: number;
  };
};

type AdminCardItem = ContentCardItem & {
  __override: OverrideItem;
};

type AnalyzeStats = {
  total: number;
  authedCount: number;
  guestCount: number;
  uniqueVisitors: number;
  last7DaysCount: number;
  topGenres: Array<{ name: string; count: number }>;
  topMoods: Array<{ name: string; count: number }>;
  topExcludes: Array<{ name: string; count: number }>;
  topCountries: Array<{ name: string; count: number }>;
  topRuntimes: Array<{ name: string; count: number }>;
  topReleaseYears: Array<{ name: string; count: number }>;
};

type AnalyzeStatsDetailed = {
  generatedAt: string;
  range: { days: number; from: string; to: string };
  summary: {
    total: number;
    authedCount: number;
    guestCount: number;
    uniqueVisitors: number;
    firstEventAt: string | null;
    lastEventAt: string | null;
  };
  daily: Array<{
    date: string;
    count: number;
    authedCount: number;
    guestCount: number;
    uniqueVisitors: number;
  }>;
  genres: Array<{ name: string; count: number }>;
  moods: Array<{ name: string; count: number }>;
  excludes: Array<{ name: string; count: number }>;
  countries: Array<{ name: string; count: number }>;
  runtimes: Array<{ name: string; count: number }>;
  releaseYears: Array<{ name: string; count: number }>;
  recentEvents: Array<{
    id: string;
    createdAt: string;
    isAuthed: boolean;
    userId: number | null;
    visitorId: string;
    country: string | null;
    runtime: string | null;
    releaseYear: string | null;
    favoriteCount: number;
    genres: string[];
    moods: string[];
    excludes: string[];
    favoriteMovieIds: number[];
  }>;
};

type IssueReportStatus = "received" | "in_progress" | "answered";

type ContentIssueItem = {
  id: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  contentTitle: string | null;
  issueMessage: string;
  issueDetail: string | null;
  reporterUserId: number | null;
  reporterName: string | null;
  reporterEmail: string | null;
  visitorId: string | null;
  source: string;
  status: IssueReportStatus;
  adminReply: string | null;
  adminRepliedAt: string | null;
  adminRepliedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ContentIssueResponse = {
  summary: {
    total: number;
    receivedCount: number;
    inProgressCount: number;
    answeredCount: number;
  };
  items: ContentIssueItem[];
};

type AdminManagedUser = {
  id: number;
  username: string;
  nickname: string | null;
  email: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  lastLoginAt: string | null;
};

type EditScope = "hidden" | "edited" | null;

type ConfirmState = {
  open: boolean;
  title: string;
  desc?: string;
  confirmText: string;
  action: (() => Promise<void>) | null;
};

type AdminShortcutKey = "hidden" | "edited" | "search" | "analyze" | "users" | "issues";
const ADMIN_GRANT_EMAIL = "yeongmins123@gmail.com";

function readStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.USER);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function isAdminUser(user: StoredUser | null): boolean {
  return String(user?.role ?? "").toUpperCase() === "ADMIN";
}

function itemKey(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}:${tmdbId}`;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const idx = cursor++;
        if (idx >= items.length) return;
        out[idx] = await mapper(items[idx]);
      }
    },
  );

  await Promise.all(workers);
  return out;
}

export default function AdminSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState<StoredUser | null>(() => readStoredUser());

  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<OverrideItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    hiddenCount: 0,
    editedCount: 0,
  });

  const [detailMap, setDetailMap] = useState<Record<string, ContentCardItem>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [analyzeStats, setAnalyzeStats] = useState<AnalyzeStats | null>(null);

  const [search, setSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "movie" | "tv" | "ani">("all");
  const [searchPolicyKeywords, setSearchPolicyKeywords] = useState<string[]>([]);
  const [policyInput, setPolicyInput] = useState("");
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyTestQuery, setPolicyTestQuery] = useState("");
  const [policySaveNotice, setPolicySaveNotice] = useState<"success" | "error" | null>(null);
  const [analyzeDays, setAnalyzeDays] = useState(30);
  const [analyzeDetailed, setAnalyzeDetailed] = useState<AnalyzeStatsDetailed | null>(null);
  const [, setAnalyzeDetailLoading] = useState(false);
  const [issueFilter, setIssueFilter] = useState<"all" | IssueReportStatus>("all");
  const [issueQuery, setIssueQuery] = useState("");
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueSummary, setIssueSummary] = useState({
    total: 0,
    receivedCount: 0,
    inProgressCount: 0,
    answeredCount: 0,
  });
  const [issueItems, setIssueItems] = useState<ContentIssueItem[]>([]);
  const [issueDraftStatusMap, setIssueDraftStatusMap] = useState<Record<number, IssueReportStatus>>(
    {},
  );
  const [issueDraftReplyMap, setIssueDraftReplyMap] = useState<Record<number, string>>({});
  const [issueSavingId, setIssueSavingId] = useState<number | null>(null);
  const [issueNotice, setIssueNotice] = useState<"success" | "error" | null>(null);
  const [recentLoginUsers, setRecentLoginUsers] = useState<AdminManagedUser[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userSearchSubmittedQuery, setUserSearchSubmittedQuery] = useState("");
  const [userSearchItems, setUserSearchItems] = useState<AdminManagedUser[]>([]);
  const [userSearchBusy, setUserSearchBusy] = useState(false);
  const [userActionBusyId, setUserActionBusyId] = useState<number | null>(null);
  const [userNotice, setUserNotice] = useState<"success" | "error" | null>(null);
  const [recentUsersExpanded, setRecentUsersExpanded] = useState(false);
  const [activeShortcut, setActiveShortcut] = useState<AdminShortcutKey>("hidden");
  const [shortcutMenuOpen, setShortcutMenuOpen] = useState(false);

  const [editScope, setEditScope] = useState<EditScope>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    desc: "",
    confirmText: "확인",
    action: null,
  });
  const policySavedTimerRef = useRef<number | null>(null);
  const issueNoticeTimerRef = useRef<number | null>(null);
  const userNoticeTimerRef = useRef<number | null>(null);
  const hiddenSectionRef = useRef<HTMLElement | null>(null);
  const editedSectionRef = useRef<HTMLElement | null>(null);
  const searchSectionRef = useRef<HTMLElement | null>(null);
  const analyzeSectionRef = useRef<HTMLElement | null>(null);
  const usersSectionRef = useRef<HTMLElement | null>(null);
  const issuesSectionRef = useRef<HTMLElement | null>(null);
  const shortcutMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => setMe(readStoredUser());
    window.addEventListener("pickmovie-auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("pickmovie-auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (policySavedTimerRef.current !== null) {
        window.clearTimeout(policySavedTimerRef.current);
      }
      if (issueNoticeTimerRef.current !== null) {
        window.clearTimeout(issueNoticeTimerRef.current);
      }
      if (userNoticeTimerRef.current !== null) {
        window.clearTimeout(userNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAdminUser(me)) return;
    navigate("/", { replace: true });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
    openAuthModal("login");
  }, [me, navigate]);

  const loadOverrides = useCallback(async () => {
    if (!isAdminUser(me)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<OverridesResponse>("/admin/meta/overrides", {
        limit: 300,
      });
      const items = Array.isArray(res?.items) ? res.items : [];
      const nextSummary = res?.summary ?? {
        total: items.length,
        hiddenCount: items.filter((x) => x.forceHidden).length,
        editedCount: items.filter((x) => x.hasDetailEdits || x.hasMetaEdits).length,
      };
      setOverrides(items);
      setSummary(nextSummary);
    } catch (e: any) {
      const msg =
        e instanceof ApiError && typeof e.message === "string"
          ? e.message
          : "관리자 설정 데이터를 불러오지 못했습니다.";
      setError(msg);
      setOverrides([]);
      setSummary({ total: 0, hiddenCount: 0, editedCount: 0 });
    } finally {
      setLoading(false);
    }
  }, [me]);

  const loadSearchPolicy = useCallback(async () => {
    if (!isAdminUser(me)) return;
    try {
      const res = await apiGet<{ keywords?: string[] }>("/admin/meta/search-policy");
      const list = Array.isArray(res?.keywords)
        ? res.keywords
            .map((x) => String(x ?? "").trim().toLowerCase())
            .filter(Boolean)
        : [];
      setSearchPolicyKeywords(list);
    } catch {
      setSearchPolicyKeywords([]);
    }
  }, [me]);

  const loadAnalyzeStats = useCallback(async () => {
    if (!isAdminUser(me)) return;
    try {
      const res = await apiGet<AnalyzeStats>("/admin/meta/analyze-stats");
      setAnalyzeStats(res ?? null);
    } catch {
      setAnalyzeStats(null);
    }
  }, [me]);

  const loadAnalyzeDetailed = useCallback(async () => {
    if (!isAdminUser(me)) return;
    setAnalyzeDetailLoading(true);
    try {
      const res = await apiGet<AnalyzeStatsDetailed>("/admin/meta/analyze-stats/detailed", {
        days: analyzeDays,
        limit: 500,
      });
      setAnalyzeDetailed(res ?? null);
    } catch {
      setAnalyzeDetailed(null);
    } finally {
      setAnalyzeDetailLoading(false);
    }
  }, [analyzeDays, me]);

  const loadContentIssues = useCallback(async () => {
    if (!isAdminUser(me)) return;
    setIssueLoading(true);
    try {
      const res = await apiGet<ContentIssueResponse>("/admin/meta/content-issues", {
        days: 365,
        limit: 150,
        status: issueFilter,
        q: issueQuery.trim(),
      });
      const items = Array.isArray(res?.items) ? res.items : [];
      setIssueSummary(
        res?.summary ?? {
          total: items.length,
          receivedCount: items.filter((x) => x.status === "received").length,
          inProgressCount: items.filter((x) => x.status === "in_progress").length,
          answeredCount: items.filter((x) => x.status === "answered").length,
        },
      );
      setIssueItems(items);
      setIssueDraftStatusMap(
        Object.fromEntries(items.map((x) => [x.id, x.status])) as Record<
          number,
          IssueReportStatus
        >,
      );
      setIssueDraftReplyMap(
        Object.fromEntries(items.map((x) => [x.id, x.adminReply ?? ""])) as Record<
          number,
          string
        >,
      );
    } catch {
      setIssueSummary({ total: 0, receivedCount: 0, inProgressCount: 0, answeredCount: 0 });
      setIssueItems([]);
    } finally {
      setIssueLoading(false);
    }
  }, [issueFilter, issueQuery, me]);

  const loadRecentLoginUsers = useCallback(async () => {
    if (!isAdminUser(me)) return;
    try {
      const res = await apiGet<{ items?: AdminManagedUser[] }>("/admin/meta/users/recent-logins", {
        limit: 10,
      });
      const items = Array.isArray(res?.items) ? res.items : [];
      setRecentLoginUsers(items);
    } catch {
      setRecentLoginUsers([]);
    }
  }, [me]);

  const runUserSearch = useCallback(
    async (rawQuery: string) => {
      if (!isAdminUser(me)) return;
      const q = rawQuery.trim();
      if (!q) {
        setUserSearchSubmittedQuery("");
        setUserSearchItems([]);
        return;
      }
      setUserSearchSubmittedQuery(q);
      setUserSearchBusy(true);
      try {
        const res = await apiGet<{ items?: AdminManagedUser[] }>("/admin/meta/users/search", {
          q,
          limit: 20,
        });
        const items = Array.isArray(res?.items) ? res.items : [];
        setUserSearchItems(items);
      } catch {
        setUserSearchItems([]);
      } finally {
        setUserSearchBusy(false);
      }
    },
    [me],
  );

  useEffect(() => {
    void loadOverrides();
    void loadSearchPolicy();
    void loadAnalyzeStats();
    void loadAnalyzeDetailed();
    void loadContentIssues();
    void loadRecentLoginUsers();
  }, [
    loadOverrides,
    loadSearchPolicy,
    loadAnalyzeStats,
    loadAnalyzeDetailed,
    loadContentIssues,
    loadRecentLoginUsers,
  ]);

  const isAniOverride = useCallback(
    (o: OverrideItem): boolean => {
      const ck = String(o.contentKind ?? "").trim().toUpperCase();
      if (ck === "ANI") return true;
      const key = itemKey(o.mediaType, o.tmdbId);
      const detail = detailMap[key] as any;
      const genreIds = Array.isArray(detail?.genre_ids) ? detail.genre_ids : [];
      return genreIds.includes(16);
    },
    [detailMap],
  );

  const tvOverrides = useMemo(
    () => overrides.filter((o) => o.mediaType === "tv"),
    [overrides],
  );

  const baseOverrides = useMemo(() => {
    if (mediaFilter === "all") return overrides;
    if (mediaFilter === "tv") return tvOverrides;
    return overrides.filter((o) => {
      if (mediaFilter === "ani") return isAniOverride(o);
      if (mediaFilter === "movie") return o.mediaType === "movie" && !isAniOverride(o);
      return true;
    });
  }, [overrides, tvOverrides, mediaFilter, isAniOverride]);

  const getOverrideTitle = useCallback(
    (o: OverrideItem): string => {
      const key = itemKey(o.mediaType, o.tmdbId);
      const detail = detailMap[key] as any;
      return String(
        detail?.title ??
          detail?.name ??
          o.overrideTitle ??
          o.overrideOriginalTitle ??
          "",
      )
        .trim()
        .toLowerCase();
    },
    [detailMap],
  );

  const filteredOverrides = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseOverrides.filter((o) => {
      if (!q) return true;
      if (`${o.mediaType}:${o.tmdbId}`.includes(q)) return true;
      if (String(o.tmdbId).includes(q)) return true;
      const t = getOverrideTitle(o);
      if (t && t.includes(q)) return true;
      return false;
    });
  }, [baseOverrides, search, getOverrideTitle]);

  const hiddenOverrides = useMemo(
    () => filteredOverrides.filter((o) => o.forceHidden),
    [filteredOverrides],
  );

  const editedOverrides = useMemo(
    () => filteredOverrides.filter((o) => o.hasDetailEdits || o.hasMetaEdits),
    [filteredOverrides],
  );

  useEffect(() => {
    let alive = true;

    const union = Array.from(
      new Map(
        baseOverrides.map((o) => [itemKey(o.mediaType, o.tmdbId), o]),
      ).values(),
    );

    if (union.length === 0) {
      setDetailsLoading((prev) => (prev ? false : prev));
      setDetailMap((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    setDetailsLoading(true);

    void mapLimit(union, 6, async (o) => {
      try {
        const detail = await getContentDetails(o.tmdbId, o.mediaType);
        return {
          key: itemKey(o.mediaType, o.tmdbId),
          value: {
            ...(detail as any),
            id: Number((detail as any)?.id ?? o.tmdbId),
            media_type: o.mediaType,
          } as ContentCardItem,
        };
      } catch {
        return null;
      }
    })
      .then((rows) => {
        if (!alive) return;
        const next: Record<string, ContentCardItem> = {};
        for (const r of rows) {
          if (!r) continue;
          next[r.key] = r.value;
        }
        setDetailMap((prev) => {
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(next);
          if (prevKeys.length !== nextKeys.length) return next;
          for (const k of nextKeys) {
            const a = prev[k] as any;
            const b = next[k] as any;
            if (!a || !b) return next;
            if (a.id !== b.id) return next;
            if (a.media_type !== b.media_type) return next;
            if (a.title !== b.title) return next;
            if (a.name !== b.name) return next;
            if (a.poster_path !== b.poster_path) return next;
          }
          return prev;
        });
      })
      .finally(() => {
        if (!alive) return;
        setDetailsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [baseOverrides]);

  const hiddenCards = useMemo<AdminCardItem[]>(() => {
    return hiddenOverrides
      .map((o) => {
        const key = itemKey(o.mediaType, o.tmdbId);
        const detail = detailMap[key];
        if (!detail) return null;
        return { ...detail, __override: o } as AdminCardItem;
      })
      .filter(Boolean) as AdminCardItem[];
  }, [hiddenOverrides, detailMap]);

  const editedCards = useMemo<AdminCardItem[]>(() => {
    return editedOverrides
      .map((o) => {
        const key = itemKey(o.mediaType, o.tmdbId);
        const detail = detailMap[key];
        if (!detail) return null;
        return { ...detail, __override: o } as AdminCardItem;
      })
      .filter(Boolean) as AdminCardItem[];
  }, [editedOverrides, detailMap]);

  const currentCards = editScope === "hidden" ? hiddenCards : editedCards;

  useEffect(() => {
    if (!editScope) {
      setSelectedKeys(new Set());
      return;
    }
    const valid = new Set(
      currentCards.map((c) => itemKey(c.__override.mediaType, c.__override.tmdbId)),
    );
    setSelectedKeys((prev) => {
      const next = new Set<string>();
      prev.forEach((k) => {
        if (valid.has(k)) next.add(k);
      });
      return next;
    });
  }, [editScope, currentCards]);

  const askConfirm = useCallback(
    (title: string, desc: string, confirmText: string, action: () => Promise<void>) => {
      setConfirm({ open: true, title, desc, confirmText, action });
    },
    [],
  );

  const closeConfirm = useCallback(() => {
    setConfirm((prev) => ({ ...prev, open: false, action: null }));
  }, []);

  const runConfirm = useCallback(async () => {
    if (!confirm.action) return;
    const action = confirm.action;
    closeConfirm();
    await action();
  }, [confirm.action, closeConfirm]);

  const applyForceHidden = useCallback(
    async (targets: OverrideItem[], nextHidden: boolean) => {
      if (targets.length === 0) return;
      setBusyKey("bulk");
      setError(null);
      try {
        for (const t of targets) {
          await apiPatch<{ ok: true }>(`/admin/meta/${t.mediaType}/${t.tmdbId}`, {
            forceHidden: nextHidden,
          });
          setResolvedMetaCache(t.mediaType, t.tmdbId, null);
        }
        await loadOverrides();
      } catch {
        setError("일괄 노출/비노출 처리에 실패했습니다.");
      } finally {
        setBusyKey(null);
      }
    },
    [loadOverrides],
  );

  const resetOverrides = useCallback(
    async (targets: OverrideItem[]) => {
      if (targets.length === 0) return;
      setBusyKey("bulk");
      setError(null);
      try {
        for (const t of targets) {
          try {
            await apiPost<{ ok: true }>(`/admin/meta/${t.mediaType}/${t.tmdbId}/reset`, {});
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) {
              await apiDelete<{ ok: true }>(`/admin/meta/${t.mediaType}/${t.tmdbId}`);
            } else {
              throw e;
            }
          }
          setResolvedMetaCache(t.mediaType, t.tmdbId, null);
        }
        await loadOverrides();
      } catch {
        setError("일괄 초기화에 실패했습니다.");
      } finally {
        setBusyKey(null);
      }
    },
    [loadOverrides],
  );

  const selectedOverrides = useMemo(() => {
    const map = new Map<string, OverrideItem>();
    currentCards.forEach((c) => {
      const k = itemKey(c.__override.mediaType, c.__override.tmdbId);
      if (selectedKeys.has(k)) map.set(k, c.__override);
    });
    return Array.from(map.values());
  }, [currentCards, selectedKeys]);

  const toggleSelect = useCallback((card: AdminCardItem) => {
    const key = itemKey(card.__override.mediaType, card.__override.tmdbId);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllCurrent = useCallback(() => {
    setSelectedKeys(
      new Set(currentCards.map((c) => itemKey(c.__override.mediaType, c.__override.tmdbId))),
    );
  }, [currentCards]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const closeEditMode = useCallback(() => {
    setEditScope(null);
  }, []);

  const addSearchPolicyKeyword = useCallback(() => {
    const next = policyInput.trim().toLowerCase();
    if (!next) return;
    setSearchPolicyKeywords((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setPolicyInput("");
  }, [policyInput]);

  const openDetail = useCallback(
    (card: AdminCardItem) => {
      navigate(`/title/${card.__override.mediaType}/${card.__override.tmdbId}`, {
        state: { backgroundLocation: location },
      });
    },
    [navigate, location],
  );

  const hiddenRatio = summary.total > 0 ? Math.round((summary.hiddenCount / summary.total) * 100) : 0;
  const editedRatio = summary.total > 0 ? Math.round((summary.editedCount / summary.total) * 100) : 0;
  const analyzeSummary = analyzeDetailed?.summary ?? {
    total: analyzeStats?.total ?? 0,
    authedCount: analyzeStats?.authedCount ?? 0,
    guestCount: analyzeStats?.guestCount ?? 0,
    uniqueVisitors: analyzeStats?.uniqueVisitors ?? 0,
    firstEventAt: null as string | null,
    lastEventAt: null as string | null,
  };
  const authTotal = Math.max(1, analyzeSummary.authedCount + analyzeSummary.guestCount);
  const authedPct = Math.round((analyzeSummary.authedCount / authTotal) * 100);
  const guestPct = 100 - authedPct;
  const dailyTrend = (analyzeDetailed?.daily ?? []).slice(0, 14).reverse();
  const topGenreBars = (analyzeDetailed?.genres ?? analyzeStats?.topGenres ?? []).slice(0, 8);
  const topMoodBars = (analyzeDetailed?.moods ?? analyzeStats?.topMoods ?? []).slice(0, 8);
  const topCountryBars = (analyzeDetailed?.countries ?? analyzeStats?.topCountries ?? []).slice(0, 8);
  const visibleRecentLoginUsers = useMemo(
    () => recentLoginUsers.filter((u) => Number(u.id) !== Number(me?.id ?? 0)),
    [recentLoginUsers, me?.id],
  );

  const exportJson = useCallback(() => {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        summary,
        items: filteredOverrides,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pickmovie-admin-overrides-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("JSON 내보내기에 실패했습니다.");
    }
  }, [summary, filteredOverrides]);

  const exportAnalyzeDetailedJson = useCallback(() => {
    if (!analyzeDetailed) return;
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        analyzeDetailed,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pickmovie-analyze-detailed-${analyzeDays}d-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("분석 상세 JSON 내보내기에 실패했습니다.");
    }
  }, [analyzeDays, analyzeDetailed]);

  const exportAnalyzeCsv = useCallback(async () => {
    try {
      const token = localStorage.getItem(AUTH_KEYS.ACCESS);
      const base =
        (import.meta as any)?.env?.VITE_API_BASE_URL || "http://localhost:3000";
      const url = new URL("/admin/meta/analyze-stats/export.csv", base);
      url.searchParams.set("days", String(analyzeDays));
      const res = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("csv export failed");
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `pickmovie-analyze-events-${analyzeDays}d-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch {
      setError("분석 CSV 내보내기에 실패했습니다.");
    }
  }, [analyzeDays]);

  const saveIssueReply = useCallback(
    async (item: ContentIssueItem) => {
      const status = issueDraftStatusMap[item.id] ?? item.status;
      const adminReply = String(issueDraftReplyMap[item.id] ?? "").trim();

      if (status === "answered" && !adminReply) {
        setIssueNotice("error");
        if (issueNoticeTimerRef.current !== null) {
          window.clearTimeout(issueNoticeTimerRef.current);
        }
        issueNoticeTimerRef.current = window.setTimeout(() => {
          setIssueNotice(null);
          issueNoticeTimerRef.current = null;
        }, 1800);
        return;
      }

      setIssueSavingId(item.id);
      try {
        await apiPatch<{ ok: true }>(`/admin/meta/content-issues/${item.id}/reply`, {
          status,
          adminReply: adminReply || null,
          adminRepliedBy: me?.username ?? "admin",
        });
        setIssueNotice("success");
        if (issueNoticeTimerRef.current !== null) {
          window.clearTimeout(issueNoticeTimerRef.current);
        }
        issueNoticeTimerRef.current = window.setTimeout(() => {
          setIssueNotice(null);
          issueNoticeTimerRef.current = null;
        }, 1800);
        await loadContentIssues();
      } catch {
        setIssueNotice("error");
        if (issueNoticeTimerRef.current !== null) {
          window.clearTimeout(issueNoticeTimerRef.current);
        }
        issueNoticeTimerRef.current = window.setTimeout(() => {
          setIssueNotice(null);
          issueNoticeTimerRef.current = null;
        }, 1800);
      } finally {
        setIssueSavingId(null);
      }
    },
    [issueDraftReplyMap, issueDraftStatusMap, loadContentIssues, me?.username],
  );

  const updateUserRole = useCallback(
    async (user: AdminManagedUser, role: "USER" | "ADMIN") => {
      setUserActionBusyId(user.id);
      try {
        await apiPatch<{ ok: true }>(`/admin/meta/users/${user.id}/role`, { role });
        setUserNotice("success");
        if (userNoticeTimerRef.current !== null) {
          window.clearTimeout(userNoticeTimerRef.current);
        }
        userNoticeTimerRef.current = window.setTimeout(() => {
          setUserNotice(null);
          userNoticeTimerRef.current = null;
        }, 1800);
        await loadRecentLoginUsers();
        if (userSearchSubmittedQuery.trim()) {
          await runUserSearch(userSearchSubmittedQuery);
        }
      } catch {
        setUserNotice("error");
        if (userNoticeTimerRef.current !== null) {
          window.clearTimeout(userNoticeTimerRef.current);
        }
        userNoticeTimerRef.current = window.setTimeout(() => {
          setUserNotice(null);
          userNoticeTimerRef.current = null;
        }, 1800);
      } finally {
        setUserActionBusyId(null);
      }
    },
    [loadRecentLoginUsers, runUserSearch, userSearchSubmittedQuery],
  );

  const deleteUserAccount = useCallback(
    async (user: AdminManagedUser) => {
      setUserActionBusyId(user.id);
      try {
        await apiDelete<{ ok: true }>(`/admin/meta/users/account/${user.id}`);
        setUserNotice("success");
        if (userNoticeTimerRef.current !== null) {
          window.clearTimeout(userNoticeTimerRef.current);
        }
        userNoticeTimerRef.current = window.setTimeout(() => {
          setUserNotice(null);
          userNoticeTimerRef.current = null;
        }, 1800);
        await loadRecentLoginUsers();
        if (userSearchSubmittedQuery.trim()) {
          await runUserSearch(userSearchSubmittedQuery);
        }
      } catch {
        setUserNotice("error");
        if (userNoticeTimerRef.current !== null) {
          window.clearTimeout(userNoticeTimerRef.current);
        }
        userNoticeTimerRef.current = window.setTimeout(() => {
          setUserNotice(null);
          userNoticeTimerRef.current = null;
        }, 1800);
      } finally {
        setUserActionBusyId(null);
      }
    },
    [loadRecentLoginUsers, runUserSearch, userSearchSubmittedQuery],
  );

  const moveToSection = useCallback((key: AdminShortcutKey) => {
    setActiveShortcut(key);
    setShortcutMenuOpen(false);
    const target =
      key === "hidden"
        ? hiddenSectionRef.current
        : key === "edited"
          ? editedSectionRef.current
          : key === "search"
          ? searchSectionRef.current
          : key === "analyze"
            ? analyzeSectionRef.current
            : key === "users"
              ? usersSectionRef.current
              : issuesSectionRef.current;
    if (!target) return;
    if (key === "analyze" || key === "users" || key === "issues") {
      const top =
        target.getBoundingClientRect().top + window.scrollY - 132;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, []);

  useEffect(() => {
    if (!shortcutMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = shortcutMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setShortcutMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShortcutMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [shortcutMenuOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!editScope) return;
      closeEditMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editScope, closeEditMode]);

  if (!isAdminUser(me)) return null;

  return (
    <div className="admin-settings-page min-h-screen bg-[#10131b] text-white overflow-x-hidden flex flex-col">
      <Header currentSection="settings" />

      <div
        ref={shortcutMenuRef}
        className="fixed right-4 sm:right-6 top-[90px] z-[55]"
      >
        <button
          type="button"
          onClick={() => setShortcutMenuOpen((v) => !v)}
          className="w-[116px] inline-flex items-center justify-between rounded-lg bg-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/25 transition-all duration-200"
        >
          바로가기
          <ChevronDown
            className={`h-4 w-4 transition-transform ${shortcutMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
        <AnimatePresence>
          {shortcutMenuOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute right-0 top-full mt-2 w-[180px] rounded-xl bg-[#0f131d] p-2 shadow-2xl"
            >
              {(
                [
                  { key: "hidden", label: "비노출" },
                  { key: "edited", label: "편집됨" },
                  { key: "search", label: "검색 키워드" },
                  { key: "analyze", label: "분석 통계" },
                  { key: "users", label: "사용자 관리" },
                  { key: "issues", label: "오류 제보" },
                ] as Array<{ key: AdminShortcutKey; label: string }>
              ).map((item) => (
                <button
                  key={`shortcut:${item.key}`}
                  type="button"
                  onClick={() => moveToSection(item.key)}
                  className={[
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-all duration-150",
                    activeShortcut === item.key
                      ? "bg-white text-black font-semibold"
                      : "text-white/85 hover:bg-white/10",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <main id="main-content" className="flex-1 pt-[84px] pb-20">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
        <div className="px-6">
          <div className="">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">관리자 설정</h1>
                <p className="mt-1 text-sm text-white/60">
                  컨텐츠 노출/편집 관리, 검색 운영 정책, 분석 통계를 한 곳에서 운영할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="h-px w-full bg-white/10" />
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SummaryCard icon={<Sparkles className="h-4 w-4" />} label="총 오버라이드" value={summary.total} />
              <SummaryCard icon={<EyeOff className="h-4 w-4" />} label={`비노출 (${hiddenRatio}%)`} value={summary.hiddenCount} />
              <SummaryCard icon={<FileText className="h-4 w-4" />} label={`편집됨 (${editedRatio}%)`} value={summary.editedCount} />
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <label className="block">
                <div className="text-xs text-white/60 mb-1">수정 된 컨텐츠 검색</div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="제목 또는 tmdbId 입력"
                  className="w-full h-10 rounded-xl bg-white/10 px-3 outline-none"
                />
              </label>

              <div className="flex items-center gap-2">
                <FilterButton label="전체" active={mediaFilter === "all"} onClick={() => setMediaFilter("all")} />
                <FilterButton label="Movie" active={mediaFilter === "movie"} onClick={() => setMediaFilter("movie")} />
                <FilterButton label="TV" active={mediaFilter === "tv"} onClick={() => setMediaFilter("tv")} />
                <FilterButton label="Ani" active={mediaFilter === "ani"} onClick={() => setMediaFilter("ani")} />
              </div>
            </div>

            {error ? <div className="mt-4 text-sm text-rose-300">{error}</div> : null}

            <div className="mt-4">
              <div className="text-sm font-semibold text-white/90">빠른 작업</div>
              <p className="mt-1 text-xs text-white/55">
                검색/타입 필터 초기화와 현재 결과 JSON 내보내기를 바로 실행할 수 있습니다.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-semibold whitespace-nowrap"
                  onClick={() => {
                    setSearch("");
                    setMediaFilter("all");
                    clearSelection();
                  }}
                >
                  검색/필터 초기화
                </button>
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2"
                  onClick={exportJson}
                  disabled={filteredOverrides.length === 0}
                >
                  <Download className="h-4 w-4" />
                  JSON 내보내기
                </button>
              </div>
            </div>

          </div>
        </div>

        <section
          ref={hiddenSectionRef}
          className={[
            "mt-8 transition-all duration-200",
            editScope === "hidden" ? "relative z-[71] py-4" : "",
            editScope && editScope !== "hidden" ? "opacity-45 pointer-events-none" : "",
          ].join(" ")}
        >
          <RowHeader
            title="비노출 컨텐츠"
            count={hiddenCards.length}
            desc="비노출으로 설정된 컨텐츠입니다."
            editing={editScope === "hidden"}
            onToggleEdit={() => setEditScope((p) => (p === "hidden" ? null : "hidden"))}
          />
          <AdminCardRow
            cards={hiddenCards}
            targetCount={hiddenOverrides.length}
            editing={editScope === "hidden"}
            selectedKeys={selectedKeys}
            loading={detailsLoading}
            onCardClick={(card) => {
              if (editScope === "hidden") toggleSelect(card);
              else openDetail(card);
            }}
            onToggleSelect={toggleSelect}
          />
        </section>

        <section
          ref={editedSectionRef}
          className={[
            "mt-10 transition-all duration-200",
            editScope === "edited" ? "relative z-[71] py-4" : "",
            editScope && editScope !== "edited" ? "opacity-45 pointer-events-none" : "",
          ].join(" ")}
        >
          <RowHeader
            title="편집된 컨텐츠"
            count={editedCards.length}
            desc="메타/상세 정보가 수정된 컨텐츠입니다."
            editing={editScope === "edited"}
            onToggleEdit={() => setEditScope((p) => (p === "edited" ? null : "edited"))}
          />
          <AdminCardRow
            cards={editedCards}
            targetCount={editedOverrides.length}
            editing={editScope === "edited"}
            selectedKeys={selectedKeys}
            loading={detailsLoading}
            onCardClick={(card) => {
              if (editScope === "edited") toggleSelect(card);
              else openDetail(card);
            }}
            onToggleSelect={toggleSelect}
          />
        </section>

        <section ref={searchSectionRef} className="mt-10">
          <SectionHeader
            title="검색 필터 키워드"
            desc="검색 경고 대상 키워드를 관리하고, 의심 키워드를 확인해보세요."
          />
          <div className="px-6 mt-4">
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={policyInput}
                onChange={(e) => setPolicyInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as KeyboardEvent).isComposing) return;
                  if ((e.nativeEvent as KeyboardEvent).keyCode === 229) return;
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addSearchPolicyKeyword();
                }}
                placeholder="키워드 추가 (예: explicit)"
                className="h-9 w-[220px] rounded-lg bg-white/10 px-3 outline-none text-sm"
              />
              <button
                type="button"
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-semibold whitespace-nowrap"
                onClick={addSearchPolicyKeyword}
              >
                키워드 추가
              </button>
              <button
                type="button"
                className="h-9 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-sm font-semibold whitespace-nowrap"
                disabled={policyBusy}
                onClick={async () => {
                  setPolicyBusy(true);
                  setError(null);
                  setPolicySaveNotice(null);
                  try {
                    const res = await apiPatch<{ ok: true; keywords?: string[] }>(
                      "/admin/meta/search-policy",
                      { keywords: searchPolicyKeywords },
                    );
                    const list = Array.isArray(res?.keywords)
                      ? res.keywords
                          .map((x) => String(x ?? "").trim().toLowerCase())
                          .filter(Boolean)
                      : [];
                    if (list.length > 0) setSearchPolicyKeywords(list);
                    setPolicySaveNotice("success");
                    if (policySavedTimerRef.current !== null) {
                      window.clearTimeout(policySavedTimerRef.current);
                    }
                    policySavedTimerRef.current = window.setTimeout(() => {
                      setPolicySaveNotice(null);
                      policySavedTimerRef.current = null;
                    }, 1800);
                  } catch {
                    setPolicySaveNotice("error");
                    if (policySavedTimerRef.current !== null) {
                      window.clearTimeout(policySavedTimerRef.current);
                    }
                    policySavedTimerRef.current = window.setTimeout(() => {
                      setPolicySaveNotice(null);
                      policySavedTimerRef.current = null;
                    }, 1800);
                  } finally {
                    setPolicyBusy(false);
                  }
                }}
              >
                저장
              </button>
              {policySaveNotice === "success" ? (
                <span className="text-xs text-emerald-300">저장되었습니다</span>
              ) : null}
              {policySaveNotice === "error" ? (
                <span className="text-xs text-rose-300">저장에 실패했습니다</span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {searchPolicyKeywords.map((k) => (
                <button
                  type="button"
                  key={`policy:${k}`}
                  onClick={() =>
                    setSearchPolicyKeywords((prev) => prev.filter((x) => x !== k))
                  }
                  className="h-8 px-3 rounded-full bg-white/10 hover:bg-white/15 text-xs"
                  title="클릭하면 삭제"
                >
                  {k} ✕
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                value={policyTestQuery}
                onChange={(e) => setPolicyTestQuery(e.target.value)}
                placeholder="테스트 문장 입력"
                className="h-9 w-[320px] rounded-lg bg-white/10 px-3 outline-none text-sm"
              />
              <div className="text-sm">
                {policyTestQuery.trim() ? (
                  searchPolicyKeywords.some((k) =>
                    policyTestQuery.toLowerCase().includes(k),
                  ) ? (
                    <span className="text-rose-300">경고 문구 노출 대상</span>
                  ) : (
                    <span className="text-emerald-300">경고 문구 비노출 대상</span>
                  )
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section ref={analyzeSectionRef} className="mt-10">
          <SectionHeader
            title="분석 데이터 통계"
            desc="각 사용자들의 분석 데이터 통계를 확인해보세요."
          />
          <div className="px-6 mt-4">
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
              <div className="relative h-8 w-[92px] sm:h-9 sm:w-[110px] rounded-lg bg-white/10 flex-shrink-0">
                <div className="h-full inline-flex w-full items-center justify-evenly text-xs sm:text-sm font-semibold text-white">
                  <span>{`최근 ${analyzeDays}일`}</span>
                  <span className="text-white/75">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
                <select
                  value={analyzeDays}
                  onChange={(e) => setAnalyzeDays(Number(e.target.value) || 30)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 appearance-none"
                  aria-label="분석 통계 기간 선택"
                >
                  <option value={7}>최근 7일</option>
                  <option value={30}>최근 30일</option>
                  <option value={90}>최근 90일</option>
                  <option value={180}>최근 180일</option>
                  <option value={365}>최근 365일</option>
                </select>
              </div>
              <button
                type="button"
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2 flex-shrink-0"
                onClick={() => void exportAnalyzeCsv()}
              >
                <Download className="h-4 w-4" />
                CSV 내보내기
              </button>
              <button
                type="button"
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2 flex-shrink-0"
                onClick={exportAnalyzeDetailedJson}
                disabled={!analyzeDetailed}
              >
                <Download className="h-4 w-4" />
                상세 JSON 내보내기
              </button>
            </div>
            {!analyzeStats && !analyzeDetailed ? (
              <div className="mt-2 text-xs text-white/55">분석 통계를 불러오지 못했습니다.</div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MetricTile label="총 분석" value={analyzeSummary.total} tone="sky" />
                  <MetricTile label="회원 분석" value={analyzeSummary.authedCount} tone="emerald" />
                  <MetricTile label="비회원 분석" value={analyzeSummary.guestCount} tone="amber" />
                  <MetricTile label="고유 방문자" value={analyzeSummary.uniqueVisitors} tone="violet" />
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">
                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-xs text-white/65">회원/비회원 비율</div>
                    <div className="mt-3 flex items-center gap-4">
                      <div
                        className="h-24 w-24 rounded-full"
                        style={{
                          background: `conic-gradient(#34d399 0% ${authedPct}%, #f59e0b ${authedPct}% 100%)`,
                        }}
                      />
                      <div className="text-xs space-y-1">
                        <div className="text-emerald-300">회원 {authedPct}% ({analyzeSummary.authedCount})</div>
                        <div className="text-amber-300">비회원 {guestPct}% ({analyzeSummary.guestCount})</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-black/20 p-3">
                    <div className="text-xs text-white/65">최근 14일 분석 추이</div>
                    <SparkBars data={dailyTrend.map((d) => ({ label: d.date.slice(5), value: d.count }))} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <StatBarList title="상위 장르" items={topGenreBars} tone="sky" />
                  <StatBarList title="상위 분위기" items={topMoodBars} tone="emerald" />
                  <StatBarList title="상위 국가" items={topCountryBars} tone="amber" />
                </div>

                {analyzeDetailed ? (
                  <div className="mt-3 rounded-xl bg-black/20 p-3">
                    <div className="text-xs text-white/65">
                      집계 범위 {analyzeDetailed.range.from.slice(0, 10)} ~ {analyzeDetailed.range.to.slice(0, 10)}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      첫 이벤트 {analyzeDetailed.summary.firstEventAt ? analyzeDetailed.summary.firstEventAt.replace("T", " ").slice(0, 19) : "-"} / 최근 이벤트 {analyzeDetailed.summary.lastEventAt ? analyzeDetailed.summary.lastEventAt.replace("T", " ").slice(0, 19) : "-"}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section ref={usersSectionRef} className="mt-10">
          <SectionHeader
            title="사용자 관리"
            desc="최근 로그인 사용자와 사용자 검색 결과를 기반으로 권한/계정을 관리합니다."
          />
          <div className="px-6 mt-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
              <div className="relative min-w-0 w-full">
                <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center">
                  <Search className="h-4 w-4 text-white/45" />
                </span>
                <input
                  value={userQuery}
                  onChange={(e) => {
                    setUserQuery(e.target.value);
                    setUserSearchSubmittedQuery("");
                    setUserSearchItems([]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    void runUserSearch(userQuery);
                  }}
                  placeholder="아이디/닉네임 검색 (예: 1024 또는 hong)"
                  className="h-9 w-full rounded-lg bg-white/10 pl-9 pr-3 text-sm outline-none"
                />
              </div>
              <button
                type="button"
                className="h-9 w-[64px] sm:w-auto sm:px-3 rounded-lg bg-white text-black hover:bg-white/90 text-sm font-semibold whitespace-nowrap"
                onClick={() => void runUserSearch(userQuery)}
              >
                검색
              </button>
              <button
                type="button"
                className="h-9 w-[72px] sm:w-auto sm:px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-semibold whitespace-nowrap"
                onClick={() => {
                  setUserQuery("");
                  setUserSearchSubmittedQuery("");
                  setUserSearchItems([]);
                }}
              >
                초기화
              </button>
            </div>
            {userNotice === "success" ? (
              <div className="mt-2 text-xs text-emerald-300">처리되었습니다</div>
            ) : null}
            {userNotice === "error" ? (
              <div className="mt-2 text-xs text-rose-300">처리에 실패했습니다</div>
            ) : null}

            <div className="mt-3 space-y-2">
              {userSearchBusy ? (
                <div className="rounded-xl bg-black/20 p-4 text-sm text-white/60">
                  사용자 검색 중입니다...
                </div>
              ) : null}
              {!userSearchBusy &&
              !!userSearchSubmittedQuery.trim() &&
              userSearchItems.length === 0 ? (
                <div className="rounded-xl bg-black/20 p-4 text-sm text-white/60">
                  검색 결과가 없습니다.
                </div>
              ) : null}
              {!userSearchBusy &&
                userSearchItems.map((u) => {
                  const isMe = Number(me?.id ?? 0) === u.id;
                  const canAct = !isMe && userActionBusyId !== u.id;
                  const canGrantAdmin =
                    u.role === "ADMIN" ||
                    String(u.email ?? "").trim().toLowerCase() === ADMIN_GRANT_EMAIL;
                  return (
                    <div key={`managed-user:${u.id}`} className="rounded-xl bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-white/95">
                          #{u.id} {u.nickname?.trim() || u.username}
                          {isMe ? <span className="ml-2 text-xs text-white/55">(내 계정)</span> : null}
                        </div>
                        <span
                          className={[
                            "text-[11px] px-2 py-1 rounded-full",
                            u.role === "ADMIN"
                              ? "bg-emerald-400/20 text-emerald-200"
                              : "bg-white/10 text-white/75",
                          ].join(" ")}
                        >
                          {u.role}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/65">
                        아이디: @{u.username} · 닉네임: {u.nickname?.trim() || "-"} · 이메일:{" "}
                        {u.email?.trim() || "-"}
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        최근 로그인:{" "}
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString("ko-KR", { hour12: false })
                          : "-"}{" "}
                        · 가입일: {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={[
                            "h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5",
                            u.role === "ADMIN"
                              ? "bg-white/10 hover:bg-white/15 text-white"
                              : "bg-emerald-300 text-black hover:bg-emerald-200",
                          ].join(" ")}
                          disabled={!canAct || !canGrantAdmin}
                          title={
                            !canGrantAdmin && u.role !== "ADMIN"
                              ? `${ADMIN_GRANT_EMAIL} 계정만 관리자 권한 부여 가능`
                              : undefined
                          }
                          onClick={() =>
                            askConfirm(
                              u.role === "ADMIN"
                                ? "일반 권한으로 변경할까요?"
                                : "관리자 권한을 부여할까요?",
                              `대상: #${u.id} @${u.username}`,
                              u.role === "ADMIN" ? "일반 권한" : "권한 부여",
                              async () => {
                                await updateUserRole(u, u.role === "ADMIN" ? "USER" : "ADMIN");
                              },
                            )
                          }
                        >
                          <Shield className="h-4 w-4" />
                          {u.role === "ADMIN" ? "일반 권한 변경" : "관리자 권한 부여"}
                        </button>
                        <button
                          type="button"
                          className="h-9 px-3 rounded-lg bg-rose-400/90 text-black hover:bg-rose-300 text-sm font-semibold inline-flex items-center gap-1.5"
                          disabled={!canAct}
                          onClick={() =>
                            askConfirm(
                              "사용자를 삭제할까요?",
                              `삭제 대상: #${u.id} @${u.username} (되돌릴 수 없습니다)`,
                              "삭제",
                              async () => {
                                await deleteUserAccount(u);
                              },
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          계정 삭제
                        </button>
                        {userActionBusyId === u.id ? (
                          <span className="text-xs text-white/60">처리 중...</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="text-sm font-semibold text-white/90">최근 로그인 (최대 10명)</div>
              {visibleRecentLoginUsers.length > 2 ? (
                <button
                  type="button"
                  className="ml-1 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold whitespace-nowrap"
                  onClick={() => setRecentUsersExpanded((v) => !v)}
                >
                  {recentUsersExpanded ? "접기" : "펼치기"}
                </button>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {visibleRecentLoginUsers.length === 0 ? (
                <div className="rounded-xl bg-black/20 p-4 text-sm text-white/60">
                  최근 로그인 데이터가 없습니다.
                </div>
              ) : (
                visibleRecentLoginUsers
                  .slice(0, recentUsersExpanded ? 10 : 2)
                  .map((u) => (
                  <div key={`recent-user:${u.id}`} className="rounded-xl bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white/95">
                        #{u.id} {u.nickname?.trim() || u.username}
                      </div>
                      <span
                        className={[
                          "text-[11px] px-2 py-1 rounded-full",
                          u.role === "ADMIN"
                            ? "bg-emerald-400/20 text-emerald-200"
                            : "bg-white/10 text-white/75",
                        ].join(" ")}
                      >
                        {u.role}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-white/65">@{u.username}</div>
                    <div className="mt-1 text-xs text-white/60">
                      최근 로그인:{" "}
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString("ko-KR", { hour12: false })
                        : "-"}
                    </div>
                  </div>
                  ))
              )}
            </div>

          </div>
        </section>

        <section ref={issuesSectionRef} className="mt-10">
          <SectionHeader
            title="오류 제보"
            desc="접수된 오류 제보를 상태별로 관리하고 답변을 남길 수 있습니다."
          />
          <div className="px-6 mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={[
                  "h-9 px-3 rounded-lg text-sm font-semibold",
                  issueFilter === "all" ? "bg-white text-black" : "bg-white/10 hover:bg-white/15",
                ].join(" ")}
                onClick={() => setIssueFilter("all")}
              >
                전체 {issueSummary.total}
              </button>
              <button
                type="button"
                className={[
                  "h-9 px-3 rounded-lg text-sm font-semibold",
                  issueFilter === "received"
                    ? "bg-white text-black"
                    : "bg-white/10 hover:bg-white/15",
                ].join(" ")}
                onClick={() => setIssueFilter("received")}
              >
                접수 {issueSummary.receivedCount}
              </button>
              <button
                type="button"
                className={[
                  "h-9 px-3 rounded-lg text-sm font-semibold",
                  issueFilter === "in_progress"
                    ? "bg-white text-black"
                    : "bg-white/10 hover:bg-white/15",
                ].join(" ")}
                onClick={() => setIssueFilter("in_progress")}
              >
                처리중 {issueSummary.inProgressCount}
              </button>
              <button
                type="button"
                className={[
                  "h-9 px-3 rounded-lg text-sm font-semibold",
                  issueFilter === "answered"
                    ? "bg-white text-black"
                    : "bg-white/10 hover:bg-white/15",
                ].join(" ")}
                onClick={() => setIssueFilter("answered")}
              >
                답변완료 {issueSummary.answeredCount}
              </button>
              <input
                value={issueQuery}
                onChange={(e) => setIssueQuery(e.target.value)}
                placeholder="제목/tmdbId/제보/답변 검색"
                className="h-9 w-[260px] rounded-lg bg-white/10 px-3 outline-none text-sm"
              />
              {issueNotice === "success" ? (
                <span className="text-xs text-emerald-300">저장되었습니다</span>
              ) : null}
              {issueNotice === "error" ? (
                <span className="text-xs text-rose-300">저장에 실패했습니다</span>
              ) : null}
            </div>

            {issueLoading && issueItems.length === 0 ? (
              <div className="mt-3 text-sm text-white/60">오류 제보를 불러오는 중입니다...</div>
            ) : null}

            {!issueLoading && issueItems.length === 0 ? (
              <div className="mt-3 rounded-xl bg-black/20 p-4 text-sm text-white/60">
                표시할 오류 제보가 없습니다.
              </div>
            ) : null}

            {issueItems.length > 0 ? (
              <div className="mt-3 space-y-3">
                {issueItems.map((item) => {
                  const draftStatus = issueDraftStatusMap[item.id] ?? item.status;
                  const draftReply = issueDraftReplyMap[item.id] ?? "";
                  return (
                    <div key={`issue:${item.id}`} className="rounded-xl bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-white/95">
                          {item.contentTitle?.trim() || `${item.mediaType.toUpperCase()} #${item.tmdbId}`}
                        </div>
                        <div className="text-xs text-white/60">
                          {new Date(item.createdAt).toLocaleString("ko-KR", { hour12: false })}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-white/65">
                        {item.mediaType.toUpperCase()} / tmdbId {item.tmdbId} · 제보자{" "}
                        {item.reporterUserId
                          ? `회원 #${item.reporterUserId}`
                          : item.reporterEmail || item.reporterName || "비회원"}
                      </div>
                      <div className="mt-2 text-sm text-white/90">{item.issueMessage}</div>
                      {item.issueDetail ? (
                        <div className="mt-1 text-sm text-white/70 whitespace-pre-wrap">
                          {item.issueDetail}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select
                          value={draftStatus}
                          onChange={(e) =>
                            setIssueDraftStatusMap((prev) => ({
                              ...prev,
                              [item.id]: e.target.value as IssueReportStatus,
                            }))
                          }
                          className="h-9 rounded-lg bg-white/10 px-3 text-sm outline-none"
                        >
                          <option value="received">접수</option>
                          <option value="in_progress">처리중</option>
                          <option value="answered">답변완료</option>
                        </select>
                        <button
                          type="button"
                          className="h-9 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-sm font-semibold"
                          onClick={() => void saveIssueReply(item)}
                          disabled={issueSavingId === item.id}
                        >
                          {issueSavingId === item.id ? "저장 중" : "상태/답변 저장"}
                        </button>
                        {item.adminRepliedAt ? (
                          <span className="text-xs text-white/60">
                            최근 답변 {new Date(item.adminRepliedAt).toLocaleString("ko-KR", { hour12: false })}
                          </span>
                        ) : null}
                      </div>

                      <textarea
                        value={draftReply}
                        onChange={(e) =>
                          setIssueDraftReplyMap((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder="관리자 답변을 입력하세요. (답변완료 상태는 답변 내용이 필요합니다.)"
                        className="mt-2 w-full min-h-[88px] rounded-xl bg-white/10 px-3 py-2 text-sm outline-none resize-y"
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
        </motion.div>

      </main>

      <AnimatePresence>
        {editScope ? (
          <motion.div
            className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-[1px] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editScope ? (
          <motion.div
            initial={{ y: 260, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 260, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="fixed bottom-0 left-0 right-0 z-[90] px-6 pb-4"
          >
            <div className="rounded-2xl border border-white/10 bg-[#0b0b10]/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white/90">
                  {editScope === "hidden" ? "비노출 컨텐츠 편집" : "편집된 컨텐츠 편집"} · {selectedKeys.size}개 선택
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm whitespace-nowrap"
                    onClick={() => {
                      if (selectedKeys.size === currentCards.length) clearSelection();
                      else selectAllCurrent();
                    }}
                    disabled={currentCards.length === 0}
                  >
                    {selectedKeys.size === currentCards.length ? "전체취소" : "전체선택"}
                  </button>

                  {editScope === "hidden" ? (
                    <>
                      <button
                        type="button"
                        className="h-9 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-sm font-semibold whitespace-nowrap"
                        onClick={() =>
                          askConfirm(
                            "선택 컨텐츠를 노출할까요?",
                            "선택한 비노출 컨텐츠가 다시 노출됩니다.",
                            "노출",
                            async () => {
                              await applyForceHidden(selectedOverrides, false);
                              clearSelection();
                            },
                          )
                        }
                        disabled={selectedOverrides.length === 0 || busyKey === "bulk"}
                      >
                        노출
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="h-9 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-sm font-semibold whitespace-nowrap"
                        onClick={() =>
                          askConfirm(
                            "선택 컨텐츠를 초기화할까요?",
                            "선택한 컨텐츠의 관리자 오버라이드를 초기화합니다.",
                            "초기화",
                            async () => {
                              await resetOverrides(selectedOverrides);
                              clearSelection();
                            },
                          )
                        }
                        disabled={selectedOverrides.length === 0 || busyKey === "bulk"}
                      >
                        초기화
                      </button>
                    </>
                  )}

                  {editScope !== "hidden" ? (
                    <button
                      type="button"
                      className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15 inline-flex items-center justify-center"
                      onClick={closeEditMode}
                      aria-label="편집 종료"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <BottomConfirmSheet
        open={confirm.open}
        title={confirm.title}
        desc={confirm.desc}
        confirmText={confirm.confirmText}
        onClose={closeConfirm}
        onConfirm={() => void runConfirm()}
      />

      <PageFooter />
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "amber" | "violet";
}) {
  const toneClass =
    tone === "sky"
      ? "from-sky-500/35 to-sky-400/10"
      : tone === "emerald"
        ? "from-emerald-500/35 to-emerald-400/10"
        : tone === "amber"
          ? "from-amber-500/35 to-amber-400/10"
          : "from-violet-500/35 to-violet-400/10";

  return (
    <div className={`rounded-xl bg-gradient-to-br ${toneClass} p-3`}>
      <div className="text-[11px] text-white/70">{label}</div>
      <div className="mt-1 text-xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

function SparkBars({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) {
    return <div className="mt-3 text-xs text-white/45">표시할 일자 데이터가 없습니다.</div>;
  }
  return (
    <div className="mt-3">
      <div className="h-28 flex items-end gap-1">
        {data.map((d) => (
          <div key={`spark:${d.label}`} className="flex-1 min-w-0">
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-cyan-500/80 to-sky-300/70"
              style={{ height: `${Math.max(8, Math.round((d.value / max) * 100))}%` }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/45">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function StatBarList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
  tone: "sky" | "emerald" | "amber";
}) {
  const max = Math.max(1, ...items.map((x) => x.count));
  const fillClass =
    tone === "sky"
      ? "bg-sky-400/80"
      : tone === "emerald"
        ? "bg-emerald-400/80"
        : "bg-amber-400/80";

  return (
    <div className="rounded-xl bg-black/20 p-3">
      <div className="text-xs text-white/65">{title}</div>
      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-white/45">데이터 없음</div>
        ) : (
          items.map((x) => (
            <div key={`${title}:${x.name}`} className="text-xs">
              <div className="flex items-center justify-between text-white/80">
                <span className="truncate pr-2">{x.name}</span>
                <span>{x.count}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${fillClass}`}
                  style={{ width: `${Math.max(6, Math.round((x.count / max) * 100))}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RowHeader({
  title,
  count,
  desc,
  editing,
  onToggleEdit,
}: {
  title: string;
  count: number;
  desc: string;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  return (
    <div className="px-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title} <span className="text-white/45 text-lg font-semibold">({count})</span></h2>
          <p className="mt-1 text-sm text-white/60">{desc}</p>
        </div>
        <button
          type="button"
          onClick={onToggleEdit}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200 whitespace-nowrap"
        >
          {editing ? "완료" : "편집"}
        </button>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="px-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {desc ? <p className="mt-1 text-sm text-white/60">{desc}</p> : null}
      </div>
    </div>
  );
}

function AdminCardRow({
  cards,
  targetCount,
  editing,
  selectedKeys,
  loading,
  onCardClick,
  onToggleSelect,
}: {
  cards: AdminCardItem[];
  targetCount: number;
  editing: boolean;
  selectedKeys: Set<string>;
  loading: boolean;
  onCardClick: (card: AdminCardItem) => void;
  onToggleSelect: (card: AdminCardItem) => void;
}) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  const scroll = (direction: "left" | "right") => {
    const el = ref.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85;
    const next = direction === "left" ? Math.max(0, scrollPosition - amount) : scrollPosition + amount;
    el.scrollTo({ left: next, behavior: "smooth" });
    setScrollPosition(next);
  };

  if (loading && targetCount > 0 && cards.length === 0) {
    return (
      <div className="px-6 mt-4 text-sm text-white/55">컨텐츠를 불러오는 중입니다...</div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="px-6 mt-4">
        <div className="rounded-2xl bg-white/[0.02] p-5 text-sm text-white/60">
          표시할 컨텐츠가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 group/row relative">
      {scrollPosition > 0 ? (
        <button
          type="button"
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-20 w-12 sm:w-14 bg-gradient-to-r from-[#10131b] to-transparent flex items-center justify-start pl-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label="왼쪽으로 스크롤"
        >
          <ChevronLeft className="w-10 h-10 text-white drop-shadow-lg" />
        </button>
      ) : null}

      <div
        ref={ref}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-6 scroll-smooth py-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onScroll={(e) => setScrollPosition(e.currentTarget.scrollLeft)}
      >
        {cards.map((card) => {
          const key = itemKey(card.__override.mediaType, card.__override.tmdbId);
          const selected = selectedKeys.has(key);

          return (
            <div key={`admin:${key}`} className="flex-shrink-0 relative">
              <ContentCard
                item={card}
                isFavorite={false}
                onClick={() => onCardClick(card)}
                onToggleFavorite={() => {}}
                canFavorite={false}
                context="default"
                ignoreAdminHidden
                className={`w-[140px] sm:w-[200px] ${editing ? "ring-0" : ""}`}
              />

              {editing ? (
                <button
                  type="button"
                  onClick={() => onToggleSelect(card)}
                  className="absolute right-2 top-2 z-30 h-7 w-7 rounded-full border border-white/60 bg-black/35 inline-flex items-center justify-center"
                >
                  {selected ? <Check className="h-4 w-4" /> : null}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scroll("right")}
        className="absolute right-0 top-0 bottom-0 z-20 w-12 sm:w-14 bg-gradient-to-l from-[#10131b] to-transparent flex items-center justify-end pr-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
        aria-label="오른쪽으로 스크롤"
      >
        <ChevronRight className="w-10 h-10 text-white drop-shadow-lg" />
      </button>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.02] p-4">
      <div className="inline-flex items-center gap-2 text-xs text-white/70">{icon}{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-10 px-3 rounded-xl text-sm font-semibold whitespace-nowrap",
        active ? "bg-white text-black" : "bg-white/10 hover:bg-white/15 text-white",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function BottomConfirmSheet(props: {
  open: boolean;
  title: string;
  desc?: string;
  confirmText: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { open, title, desc, confirmText, onClose, onConfirm } = props;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[95] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 220, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 220, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="fixed bottom-0 left-0 right-0 z-[96] px-6 pb-4"
          >
            <div className="rounded-2xl bg-[#0b0b10]/95 p-5 shadow-2xl backdrop-blur">
              <h3 className="text-lg font-bold">{title}</h3>
              {desc ? <p className="mt-2 text-sm text-white/65">{desc}</p> : null}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
                  onClick={onClose}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-sm font-semibold"
                  onClick={onConfirm}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
