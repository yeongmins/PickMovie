// frontend/src/components/content/contentCard.hooks.ts

import { useEffect, useState } from "react";
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
} from "../../lib/contentMeta";
import type { MediaType } from "./contentCard.types";

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

/** ✅ rerun일 때만 TMDB release_dates에서 최신 극장 year 로드 */
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

  const rerunYear = useMovieRerunYear(
    mt,
    Number(item?.id || 0),
    statusKind,
    region
  );

  return getUnifiedYearFromItem(item, mt, tvLatest, { statusKind, rerunYear });
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

  const rerunYear = useMovieRerunYear(mt, id, statusKind, region);

  return getUnifiedYearFromDetail(detail, mt, { statusKind, rerunYear });
}
