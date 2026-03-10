// frontend/src/pages/detail/SeriesSeasonCards.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiGet } from "../../lib/apiClient";
import { openAuthModal } from "../../lib/auth";
import {
  ContentCard,
  type ContentCardItem,
} from "../../components/content/ContentCard";
import { useDetailFavorites } from "./detailFavorites.context";

type SeasonLike = {
  name?: string;
  season_number?: number;
  air_date?: string | null;
  poster_path?: string | null;
};

const SEASON_FAV_STORAGE_KEY = "pickmovie_favorite_tv_seasons_v1";
const AUTO_SHOW_FAV_STORAGE_KEY = "pickmovie_favorite_tv_seasons_auto_tv_v1";
const SEASON_FAV_META_STORAGE_KEY = "pickmovie_favorite_tv_season_meta_v1";

type SeasonFavMeta = {
  tvId: number;
  tvTitle: string;
  seasonNo: number;
  seasonName?: string;
  poster_path?: string | null;
  air_date?: string | null;
  vote_average?: number | null;
  updatedAt: number;
};

type SeasonNavContext = {
  seasonNo: number;
  name?: string;
  poster_path?: string | null;
  air_date?: string | null;
  overview?: string | null;
  vote_average?: number | null;
  year?: number | null;

  // ✅ DetailSections로 전달할 "시리즈 원본 first_air_date"
  original_first_air_date?: string;
};

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x)).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

function readSeasonMetaMap(): Record<string, SeasonFavMeta> {
  try {
    const raw = localStorage.getItem(SEASON_FAV_META_STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj as Record<string, SeasonFavMeta>;
  } catch {
    return {};
  }
}

function writeSeasonMetaMap(map: Record<string, SeasonFavMeta>) {
  try {
    localStorage.setItem(SEASON_FAV_META_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function ymdToYear(ymd?: string | null): number | null {
  const raw = String(ymd || "").trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).getFullYear();
}

async function pMapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let idx = 0;

  const workers = new Array(Math.max(1, Math.min(limit, items.length)))
    .fill(0)
    .map(async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await mapper(items[cur], cur);
      }
    });

  await Promise.all(workers);
  return out;
}

