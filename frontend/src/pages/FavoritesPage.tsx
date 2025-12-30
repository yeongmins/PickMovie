// frontend/src/pages/FavoritesPage.tsx
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  lazy,
  Suspense,
  memo,
  useRef,
} from "react";
import { AnimatePresence } from "framer-motion";
import { Trash2, ListMusic, X, Loader2 } from "lucide-react";

import { Button } from "../components/ui/button";
import { ContentCard } from "../components/content/ContentCard";

import type { UserPreferences } from "../features/onboarding/Onboarding";
import type { FavoriteItem } from "../App";
import {
  getMovieDetails,
  getTVDetails,
  normalizeTVToMovie,
  getPosterUrl,
  calculateMatchScore,
  type TMDBMovie,
} from "../lib/tmdb";

// Header / Modal
const Header = lazy(() =>
  import("../components/layout/Header").then((m) => ({ default: m.Header }))
);
const MovieDetailModal = lazy(() =>
  import("../features/movies/components/MovieDetailModal").then((m) => ({
    default: m.MovieDetailModal,
  }))
);

type MediaType = "movie" | "tv";
type FavoriteKey = string; // "movie:123" | "tv:456" | "123"

type MediaItem = {
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
};

type PlaylistItem = {
  key: FavoriteKey;
  addedAt: number;
};

type Playlist = {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt: number;
  updatedAt: number;
};

const PLAYLISTS_LS_KEY = "pickmovie_playlists_v1";
const PLAYLISTS_LS_KEY_OLD = "pickmovie_playlists";

