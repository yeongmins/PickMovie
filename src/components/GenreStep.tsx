import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { UserPreferences } from "./Onboarding";

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

export function GenreStep({
  onNext,
  onBack,
  selectedGenres,
  onGenresChange,
  currentPreferences,
}: GenreStepProps) {
  const [localGenres, setLocalGenres] = useState<string[]>(selectedGenres);

  const toggleGenre = (genre: string) => {
    const newGenres = localGenres.includes(genre)
      ? localGenres.filter((g) => g !== genre)
      : [...localGenres, genre];
    setLocalGenres(newGenres);
    onGenresChange(newGenres);
  };

  const handleNext = () => {
    if (localGenres.length > 0) {
      onNext();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#1a1a24]">
      {/* Cinema spotlight effect */}
      {/* <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-3xl pointer-events-none" /> */}

      <div className="max-w-5xl mx-auto w-full relative z-10 flex gap-6">
        {/* Left side - Selection */}
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
            <p className="text-gray-400 text-sm">
              최소 1개 이상 선택해주세요 (여러 개 선택 가능)
            </p>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-2 mb-3">
            {genreOptions.map((genre) => (
              <button
                key={genre.id}
                onClick={() => toggleGenre(genre.label)}
                className={`p-3 rounded-xl border-2 transition-all text-left ${
                  localGenres.includes(genre.label)
                    ? "bg-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/20"
                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                }`}
              >
                <div className="text-xl mb-2">{genre.icon}</div>
                <div className="text-sm text-white font-medium">{genre.label}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            {/* <Button
              onClick={onBack}
              variant="outline"
              size="lg"
              className="border-white/20 text-white hover:bg-white/10 bg-white/5"
            >
              이전
            </Button> */}
            <Button
              onClick={handleNext}
              disabled={localGenres.length === 0}
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
