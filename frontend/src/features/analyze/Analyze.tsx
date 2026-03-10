// src/features/analyze/Analyze.tsx
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { PageFooter } from "../../components/layout/Footer";
import type { AddItemsToPlaylistResult } from "../../App";

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
  // 현재 온보딩 단계
  const [step, setStep] = useState(initialStep);

  // 온보딩에서 수집하는 모든 취향 정보
  const [preferences, setPreferences] = useState<UserPreferences>({
    genres: [],
    moods: [],
    runtime: "",
    releaseYear: "",
    country: "",
    excludes: [],
  });

  // 취향 상태 업데이트 유틸
  const updatePreferences = (updates: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...updates }));
  };

  const goToStep = (newStep: number) => {
    setStep(newStep);
  };

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
    setPreferences({
      genres: [],
      moods: [],
      runtime: "",
      releaseYear: "",
      country: "",
      excludes: [],
    });
  };

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
    <div className="min-h-screen bg-[#10131b] text-white">
      <Header currentSection="home" />
      <div
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
      </div>
      <PageFooter className="mt-0" />
    </div>
  );
}

// 레거시 호환: 기존 import 경로/심볼을 당장 바꾸지 못한 호출부를 위한 alias
export const Onboarding = Analyze;
