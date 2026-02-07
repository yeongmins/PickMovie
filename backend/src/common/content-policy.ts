function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toStringValue(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function hasHangul(value: string): boolean {
  return /[가-힣]/.test(value);
}

export function hasKoreanTitle(raw: unknown): boolean {
  if (!isRecord(raw)) return false;

  const title = toStringValue(raw['title']);
  const name = toStringValue(raw['name']);
  const displayTitle = title || name;

  return hasHangul(displayTitle);
}

export function isBlockedContentByPolicy(raw: unknown): boolean {
  return !hasKoreanTitle(raw);
}
