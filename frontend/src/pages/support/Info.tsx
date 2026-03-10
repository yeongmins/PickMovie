// frontend/src/pages/support/Info.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  Search,
  Heart,
  Film,
  Clock3,
  CalendarDays,
  Globe2,
  CircleX,
  ListChecks,
  Clapperboard,
  BookmarkCheck,
} from "lucide-react";
import { Header } from "../../components/layout/Header";
import { PageFooter } from "../../components/layout/Footer";
import { Logo } from "../../components/icons/Logo";

const riseEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: riseEase },
  },
};

const TITLE_FONT = "font-black tracking-[-0.035em]";
const BODY_FONT = "font-medium tracking-[-0.015em]";

type PreviewStep = {
  id: number;
  title: string;
  subtitle: string;
  countLabel: string;
  badgeClass: string;
  selectionTone: "genre" | "mood" | "detail" | "exclude";
  targetSelections: string[];
  selectedGenre: string[];
  selectedMood: string[];
  selectedRuntime: string | null;
  selectedYear: string | null;
  selectedCountry: string | null;
  selectedExcludes: string[];
};

type OptionItem = {
  label: string;
  emoji?: string;
};

const genreOptions: OptionItem[] = [
  { label: "액션", emoji: "💥" },
  { label: "코미디", emoji: "😂" },
  { label: "로맨스", emoji: "💕" },
  { label: "스릴러", emoji: "😱" },
  { label: "SF", emoji: "🚀" },
  { label: "드라마", emoji: "🎭" },
  { label: "공포", emoji: "👻" },
  { label: "애니메이션", emoji: "🎨" },
  { label: "판타지", emoji: "🧙‍♂️" },
  { label: "범죄", emoji: "🔫" },
  { label: "모험", emoji: "🗺️" },
  { label: "미스터리", emoji: "🔍" },
  { label: "가족", emoji: "👨‍👩‍👧‍👦" },
  { label: "음악", emoji: "🎵" },
  { label: "다큐멘터리", emoji: "📹" },
];

const moodOptions: OptionItem[] = [
  { label: "흥미진진", emoji: "🔥" },
  { label: "감동적인", emoji: "😢" },
  { label: "재미있는", emoji: "😄" },
  { label: "무서운", emoji: "😨" },
  { label: "로맨틱", emoji: "💖" },
  { label: "진지한", emoji: "🤔" },
  { label: "가벼운", emoji: "☁️" },
  { label: "어두운", emoji: "🌑" },
  { label: "영감을 주는", emoji: "✨" },
  { label: "신비로운", emoji: "🎭" },
  { label: "향수를 불러일으키는", emoji: "📼" },
  { label: "강렬한", emoji: "⚡" },
];

const runtimeOptions: OptionItem[] = [
  { label: "90분 이하" },
  { label: "90-120분" },
  { label: "120-150분" },
  { label: "150분 이상" },
  { label: "상관없음" },
];

const yearOptions: OptionItem[] = [
  { label: "2024년" },
  { label: "2023년" },
  { label: "2022년" },
  { label: "2020년대" },
  { label: "2010년대" },
  { label: "2000년대" },
  { label: "고전" },
  { label: "상관없음" },
];

const countryOptions: OptionItem[] = [
  { label: "한국", emoji: "🇰🇷" },
  { label: "미국", emoji: "🇺🇸" },
  { label: "일본", emoji: "🇯🇵" },
  { label: "프랑스", emoji: "🇫🇷" },
  { label: "영국", emoji: "🇬🇧" },
  { label: "상관없음", emoji: "🌍" },
];

const excludeOptions: OptionItem[] = [
  { label: "폭력적 장면", emoji: "⚠️" },
  { label: "공포 요소", emoji: "😱" },
  { label: "선정적 내용", emoji: "🔞" },
  { label: "슬픈 결말", emoji: "😢" },
  { label: "복잡한 스토리", emoji: "🧩" },
  { label: "없음", emoji: "✅" },
];

