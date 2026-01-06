// frontend/src/components/content/contentCard.hooks.ts
import { useEffect, useState } from "react";
import { apiGet } from "../../lib/apiClient";
import type {
  ReleaseStatusKind,
  ScreeningSets,
  TvLatestPayload,
} from "../../lib/contentMeta";
import {
  getUnifiedYearFromDetail,
  getUnifiedYearFromItem,
  isOttOnlyMovie,
  loadMovieRerunYear,
  loadScreeningSets,
  loadTvLatest,
  peekMovieRerunYear,
  peekOttOnlyMovie,
  peekScreeningSets,
  peekTvLatest,
  yearFromDate,
} from "../../lib/contentMeta";
import type { MediaType } from "./contentCard.types";

/* =========================
   ✅ 재개봉 판정(중요)
   - “1년/6개월” 같은 기간 기준 제거
   - KR 극장(Theatrical) 개봉일이 2개 이상이면 => 재개봉으로 판단할 수 있게 정보 제공
   - ContentCard/Detail에서 공통으로 쓰기 좋게 hook 제공
========================= */

type TmdbReleaseDateItem = {
  release_date?: string;
  type?: number;
};

type TmdbReleaseDatesResult = {
  iso_3166_1?: string;
  release_dates?: TmdbReleaseDateItem[];
};

type TmdbReleaseDatesResponse = {
  results?: TmdbReleaseDatesResult[];
};

export type MovieRerunInfo = {
  hasMultipleTheatrical: boolean;
  originalTheatricalDate: string; // YYYY-MM-DD
  rerunTheatricalDate: string; // YYYY-MM-DD
};

const _rerunInfoCache = new Map<string, MovieRerunInfo>();
const _rerunInfoInFlight = new Map<string, Promise<MovieRerunInfo>>();

function toYmd(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  // TMDB는 ISO datetime이 섞여 올 수 있음
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function extractTheatricalDates(
  res: TmdbReleaseDatesResponse | null,
  region: string
): string[] {
  const list = Array.isArray(res?.results) ? res!.results! : [];
  const bucket =
    list.find(
      (x) => String(x?.iso_3166_1 || "").toUpperCase() === region.toUpperCase()
    ) ?? null;

  const dates = Array.isArray(bucket?.release_dates)
    ? bucket!.release_dates!
    : [];

  // TMDB type: 2(Theatrical limited), 3(Theatrical)
  const theatrical = dates
    .filter((d) => {
      const t = Number(d?.type);
      return t === 2 || t === 3;
    })
    .map((d) => toYmd(d?.release_date))
    .filter(Boolean);

  const uniq = Array.from(new Set(theatrical));
  uniq.sort((a, b) => a.localeCompare(b)); // YYYY-MM-DD
  return uniq;
}

async function loadMovieRerunInfoNoThreshold(
  id: number,
  region: string
): Promise<MovieRerunInfo> {
  const key = `${id}:${region.toUpperCase()}`;
  const cached = _rerunInfoCache.get(key);
  if (cached) return cached;

  const inflight = _rerunInfoInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const res = await apiGet<TmdbReleaseDatesResponse>(
        `/tmdb/proxy/movie/${id}/release_dates`
      );

      const theatricalDates = extractTheatricalDates(res, region);

      const info: MovieRerunInfo = {
        hasMultipleTheatrical: theatricalDates.length >= 2,
        originalTheatricalDate: theatricalDates[0] ?? "",
        rerunTheatricalDate:
          theatricalDates.length >= 2
            ? theatricalDates[theatricalDates.length - 1] ?? ""
            : "",
      };

      _rerunInfoCache.set(key, info);
      return info;
    } catch {
      const info: MovieRerunInfo = {
        hasMultipleTheatrical: false,
        originalTheatricalDate: "",
        rerunTheatricalDate: "",
      };
      _rerunInfoCache.set(key, info);
      return info;
    } finally {
      _rerunInfoInFlight.delete(key);
    }
  })();

  _rerunInfoInFlight.set(key, p);
  return p;
}

export function useMovieRerunInfo(args: {
  mediaType: MediaType;
  id: number;
  enabled: boolean;
  region?: string;
}) {
  const { mediaType, id, enabled, region = "KR" } = args;

  const [info, setInfo] = useState<MovieRerunInfo>(() => {
    const key = `${id}:${region.toUpperCase()}`;
    return (
      _rerunInfoCache.get(key) ?? {
        hasMultipleTheatrical: false,
        originalTheatricalDate: "",
        rerunTheatricalDate: "",
      }
    );
  });

  useEffect(() => {
    let mounted = true;

    if (!enabled || mediaType !== "movie" || !Number.isFinite(id) || id <= 0) {
      setInfo({
        hasMultipleTheatrical: false,
        originalTheatricalDate: "",
        rerunTheatricalDate: "",
      });
      return () => void (mounted = false);
    }

    void (async () => {
      const next = await loadMovieRerunInfoNoThreshold(id, region);
      if (!mounted) return;
      setInfo(next);
    })();

    return () => {
      mounted = false;
    };
  }, [enabled, mediaType, id, region]);

  return info;
}

