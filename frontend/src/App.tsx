// frontend/src/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Routes,
  Route,
  useNavigate,
  Navigate,
  useLocation,
} from "react-router-dom";

import { Analyze, type UserPreferences } from "./features/analyze/Analyze";
import { MainScreen } from "./pages/MainScreen";
import FavoritesPlaylistPage from "./pages/favorites/FavoritesPlaylistPage";
import Search from "./pages/Search";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import { MyPage } from "./pages/MyPage";
import { Info } from "./pages/support/Info";

import ContentDetailModal from "./pages/detail/ContentDetailModal";
import PersonDetail from "./pages/person/PersonDetail";

export interface FavoriteItem {
  id: number;
  mediaType: "movie" | "tv";
}

type PlaylistItemDto = {
  id: number;
  mediaType: "movie" | "tv";
  addedAt: string;
};

export type PlaylistDto = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItemDto[];
};

const STORAGE_KEYS = {
  PREFERENCES: "pickmovie_preferences",
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

const AUTH_EVENT = "pickmovie-auth-changed" as const;
const LEGACY_AUTH_EVENT = "pickmovie:auth" as const;

const createEmptyPreferences = (): UserPreferences => ({
  genres: [],
  moods: [],
  runtime: "",
  releaseYear: "",
  country: "",
  excludes: [],
});

type MeUser = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
};

type ApiError = Error & { status?: number; data?: any };

