// App.tsx
import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Onboarding, UserPreferences } from "./components/Onboarding";
import { MainScreen } from "./components/MainScreen";
import { WelcomeStep } from "./components/WelcomeStep";

const STORAGE_KEYS = {
  FAVORITES: "pickmovie_favorites",
  PREFERENCES: "pickmovie_preferences",
  ONBOARDING_COMPLETE: "pickmovie_onboarding_complete",
};

// 개발 환경 체크 헬퍼
const isDevelopment =
  typeof window !== "undefined" && window.location.hostname === "localhost";

// Favorite 아이템 타입
export interface FavoriteItem {
  id: number;
  mediaType: "movie" | "tv";
}

// number[] → FavoriteItem[] 변환 헬퍼
const idsToFavoriteItems = (
  ids: number[],
  mediaType: "movie" | "tv" = "movie"
): FavoriteItem[] => ids.map((id) => ({ id, mediaType }));

export default function App() {
  const navigate = useNavigate();

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    genres: [],
    moods: [],
    runtime: "",
    releaseYear: "",
    country: "",
    excludes: [],
  });
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 디버깅 함수 등록
  useEffect(() => {
    (window as any).checkStorage = () => {
      const favorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      const preferences = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      console.log(
        "%c=== STORAGE CHECK ===",
        "color: magenta; font-weight: bold; font-size: 16px"
      );
      console.log("Favorites:", favorites ? JSON.parse(favorites) : []);
      console.log("Preferences:", preferences ? JSON.parse(preferences) : {});
      return {
        favorites: favorites ? JSON.parse(favorites) : [],
        preferences: preferences ? JSON.parse(preferences) : {},
      };
    };

    (window as any).cleanupFavorites = (invalidIds: number[]) => {
      const saved = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (saved) {
        const favorites = JSON.parse(saved);
        const cleaned = favorites.filter((item: any) => {
          if (typeof item === "number") {
            return !invalidIds.includes(item);
          }
          if (item && typeof item.id === "number") {
            return !invalidIds.includes(item.id);
          }
          return true;
        });
        localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(cleaned));
        console.log(
          `%c✅ Removed invalid movie IDs: ${invalidIds.join(", ")}`,
          "color: lime; font-weight: bold"
        );
        console.log(`Cleaned favorites:`, cleaned);

        if (
          confirm(
            "잘못된 영화 ID가 제거되었습니다. 페이지를 새로고침하시겠습니까?"
          )
        ) {
          window.location.reload();
        }
        return cleaned;
      }
      return [];
    };

    if (isDevelopment) {
      console.log(
        "✅ Debug functions registered: checkStorage(), cleanupFavorites([ids])"
      );
    }
  }, []);

  // 초기 로드: 로컬스토리지에서 데이터 불러오기
  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      const savedPreferences = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      const savedOnboardingComplete = localStorage.getItem(
        STORAGE_KEYS.ONBOARDING_COMPLETE
      );

      if (savedFavorites) {
        const parsed = JSON.parse(savedFavorites);

        // 마이그레이션: number[] → FavoriteItem[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === "number") {
            const migrated = idsToFavoriteItems(parsed as number[], "movie");
            setFavorites(migrated);
            localStorage.setItem(
              STORAGE_KEYS.FAVORITES,
              JSON.stringify(migrated)
            );
            console.log("✅ Migrated favorites to new format");
          } else {
            setFavorites(parsed);
          }
        }
      }

      if (savedPreferences) {
        setUserPreferences(JSON.parse(savedPreferences));
      }

      if (savedOnboardingComplete === "true" && savedPreferences) {
        setOnboardingComplete(true);
      }
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // favorites 변경 시 로컬스토리지에 자동 저장
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
    }
  }, [favorites, isLoading]);

  // userPreferences 변경 시 로컬스토리지에 자동 저장
  useEffect(() => {
    if (!isLoading && onboardingComplete) {
      localStorage.setItem(
        STORAGE_KEYS.PREFERENCES,
        JSON.stringify(userPreferences)
      );
    }
  }, [userPreferences, isLoading, onboardingComplete]);

  const handleReanalyze = useCallback(() => {
    setOnboardingComplete(false);
    setIsReanalyzing(true);
    setUserPreferences({
      genres: [],
      moods: [],
      runtime: "",
      releaseYear: "",
      country: "",
      excludes: [],
    });
    // ✅ 재분석은 바로 온보딩으로 보냄
    navigate("/onboarding");
  }, [navigate]);

  const handleToggleFavorite = useCallback(
    (movieId: number, mediaType: "movie" | "tv" = "movie") => {
      setFavorites((prevFavorites) =>
        prevFavorites.some((item) => item.id === movieId)
          ? prevFavorites.filter((item) => item.id !== movieId)
          : [...prevFavorites, { id: movieId, mediaType }]
      );
    },
    []
  );

  if (isLoading) {
    return null;
  }

  return (
    <Routes>
      {/* 🔹 웰컴 페이지: 완전 신규 유저용 */}
      <Route
        path="/welcome"
        element={
          onboardingComplete ? (
            <Navigate to="/" replace />
          ) : (
            <WelcomeStep onNext={() => navigate("/onboarding")} />
          )
        }
      />

      {/* 🔹 온보딩 페이지 */}
      <Route
        path="/onboarding"
        element={
          onboardingComplete && !isReanalyzing ? (
            <Navigate to="/" replace />
          ) : (
            <Onboarding
              onComplete={(preferences, favs) => {
                setUserPreferences(preferences);

                if (!isReanalyzing) {
                  // 처음 온보딩: 새로 설정 (number[] -> FavoriteItem[])
                  setFavorites(idsToFavoriteItems(favs, "movie"));
                } else {
                  // 재분석: 기존 favorites(FavoriteItem[])와 병합
                  setFavorites((prev) => {
                    const existingIds = new Set(prev.map((item) => item.id));
                    const newItems = favs
                      .filter((id) => !existingIds.has(id))
                      .map((id) => ({ id, mediaType: "movie" as const }));
                    return [...prev, ...newItems];
                  });
                }

                setOnboardingComplete(true);
                setIsReanalyzing(false);
                localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, "true");
                navigate("/");
              }}
              // 이제는 항상 설문 1번부터 시작 (WelcomeStep은 /welcome에서 처리)
              initialStep={1}
              initialFavorites={
                isReanalyzing ? favorites.map((item) => item.id) : []
              }
            />
          )
        }
      />

      {/* 🔹 홈 */}
      <Route
        path="/"
        element={
          onboardingComplete ? (
            <MainScreen
              userPreferences={userPreferences}
              favorites={favorites}
              onReanalyze={handleReanalyze}
              onToggleFavorite={handleToggleFavorite}
              initialSection="home"
            />
          ) : isReanalyzing ? (
            // ✅ 재분석 중이면 온보딩으로
            <Navigate to="/onboarding" replace />
          ) : (
            // ✅ 완전 신규면 웰컴으로
            <Navigate to="/welcome" replace />
          )
        }
      />

      {/* 🔹 내 찜 목록 */}
      <Route
        path="/favorites"
        element={
          onboardingComplete ? (
            <MainScreen
              userPreferences={userPreferences}
              favorites={favorites}
              onReanalyze={handleReanalyze}
              onToggleFavorite={handleToggleFavorite}
              initialSection="favorites"
            />
          ) : isReanalyzing ? (
            <Navigate to="/onboarding" replace />
          ) : (
            <Navigate to="/welcome" replace />
          )
        }
      />

      {/* 🔹 인기 영화 */}
      <Route
        path="/popular-movies"
        element={
          onboardingComplete ? (
            <MainScreen
              userPreferences={userPreferences}
              favorites={favorites}
              onReanalyze={handleReanalyze}
              onToggleFavorite={handleToggleFavorite}
              initialSection="popular-movies"
            />
          ) : isReanalyzing ? (
            <Navigate to="/onboarding" replace />
          ) : (
            <Navigate to="/welcome" replace />
          )
        }
      />

      {/* 🔹 인기 TV 컨텐츠 */}
      <Route
        path="/popular-tv"
        element={
          onboardingComplete ? (
            <MainScreen
              userPreferences={userPreferences}
              favorites={favorites}
              onReanalyze={handleReanalyze}
              onToggleFavorite={handleToggleFavorite}
              initialSection="popular-tv"
            />
          ) : isReanalyzing ? (
            <Navigate to="/onboarding" replace />
          ) : (
            <Navigate to="/welcome" replace />
          )
        }
      />

      {/* 🔹 나머지 주소 처리 */}
      <Route
        path="*"
        element={
          <Navigate to={onboardingComplete ? "/" : "/welcome"} replace />
        }
      />
    </Routes>
  );
}
