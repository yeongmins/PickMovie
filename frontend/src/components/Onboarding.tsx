import { useState, useEffect } from "react";
import { WelcomeStep } from "./WelcomeStep";
import { GenreStep } from "./GenreStep";
import { MoodStep } from "./MoodStep";
import { PreferencesStep } from "./PreferencesStep";
import { ExcludeStep } from "./ExcludeStep";
import { RecommendationStep } from "./RecommendationStep";
import { AnimatePresence, motion } from "framer-motion";

interface OnboardingProps {
  onComplete: (preferences: UserPreferences, favorites: number[]) => void;
  initialStep?: number;
  initialFavorites?: number[]; // 기존 찜 목록 받기
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
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [preferences, setPreferences] = useState<UserPreferences>({
    genres: [],
    moods: [],
    runtime: "",
    releaseYear: "",
    country: "",
    excludes: [],
  });

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