function uniqFavoriteItems(items: FavoriteItem[]) {
  const map = new Map<string, FavoriteItem>();
  for (const it of items) {
    const mt = it.mediaType === "tv" ? "tv" : "movie";
    const id = Number(it.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    map.set(`${mt}:${id}`, { id, mediaType: mt });
  }
  return Array.from(map.values());
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const navState = (location.state as any) ?? {};

  const backgroundLocation = navState?.backgroundLocation ?? null;
  const titleStackLocation = navState?.titleStack ?? null;
  const isTitleOverSearch =
    location.pathname.startsWith("/title/") &&
    String(backgroundLocation?.pathname ?? "") === "/search";

  const searchOverlayLocation = useMemo(() => {
    // /search 단독 진입일 때는 base Routes에서만 렌더 (중복 overlay 렌더 방지)
    if (location.pathname === "/search" && backgroundLocation) return location;
    if (
      location.pathname.startsWith("/title/") &&
      String(backgroundLocation?.pathname ?? "") === "/search"
    ) {
      return backgroundLocation;
    }
    return null;
  }, [location, backgroundLocation]);

  const effectiveBaseLocation = useMemo(() => {
    if (!backgroundLocation) return location;
    if (!isTitleOverSearch) return backgroundLocation;
    const rootUnderSearch = (backgroundLocation.state as any)?.backgroundLocation;
    return rootUnderSearch ?? backgroundLocation;
  }, [backgroundLocation, isTitleOverSearch, location]);

  const API_BASE = useMemo(() => {
    return (
      (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:3000"
    );
  }, []);

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(
    createEmptyPreferences,
  );
  const [me, setMe] = useState<MeUser | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const bootingRef = useRef(false);

  const emitAuthChanged = useCallback(() => {
    window.dispatchEvent(new Event(LEGACY_AUTH_EVENT));
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, []);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const postJson = useCallback(
    async (path: string, body?: any) => {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: body ? JSON.stringify(body) : "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw Object.assign(new Error("API Error"), {
          status: res.status,
          data,
        });
      return data;
    },
    [API_BASE, authHeaders],
  );

  const getJson = useCallback(
    async (path: string) => {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers: { ...authHeaders() },
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw Object.assign(new Error("API Error"), {
          status: res.status,
          data,
        });
      return data;
    },
    [API_BASE, authHeaders],
  );

  const clearAuthLocal = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS);
    localStorage.removeItem(STORAGE_KEYS.USER);
  }, []);

  const bootstrapAuthAndLibrary = useCallback(async () => {
    if (bootingRef.current) return;
    bootingRef.current = true;

    const currentToken = localStorage.getItem(STORAGE_KEYS.ACCESS);

    try {
      let accessToken: string | null = currentToken;

      if (!accessToken) {
        const storedUser = localStorage.getItem(STORAGE_KEYS.USER);

        if (!storedUser) {
          clearAuthLocal();
          setMe(null);
          setFavorites([]);
          setPlaylists([]);
          emitAuthChanged();
          return;
        }

        const refreshed = await postJson("/auth/refresh");
        accessToken = (refreshed?.accessToken as string | null) ?? null;

        if (accessToken) localStorage.setItem(STORAGE_KEYS.ACCESS, accessToken);
      }

      if (!accessToken) {
        clearAuthLocal();
        setMe(null);
        setFavorites([]);
        setPlaylists([]);
        emitAuthChanged();
        return;
      }

      let meRes: any;
      try {
        meRes = await getJson("/auth/me");
      } catch (e) {
        const err = e as ApiError;
        if (err?.status === 401 || err?.status === 403) {
          const refreshed = await postJson("/auth/refresh");
          const newToken = (refreshed?.accessToken as string | null) ?? null;

          if (!newToken) {
            clearAuthLocal();
            setMe(null);
            setFavorites([]);
            setPlaylists([]);
            emitAuthChanged();
            return;
          }

          localStorage.setItem(STORAGE_KEYS.ACCESS, newToken);
          meRes = await getJson("/auth/me");
        } else {
          throw err;
        }
      }

      const user = (meRes?.user as MeUser | null) ?? null;
      if (!user) {
        clearAuthLocal();
        setMe(null);
        setFavorites([]);
        setPlaylists([]);
        emitAuthChanged();
        return;
      }

      setMe(user);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

      try {
        const favRes = await getJson("/auth/favorites");
        const serverItems = Array.isArray(favRes?.items)
          ? (favRes.items as FavoriteItem[])
          : [];
        setFavorites(uniqFavoriteItems(serverItems));
      } catch {
        setFavorites([]);
      }

      try {
        const plRes = await getJson("/auth/playlists");
        const serverPlaylists = Array.isArray(plRes?.playlists)
          ? (plRes.playlists as PlaylistDto[])
          : [];
        setPlaylists(serverPlaylists);
      } catch {
        setPlaylists([]);
      }

      emitAuthChanged();
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 401 || err?.status === 403) {
        clearAuthLocal();
        setMe(null);
        setFavorites([]);
        setPlaylists([]);
        emitAuthChanged();
      } else {
        if (!localStorage.getItem(STORAGE_KEYS.ACCESS)) {
          setMe(null);
          setFavorites([]);
          setPlaylists([]);
          emitAuthChanged();
        }
      }
    } finally {
      bootingRef.current = false;
    }
  }, [clearAuthLocal, emitAuthChanged, getJson, postJson]);

  useEffect(() => {
    try {
      const savedPreferences = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      if (savedPreferences) setUserPreferences(JSON.parse(savedPreferences));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(
        STORAGE_KEYS.PREFERENCES,
        JSON.stringify(userPreferences),
      );
    }
  }, [userPreferences, isLoading]);

  useEffect(() => {
    if (isLoading) return;

    void bootstrapAuthAndLibrary();

    const onAuth = () => {
      if (bootingRef.current) return;

      const token = localStorage.getItem(STORAGE_KEYS.ACCESS);
      if (!token) {
        setMe(null);
        setFavorites([]);
        setPlaylists([]);
        return;
      }
      void bootstrapAuthAndLibrary();
    };

    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener(LEGACY_AUTH_EVENT, onAuth);
    window.addEventListener("storage", onAuth);
    window.addEventListener("focus", onAuth);

    return () => {
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener(LEGACY_AUTH_EVENT, onAuth);
      window.removeEventListener("storage", onAuth);
      window.removeEventListener("focus", onAuth);
    };
  }, [isLoading, bootstrapAuthAndLibrary]);

  const handleResetFavorites = useCallback(() => {
    if (!me) {
      setFavorites([]);
      return;
    }

    setFavorites([]);
    void postJson("/auth/favorites/sync", { items: [] }).catch(() => {});
  }, [me, postJson]);

  const handleToggleFavorite = useCallback(
    (id: number, mediaType: "movie" | "tv" = "movie") => {
      if (!me) {
        navigate("/login");
        return;
      }

      const mt: FavoriteItem["mediaType"] = mediaType === "tv" ? "tv" : "movie";

      setFavorites((prev) => {
        const exists = prev.some((f) => f.id === id && f.mediaType === mt);

        const next: FavoriteItem[] = exists
          ? prev.filter((f) => !(f.id === id && f.mediaType === mt))
          : [{ id, mediaType: mt }, ...prev];

        void postJson("/auth/favorites/set", {
          id,
          mediaType: mt,
          isFavorite: !exists,
        }).catch(() => {
          setFavorites(prev);
        });

        return next;
      });
    },
    [me, navigate, postJson],
  );

  // =========================
  // ✅ Playlists handlers (DB)
  // =========================

  /**
   * ✅ 중복 생성 방지:
   * - "생성" 더블클릭 / Enter+클릭 등으로 create가 2번 호출되면 서버에 동일 플레이리스트가 2개 생김
   * - 여기서 payload 시그니처 기반으로 in-flight 중복 호출을 차단
   */
  const createPlaylistInFlightRef = useRef<Set<string>>(new Set());

  const createPlaylist = useCallback(
    async (name: string, items: FavoriteItem[]) => {
      const trimmed = name.trim();
      const xs = uniqFavoriteItems(items);
      if (!trimmed || xs.length === 0) return;

      const sig = (() => {
        const keys = xs
          .map((x) => `${x.mediaType}:${Number(x.id)}`)
          .filter(Boolean)
          .sort()
          .join(",");
        return `${trimmed}::${keys}`;
      })();

      if (createPlaylistInFlightRef.current.has(sig)) return;
      createPlaylistInFlightRef.current.add(sig);

      const prev = playlists;

      try {
        const res = await postJson("/auth/playlists/create", {
          name: trimmed,
          items: xs,
        });

        const playlist = (res?.playlist as PlaylistDto | undefined) ?? null;
        if (!playlist) {
          const plRes = await getJson("/auth/playlists").catch(() => null);
          const serverPlaylists = Array.isArray((plRes as any)?.playlists)
            ? ((plRes as any).playlists as PlaylistDto[])
            : [];
          if (serverPlaylists.length > 0) setPlaylists(serverPlaylists);
        } else {
          setPlaylists((p) => [
            playlist,
            ...p.filter((x) => x.id !== playlist.id),
          ]);
        }
      } catch {
        setPlaylists(prev);
      } finally {
        createPlaylistInFlightRef.current.delete(sig);
      }
    },
    [playlists, getJson, postJson],
  );

  const deletePlaylist = useCallback(
    async (playlistId: number) => {
      const pid = Number(playlistId);
      if (!Number.isFinite(pid) || pid <= 0) return;

      const prev = playlists;
      setPlaylists((p) => p.filter((x) => x.id !== pid));

      try {
        await postJson("/auth/playlists/delete", { playlistId: pid });
      } catch {
        setPlaylists(prev);
      }
    },
    [playlists, postJson],
  );

  const renamePlaylist = useCallback(
    async (playlistId: number, name: string) => {
      const pid = Number(playlistId);
      const trimmed = name.trim();
      if (!Number.isFinite(pid) || pid <= 0) return;
      if (!trimmed) return;

      const prev = playlists;
      setPlaylists((p) =>
        p.map((x) => (x.id === pid ? { ...x, name: trimmed } : x)),
      );

      try {
        const res = await postJson("/auth/playlists/rename", {
          playlistId: pid,
          name: trimmed,
        });
        const playlist = (res?.playlist as PlaylistDto | undefined) ?? null;
        if (playlist) {
          setPlaylists((p) => p.map((x) => (x.id === pid ? playlist : x)));
        }
      } catch {
        setPlaylists(prev);
      }
    },
    [playlists, postJson],
  );

  const setPlaylistItems = useCallback(
    async (playlistId: number, items: FavoriteItem[]) => {
      const pid = Number(playlistId);
      if (!Number.isFinite(pid) || pid <= 0) return;

      const xs = uniqFavoriteItems(items);
      const prev = playlists;

      setPlaylists((p) =>
        p.map((x) => (x.id === pid ? { ...x, items: xs as any } : x)),
      );

      try {
        const res = await postJson("/auth/playlists/items/set", {
          playlistId: pid,
          items: xs,
        });
        const playlist = (res?.playlist as PlaylistDto | undefined) ?? null;
        if (playlist) {
          setPlaylists((p) => p.map((x) => (x.id === pid ? playlist : x)));
        }
      } catch {
        setPlaylists(prev);
      }
    },
    [playlists, postJson],
  );

  const addItemsToPlaylist = useCallback(
    async (playlistId: number, items: FavoriteItem[]) => {
      const pid = Number(playlistId);
      if (!Number.isFinite(pid) || pid <= 0) return;

      const target = playlists.find((p) => p.id === pid);
      const existing = Array.isArray(target?.items) ? target!.items : [];
      const merged = uniqFavoriteItems([
        ...existing.map((it) => ({ id: it.id, mediaType: it.mediaType })),
        ...items,
      ]);

      await setPlaylistItems(pid, merged);
    },
    [playlists, setPlaylistItems],
  );

  const isAuthed = !!me;

  const analyzeInitialFavorites = useMemo(
    () =>
      favorites
        .filter((item) => item.mediaType === "movie")
        .map((item) => item.id),
    [favorites],
  );

  const openAnalyzeDetail = useCallback(
    (id: number, mediaType: "movie" | "tv" = "movie") => {
      navigate(`/title/${mediaType}/${id}`, {
        state: { backgroundLocation: location },
      });
    },
    [navigate, location],
  );

  const handleAnalyzeComplete = useCallback(
    (preferences: UserPreferences, favoriteMovieIds: number[]) => {
      setUserPreferences(preferences);

      const preservedTv = favorites.filter((item) => item.mediaType === "tv");
      const movieItems = favoriteMovieIds.map(
        (id): FavoriteItem => ({ id, mediaType: "movie" }),
      );
      const merged = uniqFavoriteItems([...preservedTv, ...movieItems]);

      setFavorites(merged);
      if (me) {
        void postJson("/auth/favorites/sync", { items: merged }).catch(() => {});
      }

      navigate("/", { replace: true });
    },
    [favorites, me, navigate, postJson],
  );

  const detailModalElement = (
    <ContentDetailModal
      favorites={favorites}
      onToggleFavorite={handleToggleFavorite}
      isAuthed={isAuthed}
    />
  );

  const isPersonOverlayOnDetail = !!backgroundLocation && !!titleStackLocation;

  return (
    <>
      <Routes location={effectiveBaseLocation}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-email/sent" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route path="/info" element={<Info />} />
        <Route
          path="/analyze"
          element={
            <Analyze
              onComplete={handleAnalyzeComplete}
              initialFavorites={analyzeInitialFavorites}
              isAuthed={isAuthed}
              favoriteMovieIds={analyzeInitialFavorites}
              onToggleFavorite={handleToggleFavorite}
              onCreatePlaylist={createPlaylist}
              onOpenDetail={openAnalyzeDetail}
            />
          }
        />
        <Route path="/onboarding" element={<Navigate to="/analyze" replace />} />
        <Route path="/legal" element={<Navigate to="/legal/terms" replace />} />

        <Route path="/settings" element={<MyPage />} />
        <Route path="/mypage" element={<Navigate to="/settings" replace />} />

        <Route path="/title/:mediaType/:id" element={detailModalElement} />
        <Route path="/person/:id" element={<PersonDetail />} />

        <Route
          path="/search"
          element={
            <Search
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onCreatePlaylist={createPlaylist}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
            />
          }
        />

        <Route
          path="/"
          element={
            <MainScreen
              userPreferences={userPreferences}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onReanalyze={() => navigate("/")}
              initialSection="home"
              isAuthed={isAuthed}
            />
          }
        />

        <Route
          path="/favorites"
          element={
            <FavoritesPlaylistPage
              userPreferences={userPreferences}
              favorites={favorites}
              playlists={playlists}
              onToggleFavorite={handleToggleFavorite}
              onResetFavorites={handleResetFavorites}
              onCreatePlaylist={createPlaylist}
              onDeletePlaylist={deletePlaylist}
              onRenamePlaylist={renamePlaylist}
              onSetPlaylistItems={setPlaylistItems}
              onAddItemsToPlaylist={addItemsToPlaylist}
            />
          }
        />

        <Route
          path="/popular-movies"
          element={
            <MainScreen
              userPreferences={userPreferences}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onReanalyze={() => navigate("/")}
              initialSection="popular-movies"
              isAuthed={isAuthed}
            />
          }
        />

        <Route
          path="/popular-tv"
          element={
            <MainScreen
              userPreferences={userPreferences}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onReanalyze={() => navigate("/")}
              initialSection="popular-tv"
              isAuthed={isAuthed}
            />
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {searchOverlayLocation ? (
        <Routes location={searchOverlayLocation}>
          <Route
            path="/search"
            element={
              <Search
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onCreatePlaylist={createPlaylist}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
              />
            }
          />
        </Routes>
      ) : null}

      {backgroundLocation ? (
        <>
          {titleStackLocation ? (
            <Routes location={titleStackLocation}>
              <Route
                path="/title/:mediaType/:id"
                element={detailModalElement}
              />
            </Routes>
          ) : null}

          {isPersonOverlayOnDetail ? (
            <Routes>
              <Route path="/person/:id" element={<PersonDetail />} />
            </Routes>
          ) : (
            <Routes>
              <Route
                path="/title/:mediaType/:id"
                element={detailModalElement}
              />
              <Route path="/person/:id" element={<PersonDetail />} />
            </Routes>
          )}
        </>
      ) : null}
    </>
  );
}
