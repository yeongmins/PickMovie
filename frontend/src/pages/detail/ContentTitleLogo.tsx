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

type LogoChoice = {
  filePath: string | null;
  invert: boolean; // ✅ (가능하면) 흰색 로고 우선, 검정만 있으면 invert로 흰색화
};

const _titleLogoCache = new Map<string, LogoChoice>();
const _titleLogoInFlight = new Map<string, Promise<LogoChoice>>();

function pickKoreanCandidates(logos?: TmdbImageAsset[]) {
  const list = Array.isArray(logos) ? logos : [];
  const ko = list.filter((l) => l.iso_639_1 === "ko");
  if (!ko.length) return [];

  ko.sort((a, b) => {
    const vc = (b.vote_count ?? 0) - (a.vote_count ?? 0);
    if (vc !== 0) return vc;
    return b.width * b.height - a.width * a.height;
  });

  return ko.slice(0, 6);
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

/**
 * ✅ 로고 밝기 측정(가능할 때만):
 * - CORS가 막히면 실패할 수 있음 → 그 경우엔 안전한 fallback 사용
 */
async function measureLogoBrightness(filePath: string): Promise<number | null> {
  try {
    const src = titleLogoCdnUrl(filePath, "w500");
    const res = await fetch(src);
    const blob = await res.blob();

    // Canvas 샘플링(투명 제외)
    const bmp =
      "createImageBitmap" in window ? await createImageBitmap(blob) : null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const w = bmp ? bmp.width : 0;
    const h = bmp ? bmp.height : 0;
    if (!w || !h) return null;

    canvas.width = Math.min(w, 320);
    canvas.height = Math.max(1, Math.round((canvas.width * h) / w));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp!, 0, 0, canvas.width, canvas.height);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let sum = 0;
    let cnt = 0;

    // 빠르게 샘플링(격자)
    const step = 8;
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const i = (y * canvas.width + x) * 4;
        const a = img[i + 3];
        if (a < 20) continue;

        const r = img[i];
        const g = img[i + 1];
        const b = img[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        sum += lum;
        cnt += 1;
      }
    }

    if (!cnt) return null;
    return sum / cnt; // 0..255
  } catch {
    return null;
  }
}

async function pickBestKoreanLogoChoice(
  mediaType: MediaType,
  id: number
): Promise<LogoChoice> {
  const data = await fetchImagesSafe(mediaType, id);
  const candidates = pickKoreanCandidates(data?.logos);

  if (!candidates.length) {
    return { filePath: null, invert: false };
  }

  // ✅ “흰색 로고 우선”
  // - 후보 중 가장 밝은 로고 선택
  // - 측정 실패하면 1등 후보로 fallback
  const top = candidates.slice(0, 4);
  const brightnessList = await Promise.all(
    top.map(async (c) => {
      const b = await measureLogoBrightness(c.file_path);
      return { filePath: c.file_path, b };
    })
  );

  const measurable = brightnessList.filter(
    (x) => typeof x.b === "number"
  ) as Array<{
    filePath: string;
    b: number;
  }>;

  if (measurable.length) {
    measurable.sort((a, b) => b.b - a.b);
    const best = measurable[0];

    // 밝기가 너무 낮으면(검정 로고 가능성) invert로 흰색화
    const invert = best.b < 80;
    return { filePath: best.filePath, invert };
  }

  // fallback: 첫 후보
  return { filePath: candidates[0].file_path, invert: true };
}

async function fetchTitleLogoChoice(
  mediaType: MediaType,
  id: number
): Promise<LogoChoice> {
  const key = `${mediaType}:${id}`;
  if (_titleLogoCache.has(key)) return _titleLogoCache.get(key)!;

  const inflight = _titleLogoInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const choice = await pickBestKoreanLogoChoice(mediaType, id);
      _titleLogoCache.set(key, choice);
      return choice;
    } catch {
      const choice: LogoChoice = { filePath: null, invert: false };
      _titleLogoCache.set(key, choice);
      return choice;
    } finally {
      _titleLogoInFlight.delete(key);
    }
  })();

  _titleLogoInFlight.set(key, p);
  return p;
}

