import { useState, useEffect, useCallback } from 'react';
import { Onboarding, UserPreferences } from './components/Onboarding';
import { MainScreen } from './components/MainScreen';

const STORAGE_KEYS = {
  FAVORITES: 'pickmovie_favorites',
  PREFERENCES: 'pickmovie_preferences',
  ONBOARDING_COMPLETE: 'pickmovie_onboarding_complete',
};

// 개발 환경 체크 헬퍼
const isDevelopment = typeof window !== 'undefined' && window.location.hostname === 'localhost';

// Favorite 아이템 타입
export interface FavoriteItem {
  id: number;
  mediaType: 'movie' | 'tv';
}

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    genres: [],
    moods: [],
    runtime: '',
    releaseYear: '',
    country: '',
    excludes: [],
  });
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 디버깅 함수를 window에 항상 등록 (개발/프로덕션 모두)
  useEffect(() => {
    // localStorage 확인 함수
    (window as any).checkStorage = () => {
      const favorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      const preferences = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      console.log('%c=== STORAGE CHECK ===', 'color: magenta; font-weight: bold; font-size: 16px');
      console.log('Favorites:', favorites ? JSON.parse(favorites) : []);
      console.log('Preferences:', preferences ? JSON.parse(preferences) : {});
      return { 
        favorites: favorites ? JSON.parse(favorites) : [], 
        preferences: preferences ? JSON.parse(preferences) : {} 
      };
    };

    // 잘못된 영화 ID 제거 함수
    (window as any).cleanupFavorites = (invalidIds: number[]) => {
      const saved = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (saved) {
        const favorites = JSON.parse(saved);
        const cleaned = favorites.filter((id: number) => !invalidIds.includes(id));
        localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(cleaned));
        console.log(`%c✅ Removed invalid movie IDs: ${invalidIds.join(', ')}`, 'color: lime; font-weight: bold');
        console.log(`Cleaned favorites:`, cleaned);
        
        // 상태 업데이트를 위해 페이지 새로고침 권장
        if (confirm('잘못된 영화 ID가 제거되었습니다. 페이지를 새로고침하시겠습니까?')) {
          window.location.reload();
        }
        return cleaned;
      }
      return [];
    };
    
    if (isDevelopment) {
      console.log('✅ Debug functions registered: checkStorage(), cleanupFavorites([ids])');
    }
  }, []);

  // 초기 로드: 로컬스토리지에서 데이터 불러오기
  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      const savedPreferences = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      const savedOnboardingComplete = localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE);

      if (savedFavorites) {
        const parsed = JSON.parse(savedFavorites);
        
        // 마이그레이션: number[] → FavoriteItem[]
        if (parsed.length > 0 && typeof parsed[0] === 'number') {
          // 기존 형식 (number[])을 새 형식으로 변환
          const migrated = parsed.map((id: number) => ({ id, mediaType: 'movie' as const }));
          setFavorites(migrated);
          localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(migrated));
          console.log('✅ Migrated favorites to new format');
        } else {
          setFavorites(parsed);
        }
      }

      if (savedPreferences) {
        setUserPreferences(JSON.parse(savedPreferences));
      }

      if (savedOnboardingComplete === 'true' && savedPreferences) {
        setOnboardingComplete(true);
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
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
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(userPreferences));
    }
  }, [userPreferences, isLoading, onboardingComplete]);

  const handleReanalyze = useCallback(() => {
    setOnboardingComplete(false);
    setIsReanalyzing(true);
    setUserPreferences({
      genres: [],
      moods: [],
      runtime: '',
      releaseYear: '',
      country: '',
      excludes: [],
    });
  }, []);

  const handleToggleFavorite = useCallback((movieId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    setFavorites(prevFavorites => 
      prevFavorites.some(item => item.id === movieId)
        ? prevFavorites.filter(item => item.id !== movieId)
        : [...prevFavorites, { id: movieId, mediaType }]
    );
  }, []);

  // 로딩 중에는 아무것도 렌더링하지 않음
  if (isLoading) {
    return null;
  }

  if (!onboardingComplete) {
    return (
      <Onboarding 
        onComplete={(preferences, favs) => {
          setUserPreferences(preferences);
          
          // 재분석 시에는 기존 찜 목록과 병합, 처음 방문 시에는 새로 설정
          if (!isReanalyzing) {
            setFavorites(favs);
          } else {
            const mergedFavorites = Array.from(new Set([...favorites, ...favs]));
            setFavorites(mergedFavorites);
          }
          
          setOnboardingComplete(true);
          setIsReanalyzing(false);
          localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
        }}
        initialStep={isReanalyzing ? 1 : 0}
        initialFavorites={isReanalyzing ? favorites : []}
      />
    );
  }

  return (
    <MainScreen 
      userPreferences={userPreferences} 
      favorites={favorites}
      onReanalyze={handleReanalyze}
      onToggleFavorite={handleToggleFavorite}
    />
  );
}