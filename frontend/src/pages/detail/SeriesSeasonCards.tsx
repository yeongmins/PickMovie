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

// ✅ 시즌 찜 메타(플레이리스트 리팩토링 때 사용)
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

// ✅ 클릭 직후(시즌 상세 fetch 전)에도 히어로가 시즌 포스터/정보를 바로 쓰도록 seed 전달
type SeasonNavContext = {
  seasonNo: number;
  name?: string;
  poster_path?: string | null;
  air_date?: string | null;
  overview?: string | null;
  vote_average?: number | null;
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

  // ✅ 시즌별 하트 UI는 로컬(시즌 단위), 하지만 "실제 찜"은 TV(id)로 유지
  const [seasonFavs, setSeasonFavs] = useState<Set<string>>(() =>
    readSet(SEASON_FAV_STORAGE_KEY)
  );
  const [autoShowFav, setAutoShowFav] = useState<Set<string>>(() =>
    readSet(AUTO_SHOW_FAV_STORAGE_KEY)
  );

  // ✅ 시즌 상세 메타(포스터/air_date/vote_average 등)
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
          const meta = await fetchTVSeasonDetail(tvId, no, {
            language: "ko-KR",
          });
          return [no, meta] as const;
        })
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
    (seasonNo: number) => {
      return seasonFavs.has(`${tvId}:${seasonNo}`);
    },
    [seasonFavs, tvId]
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

        // ✅ 시즌 메타 저장/삭제 (플레이리스트 리팩토링 때 사용)
        const metaMap = readSeasonMetaMap();
        if (willBeOn) {
          const meta = seasonMeta[seasonNo];
          const fallback = (seasons || []).find(
            (s) => (s?.season_number ?? 0) === seasonNo
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

        // ✅ "실제 찜" 서버/전역 반영:
        // - 시즌을 처음 찜(ON)하는 순간, TV가 찜이 아니면 TV 찜을 켠다
        // - 시즌을 모두 해제했을 때 TV 찜을 자동으로 끄는 건 '자동으로 켰던 경우'만
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
              k.startsWith(`${tvId}:`)
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
    ]
  );

  const items = useMemo(() => {
    return (seasons || [])
      .filter((s) => (s?.season_number ?? 0) > 0)
      .map((s) => {
        const seasonNo = s.season_number ?? 0;
        const meta = seasonMeta[seasonNo];

        // ✅ 시즌 상세 메타 우선(없으면 TV detail seasons fallback)
        const poster = meta?.poster_path ?? s.poster_path ?? null;
        const airDate = meta?.air_date ?? s.air_date ?? undefined;
        const voteAvg =
          typeof meta?.vote_average === "number"
            ? meta.vote_average
            : undefined;

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
            overview: (meta as any)?.overview ?? null,
            vote_average:
              typeof voteAvg === "number"
                ? voteAvg
                : (meta as any)?.vote_average ?? null,
          },
        };

        return item;
      });
  }, [seasons, seasonMeta, tvId, tvTitle]);

  if (!items.length) return null;

  return (
    <div className="mt-5">
      <div className="mb-2 text-white/90 font-semibold">시리즈 / 시즌</div>

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
  );
}