function useKoreanTitleLogoChoice(mediaType: MediaType, id: number) {
  const key = `${mediaType}:${id}`;

  const [choice, setChoice] = useState<LogoChoice>(() => {
    return _titleLogoCache.get(key) ?? { filePath: null, invert: false };
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await fetchTitleLogoChoice(mediaType, id);
      if (!alive) return;
      setChoice(next);
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  return choice;
}

/* =========================
   ✅ 텍스트를 "무조건 한 줄 안에 전부 보이게"
========================= */

function useFitSingleLineNoEllipsis(opts: {
  maxFontPx: number;
  minFontPx: number;
  depsKey?: string;
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

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      ro.observe(wrap);
    }

    const t1 = window.setTimeout(measure, 0);
    const t2 = window.setTimeout(measure, 120);

    return () => {
      ro?.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [opts.maxFontPx, opts.minFontPx, opts.depsKey]);

  return { wrapRef, textRef, fontPx, scaleX };
}

function SeasonBadge({ seasonNo }: { seasonNo: number }) {
  if (!seasonNo || seasonNo <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[5px] shadow-sm bg-black backdrop-blur-md shrink-0"
      title={`시즌 ${seasonNo}`}
    >
      <span className="text-[11px] font-bold tracking-wide text-white">
        SEASON
      </span>
      <span className="text-[11px] font-extrabold tracking-wide text-white">
        {seasonNo}
      </span>
    </span>
  );
}

function FittedTitleText({
  title,
  seasonNo = 0,
}: {
  title: string;
  seasonNo?: number;
}) {
  const { wrapRef, textRef, fontPx, scaleX } = useFitSingleLineNoEllipsis({
    maxFontPx: 35,
    minFontPx: 14,
    depsKey: title, // ✅ 시즌 이동으로 title이 바뀌어도 재측정
  });

  return (
    <h1 className="mb-3 flex items-end gap-2 max-w-full">
      <div
        ref={wrapRef}
        className="min-w-0 w-fit shrink"
        style={{ maxWidth: "calc(100% - 96px)" }}
      >
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

      <SeasonBadge seasonNo={seasonNo} />
    </h1>
  );
}

export function TitleLogoOrText({
  detail,
  mediaType,
  seasonNo = 0,
}: {
  detail: DetailBase;
  mediaType: MediaType;
  seasonNo?: number;
}) {
  const title = useMemo(() => getDisplayTitle(detail as any), [detail]);
  const choice = useKoreanTitleLogoChoice(mediaType, detail.id);

  const hasLogo = !!choice.filePath;

  // ✅ 로고 로딩 실패 시(404/네트워크 등) 텍스트로 안전하게 fallback
  const [logoReady, setLogoReady] = useState(false);
  const [forceText, setForceText] = useState(false);

  useEffect(() => {
    setLogoReady(false);
    setForceText(false);
  }, [detail.id, choice.filePath, choice.invert]);

  if (hasLogo && !forceText) {
    const src1x = titleLogoCdnUrl(choice.filePath!, "w500");
    const src2x = titleLogoCdnUrl(choice.filePath!, "w780");

    const visibleFilter = `${
      choice.invert ? "invert(1) " : ""
    }drop-shadow(0 10px 18px rgba(0,0,0,0.35))`;

    const hiddenFilter = `${
      choice.invert ? "invert(1) " : ""
    }blur(10px) drop-shadow(0 10px 18px rgba(0,0,0,0.22))`;

    return (
      <h1 className="mb-3 flex items-end gap-2 max-w-full">
        <span className="sr-only">{title}</span>

        <div
          className="min-w-0 w-fit shrink"
          style={{ maxWidth: "calc(100% - 96px)" }}
        >
          <motion.img
            key={`ko-logo:${mediaType}:${detail.id}:${choice.filePath}:${
              choice.invert ? "inv" : "nor"
            }`}
            src={src1x}
            srcSet={`${src1x} 1x, ${src2x} 2x`}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setLogoReady(true)}
            onError={() => {
              setLogoReady(false);
              setForceText(true); // ✅ 로고가 안 뜨면 빈칸 방지
            }}
            initial={false}
            animate={{
              opacity: logoReady ? 1 : 0,
              filter: logoReady ? visibleFilter : hiddenFilter,
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
            }}
          />
        </div>

        <SeasonBadge seasonNo={seasonNo} />
      </h1>
    );
  }

  return <FittedTitleText title={title} seasonNo={seasonNo} />;
}
