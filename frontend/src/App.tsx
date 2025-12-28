// frontend/src/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // ✅ favorites는 더 이상 저장/로드 안 함 (DB만 사용)
  PREFERENCES: "pickmovie_preferences",
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

// ✅ 이벤트명 통합(둘 다 수신/발신)
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

function readStoredUser(): MeUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) return null;
    return JSON.parse(raw) as MeUser;
  } catch {
    return null;
  }
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

  // ✅ bootstrap 중 이벤트 재진입 방지
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

  const clearAuthLocal = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS);
    localStorage.removeItem(STORAGE_KEYS.USER);
  }, []);

  const bootstrapAuthAndFavorites = useCallback(async () => {
    if (bootingRef.current) return;

    bootingRef.current = true;
    try {
      // 1) refresh로 accessToken 갱신(쿠키 기반)
      const refreshed = await postJson("/auth/refresh");
      const accessToken = (refreshed?.accessToken as string | null) ?? null;

      if (!accessToken) {
        clearAuthLocal();
        setMe(null);
        setFavorites([]);
        // ✅ Header 등 즉시 동기화
        emitAuthChanged();
        return;
      }

      localStorage.setItem(STORAGE_KEYS.ACCESS, accessToken);

      // 2) me 조회
      const meRes = await getJson("/auth/me");
      const user = (meRes?.user as MeUser | null) ?? null;

      if (!user) {
        clearAuthLocal();
        setMe(null);
        setFavorites([]);
        emitAuthChanged();
        return;
      }

      setMe(user);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

      // 3) ✅ favorites는 DB에서만 가져옴
      const favRes = await getJson("/auth/favorites");
      const serverItems = Array.isArray(favRes?.items)
        ? (favRes.items as FavoriteItem[])
        : [];

      setFavorites(serverItems);

      // ✅ 자동 로그인/갱신 시 Header도 즉시 반영
      emitAuthChanged();
    } catch {
      // 네트워크/서버 오류 시: 로그인 상태 확정 못하니 안전하게 비움
      clearAuthLocal();
      setMe(null);
      setFavorites([]);
      emitAuthChanged();
    } finally {
      bootingRef.current = false;
    }
  }, [clearAuthLocal, emitAuthChanged, getJson, postJson]);

  // 초기 로드 (preferences만 localStorage 유지)
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
        JSON.stringify(userPreferences)
      );
    }
  }, [userPreferences, isLoading]);

  // ✅ 앱 시작/로그인/로그아웃 이벤트마다 동기화
  useEffect(() => {
    if (isLoading) return;

    void bootstrapAuthAndFavorites();

    const onAuth = () => {
      if (bootingRef.current) return;

      const token = localStorage.getItem(STORAGE_KEYS.ACCESS);
      const storedUser = readStoredUser();

      // ✅ 로그아웃 이벤트면 즉시 UI에서 제거 (refresh로 다시 로그인 시도하지 않음)
      if (!token || !storedUser) {
        setMe(null);
        setFavorites([]);
        return;
      }

      // ✅ 로그인(또는 다른 탭에서 로그인) -> 서버 기준으로 재조회
      void bootstrapAuthAndFavorites();
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
  }, [isLoading, bootstrapAuthAndFavorites]);

  const handleResetFavorites = useCallback(() => {
    if (!me) {
      setFavorites([]);
      return;
    }

    setFavorites([]);
    void postJson("/auth/favorites/sync", { items: [] }).catch(() => {
      // ignore
    });
  }, [me, postJson]);

  // ✅ 찜 토글: 로그인 상태에서만 DB 반영
  const handleToggleFavorite = useCallback(
    (id: number, mediaType: "movie" | "tv" = "movie") => {
      if (!me) {
        navigate("/login");
        return;
      }

      setFavorites((prev) => {
        const exists = prev.some(
          (f) => f.id === id && f.mediaType === mediaType
        );
        const next = exists
          ? prev.filter((f) => !(f.id === id && f.mediaType === mediaType))
          : [{ id, mediaType }, ...prev];

        void postJson("/auth/favorites/set", {
          id,
          mediaType,
          isFavorite: !exists,
        }).catch(() => {
          // 실패 시 롤백
          setFavorites(prev);
        });

        return next;
      });
    },
    [me, navigate, postJson]
  );

  const isAuthed = !!me;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-email/sent" element={<VerifyEmailPage />} />

      <Route path="/mypage" element={<MyPage />} />

      <Route
        path="/picky"
        element={
          <PickyPage
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            isAuthed={isAuthed}
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
  );
}
