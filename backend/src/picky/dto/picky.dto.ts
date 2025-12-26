// backend/src/picky/dto/picky.dto.ts
export type MediaType = 'movie' | 'tv';

export type ProviderBadge = {
  providerId: number;
  providerName: string;
  logoPath: string | null;
};

export type PickyItem = {
  id: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  releaseDate: string | null;
  year: number | null;
  genreIds: number[];
  originalLanguage: string | null;
  providers: ProviderBadge[];
  ageRating: string | null;
  matchScore: number;
  matchReasons: string[];
};

export type PickyRecommendResponse = {
  items: PickyItem[];
};

export class PickyRecommendDto {
  prompt?: string;

  mediaTypes?: MediaType[];
  genreIds?: number[];

  yearFrom?: number | null;
  yearTo?: number | null;

  originalLanguage?: string | null;
  region?: string;

  // ✅ 핵심: 키워드 기반 discover 필터
  includeKeywords?: string[];
  excludeKeywords?: string[];

  page?: number;

  language?: string;
  includeAdult?: boolean;
  sortBy?: string;
}
