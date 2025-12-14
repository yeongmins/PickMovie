// App.tsx (핵심 패치 예시)
// ✅ 반드시 Hook들은 App() 함수 내부에 있어야 함

import { useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import type { UserPreferences } from "./features/onboarding/Onboarding";
import { MainScreen } from "./pages/MainScreen";
import { PickyPage } from "./features/picky/PickyPage";

export interface FavoriteItem {
  id: number;
  mediaType: "movie" | "tv";
}

const STORAGE_KEYS = {
  FAVORITES: "pickmovie_favorites",
  PREFERENCES: "pickmovie_preferences",
};

const createEmptyPreferences = (): UserPreferences => ({
  genres: [],
  moods: [],
  runtime: "",
  releaseYear: "",
  country: "",
  excludes: [],
});

function getInitialSection(pathname: string) {
  if (pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/popular-movies")) return "popular-movies";
  if (pathname.startsWith("/popular-tv")) return "popular-tv";
  return "home";
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Hook은 무조건 컴포넌트 내부
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(
    createEmptyPreferences
  );

  const initialSection = useMemo(
    () => getInitialSection(location.pathname) as any,
    [location.pathname]
  );

  const handleResetFavorites = useCallback(() => {
    setFavorites([]);
  }, []);

  const handleToggleFavorite = useCallback(
    (id: number, mediaType: "movie" | "tv" = "movie") => {
      setFavorites((prev) => {
        const exists = prev.some((f) => f.id === id);
        if (exists) return prev.filter((f) => f.id !== id);
        return [{ id, mediaType }, ...prev];
      });
    },
    []
  );

  // 초기 로드
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
          setFavorites(parsed || []);
        }
      }

      if (savedPreferences) setUserPreferences(JSON.parse(savedPreferences));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 자동 저장
  useEffect(() => {
    if (!isLoading)
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
  }, [favorites, isLoading]);

  useEffect(() => {
    if (!isLoading)
      localStorage.setItem(
        STORAGE_KEYS.PREFERENCES,
        JSON.stringify(userPreferences)
      );
  }, [userPreferences, isLoading]);

  return (
    <Routes>
      <Route
        path="/picky"
        element={
          <PickyPage
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        }
      />

      {/* MainScreen 라우팅 (프로젝트 기존 라우트 유지하고 싶으면 여기만 맞춰줘) */}
      <Route
        path="/"
        element={
          <MainScreen
            userPreferences={userPreferences}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onReanalyze={() => navigate("/")}
            initialSection={initialSection}
          />
        }
      />
      <Route
        path="/favorites"
        element={
          <MainScreen
            userPreferences={userPreferences}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onReanalyze={() => navigate("/")}
            initialSection={"favorites"}
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
            initialSection={"popular-movies"}
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
            initialSection={"popular-tv"}
          />
        }
      />
    </Routes>
  );
}
