// frontend/src/components/layout/Header.tsx

import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../icons/Logo";
import { Button } from "../ui/button";

export interface HeaderProps {
  // ✅ 기존 코드 호환용(있어도 되고 없어도 됨)
  onNavigate?: (section: string) => void;
  currentSection?: string;

  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenAI?: () => void;
}

function getActiveSection(pathname: string) {
  // ✅ Header 메뉴는 홈/찜/피키만 있으므로
  // 인기 영화/TV 페이지도 "홈" 활성으로 취급 (디자인 유지 + UX 자연스러움)
  if (pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/picky")) return "picky";
  return "home";
}

export function Header({
  onNavigate,
  currentSection,
  searchQuery,
  onSearchChange,
}: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
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

  const go = (section: string) => {
    // ✅ Header가 라우팅 담당
    if (section === "home") return navigate("/");
    if (section === "favorites") return navigate("/favorites");
    if (section === "picky") return navigate("/picky");

    // 혹시 다른 메뉴가 추가됐을 때만 fallback
    onNavigate?.(section);
  };

  const active = currentSection ?? activeSection;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full">
      <div className="relative w-full px-6 h-16 flex items-center justify-between">
        {/* ✅ 배경 2장을 겹쳐서 opacity만 전환(갑툭튀 제거) */}
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

        {/* content */}
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

            <Button
              variant="ghost"
              size="sm"
              className="text-gray-300 hover:text-white hover:bg-white/10 gap-2 h-9 px-4 rounded-full"
              onClick={() => navigate("/login")}
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">로그인</span>
            </Button>
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
