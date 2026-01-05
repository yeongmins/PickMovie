// frontend/src/components/content/ContentCard.tsx

import React, { useMemo } from "react";
import { Heart, Star, X } from "lucide-react";
import { getPosterUrl } from "../../lib/tmdb";
import { getReleaseStatusKind } from "../../lib/contentMeta";

import type { ContentCardProps } from "./contentCard.types";
import {
  getDisplayTitle,
  inferMediaType,
  isKoreanTitle,
  isLoggedInFallback,
  normalizeAge,
  typeLabelOf,
} from "./contentCard.utils";
import { useContentCardMeta } from "./contentCard.meta";
import {
  useOttOnlyState,
  useScreeningSetsState,
  useSyncOttOnly,
  useTvLatestState,
  useUnifiedYearLabelFromItem,
} from "./contentCard.hooks";
import { AgeBadge, Chip, ProviderBadges } from "./contentCard.ui";

export type {
  MediaType,
  ProviderBadge,
  ContentCardItem,
  ContentCardProps,
} from "./contentCard.types";

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

  const title = getDisplayTitle(item);
  const rating =
    typeof item.vote_average === "number" ? item.vote_average.toFixed(1) : "—";

  const mediaType = inferMediaType(item);
  const typeText = typeLabelOf(item);

  const screening = useScreeningSetsState();

  const needsMeta = useMemo(() => {
    const hasProviders =
      Array.isArray(item.providers) && item.providers.length > 0;

    const rawAge = (item.ageRating || "").trim();
    const hasAge = !!rawAge && rawAge !== "-" && rawAge !== "—";

    return !hasProviders || !hasAge;
  }, [item.providers, item.ageRating]);

  const meta = useContentCardMeta({
    mediaType,
    id: item.id,
    needsMeta,
  });

  const tvLatest = useTvLatestState(mediaType, item.id);

  const [ottOnly, setOttOnly] = useOttOnlyState(item.id);

  const providers =
    (Array.isArray(item.providers) && item.providers.length
      ? item.providers
      : meta?.providers) ?? [];

  const ageValue = normalizeAge(item.ageRating || meta?.ageRating || "—");

  const statusKind = useMemo(() => {
    return getReleaseStatusKind({
      mediaType,
      id: item.id,
      releaseDate: item.release_date ?? null,
      firstAirDate: item.first_air_date ?? null,
      sets: screening,
      ottOnly,
    });
  }, [
    mediaType,
    item.id,
    item.release_date,
    item.first_air_date,
    screening,
    ottOnly,
  ]);

  useSyncOttOnly({
    mediaType,
    id: item.id,
    statusKind: statusKind ?? null,
    setOttOnly,
  });

  // ✅ YEAR: 단일 소스(contentMeta)만 사용
  const effectiveYear = useUnifiedYearLabelFromItem({
    item,
    mediaType,
    tvLatest,
    statusKind: statusKind ?? null,
    region: "KR",
  });

  const providerLogos = providers
    .map((p) => {
      const name = p.provider_name ?? p.providerName ?? p.name ?? "";
      const lp = p.logo_path ?? p.logoPath ?? p.logo ?? null;
      return { name, path: lp };
    })
    .filter((x) => !!x.name && !!x.path)
    .map((x) => ({ name: x.name, path: x.path as string }));

  const providerNamesOnly = providers
    .map((p) => p.provider_name ?? p.providerName ?? p.name ?? "")
    .map((s) => String(s).trim())
    .filter(Boolean);

  const hasProviders = providerLogos.length > 0 || providerNamesOnly.length > 0;
  const hasAge = ageValue !== "—";

  const canFav =
    typeof canFavorite === "boolean" ? canFavorite : isLoggedInFallback();

  const effectivePosterPath =
    mediaType === "tv"
      ? (tvLatest as any)?.posterPath ?? item.poster_path
      : item.poster_path;

  const posterUrl = getPosterUrl(effectivePosterPath, "w500");

  const statusLabel =
    statusKind === "now"
      ? "상영중"
      : statusKind === "upcoming"
      ? "상영예정"
      : statusKind === "rerun"
      ? "재개봉"
      : null;

  const showTrend =
    typeof item.trendRank === "number" && Number.isFinite(item.trendRank);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={`group cursor-pointer select-none ${
        className ?? ""
      } w-[200px]`}
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
              title={`트렌드 점수 ${item.trendScore ?? "-"}`}
            >
              <Chip tone="purple">
                {item.trendRank === 1
                  ? "🥇"
                  : item.trendRank === 2
                  ? "🥈"
                  : item.trendRank === 3
                  ? "🥉"
                  : "🔥"}{" "}
                #{item.trendRank}
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

        {item.recommendReason && (
          <div className="mt-1 text-[11px] text-white/55 line-clamp-1">
            {item.recommendReason}
          </div>
        )}

        <div className="mt-1 text-xs text-white/70 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            {rating}
          </span>
          <span className="text-white/50">{effectiveYear}</span>
        </div>
      </div>
    </div>
  );
}
