// frontend/src/components/content/contentCard.meta.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../../lib/apiClient";
import type { MediaType, ProviderBadge } from "./contentCard.types";

/** ✅ contentCard.ui.tsx에서 쓰는 TMDB 이미지 URL 유틸 (기존 export 유지용) */
export function logoUrl(
  logoPath?: string | null,
  size: "w45" | "w92" | "w154" | "w185" | "w300" | "w500" | "original" = "w45"
) {
  const p = String(logoPath ?? "").trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  // TMDB 이미지 베이스
  return `https://image.tmdb.org/t/p/${size}${
    p.startsWith("/") ? "" : "/"
  }${p}`;
}

export type ContentCardMeta = {
  providers: ProviderBadge[];
  ageRating: string;
  fetchedAt: number;
  isError?: boolean;
};

type Params = {
  mediaType: MediaType | null | undefined;
  id: number;
  needsMeta: boolean;

  // ✅ 화면에 보일 때만 meta 요청하도록 제어
  enabled?: boolean;

  region?: string;
};

const OK_TTL = 6 * 60 * 60 * 1000; // 6h
const ERROR_TTL = 60 * 1000; // 1m

const cache = new Map<string, ContentCardMeta>();
const inflight = new Map<string, Promise<ContentCardMeta>>();

function keyOf(mt: MediaType, id: number, region: string) {
  return `${mt}:${id}:${String(region || "KR").toUpperCase()}`;
}

function isFresh(v: ContentCardMeta | null | undefined) {
  if (!v) return false;
  const ttl = v.isError ? ERROR_TTL : OK_TTL;
  return Date.now() - (v.fetchedAt || 0) < ttl;
}

function normalizeProviders(input: any): ProviderBadge[] {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((p: any) => {
      const name = p?.provider_name ?? p?.providerName ?? p?.name ?? "";
      const logo = p?.logo_path ?? p?.logoPath ?? p?.logo ?? null;

      const provider_name = String(name || "").trim();
      const logo_path = logo ? String(logo) : null;

      if (!provider_name) return null;

      const out: ProviderBadge = {
        provider_name,
        logo_path,
      };
      return out;
    })
    .filter(Boolean) as ProviderBadge[];
}

function normalizeAge(input: any): string {
  const raw = String(input ?? "").trim();
  return raw || "—";
}

function scheduleIdle(cb: () => void, timeoutMs = 1200) {
  const w: any = window as any;
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(() => cb(), { timeout: timeoutMs } as any);
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 0);
  return () => window.clearTimeout(id);
}

async function fetchMeta(mt: MediaType, id: number, region: string) {
  const k = keyOf(mt, id, region);

  const cached = cache.get(k);
  if (cached && isFresh(cached)) return cached;

  const inP = inflight.get(k);
  if (inP) return inP;

  const p = (async () => {
    try {
      // ✅ apiGet 시그니처(2개 인자)에 맞춤
      const res = await apiGet<any>(`/tmdb/meta/${mt}/${id}`, { region });

      const meta: ContentCardMeta = {
        providers: normalizeProviders(res?.providers),
        ageRating: normalizeAge(
          res?.ageRating ?? res?.age ?? res?.certification
        ),
        fetchedAt: Date.now(),
        isError: false,
      };

      cache.set(k, meta);
      return meta;
    } catch {
      const meta: ContentCardMeta = {
        providers: [],
        ageRating: "—",
        fetchedAt: Date.now(),
        isError: true,
      };
      cache.set(k, meta);
      return meta;
    } finally {
      inflight.delete(k);
    }
  })();

  inflight.set(k, p);
  return p;
}

export function useContentCardMeta(params: Params): ContentCardMeta | null {
  const {
    mediaType,
    id,
    needsMeta,
    enabled = true, // ✅ 기본 true (기존 호출부 호환)
    region = "KR",
  } = params;

  const mt: MediaType | null =
    mediaType === "movie" || mediaType === "tv" ? mediaType : null;

  const cacheKey = useMemo(() => {
    if (!mt || !id) return null;
    return keyOf(mt, id, region);
  }, [mt, id, region]);

  const [meta, setMeta] = useState<ContentCardMeta | null>(() => {
    if (!cacheKey) return null;
    const v = cache.get(cacheKey);
    return v && isFresh(v) ? v : null;
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mt) return;
    if (!id || !Number.isFinite(id)) return;
    if (!needsMeta) return;
    if (!enabled) return; // ✅ enabled=false면 요청 안 함

    // ✅ 캐시 신선하면 바로 반영
    if (cacheKey) {
      const v = cache.get(cacheKey);
      if (v && isFresh(v)) {
        setMeta(v);
        return;
      }
    }

    const cancel = scheduleIdle(() => {
      fetchMeta(mt, id, region).then((v) => {
        if (!mountedRef.current) return;
        setMeta(v);
      });
    });

    return () => cancel?.();
  }, [mt, id, region, needsMeta, enabled, cacheKey]);

  return meta;
}
