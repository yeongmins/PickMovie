// frontend/src/lib/aiSearch.ts

import { discoverMovies, TMDBMovie } from "./tmdb";

// API Base URL (Vite 환경 변수 사용)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export interface PickySearchResult extends TMDBMovie {
  recommendationReason: string;
}

export const SITUATION_KEYWORDS = [
  "우울할 때 위로가 되는", "배꼽 빠지게 웃긴", "심장 쫄깃한 긴장감", 
  "설렘 가득한 로맨스", "생각 없이 보기 좋은 킬링타임", "새벽 감성 터지는", 
  "반전의 반전 스릴러", "영상미 미친 판타지", "OST가 끝내주는", 
  "디즈니/픽사 감성", "지브리 스튜디오", "마블 유니버스", "하이틴 감성",
  "불금엔 맥주와 함께", "혼밥하며 볼만한", "연인과 오붓하게"
];

// 실제 백엔드 AI API 호출 함수
export async function analyzeAndSearch(query: string): Promise<PickySearchResult[]> {
  try {
    // 1. 백엔드(Gemini)에 자연어 분석 요청
    const response = await fetch(`${API_BASE_URL}/ai/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("AI Server Error");
    
    const aiData = await response.json();
    
    // 2. 분석된 필터로 TMDB 검색 실행
    // aiData 구조: { genres: number[], reason: string, primary_release_date_gte?: string ... }
    
    // TMDB API 호출 시 사용할 파라미터 변환
    const searchOptions: any = {
      genres: aiData.genres || [],
      page: 1,
      sort_by: aiData.sort_by || "popularity.desc",
    };

    if (aiData.primary_release_date_gte) {
        searchOptions["primary_release_date.gte"] = aiData.primary_release_date_gte;
    }
    if (aiData.primary_release_date_lte) {
        searchOptions["primary_release_date.lte"] = aiData.primary_release_date_lte;
    }

    const tmdbResults = await discoverMovies(searchOptions);

    // 3. 결과에 추천 이유(Gemini의 코멘트) 추가하여 반환
    return tmdbResults.map((movie) => ({
      ...movie,
      recommendationReason: aiData.reason || "Picky AI가 추천하는 영화입니다.",
    }));

  } catch (error) {
    console.error("Picky Search Failed:", error);
    // 에러 시 폴백(인기 영화)
    const fallback = await discoverMovies({ genres: [], page: 1 });
    return fallback.map(m => ({ ...m, recommendationReason: "인기 영화를 대신 추천해드려요." }));
  }
}

export function generatePlaylistTitle(query: string): string {
    const q = query.trim();
    if (q.length > 20) return "💿 나만의 Picky 플레이리스트";
    return `💿 "${q}" 맞춤 리스트`;
}