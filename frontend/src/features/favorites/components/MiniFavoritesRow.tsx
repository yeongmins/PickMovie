import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { getBackdropUrl } from "../../../lib/tmdb";
import { AgeBadge, Chip, logoUrl } from "./favoritesCarousel.shared";

type MediaType = "movie" | "tv";

type ProviderBadge = {
  provider_name?: string;
  logo_path?: string | null;

  providerName?: string;
  logoPath?: string | null;

  name?: string;
  logo?: string | null;
};

export type MiniFavoritesRowItem = {
  id: number;
  media_type?: MediaType;

  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;

  poster_path?: string | null;
  backdrop_path?: string | null;

  genre_ids?: number[];

  isNowPlaying?: boolean;
  isUpcoming?: boolean;
  ageRating?: string | number | null;

  providers?: ProviderBadge[];
};

type ActiveMeta = {
  // ✅ FavoritesCarousel(현재 슬라이드)에서 계산된 값
  statusLabel?: string | null; // airingChip.label
  ageValue?: any; // AgeBadge value
  providers?: { name: string; path?: string | null }[];
  hiddenCount?: number;
};

function normalizeMediaType(v: unknown): MediaType {
  return v === "tv" ? "tv" : "movie";
}

function getTypeLabel(item: MiniFavoritesRowItem): "Movie" | "TV" | "Ani" {
  const mt = normalizeMediaType(item.media_type);
  if (mt === "tv") return "TV";
  const genres = item.genre_ids ?? [];
  return genres.includes(16) ? "Ani" : "Movie";
}

function getStatusLabel(item: MiniFavoritesRowItem): string | null {
  if (item.isNowPlaying) return "상영중";
  if (item.isUpcoming) return "상영 예정";
  return null;
}

function normalizeProviders(list?: ProviderBadge[]) {
  if (!list?.length) return [];
  return list
    .map((p) => {
      const name = p.provider_name ?? p.providerName ?? p.name ?? "";
      const path = p.logo_path ?? p.logoPath ?? p.logo ?? null;
      return name && path ? { name, path } : null;
    })
    .filter(Boolean) as { name: string; path: string }[];
}