function safeJsonParse<T>(value: string | null, fallback: T): T {
  try {
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function uuid() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toKey(id: number, mediaType?: MediaType): FavoriteKey {
  return mediaType ? `${mediaType}:${id}` : String(id);
}

function parseKeySafe(key: unknown): { id: number; mediaType?: MediaType } {
  if (typeof key !== "string") return { id: NaN };
  if (key.includes(":")) {
    const [t, idStr] = key.split(":");
    const id = Number(idStr);
    if (t === "movie" || t === "tv") return { id, mediaType: t };
    return { id };
  }
  return { id: Number(key) };
}

function normalizePlaylistItem(input: any): PlaylistItem | null {
  const now = Date.now();

  if (typeof input === "string") return { key: input, addedAt: now };
  if (typeof input === "number") return { key: String(input), addedAt: now };

  if (input && typeof input === "object") {
    if (typeof input.key === "string") {
      return {
        key: input.key,
        addedAt: typeof input.addedAt === "number" ? input.addedAt : now,
      };
    }
    if (typeof input.id === "number") {
      const mt =
        input.mediaType === "movie" || input.mediaType === "tv"
          ? (input.mediaType as MediaType)
          : undefined;
      return { key: toKey(input.id, mt), addedAt: now };
    }
  }
  return null;
}

function normalizePlaylist(input: any): Playlist | null {
  if (!input || typeof input !== "object") return null;
  const id = typeof input.id === "string" ? input.id : uuid();
  const name = typeof input.name === "string" ? input.name : "플레이리스트";
  const createdAt =
    typeof input.createdAt === "number" ? input.createdAt : Date.now();
  const updatedAt =
    typeof input.updatedAt === "number" ? input.updatedAt : Date.now();

  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems
    .map(normalizePlaylistItem)
    .filter((x): x is PlaylistItem => x !== null);

  return { id, name, items, createdAt, updatedAt };
}

function loadPlaylists(): Playlist[] {
  if (typeof window === "undefined") return [];

  const v1raw = safeJsonParse<any[]>(
    localStorage.getItem(PLAYLISTS_LS_KEY),
    []
  );
  const oldRaw = safeJsonParse<any[]>(
    localStorage.getItem(PLAYLISTS_LS_KEY_OLD),
    []
  );

  const source = Array.isArray(v1raw) && v1raw.length ? v1raw : oldRaw;
  const normalized = (Array.isArray(source) ? source : [])
    .map(normalizePlaylist)
    .filter((p): p is Playlist => p !== null);

  localStorage.setItem(PLAYLISTS_LS_KEY, JSON.stringify(normalized));
  return normalized;
}

function savePlaylists(playlists: Playlist[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYLISTS_LS_KEY, JSON.stringify(playlists));
}

/* ------------------------------------------------------------------ */
/* PlaylistRow */
/* ------------------------------------------------------------------ */

type PlaylistRowProps = {
  playlist: Playlist;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

const PlaylistRow = memo(function PlaylistRow({
  playlist,
  active,
  onSelect,
  onDelete,
}: PlaylistRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`w-full rounded-xl border px-3 py-3 text-left transition cursor-pointer ${
        active
          ? "border-white/20 bg-white/10"
          : "border-white/10 bg-black/10 hover:bg-white/10"
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white line-clamp-1">
          {playlist.name}
        </div>
        <div className="text-xs text-white/50">{playlist.items.length}개</div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="text-xs text-white/40">
          업데이트: {new Date(playlist.updatedAt).toLocaleDateString()}
        </div>

        <button
          type="button"
          className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center"
          aria-label="플레이리스트 삭제"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4 text-white/70" />
        </button>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* FavoritesPlaylistsSection */
/* ------------------------------------------------------------------ */

type FavoritesPlaylistsSectionProps = {
  favorites: string[]; // "movie:1"
  favoriteItems: MediaItem[]; // 전체(플레이리스트 매칭용)
  onToggleFavorite: (id: number, mediaType?: MediaType) => void;
  onOpenDetail: (item: MediaItem) => void;
  onResetFavorites: () => void;
};

function FavoritesPlaylistsSection({
  favorites,
  favoriteItems,
  onToggleFavorite,
  onOpenDetail,
  onResetFavorites,
}: FavoritesPlaylistsSectionProps) {
  const [tab, setTab] = useState<"favorites" | "playlists">("favorites");

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const favoriteKeySet = useMemo(
    () => new Set<FavoriteKey>(favorites),
    [favorites]
  );

  const favoriteByKey = useMemo(() => {
    const map = new Map<FavoriteKey, MediaItem>();
    for (const item of favoriteItems) {
      map.set(toKey(item.id, item.media_type), item);
      map.set(String(item.id), item);
    }
    return map;
  }, [favoriteItems]);

  useEffect(() => {
    setPlaylists(loadPlaylists());
  }, []);

  useEffect(() => {
    savePlaylists(playlists);
  }, [playlists]);

  const activePlaylist = useMemo(() => {
    if (!activePlaylistId) return null;
    return playlists.find((p) => p.id === activePlaylistId) ?? null;
  }, [playlists, activePlaylistId]);

  const createPlaylist = useCallback(() => {
    const name = newName.trim();
    if (!name) return;

    const exists = playlists.some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) return;

    const now = Date.now();
    const next: Playlist = {
      id: uuid(),
      name,
      items: [],
      createdAt: now,
      updatedAt: now,
    };

    setPlaylists((prev) => [next, ...prev]);
    setNewName("");
    setTab("playlists");
    setActivePlaylistId(next.id);
  }, [newName, playlists]);

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    setActivePlaylistId((cur) => (cur === id ? null : cur));
  }, []);

  const removeFromPlaylist = useCallback(
    (playlistId: string, key: FavoriteKey) => {
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== playlistId) return p;
          const now = Date.now();
          return {
            ...p,
            items: p.items.filter((it) => it?.key !== key),
            updatedAt: now,
          };
        })
      );
    },
    []
  );

  const handleResetClick = () => {
    const ok = window.confirm("내 찜 목록을 모두 초기화할까요?");
    if (!ok) return;
    onResetFavorites();
  };

  // ✅ 중앙 몰림 방지
  const cardsGridClass =
    "w-full grid gap-4 justify-start content-start [grid-template-columns:repeat(auto-fit,minmax(160px,240px))]";
  const playlistCardsGridClass =
    "w-full grid gap-4 justify-start content-start [grid-template-columns:repeat(auto-fit,minmax(150px,220px))]";

  return (
    <section className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
            <button
              type="button"
              className={`px-3 py-2 rounded-lg text-sm ${
                tab === "favorites"
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:text-white"
              }`}
              onClick={() => setTab("favorites")}
            >
              내 찜
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-lg text-sm ${
                tab === "playlists"
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:text-white"
              }`}
              onClick={() => setTab("playlists")}
            >
              플레이리스트
            </button>
          </div>

          <button
            type="button"
            className="h-10 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80 flex items-center gap-2"
            onClick={handleResetClick}
            aria-label="내 찜 초기화"
          >
            <Trash2 className="h-4 w-4" />
            초기화
          </button>
        </div>

        {tab === "playlists" && (
          <form
            className="flex w-full sm:w-auto items-center gap-2 min-w-0"
            onSubmit={(e) => {
              e.preventDefault();
              createPlaylist();
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="플레이리스트 이름"
              className="h-10 flex-1 sm:w-52 min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
            />
            <Button type="submit" className="h-10 rounded-xl shrink-0">
              저장하기
            </Button>
          </form>
        )}
      </div>

      {tab === "favorites" ? (
        <>
          {favoriteItems.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/60">
              아직 찜한 콘텐츠가 없어.
            </div>
          ) : (
            <div className={cardsGridClass}>
              {favoriteItems.map((item) => {
                const k = toKey(item.id, item.media_type);
                const isFav =
                  favoriteKeySet.has(k) || favoriteKeySet.has(String(item.id));

                return (
                  <ContentCard
                    key={k}
                    item={item}
                    isFavorite={isFav}
                    onClick={() => onOpenDetail(item)}
                    onToggleFavorite={() =>
                      onToggleFavorite(item.id, item.media_type)
                    }
                    context="default"
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 rounded-2xl border border-white/10 bg-white/5 p-3 h-[72vh] overflow-y-auto">
            <div className="text-sm font-semibold text-white mb-2">
              내 플레이리스트
            </div>

            {playlists.length === 0 ? (
              <div className="text-sm text-white/60 p-3">
                플레이리스트가 없어. 위에서 생성해줘.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {playlists.map((p) => (
                  <PlaylistRow
                    key={p.id}
                    playlist={p}
                    active={activePlaylistId === p.id}
                    onSelect={() => setActivePlaylistId(p.id)}
                    onDelete={() => deletePlaylist(p.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 h-[72vh] flex flex-col">
            {!activePlaylist ? (
              <div className="text-white/60 flex items-center gap-2">
                <ListMusic className="h-5 w-5" />
                왼쪽에서 플레이리스트를 선택해줘.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <div>
                    <div className="text-lg font-bold text-white">
                      {activePlaylist.name}
                    </div>
                    <div className="text-xs text-white/50">
                      {activePlaylist.items.length}개 담김
                    </div>
                  </div>

                  <button
                    type="button"
                    className="h-10 px-3 rounded-xl border border-white/10 hover:bg-white/10 text-sm text-white/80 flex items-center gap-2"
                    onClick={() => setActivePlaylistId(null)}
                  >
                    <X className="h-4 w-4" />
                    닫기
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {activePlaylist.items.length === 0 ? (
                    <div className="text-white/60">아직 담긴 항목이 없어.</div>
                  ) : (
                    <div className={playlistCardsGridClass}>
                      {activePlaylist.items
                        .filter((it) => it && typeof it.key === "string")
                        .map((it) => {
                          const item = favoriteByKey.get(it.key);

                          if (!item) {
                            const { id, mediaType } = parseKeySafe(it.key);
                            const label =
                              Number.isFinite(id) && mediaType
                                ? `${mediaType}:${id}`
                                : String(it.key);

                            return (
                              <div
                                key={it.key}
                                className="rounded-xl border border-white/10 bg-black/10 p-3"
                              >
                                <div className="text-sm text-white/70">
                                  데이터 없음
                                </div>
                                <div className="text-xs text-white/40 mt-1">
                                  {label}
                                </div>
                                <button
                                  type="button"
                                  className="mt-3 w-full h-9 rounded-lg border border-white/10 hover:bg-white/10 text-sm text-white/80 flex items-center justify-center gap-2"
                                  onClick={() =>
                                    removeFromPlaylist(
                                      activePlaylist.id,
                                      it.key
                                    )
                                  }
                                >
                                  <X className="h-4 w-4" />
                                  제거
                                </button>
                              </div>
                            );
                          }

                          const k = toKey(item.id, item.media_type);
                          const isFav =
                            favoriteKeySet.has(k) ||
                            favoriteKeySet.has(String(item.id));

                          return (
                            <ContentCard
                              key={it.key}
                              item={item}
                              isFavorite={isFav}
                              onClick={() => onOpenDetail(item)}
                              onToggleFavorite={() =>
                                onToggleFavorite(item.id, item.media_type)
                              }
                              onRemove={() =>
                                removeFromPlaylist(activePlaylist.id, it.key)
                              }
                              context="default"
                            />
                          );
                        })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FavoritesPage */
/* ------------------------------------------------------------------ */

type FavoritesPageProps = {
  userPreferences: UserPreferences;
  favorites: FavoriteItem[];
  onToggleFavorite: (movieId: number, mediaType?: "movie" | "tv") => void;
  onResetFavorites: () => void;
};

function buildGenreString(details: any): string {
  const list = details?.genres;
  if (Array.isArray(list) && list.length) {
    return list
      .map((g: any) => g?.name)
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

export default function FavoritesPage({
  userPreferences,
  favorites,
  onToggleFavorite,
  onResetFavorites,
}: FavoritesPageProps) {
  const [favoriteItems, setFavoriteItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);

  const hasLoadedOnceRef = useRef(false);
  const itemCacheRef = useRef<Map<string, MediaItem>>(new Map());

  const favoriteKeys = useMemo(
    () => favorites.map((f) => `${f.mediaType}:${f.id}`),
    [favorites]
  );

  const loadFavoriteItems = useCallback(async () => {
    if (!favorites.length) {
      setFavoriteItems([]);
      itemCacheRef.current.clear();
      setLoading(false);
      hasLoadedOnceRef.current = true;
      return;
    }

    if (!hasLoadedOnceRef.current) setLoading(true);

    const wantedKeys = favorites.map((f) => toKey(f.id, f.mediaType));
    const cache = itemCacheRef.current;

    const missing = favorites
      .map((f, idx) => ({ f, key: wantedKeys[idx] }))
      .filter(({ key }) => !cache.has(key));

    if (missing.length === 0) {
      setFavoriteItems(
        wantedKeys.map((k) => cache.get(k)!).filter(Boolean) as MediaItem[]
      );
      setLoading(false);
      hasLoadedOnceRef.current = true;
      return;
    }

    try {
      const fetched = await Promise.all(
        missing.map(async ({ f, key }) => {
          try {
            const detail =
              f.mediaType === "tv"
                ? await getTVDetails(f.id)
                : await getMovieDetails(f.id);
            if (!detail) return { key, item: null as MediaItem | null };

            const genreIds = Array.isArray((detail as any)?.genres)
              ? (detail as any).genres.map((g: any) => g?.id).filter(Boolean)
              : undefined;

            if (f.mediaType === "tv") {
              const norm = normalizeTVToMovie(detail) as any;
              const item: MediaItem = {
                id: norm.id,
                title: norm.title,
                name: norm.name,
                original_title: norm.original_title,
                original_name: norm.original_name,
                poster_path: norm.poster_path ?? null,
                vote_average: norm.vote_average,
                release_date: norm.release_date,
                first_air_date: (detail as any).first_air_date,
                media_type: "tv",
                genre_ids: genreIds,
              };
              return { key, item };
            }

            const item: MediaItem = {
              id: (detail as any).id,
              title: (detail as any).title,
              name: (detail as any).name,
              original_title: (detail as any).original_title,
              original_name: (detail as any).original_name,
              poster_path: (detail as any).poster_path ?? null,
              vote_average: (detail as any).vote_average,
              release_date: (detail as any).release_date,
              first_air_date: (detail as any).first_air_date,
              media_type: "movie",
              genre_ids: genreIds,
            };
            return { key, item };
          } catch {
            return { key, item: null as MediaItem | null };
          }
        })
      );

      for (const r of fetched) {
        if (r.item) itemCacheRef.current.set(r.key, r.item);
      }

      const finalList = wantedKeys
        .map((k) => itemCacheRef.current.get(k) ?? null)
        .filter(Boolean) as MediaItem[];

      setFavoriteItems(finalList);
    } finally {
      setLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }, [favorites]);

  useEffect(() => {
    loadFavoriteItems();
  }, [loadFavoriteItems]);

  useEffect(() => {
    if (favorites.length === 0) {
      setSelectedMovie(null);
      setFavoriteItems([]);
      itemCacheRef.current.clear();
    }
  }, [favorites.length]);

  const handleOpenDetail = useCallback(
    async (item: MediaItem) => {
      try {
        const details =
          item.media_type === "tv"
            ? await getTVDetails(item.id)
            : await getMovieDetails(item.id);

        const merged = { ...item, ...(details || {}) };
        const genre = buildGenreString(details);

        setSelectedMovie({
          ...merged,
          genre,
          poster: getPosterUrl(
            merged.poster_path || (details as any)?.poster_path,
            "w500"
          ),
          tmdbId: item.id,
          mediaType: item.media_type || "movie",
          vote_average:
            typeof merged.vote_average === "number" ? merged.vote_average : 0,
          matchScore: calculateMatchScore(merged as TMDBMovie, userPreferences),
        });
      } catch (e) {
        console.error(e);
      }
    },
    [userPreferences]
  );

  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="min-h-screen bg-[#1a1a24] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-purple-400" />
      </div>
    );
  }

  const shellClass = "mx-auto w-full px-4 mt-4";

  return (
    <div className="min-h-screen bg-[#1a1a24] text-white overflow-x-hidden">
      <Suspense fallback={<div className="h-16" />}>
        <Header currentSection="favorites" />
      </Suspense>

      <main className={`page-fade-in pt-24 pb-20 ${shellClass}`}>
        <FavoritesPlaylistsSection
          favorites={favoriteKeys}
          favoriteItems={favoriteItems}
          onToggleFavorite={(id, type) =>
            onToggleFavorite(id, (type ?? "movie") as "movie" | "tv")
          }
          onOpenDetail={handleOpenDetail}
          onResetFavorites={onResetFavorites}
        />
      </main>

      <AnimatePresence>
        {selectedMovie && (
          <Suspense fallback={null}>
            <MovieDetailModal
              movie={selectedMovie}
              onClose={() => setSelectedMovie(null)}
              isFavorite={favoriteKeys.includes(
                `${selectedMovie.mediaType}:${selectedMovie.id}`
              )}
              onToggleFavorite={() =>
                onToggleFavorite(selectedMovie.id, selectedMovie.mediaType)
              }
              userPreferences={userPreferences}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
