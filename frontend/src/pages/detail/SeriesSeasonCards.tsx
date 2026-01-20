// frontend/src/pages/detail/SeriesSeasonCards.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  ContentCard,
  type ContentCardItem,
} from "../../components/content/ContentCard";
import { useDetailFavorites } from "./detailFavorites.context";
import { fetchTVSeasonDetail, type TmdbTvSeasonDetail } from "../../lib/tmdb";

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

function yearFromIsoDate(v?: string | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

// ✅ poster_path가 비어있을 때 ko→en fallback
async function fetchSeasonDetailWithFallback(
  tvId: number,
  seasonNo: number,
): Promise<TmdbTvSeasonDetail | null> {
  const ko = await fetchTVSeasonDetail(tvId, seasonNo, { language: "ko-KR" });
  const koPoster = (ko as any)?.poster_path ?? null;
  if (ko && koPoster) return ko;

  const en = await fetchTVSeasonDetail(tvId, seasonNo, { language: "en-US" });
  const enPoster = (en as any)?.poster_path ?? null;
  if (en && enPoster) return en;

  return ko ?? en ?? null;
}

export function SeriesSeasonCards({
  tvId,
  tvTitle,
  seasons,
}: {
  tvId: number;
  tvTitle: string;
  seasons: SeasonLike[];
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

  const [seasonMeta, setSeasonMeta] = useState<
    Record<number, TmdbTvSeasonDetail>
  >({});

  const seasonNos = useMemo(() => {
    return (seasons || [])
      .map((s) => Number(s?.season_number))
      .filter((n) => Number.isFinite(n) && n > 0) as number[];
  }, [seasons]);

  useEffect(() => {
    let alive = true;

    setSeasonMeta({});

    if (!tvId || !seasonNos.length) return () => void (alive = false);

    void (async () => {
      const pairs = await Promise.all(
        seasonNos.map(async (no) => {
          try {
            const meta = await fetchSeasonDetailWithFallback(tvId, no);
            return [no, meta] as const;
          } catch {
            return [no, null] as const;
          }
        }),
      );

      if (!alive) return;

      const map: Record<number, TmdbTvSeasonDetail> = {};
      for (const [no, meta] of pairs) {
        if (meta) map[no] = meta;
      }
      setSeasonMeta(map);
    })();

    return () => {
      alive = false;
    };
  }, [tvId, seasonNos.join(",")]);

  const isSeasonFavorite = useCallback(
    (seasonNo: number) => seasonFavs.has(`${tvId}:${seasonNo}`),
    [seasonFavs, tvId],
  );

  const showIsFavorite = useMemo(() => {
    return favorites.some((f) => f?.id === tvId && f?.mediaType === "tv");
  }, [favorites, tvId]);

  const toggleSeasonFavorite = useCallback(
    (seasonNo: number) => {
      if (!isAuthed) {
        navigate("/login");
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
          const meta = seasonMeta[seasonNo] as any;
          const fallback = (seasons || []).find(
            (s) => (s?.season_number ?? 0) === seasonNo,
          );

          metaMap[key] = {
            tvId,
            tvTitle,
            seasonNo,
            seasonName:
              (meta?.name ?? fallback?.name ?? "").trim() || undefined,
            poster_path: meta?.poster_path ?? fallback?.poster_path ?? null,
            air_date: meta?.air_date ?? fallback?.air_date ?? null,
            vote_average:
              typeof meta?.vote_average === "number" ? meta.vote_average : null,
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
    [
      isAuthed,
      navigate,
      tvId,
      tvTitle,
      seasons,
      seasonMeta,
      showIsFavorite,
      toggleFavorite,
    ],
  );

  const items = useMemo(() => {
    return (seasons || [])
      .filter((s) => (s?.season_number ?? 0) > 0)
      .map((s) => {
        const seasonNo = s.season_number ?? 0;
        const meta = seasonMeta[seasonNo] as any;

        const poster = (meta?.poster_path ?? s.poster_path ?? null) as
          | string
          | null;

        const airDate = (meta?.air_date ?? s.air_date ?? null) as string | null;

        const voteAvg =
          typeof meta?.vote_average === "number"
            ? meta.vote_average
            : undefined;

        const y = yearFromIsoDate(airDate);

        const item: ContentCardItem & {
          __seasonNo: number;
          __preferItemPoster: boolean;
          __preferItemYear: boolean;
          __seasonNavContext: SeasonNavContext;
        } = {
          id: tvId,
          media_type: "tv",
          name: `${tvTitle} ${seasonNo}`,
          poster_path: poster,
          first_air_date: airDate ?? undefined,
          vote_average: voteAvg,

          __seasonNo: seasonNo,
          __preferItemPoster: true,
          __preferItemYear: true,
          __seasonNavContext: {
            seasonNo,
            name: (meta?.name ?? s?.name ?? "").trim() || undefined,
            poster_path: poster,
            air_date: airDate ?? null,
            overview: meta?.overview ?? null,
            vote_average:
              typeof voteAvg === "number"
                ? voteAvg
                : (meta?.vote_average ?? null),
            year: y,
          },
        };

        return item;
      });
  }, [seasons, seasonMeta, tvId, tvTitle]);

  if (!items.length) return null;

  // ✅ DetailSections의 Section 스타일과 동일하게 맞춤
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

            return (
              <div key={`season-${seasonNo}`} className="shrink-0">
                <ContentCard
                  item={item}
                  isFavorite={isSeasonFavorite(seasonNo)}
                  canFavorite={isAuthed}
                  onToggleFavorite={() => toggleSeasonFavorite(seasonNo)}
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
