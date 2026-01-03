import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { apiGet } from "../../../lib/apiClient";

type MediaType = "movie" | "tv";

type TmdbVideo = {
  key: string;
  site: string;
  type: string;
  name?: string;
  official?: boolean;
};

type TmdbVideosResponse = {
  results?: TmdbVideo[];
};

const TRAILER_OPEN_EVENT = "pickmovie-trailer-open";
const TRAILER_CLOSE_EVENT = "pickmovie-trailer-close";

function pickBestTrailer(videos: TmdbVideo[] | undefined): TmdbVideo | null {
  const yt = (videos ?? []).filter((v) => v?.site === "YouTube" && !!v?.key);

  const prefer = (arr: TmdbVideo[]) => {
    const official = arr.find((v) => v.official);
    return official ?? arr[0] ?? null;
  };

  const trailers = yt.filter((v) => v.type === "Trailer");
  const teasers = yt.filter((v) => v.type === "Teaser");

  return prefer(trailers) || prefer(teasers) || prefer(yt) || null;
}

async function fetchBestTrailerKey(
  mediaType: MediaType,
  id: number
): Promise<{ key: string; name?: string } | null> {
  const tries: Array<{ language?: string }> = [
    { language: "ko-KR" },
    { language: "en-US" },
    {},
  ];

  for (const t of tries) {
    try {
      const data = await apiGet<TmdbVideosResponse>(
        `/tmdb/videos/${mediaType}/${id}`,
        t.language ? { language: t.language } : {}
      );
      const best = pickBestTrailer(data?.results ?? []);
      if (best?.key) return { key: best.key, name: best.name };
    } catch {
      // next
    }
  }
  return null;
}

export function TrailerOverlay({
  open,
  target,
  onClose,
  topInset = 60, // 호환용(현재 UI에서는 사용 안 함)
}: {
  open: boolean;
  target: { id: number; mediaType: MediaType; title?: string } | null;
  onClose: () => void;
  topInset?: number;
}) {
  void topInset;

  const [loading, setLoading] = useState(false);
  const [trailer, setTrailer] = useState<{ key: string; name?: string } | null>(
    null
  );

  const targetKey = useMemo(() => {
    if (!target) return "";
    return `${target.mediaType}:${target.id}`;
  }, [target]);

  const lastKeyRef = useRef<string>("");

  // ✅ 오버레이 open/close 이벤트 (캐러셀 자동/수동 넘김 pause용)
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent(TRAILER_OPEN_EVENT));
    return () => {
      window.dispatchEvent(new CustomEvent(TRAILER_CLOSE_EVENT));
    };
  }, [open]);

  // ✅ 스크롤/키 입력 차단 + ESC 닫기
  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const html = document.documentElement;

    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - html.clientWidth;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    const blockWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const blockTouch = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const blockKeys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // 캐러셀/페이지 이동에 쓰일 수 있는 키들 차단
      const blocked = [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
      ];
      if (blocked.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("wheel", blockWheel, { passive: false });
    window.addEventListener("touchmove", blockTouch, { passive: false });
    window.addEventListener("keydown", blockKeys, true);

    return () => {
      window.removeEventListener("wheel", blockWheel as any);
      window.removeEventListener("touchmove", blockTouch as any);
      window.removeEventListener("keydown", blockKeys, true);

      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [open, onClose]);

  // ✅ 예고편 키 fetch
  useEffect(() => {
    if (!open || !target) return;

    if (lastKeyRef.current === targetKey && trailer?.key) return;

    let alive = true;
    setLoading(true);
    setTrailer(null);

    (async () => {
      const t = await fetchBestTrailerKey(target.mediaType, target.id);
      if (!alive) return;
      lastKeyRef.current = targetKey;
      setTrailer(t);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetKey]);

  const overlayNode = (
    <AnimatePresence>
      {open && target && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {/* ✅ 배경(영상 밖) 클릭 시 닫기 */}
          <div
            className="absolute inset-0 bg-black/80"
            onMouseDown={onClose}
            aria-hidden="true"
          />

          {/* ✅ 닫기(X): 배경 우측 상단(닉네임 위치) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="예고편 닫기"
            className="absolute right-4 top-4 z-[2] h-10 w-10 rounded-full bg-black/55 border border-white/10 flex items-center justify-center text-white/85 hover:text-white hover:bg-black/70 transition"
          >
            <X className="h-5 w-5" />
          </button>

          {/* ✅ 중앙 모달(영상만 깔끔하게) */}
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative z-[1] w-[92vw] sm:w-[78vw] lg:w-[60vw] xl:w-[52vw] max-w-[1100px]"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="relative overflow-hidden rounded-2xl bg-black shadow-[0_20px_80px_rgba(0,0,0,0.7)] border border-white/10">
              <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
                {loading ? (
                  <div className="h-full w-full flex items-center justify-center text-white/70">
                    예고편을 불러오는 중…
                  </div>
                ) : trailer?.key ? (
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                    title={trailer?.name ?? target.title ?? "Trailer"}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center text-white/75">
                    <div className="text-base font-semibold">
                      예고편을 찾지 못했어요
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      다른 언어로도 검색했지만 결과가 없어요.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== "undefined") {
    return createPortal(overlayNode, document.body);
  }
  return overlayNode;
}