export function MiniFavoritesRow({
  movies,
  activeIndex,
  onSelect,
  activeMeta,
}: {
  movies: MiniFavoritesRowItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  activeMeta?: ActiveMeta;
}) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const uniqueItems = useMemo(() => {
    const deduped = Array.from(
      new Map(
        (movies ?? []).map((m) => [
          `${normalizeMediaType(m.media_type)}:${m.id}`,
          m,
        ])
      ).values()
    );
    return deduped.filter((m) => !!(m.backdrop_path || m.poster_path));
  }, [movies]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.85;
    const newPosition =
      direction === "left"
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;

    container.scrollTo({ left: newPosition, behavior: "smooth" });
    setScrollPosition(newPosition);
  };

  // active 썸네일이 항상 보이도록
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const el = container.querySelector(
      `[data-mini-idx="${activeIndex}"]`
    ) as HTMLElement | null;

    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  }, [activeIndex]);

  if (uniqueItems.length === 0) return null;

  const sectionPad = "px-4 sm:px-6 lg:px-6";

  return (
    <div className="group/row relative pointer-events-auto">
      {/* ✅ row 자체 배경 제거: “이미지만 떠있는 느낌” */}
      <div className="relative">
        {scrollPosition > 0 && (
          <button
            onClick={() => scroll("left")}
            className={[
              "absolute left-0 top-0 bottom-0 z-20",
              "w-10 sm:w-12",
              "bg-gradient-to-r from-black/45 to-transparent",
              "flex items-center justify-start pl-1",
              "opacity-0 group-hover/row:opacity-100 transition-opacity",
              "rounded-l-2xl",
            ].join(" ")}
            aria-label="왼쪽으로 스크롤"
            type="button"
          >
            <ChevronLeft className="w-9 h-9 text-white drop-shadow-lg" />
          </button>
        )}

        <div
          ref={scrollContainerRef}
          className={[
            "flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth",
            sectionPad,
            // ✅ 고정 높이로 전체 사이즈 컨트롤
            "py-1",
          ].join(" ")}
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            overflowY: "visible",
          }}
          onScroll={(e) => setScrollPosition(e.currentTarget.scrollLeft)}
        >
          {uniqueItems.map((m, idx) => {
            const mt = normalizeMediaType(m.media_type);
            const isActive = idx === activeIndex;

            // ✅ 카드에 값이 없으면 “활성 슬라이드 메타”로 보강(뱃지 안 뜨는 문제 해결)
            const typeLabel = getTypeLabel(m);
            const statusLabel =
              getStatusLabel(m) ??
              (isActive ? activeMeta?.statusLabel ?? null : null);

            const age =
              (m as any).ageRating ??
              (isActive ? activeMeta?.ageValue ?? null : null);

            const providersFromItem = normalizeProviders(m.providers);
            const providers =
              providersFromItem.length > 0
                ? providersFromItem
                : isActive
                ? activeMeta?.providers ?? []
                : [];

            const visibleProviders = providers.slice(0, 3);
            const hiddenCount =
              providersFromItem.length > 0
                ? Math.max(0, providers.length - visibleProviders.length)
                : isActive
                ? activeMeta?.hiddenCount ??
                  Math.max(0, providers.length - visibleProviders.length)
                : 0;

            const src = getBackdropUrl(
              (m.backdrop_path || m.poster_path || null) as any,
              "w780"
            );

            return (
              <button
                key={`${mt}:${m.id}`}
                data-mini-idx={idx}
                type="button"
                onClick={() => onSelect(idx)}
                aria-label={`${typeLabel} 썸네일`}
                className={[
                  "relative flex-shrink-0",
                  // ✅ 고정 크기(덮임 방지)
                  "w-[190px] sm:w-[210px] md:w-[230px]",
                  "h-[96px] sm:h-[104px] md:h-[110px]",
                  "rounded-2xl overflow-hidden",
                  "border border-white/12",
                  "shadow-[0_14px_40px_rgba(0,0,0,0.32)]",
                  "transition-transform duration-300",
                  "hover:scale-[1.03]",
                  isActive ? "ring-2 ring-white/70" : "ring-0",
                ].join(" ")}
              >
                <img
                  src={src}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300 ease-out hover:scale-[1.06]"
                  loading="lazy"
                  decoding="async"
                />

                {/* 가독성용 오버레이 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

                {/* ✅ 좌상단: 연령 */}
                <div className="absolute left-2 top-2 flex items-center gap-1">
                  {age ? <AgeBadge value={age as any} /> : null}
                </div>

                {/* ✅ 우상단: 타입 + 상영상태(요청: Movie/TV/Ani 오른쪽 배치) */}
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <Chip tone="dark">{typeLabel}</Chip>
                  {statusLabel ? <Chip tone="dark">{statusLabel}</Chip> : null}
                </div>

                {/* ✅ 우하단: OTT */}
                {(visibleProviders.length > 0 || hiddenCount > 0) && (
                  <div className="absolute right-2 bottom-2 flex items-center gap-1">
                    {visibleProviders.map((p) => (
                      <span
                        key={p.name}
                        className="w-[22px] h-[22px] rounded-[6px] bg-black/45 backdrop-blur-sm overflow-hidden flex items-center justify-center border border-white/10"
                        title={p.name}
                        aria-label={p.name}
                      >
                        {p.path ? (
                          <img
                            src={logoUrl(p.path, "w92")}
                            srcSet={`${logoUrl(p.path, "w92")} 1x, ${logoUrl(
                              p.path,
                              "w185"
                            )} 2x`}
                            alt={p.name}
                            className="w-full h-full object-contain"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : null}
                      </span>
                    ))}

                    {hiddenCount > 0 && (
                      <span className="h-[22px] rounded-[6px] bg-black/45 backdrop-blur-sm px-2 text-[11px] font-extrabold text-white/90 flex items-center border border-white/10">
                        +{hiddenCount}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => scroll("right")}
          className={[
            "absolute right-0 top-0 bottom-0 z-20",
            "w-10 sm:w-12",
            "bg-gradient-to-l from-black/45 to-transparent",
            "flex items-center justify-end pr-1",
            "opacity-0 group-hover/row:opacity-100 transition-opacity",
            "rounded-r-2xl",
          ].join(" ")}
          aria-label="오른쪽으로 스크롤"
          type="button"
        >
          <ChevronRight className="w-9 h-9 text-white drop-shadow-lg" />
        </button>
      </div>
    </div>
  );
}
