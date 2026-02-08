// 온보딩 1단계
// - 좋아하는 장르를 최소 1개, 최대 3개까지 선택하는 화면
// - 3개를 초과하면 에러 스타일 + 카드 흔들림 애니메이션

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

import { Button } from "../../../components/ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { type UserPreferences } from "../Onboarding";

interface GenreStepProps {
  onNext: () => void;
  onBack: () => void;
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
  currentPreferences: UserPreferences;
}

const genreOptions = [
  { id: "action", label: "액션", icon: "💥" },
  { id: "comedy", label: "코미디", icon: "😂" },
  { id: "romance", label: "로맨스", icon: "💕" },
  { id: "thriller", label: "스릴러", icon: "😱" },
  { id: "sf", label: "SF", icon: "🚀" },
  { id: "drama", label: "드라마", icon: "🎭" },
  { id: "horror", label: "공포", icon: "👻" },
  { id: "animation", label: "애니메이션", icon: "🎨" },
  { id: "fantasy", label: "판타지", icon: "🧙‍♂️" },
  { id: "crime", label: "범죄", icon: "🔫" },
  { id: "adventure", label: "모험", icon: "🗺️" },
  { id: "mystery", label: "미스터리", icon: "🔍" },
  { id: "family", label: "가족", icon: "👨‍👩‍👧‍👦" },
  { id: "music", label: "음악", icon: "🎵" },
  { id: "documentary", label: "다큐멘터리", icon: "📹" },
];

const MAX_SELECTION = 3;

export function GenreStep({
  onNext,
  onBack,
  selectedGenres,
  onGenresChange,
  currentPreferences,
}: GenreStepProps) {
  // 부모에서 전달된 선택값을 로컬 상태로 복사
  const [localGenres, setLocalGenres] = useState<string[]>(selectedGenres);

  useEffect(() => {
    setLocalGenres(selectedGenres);
  }, [selectedGenres]);

  const isOverLimit = localGenres.length > MAX_SELECTION;

  // 장르 카드 클릭 시 토글
  const toggleGenre = (genre: string) => {
    const isSelected = localGenres.includes(genre);

    let newGenres: string[];
    if (isSelected) {
      newGenres = localGenres.filter((g) => g !== genre);
    } else {
      // 3개를 넘겨도 일단 선택은 허용 (버튼 비활성으로만 제한)
      newGenres = [...localGenres, genre];
    }

    setLocalGenres(newGenres);
    onGenresChange(newGenres);
  };

  // 다음 버튼 클릭 시, 1~3개일 때만 진행
  const handleNext = () => {
    if (localGenres.length > 0 && !isOverLimit) {
      onNext();
    }
  };

  const isNextDisabled =
    localGenres.length === 0 || localGenres.length > MAX_SELECTION;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#10131b]">
      <div className="max-w-5xl mx-auto w-full relative z-10 flex gap-6">
        {/* 왼쪽: 장르 선택 UI */}
        <div className="flex-1 flex flex-col max-w-2xl">
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-base font-medium">
                1
              </div>
              <h2 className="text-white text-2xl font-medium">
                좋아하는 장르를 선택해주세요
              </h2>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-sm">
                최소 1개,{" "}
                <span className="text-purple-300">최대 3개까지</span> 선택할 수
                있어요.
              </p>
              <p className="text-xs text-gray-400">
                선택 {localGenres.length} / {MAX_SELECTION}개
              </p>
            </div>
            {isOverLimit && (
              <p className="mt-1 text-xs text-red-400">
                정확한 장르 파악을 위해{" "}
                <span className="font-semibold">최대 3개까지만</span> 선택해 주세요.
              </p>
            )}
          </div>

          {/* 장르 카드 그리드 */}
          <motion.div
            className="flex-1 grid grid-cols-3 gap-2 mb-3"
            animate={
              isOverLimit
                ? { x: [-4, 4, -4, 4, 0] } // 3개 초과 시 카드 전체 좌우 흔들림
                : { x: 0 }
            }
            transition={{ duration: 0.3 }}
          >
            {genreOptions.map((genre) => {
              const isSelected = localGenres.includes(genre.label);
              const baseSelected =
                "bg-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/20";
              const baseUnselected =
                "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20";

              // 3개 초과 시, 전체 카드에 빨간 톤 오버레이
              const overLimitStyle = isOverLimit
                ? isSelected
                  ? "border-red-400/80 bg-red-500/20"
                  : "border-red-400/60 bg-red-500/10"
                : "";

              return (
                <button
                  key={genre.id}
                  onClick={() => toggleGenre(genre.label)}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    isSelected ? baseSelected : baseUnselected
                  } ${overLimitStyle}`}
                >
                  <div className="text-xl mb-2">{genre.icon}</div>
                  <div className="text-sm text-white font-medium">
                    {genre.label}
                  </div>
                </button>
              );
            })}
          </motion.div>

          <div className="flex gap-3">
            {/* 필요 시 onBack 활성화 가능 */}
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

        {/* 오른쪽: 현재까지 선택한 취향 프리뷰 카드 */}
        <div className="w-80 flex-shrink-0 preview-hide-mobile">
          <PreferencesPreview
            genres={localGenres}
            moods={currentPreferences.moods}
            runtime={currentPreferences.runtime}
            releaseYear={currentPreferences.releaseYear}
            country={currentPreferences.country}
            excludes={currentPreferences.excludes}
            currentStep={1}
          />
        </div>
      </div>
    </div>
  );
}
