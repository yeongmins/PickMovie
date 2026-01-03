// frontend/src/pages/support/Legal.tsx
import { Link, useParams, Navigate } from "react-router-dom";
import { useMemo } from "react";

type LegalSection = "terms" | "privacy" | "copyright";

const TABS: Array<{ key: LegalSection; label: string; to: string }> = [
  { key: "terms", label: "이용약관", to: "/legal/terms" },
  { key: "privacy", label: "개인정보 처리방침", to: "/legal/privacy" },
  { key: "copyright", label: "저작권/출처", to: "/legal/copyright" },
];

export function Legal() {
  const params = useParams();
  const section = (params.section as LegalSection | undefined) ?? "terms";

  const active = useMemo(() => {
    return (TABS.find((t) => t.key === section)?.key ?? "terms") as LegalSection;
  }, [section]);

  // 잘못된 섹션이면 기본으로 이동
  if (!TABS.some((t) => t.key === section)) {
    return <Navigate to="/legal/terms" replace />;
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* 탭 네비 (라프텔 느낌) */}
      <div className="border-b border-neutral-200">
        <div className="mx-auto w-full max-w-[1100px] px-6">
          <div className="py-4 flex items-center gap-6 text-sm font-medium text-neutral-500">
            {TABS.map((t) => {
              const isActive = t.key === active;
              return (
                <Link
                  key={t.key}
                  to={t.to}
                  className={[
                    "relative py-3 transition",
                    isActive ? "text-purple-600" : "hover:text-neutral-900",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t.label}
                  {isActive && (
                    <span className="absolute left-0 right-0 -bottom-[1px] h-[3px] bg-purple-600 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1100px] px-6 py-14">
        {active === "terms" && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">이용약관</h1>
            <div className="mt-6 space-y-6 text-neutral-800 leading-relaxed">
              <section>
                <h2 className="text-lg font-bold">1. 목적</h2>
                <p className="mt-2">
                  본 약관은 PickMovie 서비스 이용과 관련한 기본 사항을 규정합니다.
                </p>
              </section>
              <section>
                <h2 className="text-lg font-bold">2. 서비스 제공</h2>
                <p className="mt-2">
                  PickMovie는 콘텐츠 추천/검색 보조 기능을 제공하며, 외부 API 데이터(TMDB 등)를 활용할 수 있습니다.
                </p>
              </section>
              <section>
                <h2 className="text-lg font-bold">3. 책임의 제한</h2>
                <p className="mt-2">
                  외부 데이터 제공자의 정책/장애로 인해 정보가 일부 달라질 수 있으며, 서비스는 개인 프로젝트로 제공됩니다.
                </p>
              </section>
            </div>
          </>
        )}

        {active === "privacy" && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">
              개인정보 처리방침
            </h1>
            <div className="mt-6 space-y-6 text-neutral-800 leading-relaxed">
              <section>
                <h2 className="text-lg font-bold">1. 수집 항목</h2>
                <p className="mt-2">
                  계정 기능 사용 시 이메일/닉네임 등의 정보가 저장될 수 있습니다.
                </p>
              </section>
              <section>
                <h2 className="text-lg font-bold">2. 이용 목적</h2>
                <p className="mt-2">
                  로그인/비밀번호 재설정, 추천 품질 개선, 공지 전달 등 서비스 제공 목적에 한합니다.
                </p>
              </section>
              <section>
                <h2 className="text-lg font-bold">3. 보관 및 파기</h2>
                <p className="mt-2">
                  서비스 운영에 필요한 범위 내에서 보관되며, 요청 시 삭제할 수 있습니다.
                </p>
              </section>
            </div>
          </>
        )}

        {active === "copyright" && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">저작권/출처</h1>
            <div className="mt-6 space-y-6 text-neutral-800 leading-relaxed">
              <section>
                <h2 className="text-lg font-bold">데이터 / API</h2>
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  <li>TMDB API (영화/TV 메타데이터, 포스터, 평점, 장르)</li>
                  <li>KOBIS API (박스오피스/영화 정보)</li>
                  <li>Naver API (트렌드/검색 데이터)</li>
                  <li>YouTube Data API (예고편/영상 데이터)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold">TMDB 고지</h2>
                <p className="mt-2 text-neutral-700">
                  This product uses the TMDB API but is not endorsed or certified by TMDB.
                </p>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
