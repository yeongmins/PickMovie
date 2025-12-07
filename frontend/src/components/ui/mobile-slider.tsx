// src/components/mobile-slider.tsx
import React, { useState } from "react";

const FEATURES = [
  {
    icon: "🎯",
    title: "정확한 추천",
    desc: "장르, 분위기, 러닝타임까지 고려한 맞춤형 추천",
  },
  {
    icon: "⚡",
    title: "빠른 결과",
    desc: "단 1분만에 당신에게 완벽한 영화 리스트를 제공",
  },
  {
    icon: "💾",
    title: "찜 기능",
    desc: "마음에 드는 영화를 저장하고 플레이리스트 생성",
  },
];

export function MobileFeatureSlider() {
  const [index, setIndex] = useState(0);

  const next = () => {
    setIndex((prev) => (prev + 1) % FEATURES.length);
  };

  const prev = () => {
    setIndex((prev) => (prev === 0 ? FEATURES.length - 1 : prev - 1));
  };

  return (
    // ✅ 모바일+태블릿에서만 보이게, PC에서는 숨김
    <div className="lg:hidden w-full mt-8 welcome-mn">
      {/* ✅ group 추가 → group-hover:opacity-100 이 버튼에 적용됨 */}
      <div className="relative overflow-hidden w-full group">
        {/* 슬라이드들 */}
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {FEATURES.map((f, i) => (
            <div key={i} className="min-w-full px-4">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 text-center shadow-lg shadow-black/30">
                <div className="text-5xl mb-4">{f.icon}</div>
                <h3 className="text-white text-xl mb-3">{f.title}</h3>
                <p className="text-gray-400 text-md">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          aria-label="이전 슬라이드"
          onClick={prev}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 mt-5 ml-
                     hover:bg-black/30 backdrop-blur-sm rounded-full 
                     flex items-center justify-center opacity-0 group-hover:opacity-100 
                     transition-opacity z-10"
        >
          <span className="text-2xl text-white">‹</span>
        </button>

        {/* ▶ 다음 버튼 */}
        <button
          type="button"
          aria-label="다음 슬라이드"
          onClick={next}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 mt-5 mr-2
                     hover:bg-black/30 backdrop-blur-sm rounded-full 
                     flex items-center justify-center opacity-0 group-hover:opacity-100 
                     transition-opacity z-10"
        >
          <span className="text-2xl text-white">›</span>
        </button>
      </div>

      {/* 인디케이터 점 */}
      <div className="flex justify-center gap-2 mt-4">
        {FEATURES.map((_, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              index === i ? "bg-purple-400 w-5" : "bg-gray-600"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
