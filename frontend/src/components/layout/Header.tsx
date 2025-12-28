// frontend/src/components/layout/Header.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
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

  searchQuery: string;
  onSearchChange: (query: string) => void;
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
  if (pathname.startsWith("/picky")) return "picky";
  if (pathname.startsWith("/mypage")) return "mypage";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

export function Header({
  onNavigate,
  currentSection,
  searchQuery,
  onSearchChange,
}: HeaderProps) {
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

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    if (!profileOpen) return;

    const onDown = (e: MouseEvent) => {
      const el = popoverRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target))
        setProfileOpen(false);
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

  const go = (section: string) => {
    if (section === "home") return navigate("/");
    if (section === "favorites") return navigate("/favorites");
    if (section === "picky") return navigate("/picky");
    if (section === "mypage") return navigate("/mypage");
    if (section === "settings") return navigate("/settings");
    onNavigate?.(section);
  };

  const active = currentSection ?? activeSection;

  const displayName = (me?.nickname?.trim() || me?.username || "").trim();

  const onLogout = async () => {
    try {
      await apiPost("/auth/logout", {});
    } finally {
      localStorage.removeItem(AUTH_KEYS.ACCESS);
      localStorage.removeItem(AUTH_KEYS.USER);
      window.dispatchEvent(new Event("pickmovie-auth-changed"));
      setProfileOpen(false);
      navigate("/", { replace: true });
    }
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
          className="absolute inset-0 bg-[#1a1a24]/95 backdrop-blur-md shadow-lg border-b border-white/5 transition-opacity duration-300"
          style={{ opacity: scrolled ? 1 : 0 }}
          aria-hidden="true"
        />

        <div className="relative z-10 w-full flex items-center justify-between">
          {/* 좌측 */}
          <div className="flex items-center gap-8 h-full">
            <button onClick={() => go("home")} className="flex-shrink-0">
              <Logo size="sm" />
            </button>

            <nav className="hidden md:flex items-center gap-1 h-full">
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

              {/* ✅ 마이페이지 Nav 제거 */}

              <button
                onClick={() => go("picky")}
                className="flex items-center gap-1.5 px-3 py-1.5 ml-2 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 text-sm font-medium text-purple-300 hover:text-white hover:border-purple-500/40 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Picky에게 물어보기
              </button>
            </nav>
          </div>

          {/* 우측 */}
          <div className="flex items-center gap-3 flex-1 justify-end max-w-md">
            <div className="relative flex-1 hidden sm:block group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="영화, 드라마 검색..."
                className="w-full bg-white/10 hover:bg-white/15 focus:bg-black/40 border border-transparent focus:border-purple-500/50 rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none transition-all"
              />
            </div>

            {!me ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-white hover:bg-white/10 gap-2 h-9 px-4 rounded-full"
                onClick={() => navigate("/login")}
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">로그인</span>
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
                  <span className="hidden sm:inline text-sm font-semibold">
                    {displayName}님
                  </span>

                  {/* ✅ 원형 제거 → 화살표만 */}
                  <ChevronDown
                    className={`h-4 w-4 text-white/80 transition-transform ${
                      profileOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {profileOpen ? (
                  <div className="absolute right-0 mt-2 w-[260px] rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                          <UserRound className="h-5 w-5 text-white/80" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">
                            {displayName}님
                          </div>
                          <div className="text-xs text-white/50 truncate">
                            {me.email ?? "이메일 미등록"}
                          </div>
                        </div>
                      </div>

                      {/* ✅ 메뉴 순서: 마이페이지 / 설정 / 로그아웃 */}
                      <div className="mt-4 grid gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            navigate("/mypage");
                          }}
                          className="w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm text-white flex items-center justify-between"
                        >
                          <span>마이페이지</span>
                          <span className="text-white/35">→</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            navigate("/settings");
                          }}
                          className="w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm text-white flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-white/70" />
                            설정
                          </span>
                          <span className="text-white/35">→</span>
                        </button>

                        <button
                          type="button"
                          onClick={onLogout}
                          className="w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm text-white flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <LogOut className="h-4 w-4 text-white/70" />
                            로그아웃
                          </span>
                          <span className="text-white/35">→</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
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
