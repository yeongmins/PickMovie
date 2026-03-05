// 온보딩 2단계
// - 원하는 분위기(무드)를 최소 1개, 최대 3개까지 선택하는 화면
// - 로직은 GenreStep과 거의 동일 구조

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

import { Button } from "../../../components/ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { type UserPreferences } from "../Analyze";

interface MoodStepProps {
  onNext: () => void;
  onBack: () => void;
  selectedMoods: string[];
  onMoodsChange: (moods: string[]) => void;
  currentPreferences: UserPreferences;
}

const moodOptions = [
  { id: "exciting", label: "흥미진진", icon: "🔥" },
  { id: "touching", label: "감동적인", icon: "😢" },
  { id: "fun", label: "재미있는", icon: "😄" },
  { id: "scary", label: "무서운", icon: "😨" },
  { id: "romantic", label: "로맨틱", icon: "💖" },
  { id: "serious", label: "진지한", icon: "🤔" },
  { id: "light", label: "가벼운", icon: "☁️" },
  { id: "dark", label: "어두운", icon: "🌑" },
  { id: "inspiring", label: "영감을 주는", icon: "✨" },
  { id: "mysterious", label: "신비로운", icon: "🎭" },
  { id: "nostalgic", label: "향수를 불러일으키는", icon: "📼" },
  { id: "intense", label: "강렬한", icon: "⚡" },
];

const MAX_SELECTION = 3;

export function MoodStep({
  onNext,
  onBack,
  selectedMoods,
  onMoodsChange,
  currentPreferences,
}: MoodStepProps) {
  // 부모 선택값을 로컬 상태로 복사
  const [localMoods, setLocalMoods] = useState<string[]>(selectedMoods);

  useEffect(() => {
    setLocalMoods(selectedMoods);
  }, [selectedMoods]);

  const isOverLimit = localMoods.length > MAX_SELECTION;

  // 무드 카드 토글 로직
  const toggleMood = (mood: string) => {
    const isSelected = localMoods.includes(mood);

    let newMoods: string[];
    if (isSelected) {
      newMoods = localMoods.filter((m) => m !== mood);
    } else {
      newMoods = [...localMoods, mood];
    }

    setLocalMoods(newMoods);
    onMoodsChange(newMoods);
  };

  const handleNext = () => {
    if (localMoods.length > 0 && !isOverLimit) {
      onNext();
    }
  };

  const isNextDisabled =
    localMoods.length === 0 || localMoods.length > MAX_SELECTION;

  return (
    <div className="flex justify-center px-6 pt-6 pb-20 relative bg-[#10131b] overflow-hidden max-[900px]:pb-16">
      <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-pink-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-purple-600/15 blur-3xl" />
      <div className="max-w-6xl mx-auto w-full relative z-10 flex gap-6">
        <div className="flex-1 max-w-3xl rounded-3xl border border-white/10 bg-[#0f1420]/85 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <div className="mb-5">
            <div className="inline-flex items-center rounded-full border border-pink-300/30 bg-pink-500/10 px-3 py-1 text-xs text-pink-200">
              STEP 2/4
            </div>
            <h2 className="mt-3 text-white text-2xl font-semibold">
              어떤 분위기를 원하시나요?
            </h2>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-gray-300 text-sm">
                지금 보고 싶은 톤을 최대 3개까지 골라주세요.
              </p>
              <p className="text-xs text-gray-400">
                선택 {localMoods.length}/{MAX_SELECTION}
              </p>
            </div>
            {isOverLimit ? (
              <p className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                최대 3개까지만 선택할 수 있어요.
              </p>
            ) : null}
          </div>

          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 gap-2.5"
            animate={isOverLimit ? { x: [-4, 4, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {moodOptions.map((mood) => {
              const isSelected = localMoods.includes(mood.label);
              const overLimitStyle = isOverLimit
                ? isSelected
                  ? "border-red-400/80 bg-red-500/20"
                  : "border-red-400/60 bg-red-500/10"
                : "";

              return (
                <button
                  key={mood.id}
                  onClick={() => toggleMood(mood.label)}
                  className={`min-h-24 rounded-2xl border px-3 py-3 text-left transition-all ${
                    isSelected
                      ? "border-pink-400/80 bg-pink-500/20 shadow-[0_0_0_1px_rgba(244,114,182,0.35)_inset]"
                      : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                  } ${overLimitStyle}`}
                >
                  <div className="text-xl">{mood.icon}</div>
                  <div className="mt-1 text-sm text-white font-medium">
                    {mood.label}
                  </div>
                </button>
              );
            })}
          </motion.div>

          <div className="mt-4 flex gap-3">
            <Button
              onClick={onBack}
              variant="outline"
              size="lg"
              className="border-white/20 text-white hover:bg-white/10 bg-white/5"
            >
              이전
            </Button>
            <Button
              onClick={handleNext}
              disabled={isNextDisabled}
              size="lg"
              className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed border-none transition-opacity"
            >
              다음 단계
            </Button>
          </div>
        </div>

        <div className="w-80 flex-shrink-0 preview-hide-mobile">
          <PreferencesPreview
            genres={currentPreferences.genres}
            moods={localMoods}
            runtime={currentPreferences.runtime}
            releaseYear={currentPreferences.releaseYear}
            country={currentPreferences.country}
            excludes={currentPreferences.excludes}
            currentStep={2}
          />
        </div>
      </div>
    </div>
  );
}
