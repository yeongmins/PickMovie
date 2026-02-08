// 온보딩 2단계
// - 원하는 분위기(무드)를 최소 1개, 최대 3개까지 선택하는 화면
// - 로직은 GenreStep과 거의 동일 구조

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

import { Button } from "../../../components/ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { type UserPreferences } from "../Onboarding";

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
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#10131b]">
      <div className="max-w-5xl mx-auto w-full relative z-10 flex gap-6">
        {/* 왼쪽: 분위기 선택 UI */}
        <div className="flex-1 flex flex-col max-w-2xl">
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white text-base font-medium">
                2
              </div>
              <h2 className="text-white text-2xl font-medium">
                어떤 분위기를 원하시나요?
              </h2>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-sm">
                최소 1개,{" "}
                <span className="text-pink-300">최대 3개까지</span> 선택할 수
                있어요.
              </p>
              <p className="text-xs text-gray-400">
                선택 {localMoods.length} / {MAX_SELECTION}개
              </p>
            </div>
            {isOverLimit && (
              <p className="mt-1 text-xs text-red-400">
                정확한 분위기 분석을 위해{" "}
                <span className="font-semibold">최대 3개까지만</span> 선택해 주세요.
              </p>
            )}
          </div>

          {/* 무드 카드 그리드 */}
          <motion.div
            className="flex-1 grid grid-cols-3 gap-2 mb-3"
            animate={
              isOverLimit
                ? { x: [-4, 4, -4, 4, 0] } // 3개 초과 시 흔들림
                : { x: 0 }
            }
            transition={{ duration: 0.3 }}
          >
            {moodOptions.map((mood) => {
              const isSelected = localMoods.includes(mood.label);
              const baseSelected =
                "bg-pink-500/20 border-pink-500 shadow-lg shadow-pink-500/20";
              const baseUnselected =
                "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20";

              const overLimitStyle = isOverLimit
                ? isSelected
                  ? "border-red-400/80 bg-red-500/20"
                  : "border-red-400/60 bg-red-500/10"
                : "";

              return (
                <button
                  key={mood.id}
                  onClick={() => toggleMood(mood.label)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    isSelected ? baseSelected : baseUnselected
                  } ${overLimitStyle}`}
                >
                  <div className="text-xl mb-2">{mood.icon}</div>
                  <div className="text-sm text-white font-medium">
                    {mood.label}
                  </div>
                </button>
              );
            })}
          </motion.div>

          {/* 하단 이전/다음 버튼 */}
          <div className="flex gap-3">
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
              다음
            </Button>
          </div>
        </div>

        {/* 오른쪽: 지금까지 선택한 취향 요약 프리뷰 */}
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
