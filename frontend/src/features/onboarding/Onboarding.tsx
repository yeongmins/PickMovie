// src/features/onboarding/Onboarding.tsx
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { WelcomeStep } from "./components/WelcomeStep";
import { GenreStep } from "./components/GenreStep";
import { MoodStep } from "./components/MoodStep";
import { PreferencesStep } from "./components/PreferencesStep";
import { ExcludeStep } from "./components/ExcludeStep";
import { RecommendationStep } from "./components/RecommendationStep";

interface OnboardingProps {
  onComplete: (preferences: UserPreferences, favorites: number[]) => void;
  initialStep?: number;
  initialFavorites?: number[]; // 기존 찜 목록
}

export interface UserPreferences {
  genres: string[];
  moods: string[];
  runtime: string;
  releaseYear: string;
  country: string;
  excludes: string[];
}

export function Onboarding({
  onComplete,
  initialStep = 0,
  initialFavorites = [],
}: OnboardingProps) {
  // 현재 온보딩 단계
  const [step, setStep] = useState(initialStep);
  // 앞으로/뒤로 이동 방향 (애니메이션용, 지금은 페이드만 쓰지만 확장 가능)
  const [direction, setDirection] = useState<"forward" | "back">("forward");

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

  const goToStep = (newStep: number, dir: "forward" | "back") => {
    setDirection(dir);
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
    goToStep(1, "forward");
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
    <WelcomeStep key="welcome" onNext={() => goToStep(1, "forward")} />,
    <GenreStep
      key="genre"
      onNext={() => goToStep(2, "forward")}
      onBack={() => goToStep(0, "back")}
      selectedGenres={preferences.genres}
      onGenresChange={handleGenreSelection}
      currentPreferences={preferences}
    />,
    <MoodStep
      key="mood"
      onNext={() => goToStep(3, "forward")}
      onBack={() => goToStep(1, "back")}
      selectedMoods={preferences.moods}
      onMoodsChange={handleMoodSelection}
      currentPreferences={preferences}
    />,
    <PreferencesStep
      key="preferences"
      onNext={() => goToStep(4, "forward")}
      onBack={() => goToStep(2, "back")}
      selectedRuntime={preferences.runtime}
      selectedYear={preferences.releaseYear}
      selectedCountry={preferences.country}
      onPreferencesChange={handlePreferencesSelection}
      currentPreferences={preferences}
    />,
    <ExcludeStep
      key="exclude"
      onNext={() => goToStep(5, "forward")}
      onBack={() => goToStep(3, "back")}
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
    />,
  ];

  return (
    <div className="relative">
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
  );
}
