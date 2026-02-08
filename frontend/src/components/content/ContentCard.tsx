// frontend/src/components/content/ContentCard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Star, X } from "lucide-react";
import { getPosterUrl } from "../../lib/tmdb";

import type { ContentCardProps } from "./contentCard.types";
import {
  getDisplayTitle,
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

/**
 * ✅ 프론트 추론 금지:
 * - media_type이 명확할 때만 meta 요청
 */
function mediaTypeFromItemStrict(item: any): "movie" | "tv" | null {
  const mt = String(item?.media_type ?? "").toLowerCase();
  if (mt === "movie" || mt === "tv") return mt;
  return null;
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
  showRecommendReason = false,
}: ContentCardProps) {
  const { ref: cardRef, inView } = useInViewOnce<HTMLDivElement>({
    rootMargin: "300px",
    threshold: 0.01,
  });

  const title = getDisplayTitle(item);
  const rating =
    typeof item.vote_average === "number" ? item.vote_average.toFixed(1) : "—";

  const mediaType = useMemo(() => mediaTypeFromItemStrict(item), [item]);

  const [meta, setMeta] = useState<ResolvedMeta | null>(() => {
    if (!mediaType) return null;
    return peekResolvedMeta(mediaType as any, item.id) ?? null;
  });

  useEffect(() => {
    let mounted = true;
    if (!inView) return;
    if (!mediaType) return;

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

  // ✅ 시즌카드: __yearLabel이 있으면 그걸 우선 표시
  const yearLabel = useMemo(() => {
    const override = String((item as any).__yearLabel ?? "").trim();
    if (override) return override;

    const y = String(meta?.unifiedYearLabel ?? "").trim();
    return y ? y : "—";
  }, [item, meta?.unifiedYearLabel]);

  // ✅ 카드 포스터:
  // - 일반: meta.contentCardPosterPath 우선
  // - 시즌카드: __forceItemPoster=true면 item.poster_path 고정
  const effectivePosterPath = useMemo(() => {
    const forceItemPoster = !!(item as any).__forceItemPoster;

    const itemPoster = (item as any)?.poster_path ?? null;
    const metaPoster = (meta as any)?.contentCardPosterPath ?? null;

    if (forceItemPoster) return itemPoster ?? null;
    return (metaPoster ?? itemPoster ?? null) as string | null;
  }, [item, meta]);

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
              className={[
                "group/fav relative w-[30px] h-[30px] rounded-[5px] flex items-center justify-center overflow-hidden cursor-pointer",
                "transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-[0_6px_16px_rgba(0,0,0,0.35)]",
                isFavorite
                  ? "bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 hover:ring-1 hover:ring-rose-300/55"
                  : "bg-zinc-900/58 hover:bg-zinc-800/82 border border-white/10 hover:ring-1 hover:ring-white/30",
              ].join(" ")}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
            >
              <Heart
                className={`h-4 w-4 transition-colors duration-200 ${
                  isFavorite
                    ? "fill-rose-500 text-rose-500 group-hover/fav:fill-rose-400 group-hover/fav:text-rose-400"
                    : "text-zinc-100 group-hover/fav:text-white"
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

        {showRecommendReason && (item as any).recommendReason && (
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
