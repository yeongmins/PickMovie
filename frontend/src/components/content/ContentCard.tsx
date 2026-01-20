// frontend/src/components/content/ContentCard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Star, X } from "lucide-react";
import { getPosterUrl } from "../../lib/tmdb";

import type { ContentCardProps } from "./contentCard.types";
import {
  getDisplayTitle,
  inferMediaType,
  isKoreanTitle,
  isLoggedInFallback,
} from "./contentCard.utils";
import { AgeBadge, Chip, ProviderBadges } from "./contentCard.ui";
import {
  peekResolvedMeta,
  requestResolvedMeta,
  type ResolvedMeta,
  type StatusKind,
} from "../../lib/metaClient";

export type {
  MediaType,
  ProviderBadge,
  ContentCardItem,
  ContentCardProps,
} from "./contentCard.types";

/**
 * ✅ 속도 최적화:
 * - 카드가 "보이기 전" meta 호출 X
 * - 화면 진입 시 meta lazy 로드
 */
function useInViewOnce<T extends Element>(opts?: {
  rootMargin?: string;
  threshold?: number;
}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) return;

    const io = new IntersectionObserver(
      (entries) => {
        const v = entries.some((e) => e.isIntersecting);
        if (v) {
          setInView(true);
          io.disconnect();
        }
      },
      {
        root: null,
        rootMargin: opts?.rootMargin ?? "250px",
        threshold: opts?.threshold ?? 0.01,
      },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [inView, opts?.rootMargin, opts?.threshold]);

  return { ref, inView };
}

/**
 * ✅ type 표시도 meta 단일 소스
 * - meta 없으면 “표시 안 함(—)”
 */
function typeTextFromMeta(meta: ResolvedMeta | null) {
  const ck = String(meta?.contentKind ?? "").toUpperCase();
  if (ck === "ANI") return "Ani";
  if (ck === "TV") return "TV";
  if (ck === "MOVIE") return "Movie";
  return "—";
}

function isPreferItemPoster(item: any): boolean {
  return (
    item?.__preferItemPoster === true || typeof item?.__seasonNo === "number"
  );
}
function isPreferItemYear(item: any): boolean {
  return (
    item?.__preferItemYear === true || typeof item?.__seasonNo === "number"
  );
}
function yearFromDateStr(v?: string | null): string {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})/);
  return m ? m[1] : "";
}

