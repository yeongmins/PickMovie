// backend/src/common/safe.ts
export type JsonRecord = Record<string, unknown>;

export function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export function toStringOrNull(v: unknown): string | null {
  return isString(v) ? v : null;
}

export function toNumberOrNull(v: unknown): number | null {
  return isNumber(v) ? v : null;
}

export function toBooleanOrNull(v: unknown): boolean | null {
  return isBoolean(v) ? v : null;
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * 모델 응답에서 ```json ...``` 또는 첫 번째 { ... } 객체를 찾아 파싱
 */
export function extractFirstJsonObject(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = safeJsonParse(fenced[1].trim());
    if (parsed !== null) return parsed;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const chunk = text.slice(start, end + 1);
    const parsed = safeJsonParse(chunk);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (isString(err)) return err;
  return 'Unknown error';
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
