// src/components/content/ContentCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Heart, Star, X } from "lucide-react";
import { getPosterUrl } from "../../lib/tmdb";
import { apiGet } from "../../lib/apiClient";

type MediaType = "movie" | "tv";

export type ProviderBadge = {
  provider_name?: string;
  logo_path?: string | null;

  providerName?: string;
  logoPath?: string | null;

  name?: string;
  logo?: string | null;
};

export type ContentCardItem = {
  id: number;

  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;

  poster_path: string | null;
  vote_average?: number;

  release_date?: string;
  first_air_date?: string;

  media_type?: MediaType;
  genre_ids?: number[];

  isNowPlaying?: boolean;
  providers?: ProviderBadge[];
  platform?: string;
  ageRating?: string;

  matchScore?: number;
};

export type ContentCardProps = {
  item: ContentCardItem;
  isFavorite: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;

  onRemove?: () => void;
  context?: "default" | "picky";
  onPosterError?: () => void;

  className?: string;

  // ✅ 추가: 로그인 안 하면 하트 숨김
  // - 페이지에서 명시적으로 제어하고 싶으면 이 값 넘기면 됨
  canFavorite?: boolean;
};

const TMDB_LOGO_CDN = "https://image.tmdb.org/t/p/";
const logoUrl = (path: string, size: "w92" | "w185" = "w92") =>
  `${TMDB_LOGO_CDN}${size}${path}`;

const metaCache = new Map<
  string,
  { providers: ProviderBadge[]; ageRating: string }
>();
const inflight = new Map<
  string,
  Promise<{ providers: ProviderBadge[]; ageRating: string }>
>();

const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

function isLoggedInFallback(): boolean {
  try {
    return (
      !!localStorage.getItem(AUTH_KEYS.ACCESS) ||
      !!localStorage.getItem(AUTH_KEYS.USER)
    );
  } catch {
    return false;
  }
}

function getDisplayTitle(item: ContentCardItem) {
  return (
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    "제목 정보 없음"
  );
}

function inferMediaType(item: ContentCardItem): MediaType {
  if (item.media_type === "tv") return "tv";
  if (item.media_type === "movie") return "movie";
  if (item.first_air_date && !item.release_date) return "tv";
  return "movie";
}

function typeLabelOf(item: ContentCardItem): "Movie" | "TV" | "Ani" {
  const isAni = Array.isArray(item.genre_ids) && item.genre_ids.includes(16);
  if (isAni) return "Ani";
  if (item.media_type === "tv") return "TV";
  return "Movie";
}

function yearOf(item: ContentCardItem) {
  const d = item.release_date || item.first_air_date || "";
  if (!d) return "";
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? String(y) : "";
}

function normalizeAge(age?: string) {
  const raw = (age || "").trim();
  if (!raw || raw === "-" || raw === "—") return "—";
  if (raw === "ALL" || raw.includes("전체")) return "ALL";

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return raw;

  const n = Number(digits);
  if (!Number.isFinite(n)) return raw;
  if (n <= 0) return "ALL";
  if (n <= 12) return "12";
  if (n <= 15) return "15";
  return "18";
}

function ageBadgeClass(v: string) {
  switch (v) {
    case "ALL":
      return "bg-green-500";
    case "12":
      return "bg-yellow-400";
    case "15":
      return "bg-orange-500";
    case "18":
      return "bg-red-600";
    default:
      return "bg-black/60";
  }
}

function AgeBadge({ value }: { value: string }) {
  const v = normalizeAge(value);
  if (!v || v === "—") return null;

  return (
    <div
      className={[
        "w-[22px] h-[22px] rounded-[4px]",
        "flex items-center justify-center",
        "text-white font-extrabold",
        "shadow-sm",
        ageBadgeClass(v),
      ].join(" ")}
      aria-label={`연령등급 ${v}`}
      title={`연령등급 ${v}`}
    >
      <span className={v === "ALL" ? "text-[9px]" : "text-[12px]"}>{v}</span>
    </div>
  );
}

function normalizeProviders(input: any): ProviderBadge[] {
  const arr: any[] = Array.isArray(input) ? input : [];
  return arr
    .map((p) => {
      const provider_name =
        p?.provider_name ?? p?.providerName ?? p?.name ?? "";
      const logo_path = p?.logo_path ?? p?.logoPath ?? p?.logo ?? null;
      if (!provider_name) return null;
      return { provider_name, logo_path } as ProviderBadge;
    })
    .filter(Boolean) as ProviderBadge[];
}

function pickAgeFromResponse(r: any): string {
  const v =
    r?.ageRating ??
    r?.age_rating ??
    r?.age ??
    r?.rating ??
    r?.certification ??
    "";
  const s = String(v || "").trim();
  return s || "—";
}

