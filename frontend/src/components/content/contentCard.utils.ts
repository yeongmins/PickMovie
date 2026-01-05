// frontend/src/components/content/contentCard.utils.ts

import type { ContentCardItem, MediaType } from "./contentCard.types";

const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

export function isLoggedInFallback(): boolean {
  try {
    return (
      !!localStorage.getItem(AUTH_KEYS.ACCESS) ||
      !!localStorage.getItem(AUTH_KEYS.USER)
    );
  } catch {
    return false;
  }
}

export function getDisplayTitle(item: ContentCardItem) {
  return (
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    "제목 정보 없음"
  );
}

export function isKoreanTitle(item: ContentCardItem): boolean {
  const t = String(getDisplayTitle(item) || "").trim();
  if (!t || t === "제목 정보 없음") return false;
  return /[가-힣]/.test(t);
}

export function inferMediaType(item: ContentCardItem): MediaType {
  if (item.media_type === "tv") return "tv";
  if (item.media_type === "movie") return "movie";
  if (item.first_air_date && !item.release_date) return "tv";
  return "movie";
}

export function typeLabelOf(item: ContentCardItem): "Movie" | "TV" | "Ani" {
  const isAni = Array.isArray(item.genre_ids) && item.genre_ids.includes(16);
  if (isAni) return "Ani";
  if (item.media_type === "tv") return "TV";
  return "Movie";
}

export function yearFromYmd(ymd?: string | null): string | null {
  const raw = String(ymd || "").trim();
  if (raw.length < 4) return null;
  const y = Number(raw.slice(0, 4));
  if (!Number.isFinite(y) || y <= 0) return null;
  return String(y);
}

export function normalizeAge(age?: string) {
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
