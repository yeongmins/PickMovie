// frontend/src/pages/support/Notices.tsx
export function Notices() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-[1100px] px-6 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">공지사항</h1>

        <div className="mt-8 space-y-4">
          <div className="rounded-xl border border-neutral-200 p-5">
            <div className="text-sm text-neutral-500">2026-01-04</div>
            <div className="mt-1 font-semibold">Footer / 문서 페이지 업데이트</div>
            <div className="mt-2 text-neutral-700">
              하단 링크 및 약관/정책/출처 페이지 구조가 추가되었습니다.
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-5">
            <div className="text-sm text-neutral-500">2026-01-01</div>
            <div className="mt-1 font-semibold">추천 캐러셀 안정화</div>
            <div className="mt-2 text-neutral-700">
              새로고침 전까지 “당신을 위한 추천” 데이터가 유지되도록 개선했습니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
