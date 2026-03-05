import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "../../../components/ui/button";
import { UserPreferences } from "../Analyze";
import {
  calculateMatchScore,
  discoverMovies,
  GENRE_IDS,
  type TMDBMovie,
} from "../../../lib/tmdb";
import {
  ContentCard,
  type ContentCardItem,
} from "../../../components/content/ContentCard";

interface RecommendationStepProps {
  preferences: UserPreferences;
  onComplete: (preferences: UserPreferences, favorites: number[]) => void;
  onRestart: () => void;
  initialFavorites?: number[];
  isAuthed?: boolean;
  favoriteMovieIds?: number[];
  onToggleFavorite?: (id: number, mediaType?: "movie" | "tv") => void;
  onCreatePlaylist?: (
    name: string,
    items: Array<{ id: number; mediaType: "movie" | "tv" }>,
  ) => Promise<void> | void;
  onOpenDetail?: (id: number, mediaType?: "movie" | "tv") => void;
}

interface MovieWithScore extends TMDBMovie {
  matchScore: number;
  media_type: "movie";
}

const EXIT_MS = 260;

const COUNTRY_ORIGINAL_LANGUAGE: Record<string, string> = {
  한국: "ko",
  미국: "en",
  영국: "en",
  일본: "ja",
  프랑스: "fr",
  상관없음: "",
};

function uniqueMovieIds(ids: number[]) {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
}

function toYear(releaseYear: string) {
  if (releaseYear === "2024년") return "2024";
  if (releaseYear === "2023년") return "2023";
  if (releaseYear === "2022년") return "2022";
  return "";
}

function buildSelectedSummary(p: UserPreferences) {
  const lines: string[] = [];

  if (p.genres.length) lines.push(`장르: ${p.genres.join(", ")}`);
  if (p.moods.length) lines.push(`분위기: ${p.moods.join(", ")}`);
  if (p.runtime) lines.push(`러닝타임: ${p.runtime}`);
  if (p.releaseYear) lines.push(`개봉연도: ${p.releaseYear}`);
  if (p.country) lines.push(`국가: ${p.country}`);
  if (p.excludes.length) lines.push(`제외요소: ${p.excludes.join(", ")}`);

  return lines;
}

async function loadDiscoverPages(args: {
  genreIds: number[];
  year: string;
  originalLanguage: string;
}) {
  const discoverArgs = {
    genres: args.genreIds,
    year: args.year,
    originalLanguage: args.originalLanguage,
    language: "ko-KR",
    region: "KR",
  };

  const [page1, page2, page3] = await Promise.all([
    discoverMovies({ ...discoverArgs, page: 1 }),
    discoverMovies({ ...discoverArgs, page: 2 }),
    discoverMovies({ ...discoverArgs, page: 3 }),
  ]);

  const all = [...page1, ...page2, ...page3];
  return Array.from(new Map(all.map((m) => [m.id, m])).values()) as TMDBMovie[];
}