const previewSteps: PreviewStep[] = [
  {
    id: 1,
    title: "좋아하는 장르를 선택해주세요",
    subtitle: "최소 1개, 최대 3개까지 선택할 수 있어요.",
    countLabel: "선택 3 / 3개",
    badgeClass: "bg-purple-500",
    selectionTone: "genre",
    targetSelections: ["genre:액션", "genre:코미디", "genre:애니메이션"],
    selectedGenre: ["액션", "코미디", "애니메이션"],
    selectedMood: [],
    selectedRuntime: null,
    selectedYear: null,
    selectedCountry: null,
    selectedExcludes: [],
  },
  {
    id: 2,
    title: "어떤 분위기를 원하시나요?",
    subtitle: "최소 1개, 최대 3개까지 선택할 수 있어요.",
    countLabel: "선택 2 / 3개",
    badgeClass: "bg-pink-500",
    selectionTone: "mood",
    targetSelections: ["mood:흥미진진", "mood:로맨틱"],
    selectedGenre: ["액션", "코미디", "애니메이션"],
    selectedMood: ["흥미진진", "로맨틱"],
    selectedRuntime: null,
    selectedYear: null,
    selectedCountry: null,
    selectedExcludes: [],
  },
  {
    id: 3,
    title: "세부 선호사항을 알려주세요",
    subtitle: "모든 항목을 선택해주세요",
    countLabel: "필수 항목 선택",
    badgeClass: "bg-blue-500",
    selectionTone: "detail",
    targetSelections: ["runtime:상관없음", "year:2020년대", "country:일본"],
    selectedGenre: ["액션", "코미디", "애니메이션"],
    selectedMood: ["흥미진진", "로맨틱"],
    selectedRuntime: "상관없음",
    selectedYear: "2020년대",
    selectedCountry: "일본",
    selectedExcludes: [],
  },
  {
    id: 4,
    title: "제외하고 싶은 요소가 있나요?",
    subtitle: "선택 사항입니다 (여러 개 선택 가능)",
    countLabel: "선택 1 / 복수 선택",
    badgeClass: "bg-orange-500",
    selectionTone: "exclude",
    targetSelections: ["exclude:없음"],
    selectedGenre: ["액션", "코미디", "애니메이션"],
    selectedMood: ["흥미진진", "로맨틱"],
    selectedRuntime: "상관없음",
    selectedYear: "2020년대",
    selectedCountry: "일본",
    selectedExcludes: ["없음"],
  },
] as const;

const surveyTree = [
  {
    point: "STEP 01",
    title: "좋아하는 장르 선택",
    body: "장르를 고르면 추천 방향이 빠르게 정리됩니다.",
  },
  {
    point: "STEP 02",
    title: "원하는 분위기 선택",
    body: "오늘 감정에 맞는 무드를 중심으로 후보를 좁힙니다.",
  },
  {
    point: "STEP 03",
    title: "세부 조건 설정",
    body: "러닝타임/연도/국가를 반영해 보기 좋은 작품만 남깁니다.",
  },
  {
    point: "STEP 04",
    title: "제외 요소 선택",
    body: "원치 않는 요소를 제외해 결과의 정확도를 높입니다.",
  },
  {
    point: "STEP 05",
    title: "결과 확인 후 저장",
    body: "마음에 든 작품을 찜/플레이리스트로 바로 저장합니다.",
  },
] as const;

const featureCards = [
  {
    icon: Clapperboard,
    title: "취향 설문 분석",
    body: "장르와 분위기를 선택하면 개인 취향에 맞는 추천 기준이 자동으로 정리됩니다.",
  },
  {
    icon: Search,
    title: "맞춤 작품 추천",
    body: "설문 결과를 바탕으로 지금 보고 싶은 작품을 빠르게 추천해드립니다.",
  },
  {
    icon: BookmarkCheck,
    title: "찜/플레이리스트 저장",
    body: "마음에 든 작품은 찜과 플레이리스트에 저장해 다시 보기 쉽게 관리할 수 있습니다.",
  },
  {
    icon: ListChecks,
    title: "세부 조건 필터링",
    body: "러닝타임, 연도, 국가 등 조건을 반영해 원하는 스타일만 골라볼 수 있습니다.",
  },
  {
    icon: Heart,
    title: "제외 요소 설정",
    body: "보고 싶지 않은 요소를 제외해 추천 결과의 만족도를 높일 수 있습니다.",
  },
  {
    icon: Sparkles,
    title: "분위기 기반 탐색",
    body: "오늘의 기분에 맞는 무드를 선택해 감정선에 맞는 콘텐츠를 찾을 수 있습니다.",
  },
] as const;

