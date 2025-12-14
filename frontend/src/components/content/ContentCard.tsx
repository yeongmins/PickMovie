import React, { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Star, X } from "lucide-react";
import { getPosterUrl } from "../../lib/tmdb";
import { apiGet } from "../../lib/apiClient";

type MediaType = "movie" | "tv";

export type ProviderBadge = {
  provider_name: string;
  logo_path?: string | null;
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
};

const TMDB_PROVIDER_LOGO_BASE = "https://image.tmdb.org/t/p/w45";

// ✅ 전역 캐시(카드가 여러 페이지에서 재사용돼도 중복 호출 방지)
const metaCache = new Map<
  string,
  { providers: ProviderBadge[]; ageRating: string }
>();
const inflight = new Map<
  string,
  Promise<{ providers: ProviderBadge[]; ageRating: string }>
>();

function getDisplayTitle(item: ContentCardItem) {
  return (
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    "제목 정보 없음"
  );
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

function inferMediaType(item: ContentCardItem): MediaType {
  if (item.media_type === "tv") return "tv";
  if (item.media_type === "movie") return "movie";
  // fallback
  if (item.first_air_date && !item.release_date) return "tv";
  return "movie";
}

function normalizeAge(age?: string) {
  const raw = (age || "").trim();
  if (!raw) return "—";
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

function AgeBadge({ value }: { value: string }) {
  const v = normalizeAge(value);
  // SVG 배지 (요구사항 반영)
  const label = v === "ALL" ? "ALL" : v;
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      role="img"
      aria-label={`연령등급 ${label}`}
      className="drop-shadow"
    >
      <circle
        cx="14"
        cy="14"
        r="13"
        fill="rgba(0,0,0,0.55)"
        stroke="rgba(255,255,255,0.18)"
      />
      <text
        x="14"
        y="16.2"
        textAnchor="middle"
        fontSize={label.length >= 3 ? "9.5" : "11"}
        fontWeight="800"
        fill="white"
        fontFamily="ui-sans-serif, system-ui"
      >
        {label}
      </text>
    </svg>
  );
}

export function ContentCard({
  item,
  isFavorite,
  onClick,
  onToggleFavorite,
  onRemove,
  context = "default",
  onPosterError,
}: ContentCardProps) {
  const title = getDisplayTitle(item);
  const rating =
    typeof item.vote_average === "number" ? item.vote_average.toFixed(1) : "—";
  const y = yearOf(item);
  const typeText = typeLabelOf(item);

  const posterUrl = getPosterUrl(item.poster_path, "w500");
  const mediaType = inferMediaType(item);
  const cacheKey = `${mediaType}:${item.id}`;

  // ✅ meta 보강(플랫폼/연령) - item에 없으면 백엔드 프록시로 받아옴
  const [meta, setMeta] = useState<{
    providers: ProviderBadge[];
    ageRating: string;
  } | null>(() => metaCache.get(cacheKey) ?? null);

  const needsMeta = useMemo(() => {
    const hasProviders =
      Array.isArray(item.providers) && item.providers.length > 0;
    const hasAge = !!(item.ageRating && item.ageRating.trim());
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
        apiGet<{ providers: ProviderBadge[]; ageRating: string }>(
          `/tmdb/meta/${mediaType}/${item.id}`,
          { region: "KR" }
        )
          .then((r) => {
            const safe = {
              providers: Array.isArray(r?.providers) ? r.providers : [],
              ageRating: (r?.ageRating || "—") as string,
            };
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

  // ✅ 상영중: true일 때만 표시 (텍스트 남발 방지)
  const showNowPlaying = item.isNowPlaying === true;

  // ✅ 매칭률: Picky 맥락이거나 값이 있으면 표시
  const showMatch =
    typeof item.matchScore === "number" && Number.isFinite(item.matchScore);

  // 플랫폼 로고 URL
  const providerLogos = providers
    .map((p) => ({
      name: p.provider_name,
      url: p.logo_path ? `${TMDB_PROVIDER_LOGO_BASE}${p.logo_path}` : null,
    }))
    .filter((x) => x.url);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition cursor-pointer"
      aria-label={`${title} 상세 보기`}
    >
      {/* 포스터 영역 */}
      <div className="relative aspect-[2/3] w-full bg-black/20">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
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

        {/* 상단 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />

        {/* 좌상단: 상영중 */}
        {showNowPlaying && (
          <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md bg-green-500/85 text-white text-[11px] font-bold backdrop-blur-sm">
            상영중
          </div>
        )}

        {/* 좌상단 아래: 플레이리스트 제거(X) */}
        {onRemove && (
          <button
            type="button"
            aria-label="플레이리스트에서 제거"
            className="absolute top-2 left-2 z-20 h-9 w-9 rounded-full bg-black/55 hover:bg-black/70 border border-white/10 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <X className="h-4 w-4 text-white" />
          </button>
        )}

        {/* 우상단: 매칭률(하트와 겹치지 않게 왼쪽으로) */}
        {showMatch && (
          <div className="absolute top-2 right-12 z-10 px-2 py-1 text-[11px] font-extrabold rounded-md bg-purple-600/90 backdrop-blur-sm">
            {Math.round(item.matchScore!)}% 매칭
          </div>
        )}

        {/* 우상단: 하트 */}
        <button
          type="button"
          aria-label="찜 토글"
          className="absolute top-2 right-2 z-10 h-9 w-9 rounded-full bg-black/55 hover:bg-black/70 border border-white/10 flex items-center justify-center"
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

        {/* 하단 좌: 플랫폼 로고들 */}
        {providerLogos.length > 0 && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5">
            {providerLogos.slice(0, 4).map((p) => (
              <div
                key={p.name}
                className="w-7 h-7 rounded-md bg-black/55 border border-white/10 backdrop-blur-sm overflow-hidden flex items-center justify-center"
                title={p.name}
                aria-label={p.name}
              >
                <img
                  src={p.url!}
                  alt={p.name}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
            ))}
            {providerLogos.length > 4 && (
              <span className="text-[10px] text-white/90 bg-black/55 border border-white/10 rounded-md px-1.5 py-1">
                +{providerLogos.length - 4}
              </span>
            )}
          </div>
        )}

        {/* 하단 우: 타입 + 연령 SVG */}
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2">
          <div className="px-2 py-1 rounded-md bg-black/55 border border-white/10 text-[11px] font-bold backdrop-blur-sm">
            {typeText}
          </div>
          <AgeBadge value={ageValue} />
        </div>
      </div>

      {/* 포스터 아래 텍스트(요구사항 반영) */}
      <div className="p-3">
        <div className="text-sm font-semibold text-white line-clamp-1">
          {title}
        </div>

        <div className="mt-1 text-xs text-white/70 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5" />
            {rating}
          </span>
          <span className="text-white/50">{y || "—"}</span>
        </div>
      </div>
    </div>
  );
}