function Chip({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "green" | "purple";
}) {
  const base =
    "inline-flex items-center h-[20px] rounded-[5px] text-[10px] font-bold leading-none " +
    "px-[8px] shadow-sm backdrop-blur-sm";

  const cls =
    tone === "green"
      ? "bg-green-500/90 text-white"
      : tone === "purple"
      ? "bg-purple-600/90 text-white"
      : "bg-black/45 text-white";

  return <div className={`${base} ${cls}`}>{children}</div>;
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
  const title = getDisplayTitle(item);
  const rating =
    typeof item.vote_average === "number" ? item.vote_average.toFixed(1) : "—";
  const y = yearOf(item);

  const mediaType = inferMediaType(item);
  const typeText = typeLabelOf(item);

  const posterUrl = getPosterUrl(item.poster_path, "w500");
  const cacheKey = `${mediaType}:${item.id}`;

  const [meta, setMeta] = useState<{
    providers: ProviderBadge[];
    ageRating: string;
  } | null>(() => metaCache.get(cacheKey) ?? null);

  const needsMeta = useMemo(() => {
    const hasProviders =
      Array.isArray(item.providers) && item.providers.length > 0;
    const rawAge = (item.ageRating || "").trim();
    const hasAge = !!rawAge && rawAge !== "-" && rawAge !== "—";
    return !(hasProviders && hasAge);
  }, [item.providers, item.ageRating]);

  useEffect(() => {
    let mounted = true;
    if (!needsMeta) return;

    const cached = metaCache.get(cacheKey);
    if (cached) {
      setMeta(cached);
      return;
    }

    if (!inflight.has(cacheKey)) {
      inflight.set(
        cacheKey,
        apiGet<any>(`/tmdb/meta/${mediaType}/${item.id}`, { region: "KR" })
          .then((r) => {
            const providers = normalizeProviders(
              r?.providers ?? r?.providerList ?? []
            );
            const ageRating = pickAgeFromResponse(r);
            const safe = { providers, ageRating };
            metaCache.set(cacheKey, safe);
            return safe;
          })
          .catch((e) => {
            if ((import.meta as any).env?.DEV) {
              console.warn("[ContentCard] meta fetch failed:", cacheKey, e);
            }
            const safe = { providers: [], ageRating: "—" };
            metaCache.set(cacheKey, safe);
            return safe;
          })
          .finally(() => {
            inflight.delete(cacheKey);
          })
      );
    }

    inflight.get(cacheKey)!.then((r) => {
      if (!mounted) return;
      setMeta(r);
    });

    return () => {
      mounted = false;
    };
  }, [cacheKey, needsMeta, mediaType, item.id]);

  const providers =
    (Array.isArray(item.providers) && item.providers.length
      ? item.providers
      : meta?.providers) ?? [];

  const ageValue = normalizeAge(item.ageRating || meta?.ageRating || "—");
  const showNowPlaying = item.isNowPlaying === true;

  const showMatch =
    context === "picky" &&
    typeof item.matchScore === "number" &&
    Number.isFinite(item.matchScore);

  const providerLogos = providers
    .map((p) => {
      const name = p.provider_name ?? p.providerName ?? p.name ?? "";
      const lp = p.logo_path ?? p.logoPath ?? p.logo ?? null;
      return { name, path: lp };
    })
    .filter((x) => !!x.name && !!x.path);

  const MAX_PROVIDER_BADGES = 3;
  const visibleProviders = providerLogos.slice(0, MAX_PROVIDER_BADGES);
  const hiddenCount = Math.max(
    0,
    providerLogos.length - visibleProviders.length
  );

  const hasProviders = visibleProviders.length > 0;
  const hasAge = ageValue !== "—";

  // ✅ 로그인 안 하면 하트 숨김
  const canFav =
    typeof canFavorite === "boolean" ? canFavorite : isLoggedInFallback();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={`group cursor-pointer select-none w-full ${className ?? ""}`}
      aria-label={`${title} 상세 보기`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[5px] bg-white/5 shadow-lg">
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

        {/* 좌상단 */}
        <div className="absolute top-2 left-2 z-20 flex flex-col items-start">
          {onRemove && (
            <button
              type="button"
              aria-label="플레이리스트에서 제거"
              className="w-[30px] h-[30px] rounded-[5px] bg-black/55 hover:bg-black/70 flex items-center justify-center"
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

          {showNowPlaying && (
            <div className="self-start">
              <Chip tone="green">상영중</Chip>
            </div>
          )}

          {showMatch && (
            <div className="self-start">
              <Chip tone="purple">{Math.round(item.matchScore!)}% 매칭</Chip>
            </div>
          )}
        </div>

        {/* 우상단 하트 (로그인 시에만 노출) */}
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

        {/* 우하단 */}
        {(hasProviders || hasAge) && (
          <div className="absolute bottom-2 right-2 z-20 flex flex-col items-end gap-1">
            {hasProviders && hasAge && <AgeBadge value={ageValue} />}

            {hasProviders ? (
              <div className="flex items-center gap-1 flex-nowrap">
                {visibleProviders.map((p) => (
                  <div
                    key={p.name}
                    className="w-[22px] h-[22px] rounded-[4px] bg-black/45 backdrop-blur-sm overflow-hidden flex items-center justify-center shadow-sm"
                    title={p.name}
                    aria-label={p.name}
                  >
                    <img
                      src={logoUrl(p.path!, "w92")}
                      srcSet={`${logoUrl(p.path!, "w92")} 1x, ${logoUrl(
                        p.path!,
                        "w185"
                      )} 2x`}
                      alt={p.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ))}

                {hiddenCount > 0 && (
                  <span className="w-[30px] h-[30px] rounded-[5px] bg-black/45 backdrop-blur-sm px-[6px] text-[12px] font-bold text-white/90 flex items-center shadow-sm">
                    +{hiddenCount}
                  </span>
                )}
              </div>
            ) : (
              <AgeBadge value={ageValue} />
            )}
          </div>
        )}
      </div>

      {/* 텍스트 */}
      <div className="mt-3 px-1">
        <div className="text-sm font-semibold text-white line-clamp-1">
          {title}
        </div>

        <div className="mt-1 text-xs text-white/70 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            {rating}
          </span>
          <span className="text-white/50">{y || "—"}</span>
        </div>
      </div>
    </div>
  );
}
