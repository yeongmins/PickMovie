// src/features/analyze/Analyze.tsx
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { PageFooter } from "../../components/layout/Footer";
import type { AddItemsToPlaylistResult } from "../../App";
import { getAuthIntent } from "../../lib/auth";

import { GenreStep } from "./components/GenreStep";
import { MoodStep } from "./components/MoodStep";
import { PreferencesStep } from "./components/PreferencesStep";
import { ExcludeStep } from "./components/ExcludeStep";
import { RecommendationStep } from "./components/RecommendationStep";

interface AnalyzeProps {
  onComplete: (preferences: UserPreferences, favorites: number[]) => void;
  initialStep?: number;
  initialFavorites?: number[]; // 기존 찜 목록
  isAuthed?: boolean;
  analyticsUserId?: number | null;
  favoriteMovieIds?: number[];
  onToggleFavorite?: (id: number, mediaType?: "movie" | "tv") => void;
  onCreatePlaylist?: (
    name: string,
    items: Array<{ id: number; mediaType: "movie" | "tv" }>,
  ) => Promise<void> | void;
  playlists?: Array<{ id: number | string; name: string }>;
  onAddItemsToPlaylist?: (
    playlistId: number,
    items: Array<{ id: number; mediaType: "movie" | "tv" }>,
  ) => Promise<AddItemsToPlaylistResult | void> | AddItemsToPlaylistResult | void;
  onOpenDetail?: (id: number, mediaType?: "movie" | "tv") => void;
}

export interface UserPreferences {
  genres: string[];
  moods: string[];
  runtime: string;
  releaseYear: string;
  country: string;
  excludes: string[];
}

const ANALYZE_RESUME_KEY = "pickmovie_analyze_resume_v1";
const ANALYZE_RESUME_TTL_MS = 30 * 60 * 1000;

type AnalyzeResumeSnapshot = {
  step: number;
  preferences: UserPreferences;
  createdAt: number;
  expiresAt: number;
};

const EMPTY_PREFERENCES: UserPreferences = {
  genres: [],
  moods: [],
  runtime: "",
  releaseYear: "",
  country: "",
  excludes: [],
};

function normalizePreferences(input: Partial<UserPreferences> | null | undefined): UserPreferences {
  return {
    genres: Array.isArray(input?.genres) ? input.genres.map((x) => String(x)) : [],
    moods: Array.isArray(input?.moods) ? input.moods.map((x) => String(x)) : [],
    runtime: String(input?.runtime ?? ""),
    releaseYear: String(input?.releaseYear ?? ""),
    country: String(input?.country ?? ""),
    excludes: Array.isArray(input?.excludes) ? input.excludes.map((x) => String(x)) : [],
  };
}

function readAnalyzeResumeSnapshot(): AnalyzeResumeSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ANALYZE_RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AnalyzeResumeSnapshot>;
    const expiresAt = Number(parsed?.expiresAt ?? 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      localStorage.removeItem(ANALYZE_RESUME_KEY);
      return null;
    }
    const step = Math.max(0, Math.min(4, Number(parsed?.step ?? 0)));
    return {
      step,
      preferences: normalizePreferences(parsed?.preferences),
      createdAt: Number(parsed?.createdAt ?? Date.now()),
      expiresAt,
    };
  } catch {
    try {
      localStorage.removeItem(ANALYZE_RESUME_KEY);
    } catch {}
    return null;
  }
}

function writeAnalyzeResumeSnapshot(step: number, preferences: UserPreferences) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const snapshot: AnalyzeResumeSnapshot = {
      step: Math.max(0, Math.min(4, Number(step) || 0)),
      preferences: normalizePreferences(preferences),
      createdAt: now,
      expiresAt: now + ANALYZE_RESUME_TTL_MS,
    };
    localStorage.setItem(ANALYZE_RESUME_KEY, JSON.stringify(snapshot));
  } catch {}
}

function clearAnalyzeResumeSnapshot() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ANALYZE_RESUME_KEY);
  } catch {}
}

