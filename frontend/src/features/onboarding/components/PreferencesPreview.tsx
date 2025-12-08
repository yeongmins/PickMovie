// 사용자가 온보딩에서 선택한 취향(장르, 분위기, 러닝타임 등)을
// 우측 프리뷰 카드 형태로 보여주는 컴포넌트

import {
  Film,
  Sparkles,
  Clock,
  Calendar,
  Globe,
  XCircle,
  Heart,
} from "lucide-react";
import { motion } from "framer-motion";

interface PreferencesPreviewProps {
  genres: string[];      // 선택한 장르 목록
  moods: string[];       // 선택한 분위기 목록
  runtime: string;       // 선택한 러닝타임(텍스트)
  releaseYear: string;   // 선택한 개봉 연도(텍스트)
  country: string;       // 선택한 국가(텍스트)
  excludes: string[];    // 제외한 요소 목록
  currentStep: number;   // 온보딩 진행 단계(1~4)
}

// 칩(chip) 요소가 등장할 때 짧게 페이드인만 주는 애니메이션 설정
const chipFadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.1 },
};

export function PreferencesPreview({
  genres,
  moods,
  runtime,
  releaseYear,
  country,
  excludes,
  currentStep,
}: PreferencesPreviewProps) {
  return (
    // 오른쪽에 고정되는 프리뷰 카드 (스크롤 내려도 고정)
    <div className="sticky top-6">
      {/* 프리뷰 카드 전체 컨테이너 */}
      <motion.div
        className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.12 }}
      >
        {/* 제목 영역 */}
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-purple-300" />
          <h3 className="text-white text-base font-medium">선택한 취향</h3>
        </div>

        {/* 온보딩 진행도(1~4 단계 막대 표시) */}
        <div className="mb-5">
          <div className="flex items-center gap-1 mb-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  step <= currentStep
                    ? "bg-gradient-to-r from-purple-500 to-pink-500"
                    : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <p className="text-gray-400 text-xs">{currentStep}/4 단계 완료</p>
        </div>

        <div className="space-y-4">
          {/* 장르 목록 칩 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Film className="w-3 h-3 text-purple-300" />
              <span className="text-gray-300 text-xs">장르</span>
            </div>
            {genres.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {genres.map((genre) => (
                  <motion.span
                    key={genre}
                    className="px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded-md text-purple-200 text-xs transition-transform duration-150 hover:scale-105"
                    {...chipFadeIn}
                  >
                    {genre}
                  </motion.span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-xs">선택되지 않음</p>
            )}
          </div>

          {/* 분위기 목록 칩 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-3 h-3 text-pink-300" />
              <span className="text-gray-300 text-xs">분위기</span>
            </div>
            {moods.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {moods.map((mood) => (
                  <motion.span
                    key={mood}
                    className="px-2 py-1 bg-pink-500/20 border border-pink-500/30 rounded-md text-pink-200 text-xs transition-transform duration-150 hover:scale-105"
                    {...chipFadeIn}
                  >
                    {mood}
                  </motion.span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-xs">선택되지 않음</p>
            )}
          </div>

          {/* 러닝타임 / 개봉 연도 / 국가 텍스트 표시 */}
          <div className="grid grid-cols-1 gap-3 pt-3 border-t border-white/10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3 h-3 text-blue-300" />
                <span className="text-gray-300 text-xs">러닝타임</span>
              </div>
              <motion.p
                className={`text-xs ${
                  runtime ? "text-blue-200" : "text-gray-500"
                }`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1 }}
              >
                {runtime || "선택되지 않음"}
              </motion.p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-3 h-3 text-green-300" />
                <span className="text-gray-300 text-xs">개봉 연도</span>
              </div>
              <motion.p
                className={`text-xs ${
                  releaseYear ? "text-green-200" : "text-gray-500"
                }`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1 }}
              >
                {releaseYear || "선택되지 않음"}
              </motion.p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-3 h-3 text-yellow-300" />
                <span className="text-gray-300 text-xs">국가</span>
              </div>
              <motion.p
                className={`text-xs ${
                  country ? "text-yellow-200" : "text-gray-500"
                }`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1 }}
              >
                {country || "선택되지 않음"}
              </motion.p>
            </div>
          </div>

          {/* 제외 요소 칩 목록 */}
          {excludes.length > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-3 h-3 text-orange-300" />
                <span className="text-gray-300 text-xs">제외 요소</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {excludes.map((exclude) => (
                  <motion.span
                    key={exclude}
                    className="px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded-md text-orange-200 text-xs transition-transform duration-150 hover:scale-105"
                    {...chipFadeIn}
                  >
                    {exclude}
                  </motion.span>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