export function useScreeningSetsState() {
  const [screening, setScreening] = useState<ScreeningSets | null>(() => {
    return peekScreeningSets();
  });

  useEffect(() => {
    let mounted = true;
    loadScreeningSets()
      .then((s) => {
        if (!mounted) return;
        setScreening(s);
      })
      .catch(() => {
        if (!mounted) return;
        setScreening((prev) => prev ?? null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return screening;
}

export function useTvLatestState(mediaType: MediaType, id: number) {
  const [tvLatest, setTvLatest] = useState<TvLatestPayload | null>(() => {
    return mediaType === "tv" ? peekTvLatest(id) : null;
  });

  useEffect(() => {
    let mounted = true;

    if (mediaType !== "tv") {
      setTvLatest(null);
      return;
    }

    const cached = peekTvLatest(id);
    if (cached) setTvLatest(cached);

    loadTvLatest(id).then((r) => {
      if (!mounted) return;
      setTvLatest(r);
    });

    return () => {
      mounted = false;
    };
  }, [mediaType, id]);

  return tvLatest;
}

export function useOttOnlyState(id: number) {
  const [ottOnly, setOttOnly] = useState<boolean>(() => {
    return peekOttOnlyMovie(id, "KR") ?? false;
  });

  // ✅ (중요) 캐러셀/상세처럼 id가 바뀌는 경우에도 값이 꼬이지 않게 리셋
  useEffect(() => {
    setOttOnly(peekOttOnlyMovie(id, "KR") ?? false);
  }, [id]);

  return [ottOnly, setOttOnly] as const;
}

export function useSyncOttOnly(args: {
  mediaType: MediaType;
  id: number;
  statusKind: ReleaseStatusKind | null;
  setOttOnly: (v: boolean) => void;
}) {
  const { mediaType, id, statusKind, setOttOnly } = args;

  useEffect(() => {
    let mounted = true;

    if (mediaType !== "movie") {
      setOttOnly(false);
      return;
    }

    if (statusKind !== "now" && statusKind !== "rerun") {
      setOttOnly(false);
      return;
    }

    const cached = peekOttOnlyMovie(id, "KR");
    if (typeof cached === "boolean") {
      setOttOnly(cached);
      return;
    }

    isOttOnlyMovie(id, "KR").then((v) => {
      if (!mounted) return;
      setOttOnly(v);
    });

    return () => {
      mounted = false;
    };
  }, [statusKind, mediaType, id, setOttOnly]);
}

/** ✅ rerun일 때만 TMDB release_dates에서 최신 극장 year 로드(기존 유지) */
export function useMovieRerunYear(
  mediaType: MediaType,
  id: number,
  statusKind: ReleaseStatusKind | null,
  region: string = "KR"
) {
  const [rerunYear, setRerunYear] = useState<string>(() => {
    if (mediaType !== "movie" || statusKind !== "rerun") return "";
    return peekMovieRerunYear(id, region) ?? "";
  });

  useEffect(() => {
    let mounted = true;

    if (mediaType !== "movie" || statusKind !== "rerun") {
      setRerunYear("");
      return;
    }

    const cached = peekMovieRerunYear(id, region);
    if (cached) setRerunYear(cached);

    loadMovieRerunYear(id, region).then((y) => {
      if (!mounted) return;
      setRerunYear((y || "").trim());
    });

    return () => {
      mounted = false;
    };
  }, [mediaType, id, statusKind, region]);

  return rerunYear;
}

/** ✅ (카드/캐러셀) item 기반: “통일 year”를 그대로 반환(항상 "—" 포함) */
export function useUnifiedYearLabelFromItem(args: {
  item: any;
  mediaType: MediaType | null | undefined;
  tvLatest: TvLatestPayload | null;
  statusKind: ReleaseStatusKind | null;
  region?: string;
}) {
  const { item, mediaType, tvLatest, statusKind, region = "KR" } = args;

  const mt: MediaType =
    mediaType === "tv" || mediaType === "movie"
      ? mediaType
      : item?.first_air_date && !item?.release_date
      ? "tv"
      : "movie";

  // ✅ 재개봉(rerun)이어도 “출시년도”는 KR 최초 극장 개봉년도(earliest)
  const rerunInfo = useMovieRerunInfo({
    mediaType: mt,
    id: Number(item?.id || 0),
    enabled: mt === "movie" && statusKind === "rerun",
    region,
  });

  const originalYear =
    statusKind === "rerun"
      ? yearFromDate(rerunInfo.originalTheatricalDate) ||
        yearFromDate(item?.release_date) ||
        ""
      : "";

  return getUnifiedYearFromItem(item, mt, tvLatest, {
    statusKind,
    originalYear,
  });
}

/** ✅ (상세) detail 기반: “통일 year”를 그대로 반환(항상 "—" 포함) */
export function useUnifiedYearLabelFromDetail(args: {
  id: number;
  detail: any;
  mediaType: MediaType | null | undefined;
  statusKind: ReleaseStatusKind | null;
  region?: string;
}) {
  const { id, detail, mediaType, statusKind, region = "KR" } = args;

  const mt: MediaType =
    mediaType === "tv" || mediaType === "movie"
      ? mediaType
      : Array.isArray(detail?.seasons)
      ? "tv"
      : "movie";

  const rerunInfo = useMovieRerunInfo({
    mediaType: mt,
    id,
    enabled: mt === "movie" && statusKind === "rerun",
    region,
  });

  const originalYear =
    statusKind === "rerun"
      ? yearFromDate(rerunInfo.originalTheatricalDate) ||
        yearFromDate(detail?.release_date) ||
        ""
      : "";

  return getUnifiedYearFromDetail(detail, mt, { statusKind, originalYear });
}
