// frontend/src/App.tsx

import { useCallback, useEffect, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";

import type { UserPreferences } from "./features/onboarding/Onboarding";
import { MainScreen } from "./pages/MainScreen";
import FavoritesPage from "./pages/FavoritesPage";
import { PickyPage } from "./pages/PickyPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";

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

export default function App() {
  const navigate = useNavigate();

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(
    createEmptyPreferences
  );

  const handleResetFavorites = useCallback(() => {
    setFavorites([]);
  }, []);

  // ✅ id만 비교하면 movie/tv가 같은 id일 때 충돌 가능 → mediaType까지 같이 비교
  const handleToggleFavorite = useCallback(
    (id: number, mediaType: "movie" | "tv" = "movie") => {
      setFavorites((prev) => {
        const exists = prev.some(
          (f) => f.id === id && f.mediaType === mediaType
        );
        if (exists)
          return prev.filter(
            (f) => !(f.id === id && f.mediaType === mediaType)
          );
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

  return (
    <Routes>
      {/* ✅ Auth Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

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

      {/* ✅ 찜/플레이리스트는 FavoritesPage로 */}
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
