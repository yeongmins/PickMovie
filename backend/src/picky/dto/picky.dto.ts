// backend/src/picky/dto/picky.dto.ts
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export type MediaType = 'movie' | 'tv';

/**
 * Watch provider badge (백엔드 표준 형태)
 */
export type ProviderBadge = {
  providerId: number;
  providerName: string;
  logoPath: string | null;
};

/**
 * Picky 기본 아이템(서비스 toBaseItem() 결과와 1:1 매칭)
 */
export type PickyBaseItem = {
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
};

/**
 * 최종 반환 아이템(서비스 enriched 결과와 1:1 매칭)
 */
export type PickyItem = PickyBaseItem & {
  providers: ProviderBadge[];
  ageRating: string | null;

  matchScore: number;
  matchReasons: string[];
};

export type PickyRecommendResponse = {
  items: PickyItem[];
};

export class PickyRecommendDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @IsIn(['movie', 'tv'], { each: true })
  @ArrayUnique()
  @ArrayMaxSize(2)
  mediaTypes?: MediaType[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  includeKeywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  excludeKeywords?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(50)
  genreIds?: number[];

  @IsOptional()
  @IsInt()
  yearFrom?: number | null;

  @IsOptional()
  @IsInt()
  yearTo?: number | null;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsBoolean()
  includeAdult?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  originalLanguage?: string | null;
}
