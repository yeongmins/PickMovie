// 온보딩 3단계: 런타임, 개봉 연도, 국가 등 세부 선호를 선택하는 화면

import { useState } from "react";
import { Button } from "./ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { UserPreferences } from "./Onboarding";

interface PreferencesStepProps {
  onNext: () => void; // 다음 단계로 이동
  onBack: () => void; // 이전 단계로 이동
  selectedRuntime: string; // 현재 선택된 러닝타임
  selectedYear: string; // 현재 선택된 개봉 연도
  selectedCountry: string; // 현재 선택된 국가
  onPreferencesChange: (runtime: string, year: string, country: string) => void; // 3가지 세부 선호 변경 콜백
  currentPreferences: UserPreferences; // 프리뷰용 전체 선호
}

// 러닝타임 옵션
const runtimeOptions = [
  { id: "short", label: "90분 이하" },
  { id: "medium", label: "90-120분" },
  { id: "long", label: "120-150분" },
  { id: "verylong", label: "150분 이상" },
  { id: "any", label: "상관없음" },
];

// 개봉 연도 옵션
const yearOptions = [
  { id: "2024", label: "2024년" },
  { id: "2023", label: "2023년" },
  { id: "2022", label: "2022년" },
  { id: "2020s", label: "2020년대" },
  { id: "2010s", label: "2010년대" },
  { id: "2000s", label: "2000년대" },
  { id: "classic", label: "고전" },
  { id: "any", label: "상관없음" },
];

// 국가 옵션 (이모지 + 국가 이름)
const countryOptions = [
  { id: "korea", label: "한국", icon: "🇰🇷" },
  { id: "usa", label: "미국", icon: "🇺🇸" },
  { id: "japan", label: "일본", icon: "🇯🇵" },
  { id: "france", label: "프랑스", icon: "🇫🇷" },
  { id: "uk", label: "영국", icon: "🇬🇧" },
  { id: "any", label: "상관없음", icon: "🌍" },
];

export function PreferencesStep({
  onNext,
  onBack,
  selectedRuntime,
  selectedYear,
  selectedCountry,
  onPreferencesChange,
  currentPreferences,
}: PreferencesStepProps) {
  // 각 항목을 로컬 상태로 관리 (선택마다 부모 콜백으로 동기화)
  const [localRuntime, setLocalRuntime] = useState(selectedRuntime);
  const [localYear, setLocalYear] = useState(selectedYear);
  const [localCountry, setLocalCountry] = useState(selectedCountry);

  // 러닝타임 선택 시 상태 및 부모 콜백 업데이트
  const handleRuntimeChange = (value: string) => {
    setLocalRuntime(value);
    onPreferencesChange(value, localYear, localCountry);
  };

  // 개봉 연도 선택 시
  const handleYearChange = (value: string) => {
    setLocalYear(value);
    onPreferencesChange(localRuntime, value, localCountry);
  };

  // 국가 선택 시
  const handleCountryChange = (value: string) => {
    setLocalCountry(value);
    onPreferencesChange(localRuntime, localYear, value);
  };

  // 3개 항목이 모두 선택된 경우에만 다음 단계로 이동
  const handleNext = () => {
    if (localRuntime && localYear && localCountry) {
      onNext();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#1a1a24]">
      {/* 중앙에서 퍼지는 블루 톤 스포트라이트 효과 */}
      {/* <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-3xl pointer-events-none" /> */}

      <div className="max-w-5xl mx-auto w-full relative z-10 flex gap-6">
        {/* 왼쪽: 세부 선호 선택 UI */}
        <div className="flex-1 flex flex-col max-w-2xl">
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-base font-medium">
                3
              </div>
              <h2 className="text-white text-2xl font-medium">
                세부 선호사항을 알려주세요
              </h2>
            </div>
            <p className="text-gray-400 text-sm">모든 항목을 선택해주세요</p>
          </div>

          {/* 러닝타임 / 개봉연도 / 국가 3개 섹션 */}
          <div className="flex-1 space-y-4 mb-3">
            {/* 러닝타임 선택 */}
            <div>
              <label className="text-white mb-2 block text-sm">러닝타임</label>
              <div className="grid grid-cols-4 gap-2">
                {runtimeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleRuntimeChange(option.label)}
                    className={`p-2.5 rounded-lg border-2 transition-all ${
                      localRuntime === option.label
                        ? // 선택 상태
                          "bg-blue-500/20 border-blue-500 shadow-lg shadow-blue-500/20"
                        : // 기본 상태
                          "bg-white/5 border-white/10 hover:bg-white/10 "
                    }`}
                  >
                    <div className="text-white text-xs font-medium">
                      {option.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 개봉 연도 선택 */}
            <div>
              <label className="text-white mb-2 block text-sm">개봉 연도</label>
              <div className="grid grid-cols-4 gap-2">
                {yearOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleYearChange(option.label)}
                    className={`p-2.5 rounded-lg border-2 transition-all ${
                      localYear === option.label
                        ? "bg-blue-500/20 border-blue-500 shadow-lg shadow-blue-500/20"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-white text-xs font-medium">
                      {option.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 국가 선택 */}
            <div>
              <label className="text-white mb-2 block text-sm">국가</label>
              <div className="grid grid-cols-4 gap-2">
                {countryOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleCountryChange(option.label)}
                    className={`p-2.5 rounded-lg border-2 transition-all ${
                      localCountry === option.label
                        ? "bg-blue-500/20 border-blue-500 shadow-lg shadow-blue-500/20"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {/* 플래그 이모지 */}
                    <div
                      className="text-xl mb-0.5 flag-emoji"
                      aria-hidden="true"
                    >
                      {option.icon}
                    </div>
                    <div className="text-white text-xs font-medium">
                      {option.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
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
              disabled={!localRuntime || !localYear || !localCountry}
              size="lg"
              className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed border-none transition-opacity"
            >
              다음
            </Button>
          </div>
        </div>

        {/* 오른쪽: 현재까지 선택한 취향 프리뷰 */}
        <div className="w-80 flex-shrink-0 preview-hide-mobile">
          <PreferencesPreview
            genres={currentPreferences.genres}
            moods={currentPreferences.moods}
            runtime={localRuntime}
            releaseYear={localYear}
            country={localCountry}
            excludes={currentPreferences.excludes}
            currentStep={3}
          />
        </div>
      </div>
    </div>
  );
}
