import { Search } from "lucide-react";
import { Logo } from "./Logo";

interface HeaderProps {
  onNavigate: (section: string) => void;
  currentSection: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({
  onNavigate,
  currentSection,
  searchQuery,
  onSearchChange,
}: HeaderProps) {
  const menuItems = [
    { id: "home", label: "홈" },
    { id: "favorites", label: "내 찜 목록" },
    { id: "popular-movies", label: "인기 영화" },
    { id: "popular-tv", label: "인기 TV 컨텐츠" },
  ];

  // 🟣 스크롤을 "즉시" 최상단으로 이동시키는 함수 (애니메이션 X)
  const scrollToTopInstant = () => {
    if (typeof window !== "undefined") {
      // behavior 생략 or "auto" => 눈에 보이는 스무스 스크롤 없이 바로 점프
      window.scrollTo(0, 0);
    }
  };

  // 공통 네비게이션 핸들러
  const handleNavigate = (sectionId: string) => {
    onNavigate(sectionId); // 섹션 변경
    onSearchChange(""); // 검색어 초기화
    scrollToTopInstant(); // 최상단으로 이동
  };

  return (
    <header className="sticky top-0 z-50 bg-[#1a1a24]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-[1800px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-8">
          {/* Logo */}
          <button
            onClick={() => handleNavigate("home")} // 🔥 로고 클릭 시 홈 + 최상단
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
            aria-label="PickMovie 홈으로 이동"
          >
            <Logo size="md" />
          </button>

          {/* Navigation Menu (Desktop) */}
          <nav
            className="hidden md:flex items-center gap-6"
            aria-label="주요 섹션"
          >
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)} // 🔥 모든 메뉴 클릭 시 최상단
                className={`text-lg font-medium transition-colors relative group ${
                  currentSection === item.id
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                }`}
                aria-current={currentSection === item.id ? "page" : undefined}
              >
                {item.label}
                {currentSection === item.id && (
                  <div className="absolute -bottom-[20px] left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500" />
                )}
              </button>
            ))}
          </nav>

          {/* Search Bar */}
          <div className="flex-1 max-w-md">
            <label htmlFor="main-search" className="sr-only">
              콘텐츠 검색
            </label>

            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                aria-hidden="true"
              />
              <input
                id="main-search"
                name="search"
                type="search"
                autoComplete="off"
                placeholder="영화, TV 프로그램 검색..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <nav
          className="flex md:hidden items-center gap-4 mt-4 overflow-x-auto pb-2"
          aria-label="모바일 내비게이션"
        >
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)} // 🔥 모바일 메뉴도 동일
              className={`text-md whitespace-nowrap px-3 py-1.5 rounded-full transition-all ${
                currentSection === item.id
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
              aria-current={currentSection === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
