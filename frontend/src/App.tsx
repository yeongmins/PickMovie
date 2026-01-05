// frontend/src/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Routes,
  Route,
  useNavigate,
  Navigate,
  useLocation,
} from "react-router-dom";

import type { UserPreferences } from "./features/onboarding/Onboarding";
import { MainScreen } from "./pages/MainScreen";
import FavoritesPage from "./pages/FavoritesPage";
import Picky from "./pages/Picky";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { MyPage } from "./pages/MyPage";
import { Info } from "./pages/support/Info";
import { Notices } from "./pages/support/Notices";
import { Legal } from "./pages/support/Legal";

import ContentDetailModal from "./pages/detail/ContentDetailModal";
import PersonDetail from "./pages/person/PersonDetail";

export interface FavoriteItem {
  id: number;
  mediaType: "movie" | "tv";
}

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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ 모달 라우팅: backgroundLocation이 있으면 "그 페이지 위에" 오버레이로 띄움
  const backgroundLocation = (location.state as any)?.backgroundLocation;

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

  // ✅ Picky에서만 쓰는 검색 입력 상태
  const [pickyQuery, setPickyQuery] = useState("");

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

    const currentToken = localStorage.getItem(STORAGE_KEYS.ACCESS);

    try {
      let accessToken: string | null = currentToken;

      // ✅ accessToken이 없을 때: "이전에 로그인한 적이 있는 경우에만" refresh 시도
      if (!accessToken) {
        const storedUser = localStorage.getItem(STORAGE_KEYS.USER);

        if (!storedUser) {
          clearAuthLocal();
          setMe(null);
          setFavorites([]);
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
        setFavorites(serverItems);
      } catch {
        setFavorites([]);
      }

      emitAuthChanged();
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 401 || err?.status === 403) {
        clearAuthLocal();
        setMe(null);
        setFavorites([]);
        emitAuthChanged();
      } else {
        if (!localStorage.getItem(STORAGE_KEYS.ACCESS)) {
          setMe(null);
          setFavorites([]);
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
        JSON.stringify(userPreferences)
      );
    }
  }, [userPreferences, isLoading]);

  useEffect(() => {
    if (isLoading) return;

    void bootstrapAuthAndFavorites();

    const onAuth = () => {
      if (bootingRef.current) return;

      const token = localStorage.getItem(STORAGE_KEYS.ACCESS);
      if (!token) {
        setMe(null);
        setFavorites([]);
        return;
      }
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
    void postJson("/auth/favorites/sync", { items: [] }).catch(() => {});
  }, [me, postJson]);

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
          setFavorites(prev);
        });

        return next;
      });
    },
    [me, navigate, postJson]
  );

  const isAuthed = !!me;

  // ✅ 상세 모달: 항상 동일 props로 렌더 (기본/오버레이 둘 다)
  const detailModalElement = (
    <ContentDetailModal
      favorites={favorites}
      onToggleFavorite={handleToggleFavorite}
      isAuthed={isAuthed}
    />
  );

  return (
    <>
      {/* ✅ 기본 화면 라우트 */}
      <Routes location={backgroundLocation || location}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-email/sent" element={<VerifyEmailPage />} />

        <Route path="/info" element={<Info />} />
        <Route path="/notices" element={<Notices />} />
        <Route path="/legal" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/legal/:section" element={<Legal />} />

        <Route path="/mypage" element={<MyPage />} />

        {/* ✅ 상세 URL: 직접 접근/새로고침도 가능 */}
        <Route path="/title/:mediaType/:id" element={detailModalElement} />

        {/* ✅ 배우 모달 URL: 직접 접근/새로고침도 가능 */}
        <Route path="/person/:id" element={<PersonDetail />} />

        <Route
          path="/picky"
          element={
            <Picky searchQuery={pickyQuery} onSearchChange={setPickyQuery} />
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

      {/* ✅ 오버레이 라우트: backgroundLocation이 있을 때만 "덮어서" 렌더 */}
      {backgroundLocation ? (
        <Routes>
          <Route
            path="/picky"
            element={
              <Picky searchQuery={pickyQuery} onSearchChange={setPickyQuery} />
            }
          />

          <Route path="/title/:mediaType/:id" element={detailModalElement} />
          <Route path="/person/:id" element={<PersonDetail />} />
        </Routes>
      ) : null}
    </>
  );
}
