// frontend/src/components/content/contentCard.meta.ts

import { useEffect, useState } from "react";
import { apiGet } from "../../lib/apiClient";
import type { MediaType, ProviderBadge } from "./contentCard.types";

const TMDB_LOGO_CDN = "https://image.tmdb.org/t/p/";
export const logoUrl = (path: string, size: "w92" | "w185" = "w92") =>
  `${TMDB_LOGO_CDN}${size}${path}`;

export type MetaPayload = {
  providers: ProviderBadge[];
  ageRating: string;
  fetchedAt: number;
  isError?: boolean;
};

const metaCache = new Map<string, MetaPayload>();
const inflight = new Map<string, Promise<MetaPayload>>();

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

export function useContentCardMeta(args: {
  mediaType: MediaType;
  id: number;
  needsMeta: boolean;
}) {
  const { mediaType, id, needsMeta } = args;
  const cacheKey = `${mediaType}:${id}`;

  const [meta, setMeta] = useState<MetaPayload | null>(() => {
    return metaCache.get(cacheKey) ?? null;
  });

  useEffect(() => {
    let mounted = true;
    if (!needsMeta) return;

    const now = Date.now();
    const cached = metaCache.get(cacheKey);

    const OK_TTL = 30 * 60 * 1000;
    const ERROR_TTL = 60 * 1000;

    const isFreshOk =
      cached && !cached.isError && now - cached.fetchedAt < OK_TTL;

    const isFreshError =
      cached && cached.isError && now - cached.fetchedAt < ERROR_TTL;

    if (cached) setMeta(cached);
    if (isFreshOk || isFreshError) return;

    if (!inflight.has(cacheKey)) {
      inflight.set(
        cacheKey,
        apiGet<any>(`/tmdb/meta/${mediaType}/${id}`, { region: "KR" })
          .then((r) => {
            const providers = normalizeProviders(
              r?.providers ?? r?.providerList ?? []
            );
            const ageRating = pickAgeFromResponse(r);

            const safe: MetaPayload = {
              providers,
              ageRating,
              fetchedAt: Date.now(),
              isError: false,
            };
            metaCache.set(cacheKey, safe);
            return safe;
          })
          .catch((e) => {
            if ((import.meta as any).env?.DEV) {
              console.warn("[ContentCard] meta fetch failed:", cacheKey, e);
            }
            const safe: MetaPayload = {
              providers: [],
              ageRating: "—",
              fetchedAt: Date.now(),
              isError: true,
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
  }, [cacheKey, needsMeta, mediaType, id]);

  return meta;
}