function SurveyJourneyPanel() {
  const [active, setActive] = useState(0);
  const [isNextPulse, setIsNextPulse] = useState(false);
  const [animatedSelected, setAnimatedSelected] = useState<string[]>([]);
  const [recentSelected, setRecentSelected] = useState<string | null>(null);
  const activeStep = previewSteps[active];
  const toLabel = (selectionKey: string) => selectionKey.split(":").slice(1).join(":");
  const buildSelectionKey = (
    label: string,
    detailGroup?: "runtime" | "year" | "country",
  ) => {
    if (activeStep.selectionTone === "genre") return `genre:${label}`;
    if (activeStep.selectionTone === "mood") return `mood:${label}`;
    if (activeStep.selectionTone === "exclude") return `exclude:${label}`;
    return `${detailGroup ?? "runtime"}:${label}`;
  };

  useEffect(() => {
    const selectedOrder = activeStep.targetSelections;
    const timers: number[] = [];

    setIsNextPulse(false);
    setAnimatedSelected([]);
    setRecentSelected(null);

    selectedOrder.forEach((label, order) => {
      const showAt = 420 + order * 620;
      timers.push(
        window.setTimeout(() => {
          setAnimatedSelected((prev) => [...prev, label]);
          setRecentSelected(label);
          timers.push(
            window.setTimeout(() => {
              setRecentSelected((prev) => (prev === label ? null : prev));
            }, 320),
          );
        }, showAt),
      );
    });

    const pulseAt = Math.max(2600, 420 + selectedOrder.length * 620 + 700);
    timers.push(
      window.setTimeout(() => {
        setIsNextPulse(true);
      }, pulseAt),
    );
    timers.push(
      window.setTimeout(() => {
        setActive((prev) => (prev + 1) % previewSteps.length);
        setIsNextPulse(false);
      }, pulseAt + 420),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, activeStep.targetSelections]);

  const stagedSelected = activeStep.targetSelections.filter((label) =>
    animatedSelected.includes(label),
  );
  const stagedSelectedLabels = stagedSelected.map(toLabel);

  const displayedGenre =
    activeStep.id === 1 ? stagedSelectedLabels : activeStep.selectedGenre;
  const displayedMood =
    activeStep.id === 2 ? stagedSelectedLabels : activeStep.selectedMood;
  const detailRuntimeKey = activeStep.id === 3 ? activeStep.targetSelections[0] : "";
  const detailYearKey = activeStep.id === 3 ? activeStep.targetSelections[1] : "";
  const detailCountryKey = activeStep.id === 3 ? activeStep.targetSelections[2] : "";
  const displayedRuntime =
    activeStep.id === 3 && !animatedSelected.includes(detailRuntimeKey)
      ? null
      : activeStep.selectedRuntime;
  const displayedYear =
    activeStep.id === 3 && !animatedSelected.includes(detailYearKey)
      ? null
      : activeStep.selectedYear;
  const displayedCountry =
    activeStep.id === 3 && !animatedSelected.includes(detailCountryKey)
      ? null
      : activeStep.selectedCountry;
  const displayedExcludes =
    activeStep.id === 4 ? stagedSelectedLabels : activeStep.selectedExcludes;

  const isLabelSelected = (
    label: string,
    detailGroup?: "runtime" | "year" | "country",
  ) => animatedSelected.includes(buildSelectionKey(label, detailGroup));
  const isLabelRecent = (
    label: string,
    detailGroup?: "runtime" | "year" | "country",
  ) => recentSelected === buildSelectionKey(label, detailGroup);

  const selectedToneClass = (() => {
    if (activeStep.selectionTone === "genre") {
      return "bg-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/20";
    }
    if (activeStep.selectionTone === "mood") {
      return "bg-pink-500/20 border-pink-500 shadow-lg shadow-pink-500/20";
    }
    if (activeStep.selectionTone === "exclude") {
      return "bg-orange-500/20 border-orange-500 shadow-lg shadow-orange-500/20";
    }
    return "bg-blue-500/20 border-blue-500 shadow-lg shadow-blue-500/20";
  })();

  const secondaryHighlightClass =
    activeStep.id === 1
      ? "text-purple-200"
      : activeStep.id === 2
        ? "text-pink-300"
        : activeStep.id === 3
          ? "text-blue-300"
          : "text-orange-300";

  return (
    <div className="relative h-full overflow-hidden rounded-[2rem] border border-white/15 bg-[radial-gradient(circle_at_12%_8%,rgba(153,69,255,0.2),transparent_44%),linear-gradient(160deg,#050d25,#091836_45%,#0a1430_100%)] p-4 xl:p-6">
      <div className="w-full">
        <div className="grid h-full min-h-[560px] min-w-0 items-center gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(200px,28%,300px)] lg:items-stretch">
          <motion.div
            key={activeStep.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="order-1 min-w-0 self-center rounded-3xl border border-white/12 bg-black/18 p-3 lg:self-auto"
          >
            <div className="mb-3">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div
                  className={`w-7 h-7 ${activeStep.badgeClass} rounded-full flex items-center justify-center text-white text-sm font-medium`}
                >
                  {activeStep.id}
                </div>
                <h3 className="min-w-0 text-white font-medium text-[clamp(1rem,1.25vw,1.5rem)] whitespace-nowrap truncate">
                  {activeStep.title}
                </h3>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 truncate whitespace-nowrap text-gray-400 text-[clamp(10px,0.82vw,12px)]">
                  {activeStep.id === 1 && (
                    <>
                      최소 1개, <span className={secondaryHighlightClass}>최대 3개까지</span> 선택할 수 있어요.
                    </>
                  )}
                  {activeStep.id === 2 && (
                    <>
                      최소 1개, <span className={secondaryHighlightClass}>최대 3개까지</span> 선택할 수 있어요.
                    </>
                  )}
                  {activeStep.id !== 1 && activeStep.id !== 2 && activeStep.subtitle}
                </p>
                <p className="shrink-0 whitespace-nowrap text-[clamp(10px,0.78vw,11px)] text-gray-400">
                  {activeStep.countLabel}
                </p>
              </div>
            </div>

            {(activeStep.id === 1 || activeStep.id === 2) && (
              <div className="flex-1 grid grid-cols-3 gap-1.5 mb-2.5">
                {(activeStep.id === 1 ? genreOptions : moodOptions).map((option) => {
                  const isChosen = isLabelSelected(option.label);
                  const isFlash = isLabelRecent(option.label);
                  return (
                    <motion.button
                      key={option.label}
                      type="button"
                      animate={{ scale: isFlash ? [1, 0.98, 1.03, 1] : 1 }}
                      transition={{ duration: 0.32 }}
                      className={`p-2.5 rounded-xl border-2 transition-all text-left ${
                        isChosen
                          ? selectedToneClass
                          : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="text-lg mb-1.5">{option.emoji}</div>
                      <div className="text-[13px] text-white font-medium break-keep">
                        {option.label}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {activeStep.id === 3 && (
              <div className="flex-1 space-y-3 mb-2.5">
                <div>
                  <label className="text-white mb-1.5 block text-[13px]">러닝타임</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {runtimeOptions.map((option) => {
                      const isChosen = isLabelSelected(option.label, "runtime");
                      const isFlash = isLabelRecent(option.label, "runtime");
                      return (
                        <motion.button
                          key={option.label}
                          type="button"
                          animate={{ scale: isFlash ? [1, 0.98, 1.03, 1] : 1 }}
                          transition={{ duration: 0.32 }}
                          className={`p-2 rounded-lg border-2 transition-all ${
                            isChosen
                              ? selectedToneClass
                              : "bg-white/5 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          <div className="text-white text-[11px] font-medium leading-tight">{option.label}</div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-white mb-1.5 block text-[13px]">개봉 연도</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {yearOptions.map((option) => {
                      const isChosen = isLabelSelected(option.label, "year");
                      const isFlash = isLabelRecent(option.label, "year");
                      return (
                        <motion.button
                          key={option.label}
                          type="button"
                          animate={{ scale: isFlash ? [1, 0.98, 1.03, 1] : 1 }}
                          transition={{ duration: 0.32 }}
                          className={`p-2 rounded-lg border-2 transition-all ${
                            isChosen
                              ? selectedToneClass
                              : "bg-white/5 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          <div className="text-white text-[11px] font-medium leading-tight">{option.label}</div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-white mb-1.5 block text-[13px]">국가</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {countryOptions.map((option) => {
                      const isChosen = isLabelSelected(option.label, "country");
                      const isFlash = isLabelRecent(option.label, "country");
                      return (
                        <motion.button
                          key={option.label}
                          type="button"
                          animate={{ scale: isFlash ? [1, 0.98, 1.03, 1] : 1 }}
                          transition={{ duration: 0.32 }}
                          className={`p-2 rounded-lg border-2 transition-all ${
                            isChosen
                              ? selectedToneClass
                              : "bg-white/5 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          <div className="text-lg mb-0.5">{option.emoji}</div>
                          <div className="text-white text-[11px] font-medium leading-tight">{option.label}</div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeStep.id === 4 && (
              <div className="flex-1 grid grid-cols-3 gap-1.5 mb-2.5">
                {excludeOptions.map((option) => {
                  const isChosen = isLabelSelected(option.label);
                  const isFlash = isLabelRecent(option.label);
                  return (
                    <motion.button
                      key={option.label}
                      type="button"
                      animate={{ scale: isFlash ? [1, 0.98, 1.03, 1] : 1 }}
                      transition={{ duration: 0.32 }}
                      className={`p-2.5 rounded-xl border-2 transition-all text-left ${
                        isChosen
                          ? selectedToneClass
                          : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="text-lg mb-1">{option.emoji}</div>
                      <div className="text-white text-[13px] font-medium break-keep">
                        {option.label}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-xl border px-3 py-2 text-[13px] ${
                  active === 0
                    ? "border-white/10 text-white/30"
                    : "border-white/20 text-white hover:bg-white/10 bg-white/5"
                }`}
              >
                이전
              </button>
              <motion.button
                type="button"
                animate={{
                  scale: isNextPulse ? [1, 0.97, 1.03, 1] : 1,
                  opacity: isNextPulse ? [1, 0.88, 1] : 1,
                }}
                transition={{ duration: 0.35 }}
                className="pick-cta flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border-none transition-opacity rounded-xl px-3 py-2 text-[13px]"
              >
                {activeStep.id === previewSteps.length ? "완료" : "다음"}
              </motion.button>
            </div>
          </motion.div>

          <div className="order-2 hidden min-w-0 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 lg:block">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-purple-200" />
              <h3 className="text-white text-sm font-medium">선택한 취향</h3>
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-1 mb-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      step <= active + 1
                        ? "bg-gradient-to-r from-purple-600 to-pink-600"
                        : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
              <p className="text-gray-400 text-[11px]">{active + 1}/4 단계 완료</p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Film className="w-3 h-3 text-purple-200" />
                  <span className="text-gray-300 text-xs">장르</span>
                </div>
                {displayedGenre.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {displayedGenre.map((genre) => (
                      <span
                        key={genre}
                        className="px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded-md text-purple-200 text-xs"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs">선택되지 않음</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="w-3 h-3 text-pink-300" />
                  <span className="text-gray-300 text-xs">분위기</span>
                </div>
                {displayedMood.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {displayedMood.map((mood) => (
                      <span
                        key={mood}
                        className="px-2 py-1 bg-pink-500/20 border border-pink-500/30 rounded-md text-pink-200 text-xs"
                      >
                        {mood}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs">선택되지 않음</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 pt-3 border-t border-white/10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock3 className="w-3 h-3 text-blue-300" />
                    <span className="text-gray-300 text-xs">러닝타임</span>
                  </div>
                  <p className={`text-xs ${displayedRuntime ? "text-blue-200" : "text-gray-500"}`}>
                    {displayedRuntime || "선택되지 않음"}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarDays className="w-3 h-3 text-green-300" />
                    <span className="text-gray-300 text-xs">개봉 연도</span>
                  </div>
                  <p className={`text-xs ${displayedYear ? "text-green-200" : "text-gray-500"}`}>
                    {displayedYear || "선택되지 않음"}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Globe2 className="w-3 h-3 text-yellow-300" />
                    <span className="text-gray-300 text-xs">국가</span>
                  </div>
                  <p className={`text-xs ${displayedCountry ? "text-yellow-200" : "text-gray-500"}`}>
                    {displayedCountry || "선택되지 않음"}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <CircleX className="w-3 h-3 text-orange-300" />
                  <span className="text-gray-300 text-xs">제외 요소</span>
                </div>
                {displayedExcludes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {displayedExcludes.map((exclude) => (
                      <span
                        key={exclude}
                        className="px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded-md text-orange-200 text-xs"
                      >
                        {exclude}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs">선택되지 않음</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Info() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  return (
    <>
      <Header currentSection="home" />

      <main
        id="main-content"
        className={`relative overflow-hidden pt-16 text-white ${TITLE_FONT}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        >
          <div className="absolute left-[-10%] top-[-12%] h-[560px] w-[560px] rounded-full bg-fuchsia-500/22 blur-[130px]" />
          <div className="absolute right-[-12%] top-[16%] h-[520px] w-[520px] rounded-full bg-blue-400/20 blur-[130px]" />
          <div className="absolute bottom-[-18%] left-[22%] h-[480px] w-[480px] rounded-full bg-violet-500/22 blur-[130px]" />
        </div>

        <section className="relative z-10 min-h-[88vh] px-5 py-16 sm:px-9 sm:py-16 lg:px-8 lg:py-20 xl:px-14">
          <div className="mx-auto grid w-full max-w-[1420px] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={rise}
              className="space-y-2 sm:space-y-3"
            >
              <p
                className={`${TITLE_FONT} text-2xl leading-[1.08] sm:text-3xl`}
              >
                내가 보고싶은 컨텐츠를 추천해주는
              </p>
              <p
                className={`${TITLE_FONT} text-2xl leading-[1.08] text-white/95 sm:text-3xl`}
              >
                개인 맞춤형 영화 추천 플랫폼
              </p>
              <div className="origin-left scale-[1.14] pt-2 sm:scale-[1.2] lg:scale-[1.24]">
                <Logo
                  size="xl"
                  className="drop-shadow-[0_8px_22px_rgba(157,91,255,0.28)]"
                />
              </div>
              <p
                className={`${BODY_FONT} max-w-2xl pt-3 text-base leading-[1.45] text-white/82 sm:pt-5 sm:text-lg`}
              >
                취향 설문조사를 통해 다양한 영화를 추천받고, 마음에 드는 작품은
                찜/플레이리스트에 저장해서 원하는 영화를 시청/관리를 할 수 있어요
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.75,
                delay: 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative min-w-0 overflow-x-auto pb-2"
            >
              <div className="w-full lg:w-[clamp(520px,50vw,860px)]">
                <SurveyJourneyPanel />
              </div>
            </motion.div>
          </div>
        </section>

        <section className="relative z-10 px-5 py-20 sm:px-9 sm:py-28 lg:px-14 lg:py-32">
          <div className="mx-auto w-full max-w-[1320px]">
            <motion.h2
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={rise}
              className={`${TITLE_FONT} text-3xl lg:text-4xl leading-[1.06]`}
            >
              주요 기능
            </motion.h2>

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {featureCards.map((card, index) => (
                <motion.article
                  key={card.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, delay: index * 0.07 }}
                  className="rounded-3xl bg-white/10 p-7 shadow-[0_22px_52px_rgba(0,0,0,0.28)]"
                >
                  <div className="inline-flex rounded-xl bg-black/20 p-2.5">
                    <card.icon className="h-4 w-4" />
                  </div>
                  <h3
                    className={`${TITLE_FONT} mt-5 text-2xl`}
                  >
                    {card.title}
                  </h3>
                  <p
                    className={`${BODY_FONT} mt-3 text-[15px] leading-[1.45] text-white/84`}
                  >
                    {card.body}
                  </p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 px-5 py-20 sm:px-9 sm:py-28 lg:px-14 lg:py-32">
          <div className="mx-auto w-full max-w-[1320px]">
            <motion.h2
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={rise}
              className={`${TITLE_FONT} text-3xl lg:text-4xl leading-[1.06]`}
            >
              설문조사 방법
            </motion.h2>

            <div className="relative mt-12 sm:mt-14">
              <div className="absolute bottom-0 left-4 top-0 w-px bg-white/25 md:left-1/2 md:-translate-x-1/2" />
              <div className="space-y-7 md:space-y-10">
                {surveyTree.map((step, index) => (
                  <motion.div
                    key={step.point}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.45, delay: index * 0.04 }}
                    className="relative min-h-[106px]"
                  >
                    <span className="absolute left-4 top-[34px] z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-fuchsia-400 shadow-[0_0_0_5px_rgba(212,72,255,0.18)] md:left-1/2" />

                    <article
                      className={`ml-12 rounded-3xl bg-white/12 px-5 py-5 backdrop-blur md:w-[calc(50%-2rem)] md:px-6 ${
                        index % 2 === 0
                          ? "md:mr-auto md:ml-0 md:text-right"
                          : "md:ml-auto md:mr-0"
                      }`}
                    >
                      <p className={`${BODY_FONT} text-xs text-white/78`}>
                        {step.point}
                      </p>
                      <h3
                        className={`${TITLE_FONT} mt-1 text-2xl leading-[1.08] sm:text-[1.9rem]`}
                      >
                        {step.title}
                      </h3>
                      <p
                        className={`${BODY_FONT} mt-2 text-[15px] leading-[1.42] text-white/84`}
                      >
                        {step.body}
                      </p>
                    </article>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 px-5 py-20 sm:px-9 sm:py-28 lg:px-14 lg:py-32">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={rise}
            className="mx-auto w-full max-w-[1120px] pb-4 text-center sm:pb-0"
          >
            <h2
              className={`${TITLE_FONT} text-3xl lg:text-4xl`}
            >
              지금 바로 분석해보세요
            </h2>
            <p
              className={`${BODY_FONT} mx-auto mt-4 max-w-4xl text-[18px] lg:text-[20px] text-white/84`}
            >
              설문 몇 단계만 완료하면, 취향에 맞는 영화를 바로 추천해드려요.
            </p>
            <div className="mt-11">
              <Link
                to="/analyze"
                onClick={() =>
                  window.scrollTo({ top: 0, behavior: "auto" })
                }
                className={`${TITLE_FONT} inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-9 py-3.5 text-xl shadow-[0_14px_42px_rgba(168,85,247,0.36)] transition hover:brightness-110`}
              >
                분석하기
                <ArrowRight className="h-6 w-6" />
              </Link>
            </div>
          </motion.div>
        </section>

        <div
          aria-hidden="true"
          className="pointer-events-none relative z-10 h-16 bg-[linear-gradient(to_bottom,rgba(10,16,31,0),rgba(11,13,21,0.88)_62%,#0b0b10)]"
        />
      </main>

      <PageFooter className="mt-0" />
    </>
  );
}
