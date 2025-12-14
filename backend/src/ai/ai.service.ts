// backend/src/ai/ai.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface AiSearchResponse {
  genres: number[];
  keywords: string[];
  mood: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    // ✅ 2025년 12월 기준 최신 무료 모델 적용
    // 빠른 모드(Fast Mode)로 무제한 사용 가능한 모델입니다.
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async analyzeQuery(query: string): Promise<AiSearchResponse> {
    try {
      // 프롬프트: 사용자의 의도를 TMDB 필터로 정밀 변환
      const prompt = `
        너는 2025년 최고의 영화 추천 AI 'Picky'야.
        사용자의 요청을 분석해서 TMDB API 검색에 사용할 필터 조건으로 완벽하게 변환해줘.
        
        사용자 요청: "${query}"
        
        반드시 아래 JSON 형식으로만 답변해줘 (마크다운, 설명 금지):
        {
          "genres": number[], // TMDB 장르 ID 배열 (예: 액션=28, 코미디=35, 로맨스=10749, 애니=16 등)
          "keywords": string[], // 영화와 관련된 영어 키워드 2~3개 (예: "time travel", "revenge")
          "mood": string // 사용자의 기분이나 상황 요약 (한국어, 예: "새벽 감성 터지는", "스트레스 풀리는")
        }
      `;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // JSON 파싱 (안전하게 처리)
      const jsonStr = text.replace(/```json|```/g, '').trim();

      this.logger.log(`Picky(Gemini-2.5) Analysis: ${jsonStr}`);

      return JSON.parse(jsonStr) as AiSearchResponse;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Gemini API Error: ${errorMessage}`);

      // 에러 발생 시 빈 값 반환 (서비스 중단 방지)
      return {
        genres: [],
        keywords: [],
        mood: '잠시 연결이 불안정해요 😅',
      };
    }
  }
}
