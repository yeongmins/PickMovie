// App.tsx
// - 라우팅 전체 구성 (/welcome, /onboarding, /, /favorites, /popular-movies, /popular-tv)
// - 로컬스토리지에서 취향/찜/온보딩 완료 여부를 읽고/저장
// - 온보딩 → 메인 화면 흐름, 재분석 흐름까지 관리

import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Onboarding, UserPreferences } from "./features/onboarding/Onboarding";
import { MainScreen } from "./pages/MainScreen";
import { WelcomeStep } from "./features/onboarding/components/WelcomeStep";

const STORAGE_KEYS = {
  FAVORITES: "pickmovie_favorites",
  PREFERENCES: "pickmovie_preferences",
  ONBOARDING_COMPLETE: "pickmovie_onboarding_complete",
};

// 개발 환경 여부 체크 헬퍼
const isDevelopment =
  typeof window !== "undefined" && window.location.hostname === "localhost";

// ✅ 빈 UserPreferences 생성 헬퍼
const createEmptyPreferences = (): UserPreferences => ({
  genres: [],
  moods: [],
  runtime: "",
  releaseYear: "",
  country: "",
  excludes: [],
});

// Favorite 아이템 타입: 이제 id와 mediaType을 같이 저장
export interface FavoriteItem {
  id: number;
  mediaType: "movie" | "tv";
}

// 기존 number[] 포맷을 새 FavoriteItem[] 포맷으로 마이그레이션하는 헬퍼
const idsToFavoriteItems = (
  ids: number[],
  mediaType: "movie" | "tv" = "movie"
): FavoriteItem[] => ids.map((id) => ({ id, mediaType }));

export default function App() {
  const navigate = useNavigate();

  // 온보딩 완료 여부
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  // 재분석 모드 여부 (기존 찜은 유지하되 취향만 다시 받는 모드)
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  // ✅ 초기값을 헬퍼로 통일 (언제나 같은 기본값)
  const [userPreferences, setUserPreferences] =
    useState<UserPreferences>(createEmptyPreferences);

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true); // ✅ 로컬스토리지 로딩 중 플래그

  // 디버깅용 전역 함수 등록: checkStorage(), cleanupFavorites()
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

  // 초기 로드: 로컬스토리지에서 취향/찜/온보딩 완료 여부를 불러옴
  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      const savedPreferences = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      const savedOnboardingComplete = localStorage.getItem(
        STORAGE_KEYS.ONBOARDING_COMPLETE
      );

      // 찜 데이터 로드 + 필요 시 포맷 마이그레이션 (number[] → FavoriteItem[])
      if (savedFavorites) {
        const parsed = JSON.parse(savedFavorites);

        if (Array.isArray(parsed) && parsed.length > 0) {
          // 과거 버전: [123, 456] 형태라면 FavoriteItem[]로 변환
          if (typeof parsed[0] === "number") {
            const migrated = idsToFavoriteItems(parsed as number[], "movie");
            setFavorites(migrated);
            localStorage.setItem(
              STORAGE_KEYS.FAVORITES,
              JSON.stringify(migrated)
            );
            console.log("✅ Migrated favorites to new format");
          } else {
            // 새 포맷: [{ id, mediaType }]
            setFavorites(parsed);
          }
        }
      }

      // 취향 데이터 로드
      if (savedPreferences) {
        setUserPreferences(
          savedPreferences ? JSON.parse(savedPreferences) : createEmptyPreferences()
        );
      }

      // 온보딩 완료 플래그 + 취향 데이터가 둘 다 있어야 완료 상태로 간주
      if (savedOnboardingComplete === "true" && savedPreferences) {
        setOnboardingComplete(true);
      } else {
        // ✅ 저장된 온보딩 정보가 없으면 항상 미완료 상태로 시작
        setOnboardingComplete(false);
      }
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
      // 에러 발생 시에도 최소한 기본 상태로 앱이 돌아가게 처리
      setUserPreferences(createEmptyPreferences());
      setFavorites([]);
      setOnboardingComplete(false);
    } finally {
      // ✅ 여기서부터 실제 라우트 렌더링 허용
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
    // 온보딩이 끝난 상태에서만 저장 (온보딩 도중 값들은 아직 확정이 아님)
    if (!isLoading && onboardingComplete) {
      localStorage.setItem(
        STORAGE_KEYS.PREFERENCES,
        JSON.stringify(userPreferences)
      );
    }
  }, [userPreferences, isLoading, onboardingComplete]);

  // 취향 재분석 버튼 클릭 시:
  // - 온보딩 완료 플래그 해제
  // - isReanalyzing = true
  // - 취향 초기화 후 /onboarding으로 이동
  const handleReanalyze = useCallback(() => {
    setOnboardingComplete(false);
    setIsReanalyzing(true);
    setUserPreferences(createEmptyPreferences());
    navigate("/onboarding");
  }, [navigate]);

  // 전역 찜 토글 (MainScreen → App)
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

  // ✅ 로컬스토리지 로딩 전에는 아무것도 렌더링하지 않음
  if (isLoading) {
    return null; // 필요하면 글로벌 로딩 스피너 컴포넌트로 교체 가능
  }

  return (
    <Routes>
      {/* 🔹 웰컴 페이지: 완전 신규 유저용 인트로 랜딩 */}
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

      {/* 🔹 온보딩 페이지 (설문 1~4 + 추천 단계) */}
      <Route
        path="/onboarding"
        element={
          onboardingComplete && !isReanalyzing ? (
            <Navigate to="/" replace />
          ) : (
            <Onboarding
              onComplete={(preferences, favs) => {
                // 온보딩 완료 시 사용자 취향 저장
                setUserPreferences(preferences);

                if (!isReanalyzing) {
                  // ✅ 최초 온보딩: 찜 결과를 새로 설정 (number[] → FavoriteItem[])
                  setFavorites(idsToFavoriteItems(favs, "movie"));
                } else {
                  // ✅ 재분석: 기존 FavoriteItem[]과 온보딩 중 새로 찜한 영화 ID를 병합
                  setFavorites((prev) => {
                    const existingIds = new Set(prev.map((item) => item.id));
                    const newItems = favs
                      .filter((id) => !existingIds.has(id))
                      .map((id) => ({ id, mediaType: "movie" as const }));
                    return [...prev, ...newItems];
                  });
                }

                // 온보딩 완료 플래그 true
                setOnboardingComplete(true);
                setIsReanalyzing(false);
                localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, "true");
                navigate("/");
              }}
              // 재분석이든 처음이든 온보딩은 설문 1번부터 시작 (0번은 /welcome)
              initialStep={1}
              initialFavorites={
                isReanalyzing ? favorites.map((item) => item.id) : []
              }
            />
          )
        }
      />

      {/* 🔹 홈 (온보딩 완료 시 진입) */}
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
            // ✅ 재분석 중에는 무조건 온보딩으로 보냄
            <Navigate to="/onboarding" replace />
          ) : (
            // ✅ 완전 신규 유저는 웰컴으로
            <Navigate to="/welcome" replace />
          )
        }
      />

      {/* 🔹 내 찜 목록 페이지 */}
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

      {/* 🔹 인기 영화 페이지 */}
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

      {/* 🔹 인기 TV 컨텐츠 페이지 */}
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

      {/* 🔹 나머지 주소 처리: 온보딩 완료 여부에 따라 리다이렉트 */}
      <Route
        path="*"
        element={
          <Navigate to={onboardingComplete ? "/" : "/welcome"} replace />
        }
      />
    </Routes>
  );
}
