// backend/src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { AnalyzeDto, AiIntent, MediaType } from './dto/analyze.dto';

type Tone = AiIntent['tone'];
type Pace = AiIntent['pace'];
type Ending = AiIntent['ending'];

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type FetchLike = (url: string, init?: FetchInit) => Promise<unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }

    if (ch === '"') {
      inStr = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      const slice = text.slice(start, i + 1);
      return safeJsonParse(slice);
    }
  }

  return null;
}

function normalizeMediaTypes(v: unknown): MediaType[] {
  if (!isArray(v)) return [];
  const out: MediaType[] = [];
  for (const it of v) {
    if (it === 'movie' || it === 'tv') out.push(it);
  }
  return uniq(out);
}

function normalizeNumberArray(v: unknown): number[] {
  if (!isArray(v)) return [];
  const out: number[] = [];
  for (const it of v) {
    if (isNumber(it)) out.push(Math.trunc(it));
  }
  return uniq(out);
}

function normalizeStringArray(v: unknown): string[] {
  if (!isArray(v)) return [];
  const out: string[] = [];
  for (const it of v) {
    if (isString(it)) out.push(it.trim());
  }
  return uniq(out.filter((s) => s.length > 0));
}

function normalizeTone(v: unknown): Tone {
  if (v === 'light' || v === 'neutral' || v === 'dark') return v;
  return 'neutral';
}

function normalizePace(v: unknown): Pace {
  if (v === 'slow' || v === 'medium' || v === 'fast') return v;
  return 'medium';
}

function normalizeEnding(v: unknown): Ending {
  if (v === 'happy' || v === 'open' || v === 'sad' || v === 'any') return v;
  return 'any';
}

function buildFallbackIntent(prompt: string): AiIntent {
  const p = prompt.toLowerCase();

  const mediaTypes: MediaType[] =
    p.includes('드라마') || p.includes('tv') || p.includes('시리즈')
      ? ['tv']
      : p.includes('영화') || p.includes('movie')
        ? ['movie']
        : ['movie', 'tv'];

  const tone: Tone =
    p.includes('힐링') || p.includes('가벼') || p.includes('코미')
      ? 'light'
      : p.includes('우울') || p.includes('다크') || p.includes('스릴')
        ? 'dark'
        : 'neutral';

  const pace: Pace =
    p.includes('잔잔') || p.includes('느긋')
      ? 'slow'
      : p.includes('빠른')
        ? 'fast'
        : 'medium';

  const ending: Ending = p.includes('해피')
    ? 'happy'
    : p.includes('새드')
      ? 'sad'
      : p.includes('여운')
        ? 'open'
        : 'any';

  return {
    mediaTypes,
    genreIds: [],
    yearFrom: null,
    yearTo: null,
    originalLanguage: null,
    includeKeywords: [],
    excludeKeywords: [],
    tone,
    pace,
    ending,
    confidence: 0.35,
    needsClarification: false,
    clarifyingQuestion: null,
  };
}

function parseIntentFromUnknown(obj: unknown, fallback: AiIntent): AiIntent {
  if (!isRecord(obj)) return fallback;

  const mediaTypes = normalizeMediaTypes(obj.mediaTypes);
  const genreIds = normalizeNumberArray(obj.genreIds);

  const yearFrom = isNumber(obj.yearFrom) ? Math.trunc(obj.yearFrom) : null;
  const yearTo = isNumber(obj.yearTo) ? Math.trunc(obj.yearTo) : null;

  const originalLanguage = isString(obj.originalLanguage)
    ? obj.originalLanguage
    : null;

  const includeKeywords = normalizeStringArray(obj.includeKeywords);
  const excludeKeywords = normalizeStringArray(obj.excludeKeywords);

  const tone = normalizeTone(obj.tone);
  const pace = normalizePace(obj.pace);
  const ending = normalizeEnding(obj.ending);

  const confidence = isNumber(obj.confidence)
    ? clamp(obj.confidence, 0, 1)
    : fallback.confidence;

  const needsClarification = isBoolean(obj.needsClarification)
    ? obj.needsClarification
    : false;

  const clarifyingQuestion = isString(obj.clarifyingQuestion)
    ? obj.clarifyingQuestion
    : null;

  return {
    mediaTypes: mediaTypes.length ? mediaTypes : fallback.mediaTypes,
    genreIds,
    yearFrom,
    yearTo,
    originalLanguage,
    includeKeywords,
    excludeKeywords,
    tone,
    pace,
    ending,
    confidence,
    needsClarification,
    clarifyingQuestion,
  };
}

function isFetchLike(v: unknown): v is FetchLike {
  return typeof v === 'function';
}

function isFetchResponseLike(v: unknown): v is FetchResponseLike {
  if (!isRecord(v)) return false;
  return isBoolean(v.ok) && isNumber(v.status) && typeof v.text === 'function';
}

async function callGemini(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const model = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
  };

  const g = globalThis as unknown as Record<string, unknown>;
  const f = g['fetch'];
  if (!isFetchLike(f)) return null;

  const resUnknown = await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!isFetchResponseLike(resUnknown)) return null;
  if (!resUnknown.ok) return null;

  const rawText = await resUnknown.text();
  const parsed = safeJsonParse(rawText);

  if (!isRecord(parsed) || !isArray(parsed.candidates)) return null;
  const c0 = parsed.candidates[0];
  if (!isRecord(c0) || !isRecord(c0.content) || !isArray(c0.content.parts))
    return null;

  const p0 = c0.content.parts[0];
  if (!isRecord(p0) || !isString(p0.text)) return null;

  return p0.text;
}

@Injectable()
export class AiService {
  async analyze(dto: AnalyzeDto): Promise<AiIntent> {
    const fallback = buildFallbackIntent(dto.prompt);

    const systemPrompt = [
      `너는 영화/TV 추천 필터 분석기야.`,
      `반드시 JSON 객체만 출력해.`,
      `키는 정확히 아래 스키마를 따라:`,
      `{`,
      `  "mediaTypes": ["movie"|"tv"],`,
      `  "genreIds": number[],`,
      `  "yearFrom": number|null,`,
      `  "yearTo": number|null,`,
      `  "originalLanguage": string|null,`,
      `  "includeKeywords": string[],`,
      `  "excludeKeywords": string[],`,
      `  "tone": "light"|"neutral"|"dark",`,
      `  "pace": "slow"|"medium"|"fast",`,
      `  "ending": "happy"|"open"|"sad"|"any",`,
      `  "confidence": number(0~1),`,
      `  "needsClarification": boolean,`,
      `  "clarifyingQuestion": string|null`,
      `}`,
      `genreIds는 모르면 빈 배열로 둬.`,
    ].join('\n');

    const finalPrompt = `${systemPrompt}\n\n사용자 입력: ${dto.prompt}`;

    try {
      const text = (await callGemini(finalPrompt)) ?? '';
      const jsonObj = text ? extractFirstJsonObject(text) : null;
      return parseIntentFromUnknown(jsonObj, fallback);
    } catch {
      return fallback;
    }
  }
}
