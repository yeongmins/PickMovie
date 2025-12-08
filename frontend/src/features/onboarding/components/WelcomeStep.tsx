// 온보딩 진입 전 인트로 랜딩 화면 (서비스 소개 + 스크롤 유도)
// /welcome 라우트에서만 사용, 실제 온보딩은 /onboarding에서 시작

import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import { motion } from "framer-motion";
import { MouseScrollIcon } from "./MouseScrollIcon";
import { Logo } from "../../../components/icons/Logo";
import { MobileFeatureSlider } from "./MobileFeatureSlider";

interface WelcomeStepProps {
  onNext: () => void; // "시작하기" 클릭 시 온보딩으로 이동
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const [scrollY, setScrollY] = useState(0); // 컨테이너 내부 스크롤 위치
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 자체 스크롤 컨테이너에 스크롤 이벤트 등록
    const handleScroll = () => {
      if (containerRef.current) {
        setScrollY(containerRef.current.scrollTop);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);

  // 패럴랙스 효과 등에 사용할 수 있는 값 (현재는 사용 X)
  const parallaxOffset = scrollY * 0.5;
  void parallaxOffset;

  return (
    <div
      ref={containerRef}
      className="relative h-screen overflow-y-auto snap-y snap-mandatory scroll-smooth"
    >
      {/* 보라색 원형 글로우 배경 (화면 전체 고정) */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
        <div className="w-[140vmax] h-[140vmax] rounded-full bg-[#341551] opacity-90 blur-3xl" />
      </div>

      {/* Section 1: Hero 영역 (로고 + 메인 카피) */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 snap-start overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-center"
        >
          {/* 로고 */}
          <Logo size="xl" className="justify-center mb-12 welcome-title" />

          {/* 메인 헤드라인 */}
          <h1 className="text-white mb-8 text-5xl font-bold welcome-middle">
            당신만을 위한 영화 추천 서비스
          </h1>

          {/* 서브 카피 */}
          <p className="text-gray-300 mb-16 text-xl welcome-small-text">
            1분만 투자하세요.
            <br />
            알고리즘이 당신의 취향을 분석하여
            <br />
            완벽한 영화를 찾아드립니다.
          </p>

          {/* 아래로 스크롤 안내 아이콘 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1 }}
          >
            <MouseScrollIcon />
          </motion.div>
        </motion.div>
      </section>

      {/* Section 2: Why PickMovie? (서비스 장점 3가지) */}
      <section className="relative z-10 min-h-screen flex items-center justify-center px-6 py-12 snap-start">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          viewport={{ once: true, margin: "-100px" }}
          className="w-full max-w-5xl mx-auto text-center"
        >
          <h2 className="text-white mb-6 text-6xl welcome-why">
            왜{" "}
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent font-bold">
              PickMovie
            </span>{" "}
            인가요?
          </h2>

          <p className="text-gray-400 mb-10 text-base welcome-small-text">
            수많은 OTT 플랫폼과 영화 속에서 선택 장애를 겪고 계신가요?
          </p>

          {/* 🖥 데스크탑 / 태블릿: 3개 카드 형태 */}
          <div className="hidden lg:grid grid-cols-3 gap-8">
            {/* 정확한 추천 카드 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true, margin: "-50px" }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <div className="text-5xl mb-4">🎯</div>
              <h3 className="text-white mb-3">정확한 추천</h3>
              <p className="text-gray-400">
                장르, 분위기, 러닝타임까지 고려한 맞춤형 추천
              </p>
            </motion.div>

            {/* 빠른 결과 카드 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true, margin: "-50px" }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <div className="text-5xl mb-4">⚡</div>
              <h3 className="text-white mb-3">빠른 결과</h3>
              <p className="text-gray-400">
                단 1분만에 당신에게 완벽한 영화 리스트를 제공
              </p>
            </motion.div>

            {/* 찜 기능 카드 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true, margin: "-50px" }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <div className="text-5xl mb-4">💾</div>
              <h3 className="text-white mb-3">찜 기능</h3>
              <p className="text-gray-400">
                마음에 드는 영화를 저장하고 플레이리스트 생성
              </p>
            </motion.div>
          </div>

          {/* 📱 모바일/태블릿: 슬라이더로 1장씩 보여줌 */}
          <div className="flex justify-center mt-6 lg:hidden">
            <MobileFeatureSlider />
          </div>
        </motion.div>
      </section>

      {/* Section 3: 사용 방법 3단계 설명 */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 snap-start">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          viewport={{ once: true, margin: "-100px" }}
          className="max-w-4xl mx-auto text-center"
        >
          <h2 className="text-white mb-6 text-5xl welcome-why">
            어떻게 작동하나요?
          </h2>
          <p className="text-gray-400 mb-16 text-lg welcome-small-text">
            간단한 3단계로 당신만의 영화 추천을 받아보세요
          </p>

          {/* 3단계 리스트 */}
          <div className="space-y-12">
            {/* 1단계: 취향 설문 작성 */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              viewport={{ once: true, margin: "-50px" }}
              className="flex items-start gap-6 text-left welcome-gap"
            >
              <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 text-white">
                1
              </div>
              <div>
                <h3 className="text-white mb-2">취향 설문 작성</h3>
                <p className="text-gray-400">
                  선호하는 장르, 분위기, 러닝타임 등을 선택해주세요. 1분이면
                  충분합니다.
                </p>
              </div>
            </motion.div>

            {/* 2단계: 알고리즘 분석 */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
              viewport={{ once: true, margin: "-50px" }}
              className="flex items-start gap-6 text-left welcome-gap"
            >
              <div className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center flex-shrink-0 text-white">
                2
              </div>
              <div>
                <h3 className="text-white mb-2">알고리즘 기반 분석</h3>
                <p className="text-gray-400">
                  가중치 기반 알고리즘으로 당신의 취향을 분석하고 TMDB에서
                  최적의 영화를 찾습니다.
                </p>
              </div>
            </motion.div>

            {/* 3단계: 맞춤 추천 */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              viewport={{ once: true, margin: "-50px" }}
              className="flex items-start gap-6 text-left welcome-gap"
            >
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 text-white">
                3
              </div>
              <div>
                <h3 className="text-white mb-2">맞춤 추천</h3>
                <p className="text-gray-400">
                  당신을 위한 영화 리스트를 받고, 찜하고, 나만의 플레이리스트를
                  만드세요.
                </p>
              </div>
            </motion.div>
          </div>

          {/* 시작하기 CTA 버튼 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            viewport={{ once: true, margin: "-50px" }}
            className="mt-16"
          >
            <Button
              onClick={onNext}
              size="lg"
              className="pick-cta pick-cta-start bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-90 transition-all text-white border-none"
            >
              시작하기
            </Button>
            <p className="text-gray-500 text-sm mt-4">1분이면 완료됩니다</p>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