export function SeriesSeasonCards({
  tvId,
  tvTitle,
  seasons,
  originalFirstAirDate,
}: {
  tvId: number;
  tvTitle: string;
  seasons: SeasonLike[];
  originalFirstAirDate?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const { favorites, isAuthed, toggleFavorite } = useDetailFavorites();

  const [seasonFavs, setSeasonFavs] = useState<Set<string>>(() =>
    readSet(SEASON_FAV_STORAGE_KEY),
  );
  const [autoShowFav, setAutoShowFav] = useState<Set<string>>(() =>
    readSet(AUTO_SHOW_FAV_STORAGE_KEY),
  );
  void autoShowFav;

  const [seasonDetailMap, setSeasonDetailMap] = useState<
    Record<
      number,
      {
        vote_average?: number | null;
        air_date?: string | null;
        poster_path?: string | null;
      }
    >
  >({});

  useEffect(() => {
    let alive = true;

    const targets = (seasons || [])
      .map((s) => Number(s?.season_number ?? 0))
      .filter((n) => n > 0);

    if (!targets.length) {
      setSeasonDetailMap({});
      return () => void (alive = false);
    }

    void (async () => {
      try {
        const settled = await pMapLimit(
          targets,
          4,
          async (seasonNo): Promise<[number, any] | null> => {
            try {
              const r = await apiGet<any>(
                `/tmdb/proxy/tv/${tvId}/season/${seasonNo}`,
                { language: "ko-KR" },
              );
              return [
                seasonNo,
                {
                  vote_average:
                    typeof r?.vote_average === "number" ? r.vote_average : null,
                  air_date: r?.air_date ?? null,
                  poster_path: r?.poster_path ?? null,
                },
              ];
            } catch {
              return [seasonNo, {}];
            }
          },
        );

        if (!alive) return;

        const next: Record<number, any> = {};
        for (const row of settled) {
          if (!row) continue;
          const [k, v] = row;
          next[k] = v ?? {};
        }
        setSeasonDetailMap(next);
      } catch {
        if (!alive) return;
        setSeasonDetailMap({});
      }
    })();

    return () => void (alive = false);
  }, [tvId, seasons]);

  const isSeasonFavorite = useCallback(
    (seasonNo: number) => seasonFavs.has(`${tvId}:${seasonNo}`),
    [seasonFavs, tvId],
  );

  const showIsFavorite = useMemo(() => {
    return favorites.some((f) => f?.id === tvId && f?.mediaType === "tv");
  }, [favorites, tvId]);

  const toggleSeasonFavorite = useCallback(
    (seasonNo: number, seasonLike?: SeasonLike) => {
      if (!isAuthed) {
        openAuthModal("login");
        return;
      }

      const key = `${tvId}:${seasonNo}`;

      setSeasonFavs((prev) => {
        const next = new Set(prev);

        const willBeOn = !next.has(key);
        if (willBeOn) next.add(key);
        else next.delete(key);

        writeSet(SEASON_FAV_STORAGE_KEY, next);

        const metaMap = readSeasonMetaMap();
        if (willBeOn) {
          metaMap[key] = {
            tvId,
            tvTitle,
            seasonNo,
            seasonName: (seasonLike?.name ?? "").trim() || undefined,
            poster_path: seasonLike?.poster_path ?? null,
            air_date: seasonLike?.air_date ?? null,
            vote_average: null,
            updatedAt: Date.now(),
          };
        } else {
          delete metaMap[key];
        }
        writeSeasonMetaMap(metaMap);

        setAutoShowFav((prevAuto) => {
          const nextAuto = new Set(prevAuto);
          const autoKey = String(tvId);

          if (willBeOn) {
            if (!showIsFavorite) {
              toggleFavorite(tvId, "tv");
              nextAuto.add(autoKey);
            }
          } else {
            const hasAnySeasonLeft = Array.from(next).some((k) =>
              k.startsWith(`${tvId}:`),
            );
            if (!hasAnySeasonLeft && nextAuto.has(autoKey)) {
              if (showIsFavorite) toggleFavorite(tvId, "tv");
              nextAuto.delete(autoKey);
            }
          }

          writeSet(AUTO_SHOW_FAV_STORAGE_KEY, nextAuto);
          return nextAuto;
        });

        return next;
      });
    },
    [isAuthed, navigate, tvId, tvTitle, showIsFavorite, toggleFavorite],
  );

  const items = useMemo(() => {
    return (seasons || [])
      .filter((s) => Number(s?.season_number ?? 0) > 0)
      .map((s) => {
        const seasonNo = Number(s?.season_number ?? 0);
        const extra = seasonDetailMap[seasonNo] ?? {};

        const airDate = (extra.air_date ?? s.air_date ?? null) as string | null;
        const year = ymdToYear(airDate);

        const posterPath = (extra.poster_path ?? s.poster_path ?? null) as
          | string
          | null;

        const item: ContentCardItem & {
          __seasonNo: number;
          __seasonNavContext: SeasonNavContext;
          __forceItemPoster: boolean;
          __yearLabel: string;
        } = {
          id: tvId,
          media_type: "tv",

          name: `${tvTitle} ${seasonNo}`,
          poster_path: (posterPath ?? null) as any,
          first_air_date: airDate ?? undefined,

          vote_average:
            typeof extra.vote_average === "number"
              ? extra.vote_average
              : undefined,

          __seasonNo: seasonNo,
          __seasonNavContext: {
            seasonNo,
            name: (s?.name ?? "").trim() || undefined,
            poster_path: posterPath ?? null,
            air_date: airDate ?? null,
            overview: null,
            vote_average:
              typeof extra.vote_average === "number"
                ? extra.vote_average
                : null,
            year: year ?? null,

            // ✅ [핵심] 항상 유지되는 원본 first_air_date를 다음 페이지 state로 전달
            original_first_air_date: originalFirstAirDate,
          },

          __forceItemPoster: true,
          __yearLabel: year ? String(year) : "—",
        };

        return item;
      });
  }, [seasons, tvId, tvTitle, seasonDetailMap, originalFirstAirDate]);

  if (!items.length) return null;

  const rightInfo = (
    <span className="text-white/35 text-[12px] font-semibold">
      총 {items.length}개
    </span>
  );

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-white/90 font-extrabold text-[16px]">
          시리즈 / 시즌
        </h3>
        <div className="shrink-0">{rightInfo}</div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {items.map((item) => {
            const seasonNo = (item as any).__seasonNo as number;

            const st = location.state as any;
            const bg = st?.backgroundLocation ?? null;
            const root = st?.rootLocation ?? bg;

            const seasonContext = (item as any)
              .__seasonNavContext as SeasonNavContext;

            const seasonLike = (seasons || []).find(
              (x) => Number(x?.season_number ?? 0) === seasonNo,
            );

            return (
              <div key={`season-${seasonNo}`} className="shrink-0">
                <ContentCard
                  item={item}
                  isFavorite={isSeasonFavorite(seasonNo)}
                  canFavorite={isAuthed}
                  onToggleFavorite={() =>
                    toggleSeasonFavorite(seasonNo, seasonLike)
                  }
                  onClick={() => {
                    const nextState = root
                      ? {
                          backgroundLocation: root,
                          rootLocation: root,
                          seasonContext,
                        }
                      : { seasonContext };

                    navigate(`/title/tv/${tvId}?season=${seasonNo}`, {
                      state: nextState,
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
