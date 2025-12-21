// backend/src/ai/dto/analyze.dto.ts
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export type MediaType = 'movie' | 'tv';

export class AnalyzeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string; // e.g. "ko", "en"

  @IsOptional()
  @IsString()
  @MaxLength(10)
  region?: string; // e.g. "KR"
}

export interface AiIntent {
  mediaTypes: MediaType[];
  genreIds: number[];
  yearFrom: number | null;
  yearTo: number | null;
  originalLanguage: string | null;

  includeKeywords: string[];
  excludeKeywords: string[];

  tone: 'light' | 'neutral' | 'dark';
  pace: 'slow' | 'medium' | 'fast';
  ending: 'happy' | 'open' | 'sad' | 'any';

  confidence: number; // 0~1
  needsClarification: boolean;
  clarifyingQuestion: string | null;
}

export class ExplainDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt!: string;

  @IsIn(['movie', 'tv'])
  mediaType!: MediaType;

  @IsInt()
  id!: number;
}
