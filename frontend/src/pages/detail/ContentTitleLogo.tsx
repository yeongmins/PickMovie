// frontend/src/pages/detail/ContentTitleLogo.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { apiGet } from "../../lib/apiClient";
import { getDisplayTitle } from "../../features/favorites/components/favoritesCarousel.shared";
import type { DetailBase, MediaType } from "./contentDetail.data";
import { tmdbDirect } from "./contentDetail.data";

type TmdbImageAsset = {
  file_path: string;
  iso_639_1: string | null;
  width: number;
  height: number;
  vote_average: number;
  vote_count: number;
};

type TmdbImagesResponse = {
  logos?: TmdbImageAsset[];
};

function titleLogoCdnUrl(filePath: string, size: "w500" | "w780" = "w780") {
  return `https://image.tmdb.org/t/p/${size}${filePath}`;
}

const _titleLogoCache = new Map<string, string | null>();
const _titleLogoInFlight = new Map<string, Promise<string | null>>();

function pickBestKoreanLogoFilePath(logos?: TmdbImageAsset[]) {
  if (!logos?.length) return null;
  const ko = logos.filter((l) => l.iso_639_1 === "ko");
  if (!ko.length) return null;

  ko.sort((a, b) => {
    const vc = (b.vote_count ?? 0) - (a.vote_count ?? 0);
    if (vc !== 0) return vc;
    return b.width * b.height - a.width * a.height;
  });

  return ko[0]?.file_path ?? null;
}

async function fetchImagesSafe(
  mediaType: MediaType,
  id: number
): Promise<TmdbImagesResponse | null> {
  // 1) backend
  try {
    return await apiGet<TmdbImagesResponse>(`/tmdb/images/${mediaType}/${id}`, {
      include_image_language: "ko",
    });
  } catch {
    // 2) direct
    return await tmdbDirect<TmdbImagesResponse>(`/${mediaType}/${id}/images`, {
      include_image_language: "ko",
    });
  }
}

async function fetchTitleLogoFilePath(
  mediaType: MediaType,
  id: number
): Promise<string | null> {
  const key = `${mediaType}:${id}`;
  if (_titleLogoCache.has(key)) return _titleLogoCache.get(key) ?? null;

  const inflight = _titleLogoInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const data = await fetchImagesSafe(mediaType, id);
      const fp = pickBestKoreanLogoFilePath(data?.logos);
      _titleLogoCache.set(key, fp);
      return fp;
    } catch {
      _titleLogoCache.set(key, null);
      return null;
    } finally {
      _titleLogoInFlight.delete(key);
    }
  })();

  _titleLogoInFlight.set(key, p);
  return p;
}

function useKoreanTitleLogo(mediaType: MediaType, id: number) {
  const key = `${mediaType}:${id}`;
  const [filePath, setFilePath] = useState<string | null>(() => {
    return _titleLogoCache.has(key) ? _titleLogoCache.get(key) ?? null : null;
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await fetchTitleLogoFilePath(mediaType, id);
      if (!alive) return;
      setFilePath(next);
    })();
    return () => {
      alive = false;
    };
  }, [key, mediaType, id]);

  return { filePath };
}

/* =========================
   ✅ 텍스트를 "무조건 한 줄 안에 전부 보이게"
   - 1) 가능한 큰 font-size를 이분탐색으로 찾고
   - 2) 그래도 넘치면 scaleX로 마지막 1px까지 맞춤
========================= */

