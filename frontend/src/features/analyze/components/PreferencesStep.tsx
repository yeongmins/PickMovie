// 온보딩 3단계: 러닝타임, 개봉 연도, 국가를 선택하는 화면
// → 여기서 선택한 값들이 추천 알고리즘 필터에 반영됨

import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { UserPreferences } from "../Analyze";

interface PreferencesStepProps {
  onNext: () => void; // 다음 단계로 이동
  onBack: () => void; // 이전 단계로 이동
  selectedRuntime: string;  // 현재까지 선택된 러닝타임
  selectedYear: string;     // 현재까지 선택된 개봉 연도
  selectedCountry: string;  // 현재까지 선택된 국가
  onPreferencesChange: (runtime: string, year: string, country: string) => void; // 상위 온보딩 상태 업데이트 콜백
  currentPreferences: UserPreferences; // 프리뷰에 보여줄 전체 선호 정보
}

// 러닝타임 옵션 목록
const runtimeOptions = [
  { id: "short", label: "90분 이하" },
  { id: "medium", label: "90-120분" },
  { id: "long", label: "120-150분" },
  { id: "verylong", label: "150분 이상" },
  { id: "any", label: "상관없음" },
];

// 개봉 연도 옵션 목록
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

// 국가 옵션 (이모지 + 라벨)
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
  // 부모에서 내려온 값을 로컬 상태로 보관하면서 클릭 시 실시간 동기화
  const [localRuntime, setLocalRuntime] = useState(selectedRuntime);
  const [localYear, setLocalYear] = useState(selectedYear);
  const [localCountry, setLocalCountry] = useState(selectedCountry);

  // 러닝타임 선택 시 로컬 + 부모 상태 동기화
  const handleRuntimeChange = (value: string) => {
    setLocalRuntime(value);
    onPreferencesChange(value, localYear, localCountry);
  };

  // 개봉연도 선택 시
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
    <div className="flex justify-center px-6 pt-6 pb-20 relative bg-[#10131b] overflow-hidden max-[900px]:pb-16">
      <div className="pointer-events-none absolute -top-20 left-1/3 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-1/4 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="max-w-6xl mx-auto w-full relative z-10 flex gap-6">
        <div className="flex-1 max-w-3xl rounded-3xl border border-white/10 bg-[#0f1420]/85 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <div className="mb-5">
            <div className="inline-flex items-center rounded-full border border-blue-300/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
              STEP 3/4
            </div>
            <h2 className="mt-3 text-white text-2xl font-semibold">
              세부 선호사항을 알려주세요
            </h2>
            <p className="mt-2 text-gray-300 text-sm">모든 항목을 선택해 주세요.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-white mb-2 block text-sm">러닝타임</label>
              <div className="grid grid-cols-4 gap-2">
                {runtimeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleRuntimeChange(option.label)}
                    className={`rounded-xl border p-2.5 transition-all ${
                      localRuntime === option.label
                        ? "bg-blue-500/20 border-blue-400/80 shadow-[0_0_0_1px_rgba(96,165,250,0.35)_inset]"
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

            {/* 개봉 연도 선택 */}
            <div>
              <label className="text-white mb-2 block text-sm">개봉 연도</label>
              <div className="grid grid-cols-4 gap-2">
                {yearOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleYearChange(option.label)}
                    className={`rounded-xl border p-2.5 transition-all ${
                      localYear === option.label
                        ? "bg-blue-500/20 border-blue-400/80 shadow-[0_0_0_1px_rgba(96,165,250,0.35)_inset]"
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
                    className={`rounded-xl border p-2.5 transition-all ${
                      localCountry === option.label
                        ? "bg-blue-500/20 border-blue-400/80 shadow-[0_0_0_1px_rgba(96,165,250,0.35)_inset]"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {/* 플래그 이모지 - OS 기본 이모지 사용 */}
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
              disabled={!localRuntime || !localYear || !localCountry}
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
