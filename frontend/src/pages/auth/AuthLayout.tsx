import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/icons/Logo";

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  belowCard?: React.ReactNode; // ✅ 카드(박스) 밖 영역
};

export function AuthLayout({
  title,
  subtitle,
  children,
  belowCard,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full px-8 py-12 flex items-center justify-center">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[#0b0b12]">
        {/* 메인 그라데이션: 어둡고 은은하게 */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-800/20 via-[#0b0b12]/70 to-pink-800/16" />

        {/* 상단 라이트 번짐(너무 밝지 않게) */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),transparent_62%)]" />

        {/* 컬러 번짐(은은한 분위기) */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(168,85,247,0.10),transparent_52%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,rgba(236,72,153,0.08),transparent_52%)]" />

        {/* 비네팅(영화관 느낌: 가장자리 어둡게) */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0),rgba(0,0,0,0.72))]" />
      </div>

      <div className="w-full max-w-[520px]">
        {/* 로고 */}
        <div className="mb-8 flex justify-center">
          <Link to="/" aria-label="PickMovie 홈" className="select-none">
            <Logo showIcon={false} size="lg" />
          </Link>
        </div>

        {/* 카드 */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
          <div className="p-7">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            {subtitle ? (
              <p className="mt-2 text-sm text-white/60">{subtitle}</p>
            ) : null}

            <div className="mt-6">{children}</div>
          </div>
        </div>

        {/* ✅ 네이버처럼 “박스 밖” 링크/문구 영역 */}
        {belowCard ? <div className="mt-6 text-center">{belowCard}</div> : null}

        <p className="mt-10 text-center text-xs text-white/30">
          © 2025 PickMovie. All rights reserved.
        </p>
      </div>
    </div>
  );
}
