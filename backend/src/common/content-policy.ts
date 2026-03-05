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

function hasDisplayTitle(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  const title = toStringValue(raw['title']);
  const name = toStringValue(raw['name']);
  return Boolean(title || name);
}

export function isBlockedContentByPolicy(raw: unknown): boolean {
  // 이전에는 "한글 제목만 허용"이라 해외 작품이 거의 전부 걸러졌음.
  // 제목 자체가 없는 비정상 데이터만 차단하도록 완화한다.
  return !hasDisplayTitle(raw);
}
