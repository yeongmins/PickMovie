// frontend/src/components/detail/DetailSections.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { ExternalLink } from "lucide-react";
import { apiGet } from "../../lib/apiClient";
import { getDisplayTitle } from "../../features/favorites/components/favoritesCarousel.shared";

type MediaType = "movie" | "tv";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const TMDB_API_KEY = (import.meta as any)?.env?.VITE_TMDB_API_KEY as
  | string
  | undefined;

const TMDB_DIRECT_BASE =
  (import.meta as any)?.env?.VITE_TMDB_BASE_URL ||
  "https://api.themoviedb.org/3";

async function tmdbDirect(
  path: string,
  params: Record<string, string> = {}
): Promise<any | null> {
  if (!TMDB_API_KEY) return null;

  try {
    const url = new URL(`${TMDB_DIRECT_BASE}${path}`);
    url.searchParams.set("api_key", TMDB_API_KEY);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* =========================
   OTT
========================= */

type Provider = {
  provider_id?: number;
  provider_name?: string;
  logo_path?: string | null;
};

type WatchPayload = {
  link?: string;
  flatrate?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
};

type WatchProviderRegionLike = {
  link?: string;
  flatrate?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
  free?: Provider[];
  ads?: Provider[];
};

const TMDB_LOGO_CDN = "https://image.tmdb.org/t/p/";
const logoUrl = (path: string, size: "w92" | "w185" = "w92") =>
  `${TMDB_LOGO_CDN}${size}${path}`;

function providerDeepLink(providerName: string, title: string) {
  const q = encodeURIComponent(title);

  const map: Record<string, string> = {
    Netflix: `https://www.netflix.com/search?q=${q}`,
    "Disney Plus": `https://www.disneyplus.com/search/${q}`,
    "Disney+": `https://www.disneyplus.com/search/${q}`,
    "Prime Video": `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}`,
    "Amazon Prime Video": `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}`,
    "Apple TV": `https://tv.apple.com/search?term=${q}`,
    "Apple TV+": `https://tv.apple.com/search?term=${q}`,
    WATCHA: `https://watcha.com/search?query=${q}`,
    왓챠: `https://watcha.com/search?query=${q}`,
    TVING: `https://www.tving.com/search?query=${q}`,
    티빙: `https://www.tving.com/search?query=${q}`,
    wavve: `https://www.wavve.com/search?query=${q}`,
    Wavve: `https://www.wavve.com/search?query=${q}`,
    쿠팡플레이: `https://www.coupangplay.com/search?q=${q}`,
    "Coupang Play": `https://www.coupangplay.com/search?q=${q}`,
  };

  const key = Object.keys(map).find((k) =>
    providerName.toLowerCase().includes(k.toLowerCase())
  );
  return key ? map[key] : "";
}

function normalizeProviders(arr: any): Provider[] {
  const list: any[] = Array.isArray(arr) ? arr : [];
  return list
    .map((p) => {
      const name = p?.provider_name ?? p?.providerName ?? p?.name ?? "";
      const logo = p?.logo_path ?? p?.logoPath ?? p?.logo ?? null;
      const id = p?.provider_id ?? p?.providerId ?? undefined;
      if (!name) return null;
      return {
        provider_id: id,
        provider_name: name,
        logo_path: logo,
      } as Provider;
    })
    .filter(Boolean) as Provider[];
}

function normalizeWatchPayload(input: any): WatchPayload | null {
  if (!input) return null;
  const link = input?.link;
  const flatrate = normalizeProviders(input?.flatrate);
  const rent = normalizeProviders(input?.rent);
  const buy = normalizeProviders(input?.buy);

  if (link || flatrate.length || rent.length || buy.length) {
    return { link, flatrate, rent, buy };
  }
  return null;
}

async function fetchWatchProviders(
  mediaType: MediaType,
  id: number
): Promise<WatchPayload | null> {
  const candidates = [
    `/tmdb/watch/providers/${mediaType}/${id}`,
    `/tmdb/watch/${mediaType}/${id}`,
    `/tmdb/providers/${mediaType}/${id}`,
    `/tmdb/meta/${mediaType}/${id}`,
  ] as const;

  for (const p of candidates) {
    try {
      const r = await apiGet<any>(p, { region: "KR", language: "ko-KR" });

      const kr = r?.results?.KR ?? r?.KR ?? null;
      const normalizedKr = normalizeWatchPayload(kr);
      if (normalizedKr) return normalizedKr;

      if (Array.isArray(r?.providers)) {
        return {
          link: r?.link,
          flatrate: normalizeProviders(r.providers),
        };
      }
    } catch {
      // ignore
    }
  }

  const json = await tmdbDirect(`/${mediaType}/${id}/watch/providers`);
  const kr = json?.results?.KR ?? null;
  return normalizeWatchPayload(kr);
}

export function DetailOttSection({
  mediaType,
  id,
  title,
  prefetched,
}: {
  mediaType: MediaType;
  id: number;
  title: string;
  prefetched?: WatchPayload | null;
}) {
  const [data, setData] = useState<WatchPayload | null>(
    () => prefetched ?? null
  );
  const [loading, setLoading] = useState(() => !prefetched);

  useEffect(() => {
    let mounted = true;

    if (prefetched) {
      setData(prefetched);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    void (async () => {
      try {
        const r = await fetchWatchProviders(mediaType, id);
        if (!mounted) return;
        setData(r);
      } catch {
        if (!mounted) return;
        setData(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [mediaType, id, prefetched]);

  const providers = useMemo(() => {
    const flat = data?.flatrate ?? [];
    const rent = data?.rent ?? [];
    const buy = data?.buy ?? [];

    const map = new Map<string, Provider>();
    [...flat, ...rent, ...buy].forEach((p) => {
      const k = (p.provider_name || "").trim();
      if (k && !map.has(k)) map.set(k, p);
    });

    return Array.from(map.values());
  }, [data]);

  const hasAny = providers.length > 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="text-white/90 font-semibold">시청 가능 OTT</div>
        <div className="text-xs text-white/55">
          {loading
            ? "불러오는 중…"
            : hasAny
            ? "실제 정보와 다를 수 있습니다."
            : "실제 정보와 다를 수 있습니다."}
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="h-12 rounded-xl bg-white/5 flex items-center justify-center text-sm text-white/60">
            시청처 정보를 불러오는 중…
          </div>
        ) : !hasAny ? (
          <div className="h-12 rounded-xl bg-white/5 flex items-center justify-center text-sm text-white/60">
            현재 스트리밍 정보가 없습니다.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {providers.slice(0, 10).map((p) => {
              const name = p.provider_name || "";

              // ✅ TMDB Watch Providers가 내려주는 "타이틀 고유 링크(link)"를 우선 사용 (ID 매칭되는 동작)
              // link가 없을 때만 검색 링크로 fallback
              const link = data?.link || providerDeepLink(name, title) || "";

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    if (!link) return;
                    window.open(link, "_blank", "noopener,noreferrer");
                  }}
                  disabled={!link}
                  className="group flex items-center gap-2 rounded-xl bg-white/6 hover:bg-white/10 px-3 py-2 transition"
                  aria-label={`${name}에서 바로가기`}
                >
                  <div className="w-9 h-9 rounded-lg bg-black/35 overflow-hidden flex items-center justify-center">
                    {p.logo_path ? (
                      <img
                        src={logoUrl(p.logo_path, "w92")}
                        srcSet={`${logoUrl(p.logo_path, "w92")} 1x, ${logoUrl(
                          p.logo_path,
                          "w185"
                        )} 2x`}
                        alt={name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="text-[10px] text-white/60">OTT</span>
                    )}
                  </div>

                  <div className="min-w-0 text-left">
                    <div className="text-sm text-white/85 font-semibold max-w-[180px] truncate">
                      {name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/55 inline-flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" />
                      바로가기
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2 text-[11px] text-white/40">
        출처: TMDB Watch Providers (KR)
      </div>
    </div>
  );
}

/* =========================
   Reviews
========================= */

type Review = {
  author?: string;
  content?: string;
  created_at?: string;
  url?: string;
};

function normalizeReviews(input: any): Review[] {
  const list: any[] = Array.isArray(input?.results)
    ? input.results
    : Array.isArray(input)
    ? input
    : [];

  return list.map((r) => ({
    author: r?.author ?? r?.author_details?.name ?? "",
    content: r?.content ?? "",
    created_at: r?.created_at ?? "",
    url: r?.url ?? "",
  }));
}

async function fetchReviews(
  mediaType: MediaType,
  id: number
): Promise<Review[] | null> {
  const candidates = [
    `/tmdb/reviews/${mediaType}/${id}`,
    `/tmdb/${mediaType}/${id}/reviews`,
    `/reviews/${mediaType}/${id}`,
  ] as const;

  for (const p of candidates) {
    try {
      const r = await apiGet<any>(p, { language: "ko-KR" });
      const arr = normalizeReviews(r);
      if (arr.length) return arr;
    } catch {
      // ignore
    }
  }

  for (const lang of ["ko-KR", "en-US"] as const) {
    const json = await tmdbDirect(`/${mediaType}/${id}/reviews`, {
      language: lang,
      page: "1",
    });
    const arr = normalizeReviews(json);
    if (arr.length) return arr;
  }

  return [];
}

export function DetailReviewsSection({
  mediaType,
  id,
  voteAverage,
  voteCount,
}: {
  mediaType: MediaType;
  id: number;
  voteAverage: number | null;
  voteCount: number | null;
}) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    void (async () => {
      try {
        const r = await fetchReviews(mediaType, id);
        if (!mounted) return;
        setReviews(r ?? []);
      } catch {
        if (!mounted) return;
        setReviews([]);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [mediaType, id]);

  const head = useMemo(() => {
    const avg = typeof voteAverage === "number" ? voteAverage.toFixed(1) : "—";
    const cnt =
      typeof voteCount === "number" ? voteCount.toLocaleString() : "—";
    return { avg, cnt };
  }, [voteAverage, voteCount]);

  if (loading) {
    return (
      <div className="text-sm text-white/60">리뷰 정보를 불러오는 중…</div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <div className="text-sm text-white/60">
        외부 평점/리뷰 정보가 없습니다. (출처: TMDB)
        <div className="mt-2 text-xs text-white/45">
          평점 {head.avg} · 표본 {head.cnt}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-white/85 font-semibold">
          TMDB 평점 <span className="text-white">{head.avg}</span>
          <span className="text-white/45 text-xs"> · 표본 {head.cnt}</span>
        </div>
        <div className="text-xs text-white/45">출처: TMDB Reviews</div>
      </div>

      <div className="mt-3 space-y-3">
        {reviews.slice(0, 3).map((r, i) => (
          <div
            key={`${r.author}-${i}`}
            className="rounded-xl bg-white/5 hover:bg-white/7 transition p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white/85 truncate">
                {r.author || "익명"}
              </div>
              <div className="text-xs text-white/45">
                {r.created_at
                  ? new Date(r.created_at).toLocaleDateString()
                  : ""}
              </div>
            </div>
            <div className="mt-2 text-sm text-white/70 leading-relaxed line-clamp-4">
              {r.content || ""}
            </div>
            {r.url ? (
              <div className="mt-2">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-white/60 hover:text-white underline"
                >
                  원문 보기
                </a>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================
   Sections Wrapper
========================= */

type DetailLike = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  runtime?: number;
  episode_run_time?: number[];
  genres?: Array<{ id: number; name: string }>;
};

export function DetailSections({
  detail,
  mediaType,
  providersKR,
}: {
  detail: DetailLike;
  mediaType: MediaType;
  providersKR?: WatchProviderRegionLike | null;
}) {
  const title = useMemo(() => getDisplayTitle(detail as any), [detail]);

  const prefetchedOtt = useMemo(() => {
    if (!providersKR) return undefined;
    return normalizeWatchPayload(providersKR) ?? { link: providersKR.link };
  }, [providersKR]);

  return (
    <div className="w-full">
      <div className="space-y-10">
        <section className=" pt-8">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white/90 font-semibold">줄거리</div>
          </div>

          <div className="mt-4 text-sm text-white/70 leading-relaxed whitespace-pre-line">
            {detail.overview?.trim()
              ? detail.overview
              : "줄거리 정보가 없습니다."}
          </div>
        </section>

        <section className="pt-8">
          <DetailOttSection
            mediaType={mediaType}
            id={detail.id}
            title={title}
            prefetched={prefetchedOtt ?? undefined}
          />
        </section>

        <section className="pt-8">
          <div className="text-white/90 font-semibold mb-4">평점/리뷰</div>
          <DetailReviewsSection
            mediaType={mediaType}
            id={detail.id}
            voteAverage={detail.vote_average ?? null}
            voteCount={detail.vote_count ?? null}
          />
        </section>
      </div>
    </div>
  );
}
