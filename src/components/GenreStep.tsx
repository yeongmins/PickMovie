// 온보딩 1단계: 사용자가 좋아하는 장르를 선택하는 화면

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { UserPreferences } from "./Onboarding";

interface GenreStepProps {
  onNext: () => void; // 다음 단계로 이동
  onBack: () => void; // 이전 단계로 이동(현재는 사용 X)
  selectedGenres: string[]; // 부모에서 내려준 현재 선택된 장르
  onGenresChange: (genres: string[]) => void; // 선택된 장르 변경 콜백
  currentPreferences: UserPreferences; // 프리뷰에 표시할 전체 취향 정보
}

// 화면에 보여줄 장르 선택 옵션 (이모지 + 한글 라벨)
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

export function GenreStep({
  onNext,
  onBack,
  selectedGenres,
  onGenresChange,
  currentPreferences,
}: GenreStepProps) {
  // 로컬 상태로 선택된 장르를 관리 (부모와 즉시 동기화)
  const [localGenres, setLocalGenres] = useState<string[]>(selectedGenres);

  // 장르 버튼을 클릭했을 때 선택/해제 토글
  const toggleGenre = (genre: string) => {
    const newGenres = localGenres.includes(genre)
      ? localGenres.filter((g) => g !== genre) // 이미 선택되어 있으면 제거
      : [...localGenres, genre]; // 아니면 추가

    setLocalGenres(newGenres); // 로컬 상태 업데이트
    onGenresChange(newGenres); // 부모에도 변경 내용 전달
  };

  // 최소 1개 이상 선택된 경우에만 다음 단계로 이동
  const handleNext = () => {
    if (localGenres.length > 0) {
      onNext();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#1a1a24]">
      {/* 전체 온보딩 공통 배경 (영화관 느낌의 어두운 배경) */}
      {/* <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-3xl pointer-events-none" /> */}

      <div className="max-w-5xl mx-auto w-full relative z-10 flex gap-6">
        {/* 왼쪽: 장르 선택 UI */}
        <div className="flex-1 flex flex-col max-w-2xl">
          <div className="mb-4">
            {/* 단계 번호 + 제목 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-base font-medium">
                1
              </div>
              <h2 className="text-white text-2xl font-medium">
                좋아하는 장르를 선택해주세요
              </h2>
            </div>
            <p className="text-gray-400 text-sm">
              최소 1개 이상 선택해주세요 (여러 개 선택 가능)
            </p>
          </div>

          {/* 장르 카드 그리드 */}
          <div className="flex-1 grid grid-cols-3 gap-2 mb-3">
            {genreOptions.map((genre) => (
              <button
                key={genre.id}
                onClick={() => toggleGenre(genre.label)}
                className={`p-3 rounded-xl border-2 transition-all text-left ${
                  localGenres.includes(genre.label)
                    ? // 선택된 상태: 보라색 강조 + 그림자
                      "bg-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/20"
                    : // 기본 상태: 약한 테두리 + 호버 시만 밝게
                      "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                }`}
              >
                <div className="text-xl mb-2">{genre.icon}</div>
                <div className="text-sm text-white font-medium">
                  {genre.label}
                </div>
              </button>
            ))}
          </div>

          {/* 하단 버튼 영역 (이전/다음) */}
          <div className="flex gap-3">
            {/* 이전 버튼은 UX 상 필요 없어서 주석 처리 */}
            {/* <Button ...>이전</Button> */}
            <Button
              onClick={handleNext}
              disabled={localGenres.length === 0} // 하나도 선택 안했으면 비활성화
              size="lg"
              className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </Button>
          </div>
        </div>

        {/* 오른쪽: 현재까지 선택한 취향 미리보기 카드 */}
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
