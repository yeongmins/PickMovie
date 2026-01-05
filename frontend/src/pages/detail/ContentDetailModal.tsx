// frontend/src/pages/detail/ContentDetailModal.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";

import {
  computeTheatricalChip,
  detectExclusiveProvider,
  detectOriginalProvider,
  fetchAge,
  fetchDetailSafe,
  fetchProvidersKR,
  fetchTrailerKey,
  isAnime,
  normalizeMediaType,
  type DetailBase,
  type MediaType,
  type WatchProviderRegion,
  yearTextFrom,
} from "./contentDetail.data";

import { ContentDetailHero } from "./ContentDetailHero";
import { ContentDetailBody } from "./ContentDetailBody";

export default function ContentDetailModal() {
  const navigate = useNavigate();
  const params = useParams();

  const mediaType = normalizeMediaType(params.mediaType) as MediaType;
  const id = Number(params.id);

  const [detail, setDetail] = useState<DetailBase | null>(null);
  const [loading, setLoading] = useState(true);

  const [providersKR, setProvidersKR] = useState<WatchProviderRegion | null>(
    null
  );
  const [trailerKey, setTrailerKey] = useState<string | null>(null);

  // ✅ 연령 잔상 방지: 로딩 중엔 null
  const [ageValue, setAgeValue] = useState<string | null>(null);

  const [trailerOpen, setTrailerOpen] = useState(false);
  // ✅ 예고편 재생 버튼을 눌렀을 때 처음부터 소리가 나야 하므로 기본 false
  const [trailerMuted, setTrailerMuted] = useState(false);

  // body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onClose = useCallback(() => {
    setTrailerOpen(false);
    navigate(-1);
  }, [navigate]);

  // ✅ ESC: 예고편 열려있으면 예고편 먼저 닫기 -> (추가 ESC) 모달 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (trailerOpen) {
        setTrailerOpen(false);
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, trailerOpen]);

  useEffect(() => {
    let alive = true;

    // ✅ 컨텐츠 변경 시 상태 초기화(잔상 방지)
    setTrailerOpen(false);
    setTrailerMuted(false);
    setProvidersKR(null);
    setTrailerKey(null);
    setAgeValue(null);
    setDetail(null);

    if (!Number.isFinite(id) || id <= 0) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    setLoading(true);

    void (async () => {
      try {
        const data = await fetchDetailSafe(mediaType, id);
        if (!alive) return;

        if (!data) {
          setLoading(false);
          return;
        }

        setDetail(data);
        setLoading(false);

        const [p, t, a] = await Promise.all([
          fetchProvidersKR(mediaType, id),
          fetchTrailerKey(mediaType, id),
          fetchAge(mediaType, id, data?.adult),
        ]);

        if (!alive) return;

        setProvidersKR(p);
        setTrailerKey(t);
        setAgeValue(String(a)); // ✅ 여기서만 값 들어옴(0이면 진짜 ALL)
      } catch {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [mediaType, id]);

  const typeText = useMemo(() => {
    if (!detail) return mediaType === "tv" ? "TV" : "Movie";
    if (isAnime(detail.genres)) return "Ani";
    return mediaType === "tv" ? "TV" : "Movie";
  }, [detail, mediaType]);

  const yearText = useMemo(
    () => (detail ? yearTextFrom(detail, mediaType) : ""),
    [detail, mediaType]
  );

  // ✅ ORIGINAL: 제작/방영(네트워크/제작사) 단서 기반
  const providerOriginal = useMemo(() => {
    if (!detail) return null;
    return detectOriginalProvider(detail, providersKR);
  }, [detail, providersKR]);

  // ✅ ONLY(독점): 국내 스트리밍 제공처가 사실상 1개일 때 (ORIGINAL이면 숨김)
  const providerExclusive = useMemo(() => {
    if (!providersKR) return null;
    if (providerOriginal) return null;
    return detectExclusiveProvider(providersKR);
  }, [providersKR, providerOriginal]);

  const isOttLike = !!providerOriginal || !!providerExclusive;

  const theatricalChip = useMemo(() => {
    if (!detail) return null;
    return computeTheatricalChip(detail, mediaType, isOttLike);
  }, [detail, mediaType, isOttLike]);

  return (
    <div className="fixed inset-0 z-[999]">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={[
          "relative mx-auto",
          "w-[min(1120px,94vw)]",
          "h-[96svh] mt-[4svh] mb-0",
          "overflow-hidden",
          "bg-[#0b0b10]",
          "shadow-[0_30px_90px_rgba(0,0,0,0.65)]",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute right-4 top-4 z-40 w-10 h-10 rounded-full bg-black/35 hover:bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="h-full overflow-y-auto overscroll-contain">
          {detail ? (
            <ContentDetailHero
              detail={detail}
              mediaType={mediaType}
              providerOriginal={providerOriginal}
              providerExclusive={providerExclusive}
              theatricalChip={theatricalChip}
              typeText={typeText}
              yearText={yearText}
              ageValue={ageValue}
              trailerKey={trailerKey}
              trailerOpen={trailerOpen}
              trailerMuted={trailerMuted}
              setTrailerOpen={setTrailerOpen}
              setTrailerMuted={setTrailerMuted}
            />
          ) : (
            <div
              className="relative w-full overflow-hidden"
              style={{ height: "clamp(420px, 62vh, 680px)" }}
            >
              <div className="absolute inset-0 bg-black" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b10] via-black/15 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent via-[#0b0b10]/70 to-[#0b0b10]" />
            </div>
          )}

          <ContentDetailBody
            loading={loading}
            detail={detail}
            mediaType={mediaType}
            providersKR={providersKR}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .fixed.inset-0.z-[999] > div.relative.mx-auto {
            width: 100vw !important;
            height: 100svh !important;
            margin-top: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
