import type { MediaType } from '../tmdb/tmdb.types';

export interface AiAnalysis {
  intent: 'discover' | 'search';
  mediaTypes: MediaType[];
  includeKeywords: string[];
  excludeKeywords: string[];
  movieGenreIds: number[];
  tvGenreIds: number[];
  yearFrom?: number;
  yearTo?: number;
  originalLanguage?: string;
  confidence: number; // 0~1
  needsClarification: boolean;
  clarifyingQuestion: string | null;

  // ✅ “AI 체감”
  expandedQueries: string[];
  summary: string;
}
