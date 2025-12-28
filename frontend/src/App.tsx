// frontend/src/App.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";

import type { UserPreferences } from "./features/onboarding/Onboarding";
import { MainScreen } from "./pages/MainScreen";
import FavoritesPage from "./pages/FavoritesPage";
import { PickyPage } from "./pages/PickyPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { MyPage } from "./pages/MyPage";

export interface FavoriteItem {
  id: number;
  mediaType: "movie" | "tv";
}

const STORAGE_KEYS = {
  FAVORITES: "pickmovie_favorites",
  PREFERENCES: "pickmovie_preferences",
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
};

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

function uniqueFavorites(items: FavoriteItem[]) {
  const map = new Map<string, FavoriteItem>();
  for (const it of items) {
    const key = `${it.mediaType}:${it.id}`;
    map.set(key, it);
  }
  return Array.from(map.values());
}

export default function App() {
  const navigate = useNavigate();

  const API_BASE = useMemo(() => {
    return (
      (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:3000"
    );
  }, []);

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(
    createEmptyPreferences
  );
  const [me, setMe] = useState<MeUser | null>(null);

  const handleResetFavorites = useCallback(() => {
    setFavorites([]);
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
    [API_BASE, authHeaders]
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
    [API_BASE, authHeaders]
  );

  // ✅ id만 비교하면 movie/tv가 같은 id일 때 충돌 가능 → mediaType까지 같이 비교
  const handleToggleFavorite = useCallback(
    (id: number, mediaType: "movie" | "tv" = "movie") => {
      setFavorites((prev) => {
        const exists = prev.some(
          (f) => f.id === id && f.mediaType === mediaType
        );
        const next = exists
          ? prev.filter((f) => !(f.id === id && f.mediaType === mediaType))
          : [{ id, mediaType }, ...prev];

        // ✅ 로그인 상태면 서버에도 반영(실패해도 UI는 유지)
        if (me) {
          void postJson("/auth/favorites/set", {
            id,
            mediaType,
            isFavorite: !exists,
          }).catch(() => {
            // ignore
          });
        }

        return next;
      });
    },
    [me, postJson]
  );

  // 초기 로드 (localStorage)
  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      const savedPreferences = localStorage.getItem(STORAGE_KEYS.PREFERENCES);

      if (savedFavorites) {
        const parsed = JSON.parse(savedFavorites);

        // 마이그레이션(number[] -> FavoriteItem[])
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          typeof parsed[0] === "number"
        ) {
          const migrated = parsed.map((nid: number) => ({
            id: nid,
            mediaType: "movie" as const,
          }));
          setFavorites(migrated);
          localStorage.setItem(
            STORAGE_KEYS.FAVORITES,
            JSON.stringify(migrated)
          );
        } else {
          setFavorites(Array.isArray(parsed) ? parsed : []);
        }
      }

      if (savedPreferences) {
        setUserPreferences(JSON.parse(savedPreferences));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 자동 저장
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
    }
  }, [favorites, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(
        STORAGE_KEYS.PREFERENCES,
        JSON.stringify(userPreferences)
      );
    }
  }, [userPreferences, isLoading]);

  // ✅ 로그인 “체감” 강화: 앱 시작 시 refresh → me → favorites sync
  useEffect(() => {
    if (isLoading) return;

    const bootstrap = async () => {
      try {
        // 1) refresh로 accessToken 갱신(쿠키 기반)
        const refreshed = await postJson("/auth/refresh");
        const accessToken = refreshed?.accessToken as string | null;

        if (!accessToken) {
          setMe(null);
          return;
        }

        localStorage.setItem(STORAGE_KEYS.ACCESS, accessToken);

        // 2) me 조회
        const meRes = await getJson("/auth/me");
        const user = meRes?.user as MeUser | null;

        if (!user) {
          setMe(null);
          return;
        }

        setMe(user);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        window.dispatchEvent(new Event("pickmovie:auth"));

        // 3) 서버 favorites 가져와서 local과 merge 후 서버에 sync
        const server = await getJson("/auth/favorites");
        const serverItems = Array.isArray(server?.items)
          ? (server.items as FavoriteItem[])
          : [];

        const merged = uniqueFavorites([...favorites, ...serverItems]);

        // 서버에 merged로 교체(sync)
        const synced = await postJson("/auth/favorites/sync", {
          items: merged,
        });
        const finalItems = Array.isArray(synced?.items)
          ? (synced.items as FavoriteItem[])
          : merged;

        setFavorites(finalItems);
      } catch {
        // 실패해도 기존 로컬 UX는 유지
      }
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <Routes>
      {/* ✅ Auth Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-email/sent" element={<VerifyEmailPage />} />

      {/* ✅ MyPage */}
      <Route path="/mypage" element={<MyPage />} />

      <Route
        path="/picky"
        element={
          <PickyPage
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        }
      />

      {/* ✅ 홈 */}
      <Route
        path="/"
        element={
          <MainScreen
            userPreferences={userPreferences}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onReanalyze={() => navigate("/")}
            initialSection="home"
          />
        }
      />

      {/* ✅ 찜/플레이리스트 */}
      <Route
        path="/favorites"
        element={
          <FavoritesPage
            userPreferences={userPreferences}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onResetFavorites={handleResetFavorites}
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
          />
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
