// frontend/src/pages/detail/ContentDetailBody.tsx
import { useMemo } from "react";
import type {
  DetailBase,
  MediaType,
  ProviderItem,
  WatchProviderRegion,
} from "./contentDetail.data";
import { DetailSections } from "../../components/detail/DetailSections";

function mergeProvidersToFlatrateOnly(
  providersKR: WatchProviderRegion | null
): WatchProviderRegion | null {
  if (!providersKR) return null;

  const all: ProviderItem[] = [
    ...(providersKR.flatrate ?? []),
    ...(providersKR.free ?? []),
    ...(providersKR.ads ?? []),
    ...(providersKR.rent ?? []),
    ...(providersKR.buy ?? []),
  ];

  const seen = new Set<number>();
  const uniq: ProviderItem[] = [];
  for (const p of all) {
    if (!p) continue;
    if (typeof p.provider_id !== "number") continue;
    if (seen.has(p.provider_id)) continue;
    seen.add(p.provider_id);
    uniq.push(p);
  }

  // ✅ DetailSections가 flatrate만 사용해도 더 많은 OTT가 보이도록
  // (중복/표시 혼선 방지를 위해 나머지는 비움)
  return {
    link: providersKR.link,
    flatrate: uniq.length ? uniq : providersKR.flatrate ?? [],
  };
}

export function ContentDetailBody({
  loading,
  detail,
  mediaType,
  providersKR,
}: {
  loading: boolean;
  detail: DetailBase | null;
  mediaType: MediaType;
  providersKR: WatchProviderRegion | null;
}) {
  const providersForDisplay = useMemo(
    () => mergeProvidersToFlatrateOnly(providersKR),
    [providersKR]
  );

  return (
    <div className="relative -mt-16 pt-16 px-4 sm:px-8 pb-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-transparent to-[#0b0b10]" />

      {loading ? (
        <div className="py-10 text-white/70">불러오는 중...</div>
      ) : detail ? (
        <DetailSections
          detail={detail}
          mediaType={mediaType}
          providersKR={providersForDisplay}
        />
      ) : (
        <div className="py-10 text-white/70">
          상세 정보를 불러오지 못했습니다.
        </div>
      )}
    </div>
  );
}
