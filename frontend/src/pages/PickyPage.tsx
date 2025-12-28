// frontend/src/pages/PickyPage.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, X, Sparkles, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import type { FavoriteItem } from "../App";
import type { ModalMovie } from "../features/movies/components/MovieDetailModal";
import { getPosterUrl } from "../lib/tmdb";

import { Header } from "../components/layout/Header"; // ✅ 공통 Header 적용
import { ContentCard } from "../components/content/ContentCard";

import { pickRandomKeywords } from "../features/picky/data/keywordPool";
import {
  runPickySearch,
  type ResultItem,
  type AiAnalysis,
} from "../features/picky/algorithm/pickyAlgorithm";
import {
  loadPlaylists,
  savePlaylists,
  readUserPreferences,
  type Playlist,
  type PlaylistItem,
  type MediaType,
} from "../features/picky/storage/pickyStorage";

const MovieDetailModal = lazy(() =>
  import("../features/movies/components/MovieDetailModal").then((m) => ({
    default: m.MovieDetailModal,
  }))
);

export type PickyPageProps = {
  favorites: FavoriteItem[];
  onToggleFavorite: (movieId: number, mediaType?: MediaType) => void;
};

type FavoriteKey = `${MediaType}:${number}`;

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function yearFromItem(item: {
  release_date?: string;
  first_air_date?: string;
}) {
  const date = item.release_date || item.first_air_date || "";
  if (!date) return undefined;
  const y = new Date(date).getFullYear();
  return Number.isFinite(y) ? y : undefined;
}

function toKey(id: number, mediaType?: MediaType): FavoriteKey {
  const mt: MediaType = mediaType === "tv" ? "tv" : "movie";
  return `${mt}:${id}`;
}

// ✅ (원래 코드에서 toKey 안에 들어가 있던 버그 수정) AI 인사이트 컴포넌트
function AiInsight({ analysis }: { analysis: AiAnalysis | null }) {
  if (!analysis) return null;

  const a: any = analysis as any;
  const aiSummary: string = (
    a.aiSummary ??
    a.summary ??
    a.message ??
    ""
  ).toString();

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm opacity-80">Picky AI 분석</div>
      {aiSummary ? <div className="mt-1 text-base">{aiSummary}</div> : null}

      <div className="mt-2 flex flex-wrap gap-2 text-xs opacity-80">
        <span className="rounded-full bg-white/10 px-2 py-1">
          신뢰도 {Math.round(safeNum(a.confidence, 0.5) * 100)}%
        </span>
        {a.yearFrom && a.yearTo ? (
          <span className="rounded-full bg-white/10 px-2 py-1">
            {a.yearFrom}~{a.yearTo}
          </span>
        ) : null}
        {(Array.isArray(a.includeKeywords) ? a.includeKeywords : [])
          .slice(0, 5)
          .map((k: string) => (
            <span key={k} className="rounded-full bg-white/10 px-2 py-1">
              {k}
            </span>
          ))}
      </div>
    </div>
  );
}

