// frontend/src/components/layout/Header.tsx
import { useEffect, useMemo, useRef, useState, useId } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Search,
  User,
  LogOut,
  ChevronDown,
  Settings,
  Bell,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../icons/Logo";
import { Button } from "../ui/button";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/apiClient";
import {
  AUTH_EVENT,
  AUTH_KEYS,
  openAuthModal,
  reloadAfterAuth,
} from "../../lib/auth";

export interface HeaderProps {
  onNavigate?: (section: string) => void;
  currentSection?: string;
  onOpenAI?: () => void;
}

type SafeUser = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
  role?: string | null;
};

type IssueReplyNotification = {
  id: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  contentTitle: string | null;
  issueMessage: string;
  adminReply: string;
  adminRepliedAt: string;
  isRead: boolean;
};

function readStoredUser(): SafeUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.USER);
    if (!raw) return null;
    return JSON.parse(raw) as SafeUser;
  } catch {
    return null;
  }
}

function getActiveSection(pathname: string) {
  if (pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);

    onChange();
    if (m.addEventListener) m.addEventListener("change", onChange);
    else m.addListener(onChange);

    return () => {
      if (m.removeEventListener) m.removeEventListener("change", onChange);
      else m.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

export function Header({ onNavigate, currentSection }: HeaderProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [me, setMe] = useState<SafeUser | null>(() => readStoredUser());
  const [profileOpen, setProfileOpen] = useState(false);
  const [issueNoticeOpen, setIssueNoticeOpen] = useState(false);
  const [issueUnreadCount, setIssueUnreadCount] = useState(0);
  const [issueNotifications, setIssueNotifications] = useState<IssueReplyNotification[]>([]);
  const [issueLoading, setIssueLoading] = useState(false);
  const [dismissingIssueIds, setDismissingIssueIds] = useState<Set<number>>(new Set());

  const popoverRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const isMainScreen = location.pathname === "/";

  const activeSection = useMemo(
    () => getActiveSection(location.pathname),
    [location.pathname],
  );

  const isMdUp = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const MAX = 72;
    let raf = 0;

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const p = Math.min(1, Math.max(0, y / MAX));
        setScrollProgress(p);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const sync = () => setMe(readStoredUser());
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!profileOpen) return;

    const onDown = (e: MouseEvent) => {
      const el = popoverRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setProfileOpen(false);
        setIssueNoticeOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProfileOpen(false);
        setIssueNoticeOpen(false);
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  const loadIssueNotifications = async () => {
    if (!me) {
      setIssueUnreadCount(0);
      setIssueNotifications([]);
      return;
    }
    setIssueLoading(true);
    try {
      const res = await apiGet<{
        unreadCount: number;
        items: IssueReplyNotification[];
      }>("/analytics/content-issues/my-notifications", { limit: 20 });
      setIssueUnreadCount(Number(res?.unreadCount ?? 0));
      setIssueNotifications(Array.isArray(res?.items) ? res.items : []);
      setDismissingIssueIds(new Set());
    } catch {
      setIssueUnreadCount(0);
      setIssueNotifications([]);
      setDismissingIssueIds(new Set());
    } finally {
      setIssueLoading(false);
    }
  };

  useEffect(() => {
    if (!me) {
      setIssueUnreadCount(0);
      setIssueNotifications([]);
      setIssueNoticeOpen(false);
      return;
    }
    void loadIssueNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (!profileOpen || !me) return;
    void loadIssueNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileOpen, me?.id]);

  const openSearchOverlay = () => {
    setProfileOpen(false);
    navigate("/search", { state: { backgroundLocation: location } });
  };

  const openAnalyze = () => {
    setProfileOpen(false);
    navigate("/analyze");
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  };

  const analyzeBtnClass =
    "!border-0 !bg-gradient-to-r !from-purple-600 !to-pink-600 hover:brightness-110";

  const go = (section: string) => {
    if (section === "home") return navigate("/");
    if (section === "favorites") {
      if (!me) {
        openAuthModal("login");
        return;
      }
      return navigate("/favorites");
    }
    if (section === "settings") {
      navigate("/settings");
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
      return;
    }
    onNavigate?.(section);
  };

  const active = currentSection ?? activeSection;
  const displayName = (me?.nickname?.trim() || me?.username || "").trim();
  const isAdmin = String(me?.role ?? "").toUpperCase() === "ADMIN";
  const displayEmail = (() => {
    const email = (me?.email ?? "").trim();
    if (!email) return "이메일 미등록";
    const at = email.indexOf("@");
    if (at <= 0) return email;
    return email.slice(0, at);
  })();

  const onLogout = async () => {
    try {
      await apiPost("/auth/logout", {});
    } catch {
      // ignore
    } finally {
      localStorage.removeItem(AUTH_KEYS.ACCESS);
      localStorage.removeItem(AUTH_KEYS.USER);
      setProfileOpen(false);
      setIssueNoticeOpen(false);
      reloadAfterAuth("/");
    }
  };

  const markIssueAsRead = async (id: number) => {
    if (!Number.isFinite(id) || id <= 0) return;
    try {
      await apiPatch<{ ok: true }>(`/analytics/content-issues/my-notifications/${id}/read`, {});
    } catch {
      // ignore
    }
    await loadIssueNotifications();
  };

  const deleteIssueNotification = async (id: number) => {
    if (!Number.isFinite(id) || id <= 0) return;
    if (dismissingIssueIds.has(id)) return;
    const target = issueNotifications.find((x) => x.id === id);
    if (!target) return;

    setDismissingIssueIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (!target.isRead) {
      setIssueUnreadCount((prev) => Math.max(0, prev - 1));
    }

    await new Promise((resolve) => window.setTimeout(resolve, 260));

    try {
      await apiDelete<{ ok: true }>(`/analytics/content-issues/my-notifications/${id}`);
      setIssueNotifications((prev) => prev.filter((x) => x.id !== id));
    } catch {
      if (!target.isRead) {
        setIssueUnreadCount((prev) => prev + 1);
      }
      setDismissingIssueIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadIssueNotifications();
      return;
    }
    setDismissingIssueIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    void loadIssueNotifications();
  };

  const menuMotion = {
    initial: { opacity: 0, y: -6, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -6, scale: 0.98 },
    transition: { duration: 0.12, ease: "easeOut" as const },
  };

  const tooltipId = useId();

  const searchBtnVariants: Variants = {
    rest: { scale: 1 },
    hover: { scale: 1.03, transition: { duration: 0.15, ease: "easeOut" } },
    tap: { scale: 0.98 },
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full">
      <div className="relative w-full px-6 h-15 flex items-center justify-between">
        <div
          className={[
            "pointer-events-none absolute top-0 left-0 right-0",
            "h-[60px]",
            "bg-[radial-gradient(120%_85%_at_50%_0%,rgba(0,0,0,0.38)_0%,rgba(0,0,0,0.14)_55%,rgba(0,0,0,0)_78%),linear-gradient(to_bottom,rgba(0,0,0,0.42)_0%,rgba(0,0,0,0.18)_60%,rgba(0,0,0,0)_100%)]",
            "will-change-[opacity]",
          ].join(" ")}
          style={{ opacity: isMainScreen ? 1 - scrollProgress : 0 }}
          aria-hidden="true"
        />

        {!isMainScreen ? (
          <div
            className={[
              "pointer-events-none absolute inset-0",
              "bg-[#0b0b10]/55",
              "will-change-[opacity]",
            ].join(" ")}
            aria-hidden="true"
          />
        ) : null}

        <div
          className={[
            "pointer-events-none absolute inset-0",
            "bg-[#10131b]/90 backdrop-blur-md",
            "will-change-[opacity,box-shadow]",
          ].join(" ")}
          style={{
            opacity: scrollProgress,
            boxShadow: `0 10px 30px rgba(0,0,0,${0.1 * scrollProgress})`,
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 w-full flex items-center justify-between [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]">
          <div className="flex items-center gap-4 h-full">
            <button
              onClick={() => go("home")}
              className="flex-shrink-0"
              aria-label="PickMovie 홈"
            >
              <Logo size="sm" />
            </button>

            <AnimatePresence initial={false}>
              {isMdUp ? (
                <motion.nav
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex items-center gap-1 h-full"
                >
                  <NavItem
                    label="홈"
                    isActive={active === "home"}
                    onClick={() => go("home")}
                  />
                  <NavItem
                    label="찜/플레이리스트"
                    isActive={active === "favorites"}
                    onClick={() => go("favorites")}
                  />
                  {isAdmin ? (
                    <NavItem
                      label="관리자 설정"
                      isActive={location.pathname.startsWith("/admin/settings")}
                      onClick={() => {
                        navigate("/admin/settings");
                        requestAnimationFrame(() => {
                          window.scrollTo({ top: 0, behavior: "auto" });
                        });
                      }}
                    />
                  ) : null}
                </motion.nav>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end ml-3">
            {isMdUp ? (
              <motion.button
                type="button"
                onClick={openAnalyze}
                variants={searchBtnVariants}
                initial="rest"
                animate="rest"
                whileHover="hover"
                whileTap="tap"
                className={[
                  "h-9 px-4 rounded-full inline-flex items-center justify-center",
                  "text-sm font-bold text-white",
                  analyzeBtnClass,
                  "shadow-none",
                  "transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b10]",
                ].join(" ")}
              >
                분석하기
              </motion.button>
            ) : null}

            <div className="relative group">
              <motion.button
                type="button"
                onClick={openSearchOverlay}
                aria-label="검색"
                aria-describedby={tooltipId}
                variants={searchBtnVariants}
                initial="rest"
                animate="rest"
                whileHover="hover"
                whileTap="tap"
                className={[
                  "h-9 w-9 rounded-full flex items-center justify-center",
                  "bg-white/5 border border-white/15 text-white/80",
                  "hover:text-white hover:border-white/30 hover:bg-white/10 transition-all",
                  "shadow-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b10]",
                ].join(" ")}
              >
                <Search className="h-5 w-5" />
              </motion.button>

              <div
                id={tooltipId}
                role="tooltip"
                className={[
                  "pointer-events-none absolute right-0 top-full mt-2 z-50",
                  "opacity-0 translate-y-1",
                  "group-hover:opacity-100 group-hover:translate-y-0",
                  "group-focus-within:opacity-100 group-focus-within:translate-y-0",
                  "transition duration-150 ease-out",
                ].join(" ")}
              >
                <div className="relative rounded-xl border border-white/20 bg-black/75 backdrop-blur-xl px-3 py-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
                  <div className="text-xs font-semibold text-white/90 whitespace-nowrap">
                    검색하기
                  </div>
                  <div className="absolute right-4 -top-1 h-2 w-2 rotate-45 border-t border-l border-white/20 bg-black/75" />
                </div>
              </div>
            </div>

            {!me ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-white hover:bg-white/10 gap-2 h-9 px-3 rounded-full"
                onClick={() => openAuthModal("login")}
              >
                <User className="w-4 h-4" />
                <span className="hidden md:inline font-bold">로그인</span>
              </Button>
            ) : (
              <div className="relative" ref={popoverRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex items-center gap-2 h-9 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-white/85"
                  aria-haspopup="dialog"
                  aria-expanded={profileOpen}
                >
                  <span className="text-sm font-semibold max-w-[140px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-white/80 transition-transform ${
                      profileOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {profileOpen ? (
                    <motion.div
                      {...menuMotion}
                      className="absolute right-0 mt-3 w-[220px] rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden"
                    >
                      <div className="p-4">
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-bold text-white truncate">
                              {displayName}
                            </div>
                            <button
                              type="button"
                              onClick={() => setIssueNoticeOpen((v) => !v)}
                              className="relative h-7 w-7 rounded-full bg-white/10 hover:bg-white/15 inline-flex items-center justify-center"
                              aria-label="오류 제보 답변 알림"
                              title="오류 제보 답변 알림"
                            >
                              <Bell className="h-4 w-4 text-white/85" />
                              {issueUnreadCount > 0 ? (
                                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
                              ) : null}
                            </button>
                          </div>
                          <div className="mt-0.5 text-xs text-white/50 truncate">
                            {displayEmail}
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {issueNoticeOpen ? (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="mt-3 rounded-xl bg-white/5 p-2"
                            >
                              <div className="px-1 pb-1 text-xs font-semibold text-white/80">
                                답변 알림
                              </div>
                              {issueLoading ? (
                                <div className="px-2 py-3 text-xs text-white/60">불러오는 중...</div>
                              ) : issueNotifications.length === 0 ? (
                                <div className="px-2 py-3 text-xs text-white/55">
                                  새로운 답변이 없습니다.
                                </div>
                              ) : (
                                <div className="max-h-[220px] overflow-y-auto space-y-1">
                                  <AnimatePresence initial={false}>
                                    {issueNotifications
                                      .filter((item) => !dismissingIssueIds.has(item.id))
                                      .map((item) => (
                                    <motion.div
                                      key={`issue-noti:${item.id}`}
                                      layout
                                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{
                                        opacity: 0,
                                        x: 64,
                                        y: -2,
                                        scale: 0.9,
                                        rotate: 4,
                                        filter: "blur(2px)",
                                      }}
                                      transition={{
                                        layout: { type: "spring", stiffness: 480, damping: 34 },
                                        default: { type: "spring", stiffness: 520, damping: 30, mass: 0.75 },
                                      }}
                                      className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await markIssueAsRead(item.id);
                                            setIssueNoticeOpen(false);
                                            setProfileOpen(false);
                                            navigate(`/title/${item.mediaType}/${item.tmdbId}`, {
                                              state: { backgroundLocation: location },
                                            });
                                          }}
                                          className="min-w-0 text-left flex-1"
                                        >
                                          <div className="text-xs font-semibold text-white/90 truncate">
                                            {item.contentTitle?.trim() ||
                                              `${item.mediaType.toUpperCase()} #${item.tmdbId}`}
                                          </div>
                                          <div className="mt-0.5 text-[11px] text-white/65 line-clamp-2">
                                            {item.adminReply}
                                          </div>
                                        </button>
                                        <div className="flex items-center gap-1">
                                          {!item.isRead ? (
                                            <span className="h-2 w-2 rounded-full bg-rose-500 flex-shrink-0" />
                                          ) : null}
                                          <button
                                            type="button"
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              await deleteIssueNotification(item.id);
                                            }}
                                            className="h-6 w-6 rounded-md bg-white/10 hover:bg-white/15 inline-flex items-center justify-center"
                                            title="알림 삭제"
                                            aria-label="알림 삭제"
                                          >
                                            <Trash2 className="h-3.5 w-3.5 text-white/75" />
                                          </button>
                                        </div>
                                      </div>
                                      <div className="mt-1 text-[10px] text-white/45">
                                        {new Date(item.adminRepliedAt).toLocaleString("ko-KR", {
                                          hour12: false,
                                          year: "numeric",
                                          month: "2-digit",
                                          day: "2-digit",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </div>
                                    </motion.div>
                                  ))}
                                  </AnimatePresence>
                                </div>
                              )}
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        <div className="mt-4 grid gap-2">
                          <AnimatePresence initial={false}>
                            {!isMdUp ? (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="overflow-hidden grid gap-2"
                              >
                                <MenuButton
                                  label="분석하기"
                                  onClick={openAnalyze}
                                  className={analyzeBtnClass}
                                  arrowClassName="text-white/80"
                                />
                                <MenuButton
                                  label="찜/플레이리스트"
                                  onClick={() => {
                                    setProfileOpen(false);
                                    navigate("/favorites");
                                  }}
                                />
                                {isAdmin ? (
                                  <MenuButton
                                    label="관리자 설정"
                                    onClick={() => {
                                      setProfileOpen(false);
                                      navigate("/admin/settings");
                                      requestAnimationFrame(() => {
                                        window.scrollTo({ top: 0, behavior: "auto" });
                                      });
                                    }}
                                  />
                                ) : null}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>

                          <MenuButton
                            label="설정"
                            icon={
                              <Settings className="h-4 w-4 text-white/70" />
                            }
                            onClick={() => {
                              setProfileOpen(false);
                              navigate("/settings");
                              requestAnimationFrame(() => {
                                window.scrollTo({ top: 0, behavior: "auto" });
                              });
                            }}
                          />
                          <MenuButton
                            label="로그아웃"
                            icon={<LogOut className="h-4 w-4 text-white/70" />}
                            onClick={onLogout}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function NavItem({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
        isActive
          ? "text-white"
          : "text-gray-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

function MenuButton({
  label,
  icon,
  onClick,
  className,
  arrowClassName,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  className?: string;
  arrowClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm font-semibold text-white flex items-center justify-between",
        className ?? "",
      ].join(" ")}
    >
      <span className="flex items-center gap-2">
        {icon ? icon : null}
        {label}
      </span>
      <span className={arrowClassName ?? "text-white/35"}>→</span>
    </button>
  );
}
