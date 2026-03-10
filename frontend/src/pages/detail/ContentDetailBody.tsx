// frontend/src/pages/detail/ContentDetailBody.tsx
import type { DetailBase, MediaType } from "./contentDetail.data";
import DetailSections from "../../components/detail/DetailSections";

type ReleaseStatusKind = "now" | "upcoming" | "rerun" | null;

export function ContentDetailBody({
  detail,
  mediaType,
  loading,
  isAuthed,
  statusKindOverride,
}: {
  detail: DetailBase | null;
  mediaType: MediaType;
  loading?: boolean;
  isAuthed?: boolean;
  statusKindOverride?: ReleaseStatusKind | null;
}) {
  // ✅ 중복 제거:
  // - meta fetch/캐시/보정은 DetailSections 단일 책임
  // - 시즌 선택 시 출시년도 동기화도 DetailSections가 location 기반으로 처리
  return (
    <DetailSections
      detail={detail}
      mediaType={mediaType}
      loading={loading}
      isAuthed={isAuthed}
      statusKindOverride={statusKindOverride ?? null}
    />
  );
}
