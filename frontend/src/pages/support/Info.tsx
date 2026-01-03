// frontend/src/pages/support/Info.tsx
export function Info() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-[1100px] px-6 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">프로젝트 소개</h1>
        <p className="mt-4 text-neutral-700 leading-relaxed">
          PickMovie는 취향 기반 추천 + Picky AI 검색으로 지금 보고 싶은 콘텐츠를
          빠르게 찾도록 돕는 개인 프로젝트입니다.
        </p>

        <div className="mt-10 space-y-4 text-neutral-700 leading-relaxed">
          <p>
            • 추천: 찜/플레이리스트와 선호 장르를 기반으로 추천을 구성합니다.
          </p>
          <p>
            • 검색(Picky): 자연어로 “요즘 볼 만한 감성 영화” 같은 요청을 빠르게
            찾을 수 있도록 보조합니다.
          </p>
          <p>• 데이터: TMDB / KOBIS / Naver / YouTube 등을 활용합니다.</p>
        </div>
      </div>
    </div>
  );
}
