import { useState } from "react";
import { Button } from "./ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { UserPreferences } from "./Onboarding";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

interface ExcludeStepProps {
  onNext: () => void;
  onBack: () => void;
  selectedExcludes: string[];
  onExcludesChange: (excludes: string[]) => void;
  currentPreferences: UserPreferences;
}

const excludeOptions = [
  { id: "violence", label: "폭력적 장면", icon: "⚠️" },
  { id: "horror", label: "공포 요소", icon: "😱" },
  { id: "sexual", label: "선정적 내용", icon: "🔞" },
  { id: "sad", label: "슬픈 결말", icon: "😢" },
  { id: "complex", label: "복잡한 스토리", icon: "🧩" },
  { id: "none", label: "없음", icon: "✅" },
];

export function ExcludeStep({
  onNext,
  onBack,
  selectedExcludes,
  onExcludesChange,
  currentPreferences,
}: ExcludeStepProps) {
  const [localExcludes, setLocalExcludes] =
    useState<string[]>(selectedExcludes);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const toggleExclude = (exclude: string) => {
    let newExcludes: string[];

    if (exclude === "없음") {
      newExcludes = localExcludes.includes("없음") ? [] : ["없음"];
    } else {
      newExcludes = localExcludes.filter((e) => e !== "없음");
      if (localExcludes.includes(exclude)) {
        newExcludes = newExcludes.filter((e) => e !== exclude);
      } else {
        newExcludes = [...newExcludes, exclude];
      }
    }

    setLocalExcludes(newExcludes);
    onExcludesChange(newExcludes);
  };

  const handleNext = () => {
    setIsAnalyzing(true);
    // 5초 후 다음 단계로 (API 호출 완료를 위한 충분한 시간)
    setTimeout(() => {
      onNext();
    }, 5000);
  };

  return (
    <div className="min-h-screen flex p-6 relative bg-[#1a1a24] overflow-hidden items-center justify-center">
      {/* Cinema spotlight effect */}
      {/* <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-orange-600/20 rounded-full blur-3xl pointer-events-none" /> */}

      <div className="max-w-5xl mx-auto w-full relative z-10">
        <AnimatePresence mode="wait">
          {!isAnalyzing ? (
            <motion.div
              key="survey"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4 }}
              className="flex gap-6"
            >
              {/* Left side - Selection */}
              <div className="flex-1 flex flex-col max-w-2xl">
                <div className="mb-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-base font-medium">
                      4
                    </div>
                    <h2 className="text-white text-2xl font-medium">
                      제외하고 싶은 요소가 있나요?
                    </h2>
                  </div>
                  <p className="text-gray-400 text-sm">
                    선택 사항입니다 (여러 개 선택 가능)
                  </p>
                </div>

                <div className="flex-1 grid grid-cols-3 gap-2 mb-3">
                  {excludeOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => toggleExclude(option.label)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        localExcludes.includes(option.label)
                          ? "bg-orange-500/20 border-orange-500 shadow-lg shadow-orange-500/20"
                          : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="text-2xl mb-1">{option.icon}</div>
                      <div className="text-white text-sm font-medium">{option.label}</div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={onBack}
                    // variant="outline"
                    size="lg"
                    className="border-white/20 text-white hover:bg-white/10 bg-white/5"
                  >
                    이전
                  </Button>
                  <Button
                    onClick={handleNext}
                    size="lg"
                    className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                  >
                    완료
                  </Button>
                </div>
              </div>

              {/* Right side - Preview */}
              <div className="w-80 flex-shrink-0 preview-hide-mobile">
                <PreferencesPreview
                  genres={currentPreferences.genres}
                  moods={currentPreferences.moods}
                  runtime={currentPreferences.runtime}
                  releaseYear={currentPreferences.releaseYear}
                  country={currentPreferences.country}
                  excludes={localExcludes}
                  currentStep={4}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-center min-h-[70vh]"
            >
              <div className="max-w-xl w-full text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full mb-6 mx-auto"
                />
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-white text-2xl mb-3"
                >
                  취향 분석 중입니다
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-gray-400 text-center mb-10 text-sm"
                >
                  알고리즘 기반으로 당신에게 맞는
                  <br />
                  완벽한 영화를 찾고 있습니다...
                </motion.p>

                {/* Progress indicators */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="space-y-2 w-full max-w-sm mx-auto"
                >
                  {[
                    "장르 매칭 중...",
                    "분위기 분석 중...",
                    "영화 데이터 수집 중...",
                  ].map((text, i) => (
                    <motion.div
                      key={text}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + i * 0.3 }}
                      className="flex items-center gap-2 text-gray-500 text-xs"
                    >
                      <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                      <span>{text}</span>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Preview summary */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 }}
                  className="mt-10 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5"
                >
                  <h3 className="text-white mb-3 text-xs">선택하신 취향</h3>
                  <div className="grid grid-cols-2 gap-3 text-xs text-left">
                    <div>
                      <span className="text-gray-400">장르</span>
                      <p className="text-purple-300 text-xs">
                        {currentPreferences.genres.join(", ")}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">분위기</span>
                      <p className="text-pink-300 text-xs">
                        {currentPreferences.moods.join(", ")}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">러닝타임</span>
                      <p className="text-blue-300 text-xs">
                        {currentPreferences.runtime}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">국가</span>
                      <p className="text-green-300 text-xs">
                        {currentPreferences.country}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