export function ContentCard({
  item,
  isFavorite,
  onClick,
  onToggleFavorite,
  onRemove,
  context = "default",
  onPosterError,
  className,
  canFavorite,
}: ContentCardProps) {
  if (!isKoreanTitle(item)) return null;

  const { ref: cardRef, inView } = useInViewOnce<HTMLDivElement>({
    rootMargin: "300px",
    threshold: 0.01,
  });

  const title = getDisplayTitle(item);
  const rating =
    typeof item.vote_average === "number" ? item.vote_average.toFixed(1) : "—";

  // ✅ meta 요청을 위해 필요한 최소값(요청 키)
  const mediaType = inferMediaType(item);

  // ✅ 백엔드 Meta 단일 소스(캐시 우선)
  const [meta, setMeta] = useState<ResolvedMeta | null>(() =>
    peekResolvedMeta(mediaType as any, item.id),
  );

  // ✅ meta는 보이면 요청(캐시 없을 때만)
  useEffect(() => {
    let mounted = true;
    if (!inView) return;

    const cached = peekResolvedMeta(mediaType as any, item.id);
    if (cached) {
      setMeta(cached);
      return;
    }

    requestResolvedMeta(mediaType as any, item.id)
      .then((r) => {
        if (!mounted) return;
        setMeta(r ?? null);
      })
      .catch(() => {
        if (!mounted) return;
        setMeta((prev) => prev ?? null);
      });

    return () => void (mounted = false);
  }, [inView, mediaType, item.id]);

  // =========================
  // ✅ “표시값” (원칙: meta only)
  // 단, 시즌 카드(__preferItemPoster/__preferItemYear)는
  // poster/year만 item 우선 적용
  // =========================

  const preferPoster = isPreferItemPoster(item);
  const preferYear = isPreferItemYear(item);

  const typeText = useMemo(() => typeTextFromMeta(meta), [meta]);

  const providers = meta?.providers ?? [];

  const ageValue = useMemo(() => {
    const a = String(meta?.ageRating ?? "").trim();
    return a ? a : "—";
  }, [meta?.ageRating]);

  const statusKind: StatusKind = (meta?.statusKind ?? null) as any;

  const statusLabel =
    statusKind === "now"
      ? "상영중"
      : statusKind === "upcoming"
        ? "상영예정"
        : statusKind === "rerun"
          ? "재개봉"
          : null;

  const yearLabel = useMemo(() => {
    if (preferYear) {
      const y =
        yearFromDateStr((item as any)?.first_air_date ?? null) ||
        yearFromDateStr((item as any)?.release_date ?? null) ||
        yearFromDateStr((item as any)?.air_date ?? null) ||
        yearFromDateStr((item as any)?.last_air_date ?? null);
      return y ? y : "—";
    }

    const y = String(meta?.unifiedYearLabel ?? "").trim();
    return y ? y : "—";
  }, [preferYear, item, meta?.unifiedYearLabel]);

  // ✅ 카드 포스터:
  // - 기본: 백엔드 meta.contentCardPosterPath만 사용
  // - 시즌 카드: item.poster_path 우선 (meta로 덮어쓰기 금지)
  const effectivePosterPath = preferPoster
    ? ((item as any)?.poster_path ?? null)
    : (meta?.contentCardPosterPath ?? null);

  const posterUrl = effectivePosterPath
    ? getPosterUrl(effectivePosterPath, "w500")
    : "";

  const providerLogos = providers
    .map((p: any) => {
      const name = p.provider_name ?? p.providerName ?? p.name ?? "";
      const lp = p.logo_path ?? p.logoPath ?? p.logo ?? null;
      return { name, path: lp };
    })
    .filter((x: any) => !!x.name && !!x.path)
    .map((x: any) => ({ name: x.name, path: x.path as string }));

  const providerNamesOnly = providers
    .map((p: any) => p.provider_name ?? p.providerName ?? p.name ?? "")
    .map((s: any) => String(s).trim())
    .filter(Boolean);

  const hasProviders = providerLogos.length > 0 || providerNamesOnly.length > 0;
  const hasAge = ageValue !== "—";

  const canFav =
    typeof canFavorite === "boolean" ? canFavorite : isLoggedInFallback();

  const showTrend =
    typeof (item as any).trendRank === "number" &&
    Number.isFinite((item as any).trendRank);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={`group cursor-pointer select-none ${className ?? ""} w-[200px]`}
      aria-label={`${title} 상세 보기`}
    >
      <div className="relative w-[200px] h-[300px] overflow-hidden rounded-[5px] bg-white/5 shadow-lg">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="h-full w-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={onPosterError}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white/40 text-sm">
            No Image
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/15" />

        <div className="absolute top-2 left-2 z-20 flex flex-col items-start">
          {onRemove && (
            <button
              type="button"
              aria-label="플레이리스트에서 제거"
              className="w-[22px] h-[22px] rounded-[4px] bg-black/55 hover:bg-black/70 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-4 w-4 text-white" />
            </button>
          )}

          <div className="self-start">
            <Chip tone="dark">{typeText}</Chip>
          </div>

          {showTrend && (
            <div
              className="self-start"
              title={`트렌드 점수 ${(item as any).trendScore ?? "-"}`}
            >
              <Chip tone="purple">
                {(item as any).trendRank === 1
                  ? "🥇"
                  : (item as any).trendRank === 2
                    ? "🥈"
                    : (item as any).trendRank === 3
                      ? "🥉"
                      : "🔥"}{" "}
                #{(item as any).trendRank}
              </Chip>
            </div>
          )}

          {statusLabel ? (
            <div className="self-start">
              <Chip tone="dark">{statusLabel}</Chip>
            </div>
          ) : null}
        </div>

        {canFav && (
          <div className="absolute top-2 right-2 z-20">
            <button
              type="button"
              aria-label="찜 토글"
              className="w-[30px] h-[30px] rounded-[5px] bg-black/55 hover:bg-black/70 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
            >
              <Heart
                className={`h-4 w-4 ${
                  isFavorite ? "fill-red-500 text-red-500" : "text-white"
                }`}
              />
            </button>
          </div>
        )}

        {(hasProviders || hasAge) && (
          <div className="absolute bottom-2 right-2 z-20 flex flex-col items-end gap-1">
            {hasAge && <AgeBadge value={ageValue} />}
            {hasProviders && (
              <ProviderBadges
                providerLogos={providerLogos}
                providerNames={providerNamesOnly}
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-3 px-1 w-[200px]">
        <div className="text-sm font-semibold text-white line-clamp-1">
          {title}
        </div>

        {(item as any).recommendReason && (
          <div className="mt-1 text-[11px] text-white/55 line-clamp-1">
            {(item as any).recommendReason}
          </div>
        )}

        <div className="mt-1 text-xs text-white/70 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            {rating}
          </span>
          <span className="text-white/50">{yearLabel}</span>
        </div>
      </div>
    </div>
  );
}