export function RecommendationStep({
  preferences,
  onComplete,
  onRestart,
  initialFavorites,
  isAuthed = false,
  favoriteMovieIds = [],
  onToggleFavorite,
  onCreatePlaylist,
  onOpenDetail,
}: RecommendationStepProps) {
  const navigate = useNavigate();

  const [favorites, setFavorites] = useState<number[]>(
    uniqueMovieIds(initialFavorites || []),
  );
  const [movies, setMovies] = useState<MovieWithScore[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState<Record<string, MovieWithScore>>(
    {},
  );

  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistSubmitting, setPlaylistSubmitting] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [playlistNotice, setPlaylistNotice] = useState<string | null>(null);

  const [closing, setClosing] = useState(false);

  const selectedSummary = useMemo(() => buildSelectedSummary(preferences), [preferences]);

  useEffect(() => {
    if (!isAuthed) return;
    setFavorites(uniqueMovieIds(favoriteMovieIds));
  }, [isAuthed, favoriteMovieIds]);

  useEffect(() => {
    void loadMovies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences]);

  const loadMovies = async () => {
    setLoading(true);
    setError(null);

    try {
      const genreIds = preferences.genres
        .map((g) => GENRE_IDS[g])
        .filter(Boolean) as number[];

      const year = toYear(preferences.releaseYear);
      const originalLanguage = COUNTRY_ORIGINAL_LANGUAGE[preferences.country] || "";

      const attempts: Array<{ year: string; originalLanguage: string }> = [
        { year, originalLanguage },
        { year: "", originalLanguage },
        { year, originalLanguage: "" },
        { year: "", originalLanguage: "" },
      ];

      let rows: TMDBMovie[] = [];
      for (const attempt of attempts) {
        rows = await loadDiscoverPages({
          genreIds,
          year: attempt.year,
          originalLanguage: attempt.originalLanguage,
        });
        if (rows.length > 0) break;
      }

      const withScore = rows
        .map((movie) => ({
          ...movie,
          matchScore: calculateMatchScore(movie, preferences),
          media_type: "movie" as const,
        }))
        .sort((a, b) => {
          if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
          return (b.vote_average || 0) - (a.vote_average || 0);
        })
        .slice(0, 30);

      setMovies(withScore);
      setSelectionMode(false);
      setSelectedMap({});
      setPlaylistNotice(null);
    } catch (e: any) {
      setMovies([]);
      setError(e?.message || "추천 결과를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = useMemo(() => Object.keys(selectedMap).length, [selectedMap]);
  const favoritesKeySet = useMemo(() => new Set(favorites.map((id) => `movie:${id}`)), [favorites]);

  const toggleFavoriteLocal = (movieId: number) => {
    setFavorites((prev) =>
      prev.includes(movieId)
        ? prev.filter((id) => id !== movieId)
        : [...prev, movieId],
    );
  };

  const handleToggleFavorite = (movieId: number) => {
    toggleFavoriteLocal(movieId);
    if (isAuthed && onToggleFavorite) {
      onToggleFavorite(movieId, "movie");
    }
  };

  const requestCloseModal = () => {
    if (closing) return;
    setClosing(true);
  };

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => {
      setPlaylistModalOpen(false);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  const onToggleSelect = (movie: MovieWithScore) => {
    const key = `movie:${movie.id}`;
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = movie;
      return next;
    });
  };

  const onEnterSelectionMode = () => {
    setSelectionMode(true);
    setSelectedMap({});
    setPlaylistError(null);
    setPlaylistNotice(null);
  };

  const onCancelSelectionMode = () => {
    setSelectionMode(false);
    setSelectedMap({});
    setPlaylistError(null);
  };

  const onOpenPlaylistModal = () => {
    if (!isAuthed || !onCreatePlaylist) {
      setPlaylistError("플레이리스트 추가는 로그인 후 사용할 수 있어요.");
      return;
    }

    if (selectedCount === 0) {
      setPlaylistError("추가할 콘텐츠를 먼저 선택해 주세요.");
      return;
    }

    setPlaylistError(null);
    setPlaylistModalOpen(true);
    setClosing(false);
  };

  const createPlaylistFromSelected = async () => {
    if (!onCreatePlaylist) return;

    const trimmed = playlistName.trim();
    if (!trimmed) {
      setPlaylistError("플레이리스트 이름을 입력해 주세요.");
      return;
    }

    const payloadItems = Object.values(selectedMap).map((it) => ({
      id: Number(it.id),
      mediaType: "movie" as const,
    }));

    if (payloadItems.length === 0) {
      setPlaylistError("추가할 콘텐츠를 먼저 선택해 주세요.");
      return;
    }

    setPlaylistSubmitting(true);
    setPlaylistError(null);

    try {
      await Promise.resolve(onCreatePlaylist(trimmed, payloadItems));
      setPlaylistModalOpen(false);
      setSelectionMode(false);
      setSelectedMap({});
      setPlaylistName("");
      setPlaylistNotice(`플레이리스트 "${trimmed}"가 생성되었습니다.`);
    } catch {
      setPlaylistError("플레이리스트 생성에 실패했습니다.");
    } finally {
      setPlaylistSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-400 mx-auto mb-4" />
          <p className="text-white text-xl">추천 결과를 준비 중입니다...</p>
          <p className="text-gray-400 text-sm mt-2">취향 기반으로 결과를 정렬하고 있어요.</p>
        </div>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-white/10 bg-[#0f1420]/85 p-6 text-center">
          <p className="text-white text-2xl mb-2">추천 결과가 없습니다</p>
          <p className="text-gray-300 text-sm mb-4">
            조건 조합을 완화해도 결과를 찾지 못했어요.
          </p>
          {error ? <p className="text-xs text-red-300 mb-4">{error}</p> : null}
          <div className="flex gap-2 justify-center">
            <Button
              onClick={() => void loadMovies()}
              variant="outline"
              size="lg"
              className="border-white/20 text-white hover:bg-white/10 bg-white/5"
            >
              다시 시도
            </Button>
            <Button
              onClick={onRestart}
              size="lg"
              className="pick-cta bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 border-none"
            >
              분석 다시하기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="px-4 sm:px-6 pb-8 relative"
    >
        <div className="mx-auto max-w-[1220px]">
        <div className="rounded-2xl border border-white/10 bg-[#0f1420]/85 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold tracking-tight text-purple-200">분석 완료 ✨</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onRestart}
                className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/90 transition inline-flex items-center gap-2 shrink-0"
              >
                재분석
              </button>
            </div>
          </div>
          <h1 className="text-white text-2xl max-[720px]:text-xl font-semibold mt-1">
            선택한 취향으로 찾은 추천작이에요
          </h1>
          <p className="text-gray-300 text-sm max-[720px]:text-xs mt-1">총 {movies.length}개 결과</p>

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {selectedSummary.map((line) => (
                <span
                  key={line}
                  className="text-[13px] max-[720px]:text-[11px] font-semibold text-white bg-slate-700/85 border border-slate-500/70 rounded-full px-4 max-[720px]:px-3 py-1.5 max-[720px]:py-1 shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                >
                  {line}
                </span>
              ))}
            </div>

            {!selectionMode ? (
              <button
                type="button"
                onClick={onEnterSelectionMode}
                className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/90 transition inline-flex items-center gap-2 shrink-0"
                aria-label="플레이리스트 추가 모드 시작"
              >
                <Plus className="h-4 w-4" />
                플레이리스트 추가
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancelSelectionMode}
                className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/90 transition inline-flex items-center gap-2 shrink-0"
                aria-label="선택 취소"
              >
                선택 취소
              </button>
            )}
          </div>

          {playlistNotice ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-emerald-300/95">{playlistNotice}</div>
              <button
                type="button"
                onClick={() => navigate("/favorites", { state: { initialView: "playlists", scrollToTop: true } })}
                className="h-8 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-xs font-semibold transition"
              >
                플레이리스트 이동
              </button>
            </div>
          ) : null}

          {playlistError ? (
            <div className="mt-3 text-xs text-rose-300">{playlistError}</div>
          ) : null}
        </div>

        {selectionMode ? (
          <div className="mt-3 rounded-xl bg-white/10 px-3 py-2 flex items-center justify-between gap-3">
            <div className="text-xs text-white/75">카드를 선택하고 플레이리스트에 추가하세요.</div>
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

        <div className="mt-6 pb-6 max-h-[68vh] overflow-y-auto pr-1">
          <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(200px,200px))] mb-4">
            {movies.map((item) => {
              const key = `movie:${Number(item.id)}`;
              const isSelected = !!selectedMap[key];

              return (
                <div key={key} className="relative w-[200px]">
                  <ContentCard
                    item={item as ContentCardItem}
                    isFavorite={favoritesKeySet.has(key)}
                    onToggleFavorite={() => handleToggleFavorite(Number(item.id))}
                    onClick={() => {
                      if (selectionMode) {
                        onToggleSelect(item);
                        return;
                      }
                      if (onOpenDetail) onOpenDetail(item.id, "movie");
                    }}
                    context="search"
                    canFavorite={!selectionMode}
                  />

                  {selectionMode ? (
                    <div className="absolute right-2 top-2 z-30 pointer-events-none">
                      <div
                        className={[
                          "h-7 w-7 rounded-full flex items-center justify-center",
                          isSelected ? "bg-white text-black" : "bg-black/35 text-white",
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
        </div>

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
              onClick={requestCloseModal}
            />

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.99 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed left-0 right-0 z-[80] px-4"
              style={{ bottom: 84 }}
            >
              <div className="mx-auto w-full max-w-[560px] rounded-2xl bg-[#0b0b10]/95 shadow-2xl backdrop-blur p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white/90">플레이리스트 생성</div>
                    <div className="mt-1 text-xs text-white/60">
                      선택한 콘텐츠를 새 플레이리스트로 저장합니다.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-xs"
                    onClick={requestCloseModal}
                  >
                    닫기
                  </button>
                </div>

                <div className="mt-4">
                  <label htmlFor="playlist-name" className="text-xs text-white/60">
                    플레이리스트명
                  </label>
                  <input
                    id="playlist-name"
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (playlistSubmitting) return;
                      void createPlaylistFromSelected();
                    }}
                    placeholder="예: 오늘 볼 작품"
                    className="mt-2 w-full h-11 rounded-xl bg-black/35 px-3 text-base font-semibold text-white/95 placeholder:text-white/35 outline-none caret-white"
                    maxLength={40}
                    autoFocus
                  />
                </div>

                {playlistError ? (
                  <div className="mt-3 text-xs text-rose-300">{playlistError}</div>
                ) : null}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={requestCloseModal}
                    className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white/85"
                    disabled={playlistSubmitting}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => void createPlaylistFromSelected()}
                    className="h-9 px-3 rounded-lg bg-white text-black hover:bg-white/90 text-xs font-semibold inline-flex items-center gap-2"
                    disabled={playlistSubmitting}
                  >
                    {playlistSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    플레이리스트 생성
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
