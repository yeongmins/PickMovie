// Header.tsx
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Logo } from "../icons/Logo";

interface HeaderProps {
  onNavigate: (section: string) => void;
  currentSection: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const MENU_ITEMS = [
  { id: "home", label: "홈" },
  { id: "favorites", label: "내 찜 목록" },
  { id: "popular-movies", label: "인기 영화" },
  { id: "popular-tv", label: "인기 TV 컨텐츠" },
] as const;

export function Header({
  onNavigate,
  currentSection,
  searchQuery,
  onSearchChange,
}: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  const scrollToTopInstant = () => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  };

  const handleNavigate = (sectionId: string) => {
    onNavigate(sectionId);
    onSearchChange("");
    scrollToTopInstant();
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full">
      <div
        className={`
          w-full px-6 py-5
          flex items-center justify-between
          transition-all duration-300
          ${
            scrolled
              ? "bg-[#1a1a24]/95 backdrop-blur-md shadow-lg"
              : "bg-transparent"
          }
        `}
      >
        <div className="flex items-center gap-8">
          <button
            onClick={() => handleNavigate("home")}
            className="flex-shrink-0 hover:opacity-80 transition-opacity pr-4"
            aria-label="PickMovie 홈으로 이동"
          >
            <Logo size="md" />
          </button>

          <nav
            className="hidden md:flex items-center gap-6 pr-4"
            aria-label="주요 섹션"
          >
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`text-md transition-colors ${
                  currentSection === item.id
                    ? "text-white"
                    : "text-gray-300 hover:text-white"
                }`}
                aria-current={currentSection === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 max-w-search">
          <label htmlFor="main-search" className="sr-only">
            콘텐츠 검색
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 mt-2"
              aria-hidden="true"
            />
            <input
              id="main-search"
              name="search"
              type="search"
              autoComplete="off"
              placeholder="제목을 입력하세요"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-search rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-purple-400/70 focus:bg-black/60 transition-all"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