function useFitSingleLineNoEllipsis(opts: {
  maxFontPx: number;
  minFontPx: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);

  const [fontPx, setFontPx] = useState(opts.maxFontPx);
  const [scaleX, setScaleX] = useState(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;

    const measure = () => {
      const wrapW = wrap.clientWidth;
      if (!wrapW) return;

      text.style.whiteSpace = "nowrap";
      text.style.display = "inline-block";

      // 탐색 중에는 scaleX=1로 폰트 폭만 비교
      text.style.transform = "scaleX(1)";

      let lo = opts.minFontPx;
      let hi = opts.maxFontPx;
      let best = opts.minFontPx;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        text.style.fontSize = `${mid}px`;
        const w = text.scrollWidth;

        if (w <= wrapW) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      text.style.fontSize = `${best}px`;

      const finalW = text.scrollWidth;
      const nextScale = finalW > wrapW && finalW > 0 ? wrapW / finalW : 1;

      setFontPx(best);
      setScaleX(nextScale);
    };

    measure();

    // ResizeObserver 지원 환경에서만
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      ro.observe(wrap);
    }

    // 폰트 로딩/레이아웃 타이밍 보정
    const t1 = window.setTimeout(measure, 0);
    const t2 = window.setTimeout(measure, 120);

    return () => {
      ro?.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [opts.maxFontPx, opts.minFontPx]);

  return { wrapRef, textRef, fontPx, scaleX };
}

// ✅ 훅을 쓰는 부분은 "별도 컴포넌트"로 분리(훅 규칙 위반 방지)
function FittedTitleText({
  title,
  maxWidth = 720,
}: {
  title: string;
  maxWidth?: number;
}) {
  const { wrapRef, textRef, fontPx, scaleX } = useFitSingleLineNoEllipsis({
    maxFontPx: 35,
    minFontPx: 14,
  });

  return (
    <h1 className="mb-3">
      <div ref={wrapRef} style={{ maxWidth }}>
        <span
          ref={textRef}
          title={title}
          style={{
            fontWeight: 900,
            letterSpacing: "-0.035em",
            lineHeight: 1.06,
            fontSize: `${fontPx}px`,
            color: "rgba(255,255,255,0.98)",
            display: "inline-block",
            whiteSpace: "nowrap",
            transform: `scaleX(${scaleX})`,
            transformOrigin: "left center",
            willChange: "transform",
          }}
        >
          {title}
        </span>
      </div>
    </h1>
  );
}

export function TitleLogoOrText({
  detail,
  mediaType,
}: {
  detail: DetailBase;
  mediaType: MediaType;
}) {
  const title = useMemo(() => getDisplayTitle(detail as any), [detail]);
  const logo = useKoreanTitleLogo(mediaType, detail.id);

  const hasLogo = !!logo.filePath;
  const [logoReady, setLogoReady] = useState(false);

  useEffect(() => {
    setLogoReady(false);
  }, [detail.id, logo.filePath]);

  if (hasLogo) {
    const src1x = titleLogoCdnUrl(logo.filePath!, "w500");
    const src2x = titleLogoCdnUrl(logo.filePath!, "w780");

    return (
      <h1 className="mb-3">
        <span className="sr-only">{title}</span>
        <motion.img
          key={`ko-logo:${mediaType}:${detail.id}:${logo.filePath}`}
          src={src1x}
          srcSet={`${src1x} 1x, ${src2x} 2x`}
          alt={title}
          loading="lazy"
          decoding="async"
          onLoad={() => setLogoReady(true)}
          onError={() => setLogoReady(false)}
          initial={false}
          animate={{
            opacity: logoReady ? 1 : 0,
            filter: logoReady ? "blur(0px)" : "blur(10px)",
          }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{
            display: "block",
            width: "auto",
            height: "auto",
            maxWidth: "100%",
            maxHeight: 118,
            objectFit: "contain",
            transform: "translateZ(0)",
            willChange: "opacity, filter",
            filter: logoReady
              ? "drop-shadow(0 10px 18px rgba(0,0,0,0.35))"
              : "drop-shadow(0 10px 18px rgba(0,0,0,0.22))",
          }}
        />
      </h1>
    );
  }

  // ✅ 로고 없을 때만 "훅 포함 컴포넌트"를 렌더 (훅 규칙 위반 없음)
  return <FittedTitleText title={title} />;
}
