// frontend/src/pages/Picky.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { motion } from "framer-motion";
import { Search, X, Loader2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

// ✅ 실시간 검색어 제거: keywordPool 사용
import { pickRandomKeywords } from "../features/picky/data/keywordPool";

// ✅ 서버가 추론/확장/랭킹 전담 → 프론트는 “검색 호출 + 결과 렌더”만
import { usePickySearch } from "../features/picky/hooks/usePickySearch";
import type { ResultItem } from "../features/picky/api/pickyApi";

import { ContentCard } from "../components/content/ContentCard";

export type PickyPageProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

type ViewMode = "start" | "results";

const EXIT_MS = 260; // ✅ 닫힘 애니메이션 후 navigate 딜레이

export default function Picky({ searchQuery, onSearchChange }: PickyPageProps) {
  const navigate = useNavigate();

  // ✅ PC(md 이상) / Tablet(md 미만)
  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });

  // ✅ 닫힘 애니메이션용
  const [closing, setClosing] = useState(false);

  // ✅ 모드: 시작(키워드 구름) / 결과
  const [mode, setMode] = useState<ViewMode>("start");

  // ✅ 키워드 구름
  const [displayedKeywords, setDisplayedKeywords] = useState<string[]>(() =>
    pickRandomKeywords(10)
  );

  // ✅ 검색 상태/결과 (hook)
  const {
    loading: searchLoading,
    error: searchError,
    tags,
    results,
    search,
    clear,
    cancel,
  } = usePickySearch();

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // ✅ 패널 영역 ref (여백 클릭 닫기용)
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ✅ PC/Tablet 감지
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsTablet(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // ✅ 오버레이 열리면 스크롤 잠금 + 포커스
  useEffect(() => {
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // ✅ 실제 navigate (애니메이션 이후)
  const doNavigateClose = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/", { replace: true });
  }, [navigate]);

  // ✅ 닫기 요청(버튼/배경/ESC) -> 애니메이션 -> navigate
  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  useEffect(() => {
    if (!closing) return;
    // 닫힐 때 진행중 검색 취소(레이스/상태 꼬임 방지)
    cancel();
    const t = window.setTimeout(() => doNavigateClose(), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing, doNavigateClose, cancel]);

  // ✅ ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // ✅ 여백 클릭 시 닫기 (검색바/패널 제외)
  const onRootMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current && panelRef.current.contains(t)) return;
      requestClose();
    },
    [requestClose]
  );

  // ✅ 키워드 새로고침
  const refreshKeywords = useCallback(() => {
    setDisplayedKeywords(pickRandomKeywords(10));
  }, []);

  // ✅ 입력이 완전히 비면 시작 모드로 복귀 + 결과 초기화
  useEffect(() => {
    const q = (searchQuery || "").trim();
    if (!q) {
      setMode("start");
      clear();
    }
  }, [searchQuery, clear]);

  const executeSearch = useCallback(
    async (q: string) => {
      const query = (q || "").trim();
      if (!query || searchLoading) return;

      setMode("results");
      await search(query); // hook 내부에서 성공/실패 상태 반영
    },
    [search, searchLoading]
  );

  // ✅ Enter / 검색버튼
  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void executeSearch(searchQuery);
    },
    [executeSearch, searchQuery]
  );

  // ✅ 키워드 클릭 -> 검색
  const onPickKeyword = useCallback(
    (t: string) => {
      const q = (t || "").trim();
      onSearchChange(q);
      void executeSearch(q);
    },
    [executeSearch, onSearchChange]
  );

  const clearQuery = useCallback(() => {
    onSearchChange("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [onSearchChange]);

  // ✅ 결과 패널에서 넓어지도록
  const containerClass = useMemo(() => {
    const base = ["mx-auto w-full", isTablet ? "px-4 pt-4" : "px-4 pt-6"].join(
      " "
    );
    if (isTablet) return base;
    return [base, mode === "results" ? "max-w-[1180px]" : "max-w-[650px]"].join(
      " "
    );
  }, [isTablet, mode]);

  // ✅ “확-펼쳐지는” 느낌: scale + blur 키프레임
  // ✅ 닫힐 때도: scale down + blur + fade
  const panelAnimate = useMemo(() => {
    if (closing) {
      return {
        opacity: 0,
        y: -10,
        scale: 0.985,
        filter: "blur(10px)",
      };
    }

    if (mode === "results") {
      return {
        opacity: 1,
        y: 0,
        scale: [0.985, 1.03, 1],
        filter: ["blur(10px)", "blur(3px)", "blur(0px)"],
      };
    }

    // start 화면은 안정감 있게
    return {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
    };
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
      className="fixed inset-0 z-[60]"
      aria-modal="true"
      role="dialog"
    >
      {/* dim */}
      <motion.div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{
          duration: closing ? 0.26 : 0.16,
          ease: closing ? "easeInOut" : "easeOut",
        }}
      />

      {/* root: 여백 클릭 닫기 */}
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
          {/* panelRef: 검색바 + 패널 영역 */}
          <div ref={panelRef}>
            {/* search bar */}
            <div className="h-12 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-xl flex items-center gap-2 px-3">
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
                  placeholder="기분/상황/장르를 문장처럼 입력해보세요…"
                  className="flex-1 bg-transparent outline-none text-white placeholder-white/50 text-sm"
                />

                {/* ✅ Picky 톤 “전체 지우기” */}
                {(searchQuery || "").trim().length > 0 && (
                  <button
                    type="button"
                    onClick={clearQuery}
                    onMouseDown={(e) => e.preventDefault()}
                    className="ml-2 h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all flex items-center justify-center text-white/70 hover:text-white/90"
                    aria-label="검색어 전체 지우기"
                    title="전체 지우기"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                <button
                  type="submit"
                  className="ml-2 h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all flex items-center justify-center text-white/85"
                  aria-label="검색 실행"
                >
                  <Search className="h-5 w-5" />
                </button>
              </form>
            </div>

            {/* content panel */}
            <div className={isTablet ? "pt-4 pb-6" : "pt-5 pb-8"}>
              <motion.div
                layout
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
                className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.45)]"
              >
                {mode === "start" ? (
                  <StartPanel
                    displayedKeywords={displayedKeywords}
                    onPick={onPickKeyword}
                    onRefresh={refreshKeywords}
                  />
                ) : (
                  <ResultsPanel
                    title="Picky 검색 결과 ✨"
                    subtitle={`${new Date().toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })} 기준`}
                    query={(searchQuery || "").trim()}
                    loading={searchLoading}
                    error={searchError}
                    tags={tags}
                    results={results}
                    isTablet={isTablet}
                    onBackToStart={() => {
                      setMode("start");
                      clear();
                    }}
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
  displayedKeywords,
  onPick,
  onRefresh,
}: {
  displayedKeywords: string[];
  onPick: (title: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-semibold text-white/90">
          Picky 이용 방법 ✨
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="h-9 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 transition flex items-center gap-2"
          aria-label="키워드 새로고침"
          title="키워드 새로고침"
        >
          <Sparkles className="w-4 h-4" />
          새로고침
        </button>
      </div>

      <div className="mt-4 px-1 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10">
          <Sparkles className="w-6 h-6 text-white/70" />
        </div>

        <div className="mt-4 text-sm text-white/75 leading-relaxed">
          기분/상황/장르를{" "}
          <span className="text-white/90 font-semibold">문장처럼</span> 입력하면
          <br />
          Picky가 딱 맞는 콘텐츠를 추천해요.
        </div>

        <div className="mt-1 text-xs text-white/45">
          아래 키워드를 눌러 바로 시작해보세요.
        </div>
      </div>

      <motion.div
        layout
        transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.8 }}
        className="mt-5 px-1 flex flex-wrap justify-center gap-2 pb-1"
      >
        {displayedKeywords.map((k) => (
          <motion.button
            key={k}
            layout="position"
            transition={{
              type: "spring",
              stiffness: 520,
              damping: 42,
              mass: 0.8,
            }}
            style={{ willChange: "transform" }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(k)}
            className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs text-white/75 hover:text-white transition"
            aria-label={`추천 키워드: ${k}`}
          >
            {k}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

function ResultsPanel({
  title,
  subtitle,
  query,
  loading,
  error,
  tags,
  results,
  isTablet,
  onBackToStart,
}: {
  title: string;
  subtitle: string;
  query: string;
  loading: boolean;
  error: string | null;
  tags: string[];
  results: ResultItem[];
  isTablet: boolean;
  onBackToStart: () => void;
}) {
  const cardsGridClass =
    "grid gap-4 justify-center [grid-template-columns:repeat(auto-fit,minmax(160px,240px))]";

  return (
    <div className="p-3">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-semibold text-white/90">{title}</div>
        <div className="text-xs text-white/45">{subtitle}</div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="text-sm text-white/90 truncate">
            {query ? `"${query}"` : "검색 결과"}
          </div>
          {!loading && (
            <div className="text-xs text-white/45 mt-0.5">
              총 {results.length}개
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onBackToStart}
          className="shrink-0 h-9 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 transition"
          aria-label="키워드 다시 보기"
        >
          키워드 보기
        </button>
      </div>

      {tags.length > 0 && !loading && (
        <div className="mt-3 px-1 flex flex-wrap gap-2">
          {tags.slice(0, 10).map((t) => (
            <span
              key={t}
              className="text-xs text-white/70 bg-white/5 border border-white/10 rounded-full px-3 py-1"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <div
        className={[
          "mt-4",
          isTablet ? "max-h-[62vh]" : "max-h-[68vh]",
          "overflow-y-auto pr-1",
        ].join(" ")}
      >
        {loading ? (
          <div className="py-10 flex flex-col items-center justify-center text-sm text-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            <div className="mt-3">Picky가 취향을 분석 중이에요…</div>
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-white/55">
            검색 중 문제가 발생했어요.
            <div className="mt-2 text-xs text-white/40">{error}</div>
          </div>
        ) : results.length === 0 ? (
          <div className="py-10 text-center text-sm text-white/55">
            추천 결과를 찾지 못했어요.
            <br />
            키워드를 조금 더 구체적으로 입력해보세요.
          </div>
        ) : (
          <div className={cardsGridClass}>
            {results.map((item) => (
              <ContentCard
                key={`${item.media_type}:${item.id}`}
                item={item as any}
                isFavorite={false}
                onToggleFavorite={() => {}}
                onClick={() => {}}
                context="picky"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
