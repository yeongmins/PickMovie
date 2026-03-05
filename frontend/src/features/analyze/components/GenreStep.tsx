// 온보딩 1단계
// - 좋아하는 장르를 최소 1개, 최대 3개까지 선택하는 화면
// - 3개를 초과하면 에러 스타일 + 카드 흔들림 애니메이션

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

import { Button } from "../../../components/ui/button";
import { PreferencesPreview } from "./PreferencesPreview";
import { type UserPreferences } from "../Analyze";
import { apiGet } from "../../../lib/apiClient";

interface GenreStepProps {
  onNext: () => void;
  onBack: () => void;
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
  currentPreferences: UserPreferences;
  isAuthed?: boolean;
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
  isAuthed = false,
}: GenreStepProps) {
  // 부모에서 전달된 선택값을 로컬 상태로 복사
  const [localGenres, setLocalGenres] = useState<string[]>(selectedGenres);
  const [genreBadges, setGenreBadges] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalGenres(selectedGenres);
  }, [selectedGenres]);

  useEffect(() => {
    let mounted = true;

    if (!isAuthed) {
      setGenreBadges({});
      return;
    }

    void apiGet<{
      items?: Array<{
        label?: string;
        badgeText?: string | null;
      }>;
    }>("/auth/personalization/genre-insights")
      .then((res) => {
        if (!mounted) return;
        const map: Record<string, string> = {};
        for (const item of Array.isArray(res?.items) ? res.items : []) {
          const label = String(item?.label ?? "").trim();
          const badgeText = String(item?.badgeText ?? "").trim();
          if (!label || !badgeText) continue;
          map[label] = badgeText;
        }
        setGenreBadges(map);
      })
      .catch(() => {
        if (!mounted) return;
        setGenreBadges({});
      });

    return () => {
      mounted = false;
    };
  }, [isAuthed]);

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
    <div className="flex justify-center px-6 pt-6 pb-20 relative bg-[#10131b] overflow-hidden max-[900px]:pb-16">
      <div className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 rounded-full bg-purple-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />

      <div className="max-w-6xl mx-auto w-full relative z-10 flex gap-6">
        <div className="flex-1 max-w-3xl rounded-3xl border border-white/10 bg-[#0f1420]/85 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <div className="mb-5">
            <div className="inline-flex items-center rounded-full border border-purple-300/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-200">
              STEP 1/4
            </div>
            <h2 className="mt-3 text-white text-2xl font-semibold">
              좋아하는 장르를 선택해주세요
            </h2>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-gray-300 text-sm">
                오늘 보고 싶은 장르를{" "}
                <span className="text-purple-200">최대 3개</span>까지 고를 수 있어요.
              </p>
              <p className="text-xs text-gray-400">
                선택 {localGenres.length}/{MAX_SELECTION}
              </p>
            </div>
            {isOverLimit ? (
              <p className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                정확도 유지를 위해 최대 3개까지만 선택해 주세요.
              </p>
            ) : null}
          </div>

          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 gap-2.5"
            animate={isOverLimit ? { x: [-4, 4, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {genreOptions.map((genre) => {
              const isSelected = localGenres.includes(genre.label);
              const overLimitStyle = isOverLimit
                ? isSelected
                  ? "border-red-400/80 bg-red-500/20"
                  : "border-red-400/60 bg-red-500/10"
                : "";

              return (
                <button
                  key={genre.id}
                  onClick={() => toggleGenre(genre.label)}
                  className={`min-h-24 rounded-2xl border px-3 py-3 text-left transition-all ${
                    isSelected
                      ? "border-purple-400/80 bg-purple-500/20 shadow-[0_0_0_1px_rgba(192,132,252,0.35)_inset]"
                      : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                  } ${overLimitStyle}`}
                >
                  <div className="text-xl">{genre.icon}</div>
                  <div className="mt-1 text-sm text-white font-medium">
                    {genre.label}
                  </div>
                  {genreBadges[genre.label] ? (
                    <div className="mt-1.5 text-[11px] text-purple-200/90">
                      {genreBadges[genre.label]}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </motion.div>

          <div className="mt-4 flex gap-3">
            <Button
              onClick={handleNext}
              disabled={isNextDisabled}
              size="lg"
              className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed border-none transition-opacity"
            >
              다음 단계
            </Button>
          </div>
        </div>

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