export function PickyPage({ favorites, onToggleFavorite }: PickyPageProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  // UI 상태
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // 키워드(칩)
  const [displayedKeywords, setDisplayedKeywords] = useState<string[]>(() =>
    pickRandomKeywords(8)
  );

  // 검색 결과
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);

  // 모달
  const [selectedMovie, setSelectedMovie] = useState<ModalMovie | null>(null);

  // 세션 찜(이번 검색에서 찜한 것들) - movie/tv 충돌 방지 위해 key 사용
  const [sessionPicked, setSessionPicked] = useState<
    Map<FavoriteKey, MediaType>
  >(() => new Map());

  // 플레이리스트 모달
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const playlistInputRef = useRef<HTMLInputElement>(null);

  // favorites key set
  const favoriteKeySet = useMemo(() => {
    const set = new Set<FavoriteKey>();
    favorites.forEach((f) => {
      const mt = (f as any)?.mediaType === "tv" ? "tv" : "movie";
      set.add(`${mt}:${f.id}` as FavoriteKey);
    });
    return set;
  }, [favorites]);

  // userPrefs(모달에 전달용)
  const userPrefs = useMemo(() => readUserPreferences(), []);

  const refreshKeywords = () => setDisplayedKeywords(pickRandomKeywords(8));

  const togglePick = (id: number, mediaType?: MediaType) => {
    const mt: MediaType = mediaType === "tv" ? "tv" : "movie";
    const key = toKey(id, mt);

    onToggleFavorite(id, mt);

    setSessionPicked((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, mt);
      return next;
    });
  };

  const clearSessionPicks = () => {
    setSessionPicked((prev) => {
      prev.forEach((mt, key) => {
        if (favoriteKeySet.has(key)) {
          const id = Number(String(key).split(":")[1]);
          if (Number.isFinite(id)) onToggleFavorite(id, mt);
        }
      });
      return new Map();
    });
  };

  const resetToStart = () => {
    setHasSearched(false);
    setAiAnalysis(null);
    setTags([]);
    setResults([]);
    setSelectedMovie(null);
    setSessionPicked(new Map());
  };

  const executeSearch = async (targetQuery: string) => {
    const q = (targetQuery || "").trim();
    if (!q || loading) return;

    setLoading(true);
    setHasSearched(true);
    setQuery(q);

    setAiAnalysis(null);
    setTags([]);
    setResults([]);
    setSelectedMovie(null);
    setSessionPicked(new Map());

    try {
      const { aiAnalysis, tags, results } = await runPickySearch(q);
      setAiAnalysis(aiAnalysis);
      setTags(tags);
      setResults(results);
    } catch (err) {
      console.error("검색 실패:", err);
      alert("잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleMovieClick = (item: ResultItem) => {
    const mediaType: MediaType = (item.media_type as MediaType) || "movie";
    const title =
      item.title ||
      item.name ||
      item.original_title ||
      item.original_name ||
      "제목 없음";

    const poster =
      (item.poster_path && getPosterUrl(item.poster_path, "w500")) || "";
    const rating = safeNum((item as any).vote_average, 0);
    const year = yearFromItem(item);

    const modalMovie: ModalMovie = {
      id: item.id,
      tmdbId: item.id,
      title,
      poster,
      poster_path: item.poster_path,
      rating,
      vote_average: rating,
      year,
      genre: "",
      matchScore: safeNum(item.matchScore, 0),
      description: item.overview || "",
      mediaType,
      media_type: mediaType,
    };

    setSelectedMovie(modalMovie);
  };

  // ===== Playlist Create =====
  const openPlaylistModal = () => {
    if (sessionPicked.size === 0) return;
    setPlaylistName("");
    setIsPlaylistModalOpen(true);
    setTimeout(() => playlistInputRef.current?.focus(), 0);
  };

  const savePlaylistAction = () => {
    const name = playlistName.trim();
    if (!name) return;

    const now = Date.now();
    const pickedItems: PlaylistItem[] = Array.from(sessionPicked.entries()).map(
      ([key]) => ({
        key: String(key),
        addedAt: now,
      })
    );

    const next: Playlist = {
      id: `pl_${now}`,
      name,
      items: pickedItems,
      createdAt: now,
      updatedAt: now,
    };

    const all = loadPlaylists();
    savePlaylists([next, ...all]);

    setIsPlaylistModalOpen(false);
    setToast("저장되었습니다 ✨");

    setTimeout(() => {
      setToast(null);
      navigate("/");
    }, 900);
  };

  useEffect(() => {
    if (!isPlaylistModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsPlaylistModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlaylistModalOpen]);

  const displayTitle = useMemo(() => {
    if (!hasSearched) return "";
    const base = (query || "").trim();
    return base.length > 0 ? base : "Picky 추천";
  }, [query, hasSearched]);

  const shellClass = "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10";
  const cardsGridClass =
    "grid gap-4 justify-center [grid-template-columns:repeat(auto-fit,minmax(160px,240px))]";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen bg-[#131314] text-white flex flex-col font-sans overflow-x-hidden relative"
    >
      {/* ✅ 공통 Header */}
      <Header searchQuery={query} onSearchChange={setQuery} />

      {/* Header가 fixed라서 spacer */}
      <div className="h-16 shrink-0" />

      <AnimatePresence mode="wait">
        {/* Start */}
        {!hasSearched && !loading && (
          <motion.main
            key="picky-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`flex-1 flex flex-col items-center justify-center pb-20 ${shellClass}`}
          >
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text leading-tight">
                무엇을 보고 싶으신가요?
              </h1>
              <p className="text-gray-400 text-lg font-medium">
                기분, 상황, 장르 등 자유롭게 말해보세요.
              </p>
            </div>

            <div className="w-full max-w-[820px] relative group mb-8">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-full blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
              <form
                onSubmit={handleSubmit}
                className="relative bg-[#1e1e20] rounded-full border border-white/10 flex items-center shadow-2xl pr-2 transition-colors group-focus-within:bg-[#252529] group-focus-within:border-white/20"
              >
                <label className="sr-only" htmlFor="picky-query">
                  보고 싶은 콘텐츠 입력
                </label>
                <input
                  id="picky-query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="예: 2000년대 지브리 영화"
                  className="w-full bg-transparent border-none text-white placeholder-gray-500 text-base px-6 py-4 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="검색"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
              </form>
            </div>

            {/* Keyword chips */}
            <div className="flex flex-wrap justify-center gap-2.5 max-w-2xl relative items-center">
              {displayedKeywords.map((keyword, idx) => (
                <motion.button
                  key={`${keyword}-${idx}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => executeSearch(keyword)}
                  className="px-4 py-2 bg-[#2a2a2d] hover:bg-[#3f3f43] border border-white/10 hover:border-purple-500/50 rounded-full text-sm text-gray-300 hover:text-white transition-all active:scale-95 shadow-sm"
                  aria-label={`추천 키워드: ${keyword}`}
                >
                  {keyword}
                </motion.button>
              ))}

              <button
                type="button"
                onClick={refreshKeywords}
                className="w-10 h-10 rounded-full border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/15 text-purple-300 hover:text-white transition-all flex items-center justify-center active:scale-95"
                aria-label="키워드 새로고침"
                title="키워드 새로고침"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            </div>
          </motion.main>
        )}

        {/* Loading */}
        {loading && (
          <motion.div
            key="picky-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex-1 flex flex-col items-center justify-center relative ${shellClass}`}
            role="status"
            aria-live="polite"
          >
            <div className="relative">
              <motion.div
                className="absolute inset-0 bg-purple-500/20 blur-[120px] rounded-full"
                animate={
                  reduceMotion
                    ? { opacity: 0.45 }
                    : { opacity: [0.35, 0.6, 0.35] }
                }
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 1.6, repeat: Infinity }
                }
              />

              <motion.div
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={
                  reduceMotion
                    ? undefined
                    : { repeat: Infinity, duration: 1.3, ease: "linear" }
                }
                className="relative z-10"
              >
                <div className="w-20 h-20 border-4 border-t-purple-500 border-r-purple-500/30 border-b-pink-500/20 border-l-purple-500/60 rounded-full" />
              </motion.div>
            </div>

            <div className="mt-10 text-center px-6">
              <h3 className="text-2xl font-bold text-white mb-2">
                취향 분석 중입니다
              </h3>
              <p className="text-gray-400 text-base">
                Picky가 지금 딱 맞는 콘텐츠만 고르는 중이에요…
              </p>
            </div>
          </motion.div>
        )}

        {/* Results */}
        {hasSearched && !loading && (
          <motion.div
            key="picky-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`flex-1 w-full py-10 ${shellClass}`}
          >
            {/* search bar + reset */}
            <div className="flex justify-center mb-10">
              <div className="w-full max-w-2xl flex items-center gap-2">
                <div className="relative group flex-1">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-full blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                  <form
                    onSubmit={handleSubmit}
                    className="relative bg-[#1e1e20] rounded-full border border-white/10 flex items-center shadow-lg pr-2"
                  >
                    <label className="sr-only" htmlFor="picky-query-2">
                      검색어 입력
                    </label>
                    <input
                      id="picky-query-2"
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="w-full bg-transparent border-none text-white px-6 py-3 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                      aria-label="검색"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </form>
                </div>

                <button
                  type="button"
                  onClick={resetToStart}
                  className="shrink-0 px-4 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200 flex items-center gap-2"
                  aria-label="다시 분석하기"
                >
                  <RefreshCcw className="w-4 h-4" />
                  다시 분석
                </button>
              </div>
            </div>

            {/* Title / tags */}
            <div className="mb-8 text-center">
              <div className="inline-block px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-sm mb-4">
                ✨ Picky's Choice
              </div>
              <h2 className="text-3xl font-bold mb-2">"{displayTitle}" 추천</h2>

              {tags.length > 0 && (
                <div className="flex justify-center flex-wrap gap-2 mt-4">
                  {tags.map((k) => (
                    <span
                      key={k}
                      className="text-sm text-gray-400 bg-white/5 px-3 py-1 rounded-full border border-white/5"
                    >
                      #{k}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-gray-500 text-sm mt-3">
                총 {results.length}개의 추천 결과
              </p>
            </div>

            {/* ✅ AI 분석 카드 */}
            <AiInsight analysis={aiAnalysis} />

            {results.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
                <div className="text-6xl mb-4">😅</div>
                <p className="text-white text-lg">추천 결과를 찾지 못했어요</p>
                <p className="text-gray-400 text-sm mt-2">
                  키워드를 조금 더 구체적으로 입력해보세요.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={resetToStart}
                    className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200"
                  >
                    다시 검색하기
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium"
                  >
                    메인으로 가기
                  </button>
                </div>
              </div>
            ) : (
              <div className={cardsGridClass}>
                {results.map((item) => {
                  const mt: MediaType =
                    (item.media_type as MediaType) || "movie";
                  const key = toKey(item.id, mt);
                  const isFav = favoriteKeySet.has(key);

                  return (
                    <ContentCard
                      key={`${mt}:${item.id}`}
                      item={item as any}
                      isFavorite={isFav}
                      onToggleFavorite={() => togglePick(item.id, mt)}
                      onClick={() => handleMovieClick(item)}
                      context="picky"
                    />
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Action Bar */}
      <AnimatePresence>
        {!loading && hasSearched && sessionPicked.size > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 left-0 right-0 z-40 px-4"
          >
            <div className="max-w-4xl mx-auto bg-[#1e1e20]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-2xl">
              <div className="text-sm text-gray-200">
                <span className="text-white font-semibold">
                  {sessionPicked.size}개
                </span>{" "}
                찜했어요
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearSessionPicks}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200"
                  aria-label="이번 찜 초기화"
                >
                  찜 초기화
                </button>

                <button
                  type="button"
                  onClick={openPlaylistModal}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium"
                  aria-label="플레이리스트 생성"
                >
                  플레이리스트 생성
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200"
                  aria-label="메인 화면으로 이동"
                >
                  메인으로 가기
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlist Modal */}
      <AnimatePresence>
        {isPlaylistModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="플레이리스트 생성"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsPlaylistModalOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-md bg-[#1e1e20] border border-white/10 rounded-2xl p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white text-lg font-semibold">
                  플레이리스트 생성
                </h3>
                <button
                  type="button"
                  onClick={() => setIsPlaylistModalOpen(false)}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center"
                  aria-label="닫기"
                >
                  <X className="w-4 h-4 text-gray-200" />
                </button>
              </div>

              <p className="text-gray-400 text-sm mb-4">
                이번 추천에서 찜한 {sessionPicked.size}개 콘텐츠로
                플레이리스트를 만들어요.
              </p>

              <label className="sr-only" htmlFor="playlist-name">
                플레이리스트 이름
              </label>
              <input
                id="playlist-name"
                ref={playlistInputRef}
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="플레이리스트 이름을 입력하세요"
                className="w-full bg-[#131314] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/40"
                autoFocus
              />

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setIsPlaylistModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-sm"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={savePlaylistAction}
                  disabled={!playlistName.trim()}
                  className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  저장하기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed top-6 left-0 right-0 z-[60] px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="max-w-md mx-auto bg-[#1e1e20]/95 backdrop-blur-xl border border-white/10 rounded-full px-4 py-3 text-center text-sm text-white shadow-xl">
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <Suspense fallback={null}>
            <MovieDetailModal
              movie={selectedMovie}
              onClose={() => setSelectedMovie(null)}
              isFavorite={favoriteKeySet.has(
                toKey(
                  selectedMovie.id,
                  (selectedMovie.mediaType as MediaType) || "movie"
                )
              )}
              onToggleFavorite={() =>
                onToggleFavorite(
                  selectedMovie.id,
                  ((selectedMovie.mediaType as MediaType) ||
                    "movie") as MediaType
                )
              }
              userPreferences={userPrefs}
              onMovieChange={(m: any) => setSelectedMovie(m)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default PickyPage;
