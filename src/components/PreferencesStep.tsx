import { useState } from "react";
import { Button } from "./ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { UserPreferences } from "./Onboarding";

interface PreferencesStepProps {
  onNext: () => void;
  onBack: () => void;
  selectedRuntime: string;
  selectedYear: string;
  selectedCountry: string;
  onPreferencesChange: (runtime: string, year: string, country: string) => void;
  currentPreferences: UserPreferences;
}

const runtimeOptions = [
  { id: "short", label: "90분 이하" },
  { id: "medium", label: "90-120분" },
  { id: "long", label: "120-150분" },
  { id: "verylong", label: "150분 이상" },
  { id: "any", label: "상관없음" },
];

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
  const [localRuntime, setLocalRuntime] = useState(selectedRuntime);
  const [localYear, setLocalYear] = useState(selectedYear);
  const [localCountry, setLocalCountry] = useState(selectedCountry);

  const handleRuntimeChange = (value: string) => {
    setLocalRuntime(value);
    onPreferencesChange(value, localYear, localCountry);
  };

  const handleYearChange = (value: string) => {
    setLocalYear(value);
    onPreferencesChange(localRuntime, value, localCountry);
  };

  const handleCountryChange = (value: string) => {
    setLocalCountry(value);
    onPreferencesChange(localRuntime, localYear, value);
  };

  const handleNext = () => {
    if (localRuntime && localYear && localCountry) {
      onNext();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#1a1a24]">
      {/* Cinema spotlight effect */}
      {/* <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-3xl pointer-events-none" /> */}

      <div className="max-w-5xl mx-auto w-full relative z-10 flex gap-6">
        {/* Left side - Selection */}
        <div className="flex-1 flex flex-col max-w-2xl">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm">
                3
              </div>
              <h2 className="text-white text-2xl">
                세부 선호사항을 알려주세요
              </h2>
            </div>
            <p className="text-gray-400 text-sm">모든 항목을 선택해주세요</p>
          </div>

          <div className="flex-1 space-y-4 mb-6">
            {/* Runtime */}
            <div>
              <label className="text-white mb-2 block text-sm">러닝타임</label>
              <div className="grid grid-cols-4 gap-2">
                {runtimeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleRuntimeChange(option.label)}
                    className={`p-2.5 rounded-lg border-2 transition-all ${
                      localRuntime === option.label
                        ? "bg-blue-500/20 border-blue-500"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-white text-sm">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Release Year */}
            <div>
              <label className="text-white mb-2 block text-sm">개봉 연도</label>
              <div className="grid grid-cols-4 gap-2">
                {yearOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleYearChange(option.label)}
                    className={`p-2.5 rounded-lg border-2 transition-all ${
                      localYear === option.label
                        ? "bg-blue-500/20 border-blue-500"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-white text-sm">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Country */}
            <div>
              <label className="text-white mb-2 block text-sm">국가</label>
              <div className="grid grid-cols-4 gap-2">
                {countryOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleCountryChange(option.label)}
                    className={`p-2.5 rounded-lg border-2 transition-all ${
                      localCountry === option.label
                        ? "bg-blue-500/20 border-blue-500"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-xl mb-0.5">{option.icon}</div>
                    <div className="text-white text-sm">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>
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
              disabled={!localRuntime || !localYear || !localCountry}
              size="lg"
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </Button>
          </div>
        </div>

        {/* Right side - Preview */}
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
