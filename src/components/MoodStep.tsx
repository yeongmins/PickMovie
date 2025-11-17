import { useState } from "react";
import { Button } from "./ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { UserPreferences } from "./Onboarding";

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

export function MoodStep({
  onNext,
  onBack,
  selectedMoods,
  onMoodsChange,
  currentPreferences,
}: MoodStepProps) {
  const [localMoods, setLocalMoods] = useState<string[]>(selectedMoods);

  const toggleMood = (mood: string) => {
    const newMoods = localMoods.includes(mood)
      ? localMoods.filter((m) => m !== mood)
      : [...localMoods, mood];
    setLocalMoods(newMoods);
    onMoodsChange(newMoods);
  };

  const handleNext = () => {
    if (localMoods.length > 0) {
      onNext();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#1a1a24]">
      {/* Cinema spotlight effect */}
      {/* <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-pink-600/20 rounded-full blur-3xl pointer-events-none" /> */}

      <div className="max-w-5xl mx-auto w-full relative z-10 flex gap-6">
        {/* Left side - Selection */}
        <div className="flex-1 flex flex-col max-w-2xl">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white text-sm">
                2
              </div>
              <h2 className="text-white text-2xl">어떤 분위기를 원하시나요?</h2>
            </div>
            <p className="text-gray-400 text-sm">
              최소 1개 이상 선택해주세요 (여러 개 선택 가능)
            </p>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-3 mb-6">
            {moodOptions.map((mood) => (
              <button
                key={mood.id}
                onClick={() => toggleMood(mood.label)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  localMoods.includes(mood.label)
                    ? "bg-pink-500/20 border-pink-500 shadow-lg shadow-pink-500/20"
                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                }`}
              >
                <div className="text-3xl mb-2">{mood.icon}</div>
                <div className="text-white">{mood.label}</div>
              </button>
            ))}
          </div>

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
              disabled={localMoods.length === 0}
              size="lg"
              className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </Button>
          </div>
        </div>

        {/* Right side - Preview */}
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
