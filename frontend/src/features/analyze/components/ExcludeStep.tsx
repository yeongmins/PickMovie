// 온보딩 4단계
// - 사용자가 "보고 싶지 않은 요소(폭력, 공포, 선정성 등)"를 선택하는 화면
// - 완료 시 5초 동안 "취향 분석 중" 애니메이션을 보여준 뒤 추천 단계로 이동

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { type UserPreferences } from "../Analyze";

interface ExcludeStepProps {
  onNext: () => void; // 분석 완료 후 추천 화면으로 이동
  onBack: () => void; // 이전 단계로 이동
  selectedExcludes: string[]; // 현재까지 저장된 제외 요소
  onExcludesChange: (excludes: string[]) => void; // 제외 요소 변경 콜백
  currentPreferences: UserPreferences; // 전체 취향 정보
}

// 제외 옵션 목록 (폭력, 공포, 선정성, 슬픈 결말 등)
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
  // 현재 단계에서 선택 중인 제외 요소 (부모 값과 로컬 상태 동기화용)
  const [localExcludes, setLocalExcludes] =
    useState<string[]>(selectedExcludes);

  // true가 되면 설문 UI 대신 "취향 분석 중" 화면을 보여줌
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 제외 요소 토글 로직
  const toggleExclude = (exclude: string) => {
    let newExcludes: string[];

    if (exclude === "없음") {
      // '없음' 선택 시 다른 옵션은 모두 비우고 '없음'만 남기거나 제거
      newExcludes = localExcludes.includes("없음") ? [] : ["없음"];
    } else {
      // 다른 옵션이 선택되면 '없음'은 제거
      newExcludes = localExcludes.filter((e) => e !== "없음");

      if (localExcludes.includes(exclude)) {
        // 이미 선택되어 있으면 제거
        newExcludes = newExcludes.filter((e) => e !== exclude);
      } else {
        // 선택되어 있지 않으면 추가
        newExcludes = [...newExcludes, exclude];
      }
    }

    setLocalExcludes(newExcludes);
    onExcludesChange(newExcludes); // 부모 상태 동기화
  };

  // 완료 버튼 클릭 시 분석 모드로 전환
  const handleNext = () => {
    setIsAnalyzing(true);
    // 5초 후 다음 단계로 이동 (실제 서비스에서는 이 구간에서 추천 API 호출 가능)
    setTimeout(() => {
      onNext();
    }, 5000);
  };

  return (
    <div className="flex px-6 pt-6 pb-20 relative bg-[#10131b] overflow-hidden justify-center max-[900px]:pb-16">
      <div className="pointer-events-none absolute -top-24 right-10 h-72 w-72 rounded-full bg-orange-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-purple-600/15 blur-3xl" />
      <div className="max-w-5xl mx-auto w-full relative z-10">
        {/* 설문 화면과 분석 화면을 프레이머 모션으로 전환 */}
        <AnimatePresence mode="wait">
          {!isAnalyzing ? (
            // ======================
            // 1) 설문 화면
            // ======================
            <motion.div
              key="survey"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, x: -50 }} // 왼쪽으로 사라지는 애니메이션
              transition={{ duration: 0.4 }}
              className="flex gap-6"
            >
              <div className="flex-1 flex flex-col max-w-3xl rounded-3xl border border-white/10 bg-[#0f1420]/85 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                <div className="mb-3">
                  <div className="inline-flex items-center rounded-full border border-orange-300/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-200">
                    STEP 4/4
                  </div>
                  <h2 className="mt-3 text-white text-2xl font-semibold">
                    제외하고 싶은 요소가 있나요?
                  </h2>
                  <p className="text-gray-300 text-sm mt-2">
                    선택 사항이며 여러 개를 고를 수 있어요.
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {excludeOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => toggleExclude(option.label)}
                      className={`min-h-24 rounded-2xl border px-3 py-3 text-left transition-all ${
                        localExcludes.includes(option.label)
                          ? "bg-orange-500/20 border-orange-400/80 shadow-[0_0_0_1px_rgba(251,146,60,0.35)_inset]"
                          : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="text-2xl">{option.icon}</div>
                      <div className="text-white text-sm font-medium">
                        {option.label}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex gap-3">
                  <Button
                    onClick={onBack}
                    size="lg"
                    className="border-white/20 text-white hover:bg-white/10 bg-white/5"
                  >
                    이전
                  </Button>
                  <Button
                    onClick={handleNext}
                    size="lg"
                    className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border-none transition-opacity"
                  >
                    분석 시작
                  </Button>
                </div>
              </div>

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
            // ======================
            // 2) 취향 분석 중 화면
            // ======================
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, x: 50 }} // 오른쪽에서 슬라이드 인
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-center min-h-[70vh]"
            >
              <div className="max-w-xl w-full text-center">
                {/* 회전하는 로딩 인디케이터 */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full mb-6 mx-auto"
                />
                {/* 제목/부제 */}
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

                {/* 진행 상태 텍스트 (장르/분위기/데이터 수집 등) */}
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

                {/* 사용자가 선택한 취향 요약 박스 */}
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
                      <p className="text-purple-200 text-xs">
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