export function Analyze({
  onComplete,
  initialStep = 0,
  initialFavorites = [],
  isAuthed = false,
  analyticsUserId = null,
  favoriteMovieIds = [],
  onToggleFavorite,
  onCreatePlaylist,
  playlists = [],
  onAddItemsToPlaylist,
  onOpenDetail,
}: AnalyzeProps) {
  const location = useLocation();
  const initialResume = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const resumeRequested = params.get("resume") === "1";
    const intent = getAuthIntent();
    const hasAnalyzeIntent =
      !!intent &&
      intent.type === "open_playlist_selection" &&
      intent.source === "analyze";
    if (!resumeRequested && !hasAnalyzeIntent) {
      return null;
    }
    return readAnalyzeResumeSnapshot();
  }, [location.search]);

  // 현재 온보딩 단계
  const [step, setStep] = useState(() => initialResume?.step ?? initialStep);

  // 온보딩에서 수집하는 모든 취향 정보
  const [preferences, setPreferences] = useState<UserPreferences>(
    () => initialResume?.preferences ?? EMPTY_PREFERENCES,
  );

  // 취향 상태 업데이트 유틸
  const updatePreferences = (updates: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...updates }));
  };

  const goToStep = (newStep: number) => {
    setStep(newStep);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const handleGenreSelection = (genres: string[]) => {
    updatePreferences({ genres });
  };

  const handleMoodSelection = (moods: string[]) => {
    updatePreferences({ moods });
  };

  const handlePreferencesSelection = (
    runtime: string,
    releaseYear: string,
    country: string
  ) => {
    updatePreferences({ runtime, releaseYear, country });
  };

  const handleExcludeSelection = (excludes: string[]) => {
    updatePreferences({ excludes });
  };

  // 추천 다시 시작 (취향 초기화 + 1단계로 이동)
  const handleRestart = () => {
    goToStep(0);
    setPreferences(EMPTY_PREFERENCES);
    clearAnalyzeResumeSnapshot();
  };

  useEffect(() => {
    writeAnalyzeResumeSnapshot(step, preferences);
  }, [step, preferences]);

  // 각 step 인덱스에 대응하는 JSX 구성
  const steps = [
    <GenreStep
      key="genre"
      onNext={() => goToStep(1)}
      onBack={() => {}}
      selectedGenres={preferences.genres}
      onGenresChange={handleGenreSelection}
      currentPreferences={preferences}
      isAuthed={isAuthed}
    />,
    <MoodStep
      key="mood"
      onNext={() => goToStep(2)}
      onBack={() => goToStep(0)}
      selectedMoods={preferences.moods}
      onMoodsChange={handleMoodSelection}
      currentPreferences={preferences}
    />,
    <PreferencesStep
      key="preferences"
      onNext={() => goToStep(3)}
      onBack={() => goToStep(1)}
      selectedRuntime={preferences.runtime}
      selectedYear={preferences.releaseYear}
      selectedCountry={preferences.country}
      onPreferencesChange={handlePreferencesSelection}
      currentPreferences={preferences}
    />,
    <ExcludeStep
      key="exclude"
      onNext={() => goToStep(4)}
      onBack={() => goToStep(2)}
      selectedExcludes={preferences.excludes}
      onExcludesChange={handleExcludeSelection}
      currentPreferences={preferences}
    />,
    <RecommendationStep
      key="recommendation"
      preferences={preferences}
      onComplete={onComplete}
      onRestart={handleRestart}
      initialFavorites={initialFavorites}
      isAuthed={isAuthed}
      analyticsUserId={analyticsUserId}
      favoriteMovieIds={favoriteMovieIds}
      onToggleFavorite={onToggleFavorite}
      onCreatePlaylist={onCreatePlaylist}
      playlists={playlists}
      onAddItemsToPlaylist={onAddItemsToPlaylist}
      onOpenDetail={onOpenDetail}
    />,
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="min-h-screen bg-[#10131b] text-white"
    >
      <Header currentSection="home" />
      <main
        id="main-content"
        className={[
          "pt-16",
          "pb-0",
        ].join(" ")}
      >
        {/* 단계 전환 시 페이드 애니메이션 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </main>
      <PageFooter className="mt-0" />
    </motion.div>
  );
}

// 레거시 호환: 기존 import 경로/심볼을 당장 바꾸지 못한 호출부를 위한 alias
export const Onboarding = Analyze;
