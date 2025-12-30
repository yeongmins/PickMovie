// frontend/src/components/layout/Header.tsx
import { useEffect, useMemo, useRef, useState, useId } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Sparkles,
  User,
  LogOut,
  UserRound,
  ChevronDown,
  Settings,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../icons/Logo";
import { Button } from "../ui/button";
import { apiPost } from "../../lib/apiClient";

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
};

const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

const AUTH_EVENT = "pickmovie-auth-changed";

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
  if (pathname.startsWith("/mypage")) return "mypage";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

// ✅ PC <-> 태블릿 브레이크포인트 전환을 "자연스럽게" (resize 시에도 부드럽게)
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
  const [scrolled, setScrolled] = useState(false);
  const [me, setMe] = useState<SafeUser | null>(() => readStoredUser());
  const [profileOpen, setProfileOpen] = useState(false);

  const popoverRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const activeSection = useMemo(
    () => getActiveSection(location.pathname),
    [location.pathname]
  );

  // tailwind md = 768px
  const isMdUp = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
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
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  const openPickyOverlay = () => {
    setProfileOpen(false);
    navigate("/picky", { state: { backgroundLocation: location } });
  };

  const go = (section: string) => {
    if (section === "home") return navigate("/");
    if (section === "favorites") return navigate("/favorites");
    if (section === "mypage") return navigate("/mypage");
    if (section === "settings") return navigate("/settings");
    onNavigate?.(section);
  };

  const active = currentSection ?? activeSection;
  const displayName = (me?.nickname?.trim() || me?.username || "").trim();

  const onLogout = async () => {
    try {
      await apiPost("/auth/logout", {});
    } catch {
      // ignore
    } finally {
      localStorage.removeItem(AUTH_KEYS.ACCESS);
      localStorage.removeItem(AUTH_KEYS.USER);
      setProfileOpen(false);
      window.location.replace("/");
    }
  };

  const menuMotion = {
    initial: { opacity: 0, y: -6, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -6, scale: 0.98 },
    transition: { duration: 0.12, ease: "easeOut" as const },
  };

  const tooltipId = useId();

  const pickyBtnVariants: Variants = {
    rest: { scale: 1 },
    hover: { scale: 1.03, transition: { duration: 0.15, ease: "easeOut" } },
    tap: { scale: 0.98 },
  };

  const sparkleVariants: Variants = {
    rest: { rotate: 0, scale: 1 },
    hover: {
      rotate: [0, -12, 12, -6, 0] as any,
      scale: [1, 1.18, 1.05, 1.14, 1] as any,
      transition: { duration: 0.55, ease: "easeOut" },
    },
    tap: { scale: 0.95 },
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full">
      <div className="relative w-full px-6 h-16 flex items-center justify-between">
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent transition-opacity duration-300"
          style={{ opacity: scrolled ? 0 : 1 }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-[#1a1a24]/95 backdrop-blur-md shadow-lg transition-opacity duration-300"
          style={{ opacity: scrolled ? 1 : 0 }}
          aria-hidden="true"
        />

        <div className="relative z-10 w-full flex items-center justify-between">
          {/* 좌측 */}
          <div className="flex items-center gap-8 h-full">
            <button
              onClick={() => go("home")}
              className="flex-shrink-0"
              aria-label="PickMovie 홈"
            >
              <Logo size="sm" />
            </button>

            {/* ✅ PC<->태블릿 전환 시 페이드로 자연스럽게 */}
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
                </motion.nav>
              ) : null}
            </AnimatePresence>
          </div>

          {/* 우측 */}
          <div className="flex items-center gap-2 flex-1 justify-end ml-3">
            {/* ✅ Picky 버튼 */}
            <div className="relative group">
              <motion.button
                type="button"
                onClick={openPickyOverlay}
                aria-label="Picky에게 추천받기"
                aria-describedby={tooltipId}
                variants={pickyBtnVariants}
                initial="rest"
                animate="rest"
                whileHover="hover"
                whileTap="tap"
                className={[
                  "h-9 w-9 rounded-full flex items-center justify-center",
                  "bg-gradient-to-r from-purple-500/10 to-pink-500/10",
                  "border border-purple-500/20 text-purple-300",
                  "hover:text-white hover:border-purple-500/40 transition-all",
                  "shadow-none hover:shadow-[0_0_0_1px_rgba(168,85,247,0.35),0_0_26px_rgba(236,72,153,0.22)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b10]",
                ].join(" ")}
              >
                <motion.span variants={sparkleVariants}>
                  <Sparkles className="h-5 w-5" />
                </motion.span>
              </motion.button>

              {/* ✅ 툴팁: 프로필 토글을 가리지 않도록 '오른쪽 정렬' + 꼬리 위치도 버튼을 향하게 */}
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
                <div className="relative rounded-xl border border-purple-500/20 bg-black/75 backdrop-blur-xl px-3 py-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
                  <div className="text-xs font-semibold text-white/90 whitespace-nowrap">
                    Picky에게 추천받기
                  </div>
                  {/* 말머리(꼬리): 버튼 중심을 향하도록 오른쪽 쪽에 배치 */}
                  <div className="absolute right-4 -top-1 h-2 w-2 rotate-45 border-t border-l border-purple-500/20 bg-black/75" />
                </div>
              </div>
            </div>

            {!me ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-white hover:bg-white/10 gap-2 h-9 px-3 rounded-full"
                onClick={() => navigate("/login")}
              >
                <User className="w-4 h-4" />
                <span className="hidden md:inline font-medium">로그인</span>
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
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                            <UserRound className="h-5 w-5 text-white/80" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">
                              {displayName}
                            </div>
                            <div className="text-xs text-white/50 truncate">
                              {me.username ?? "이메일 미등록"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2">
                          {/* ✅ md 이하에서만 노출 + 전환 시 자연스러운 애니메이션 */}
                          <AnimatePresence initial={false}>
                            {!isMdUp ? (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="overflow-hidden"
                              >
                                <MenuButton
                                  label="찜/플레이리스트"
                                  onClick={() => {
                                    setProfileOpen(false);
                                    navigate("/favorites");
                                  }}
                                />
                              </motion.div>
                            ) : null}
                          </AnimatePresence>

                          <MenuButton
                            label="마이페이지"
                            onClick={() => {
                              setProfileOpen(false);
                              navigate("/mypage");
                            }}
                          />
                          <MenuButton
                            label="설정"
                            icon={
                              <Settings className="h-4 w-4 text-white/70" />
                            }
                            onClick={() => {
                              setProfileOpen(false);
                              navigate("/settings");
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
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm text-white flex items-center justify-between"
    >
      <span className="flex items-center gap-2">
        {icon ? icon : null}
        {label}
      </span>
      <span className="text-white/35">→</span>
    </button>
  );
}
