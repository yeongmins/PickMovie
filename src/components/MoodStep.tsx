// 온보딩 2단계: 영화의 분위기(무드)를 선택하는 화면

import { useState } from "react";
import { Button } from "./ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { UserPreferences } from "./Onboarding";

interface MoodStepProps {
  onNext: () => void; // 다음 단계로 이동
  onBack: () => void; // 이전 단계로 이동
  selectedMoods: string[]; // 현재까지 선택된 무드
  onMoodsChange: (moods: string[]) => void; // 무드 변경 콜백
  currentPreferences: UserPreferences; // 프리뷰용 전체 취향 정보
}

// 무드 선택 옵션 목록
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
  // 현재 화면에서 선택 중인 무드 목록
  const [localMoods, setLocalMoods] = useState<string[]>(selectedMoods);

  // 무드 버튼 클릭 시 토글
  const toggleMood = (mood: string) => {
    const newMoods = localMoods.includes(mood)
      ? localMoods.filter((m) => m !== mood)
      : [...localMoods, mood];
    setLocalMoods(newMoods);
    onMoodsChange(newMoods); // 부모에도 변경 알림
  };

  // 최소 1개 이상 선택 시 다음 단계로 이동
  const handleNext = () => {
    if (localMoods.length > 0) {
      onNext();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#1a1a24]">
      {/* 배경 연출용 효과 (무드 단계는 오른쪽에서 퍼지는 느낌으로 설정) */}
      {/* <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-pink-600/20 rounded-full blur-3xl pointer-events-none" /> */}

      <div className="max-w-5xl mx-auto w-full relative z-10 flex gap-6">
        {/* 왼쪽: 분위기 선택 UI */}
        <div className="flex-1 flex flex-col max-w-2xl">
          <div className="mb-4">
            {/* 단계 번호 + 제목 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white text-base font-medium">
                2
              </div>
              <h2 className="text-white text-2xl font-medium
              ">
                어떤 분위기를 원하시나요?
              </h2>
            </div>
            <p className="text-gray-400 text-sm">
              최소 1개 이상 선택해주세요 (여러 개 선택 가능)
            </p>
          </div>

          {/* 무드 카드 그리드 */}
          <div className="flex-1 grid grid-cols-3 gap-2 mb-3">
            {moodOptions.map((mood) => (
              <button
                key={mood.id}
                onClick={() => toggleMood(mood.label)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  localMoods.includes(mood.label)
                    ? // 선택 상태: 핑크 계열 하이라이트
                      "bg-pink-500/20 border-pink-500 shadow-lg shadow-pink-500/20"
                    : // 기본 상태
                      "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                }`}
              >
                <div className="text-xl mb-2">{mood.icon}</div>
                <div className="text-sm text-white font-medium">
                  {mood.label}
                </div>
              </button>
            ))}
          </div>

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
              disabled={localMoods.length === 0}
              size="lg"
              className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
