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

function hasSoftcoreKeyword(raw: unknown): boolean {
  if (!isRecord(raw)) return false;

  const pick = (key: string): string => toStringValue(raw[key]).toLowerCase();
  const fields = [
    pick('title'),
    pick('name'),
    pick('original_title'),
    pick('original_name'),
    pick('overview'),
    pick('tagline'),
  ].filter(Boolean);

  const directHit = fields.some((v) => v.includes('softcore'));
  if (directHit) return true;

  const keywordsRaw = raw['keywords'];
  if (Array.isArray(keywordsRaw)) {
    return keywordsRaw.some((k) => {
      if (typeof k === 'string') return k.toLowerCase().includes('softcore');
      if (!isRecord(k)) return false;
      const name = toStringValue(k['name']).toLowerCase();
      return name.includes('softcore');
    });
  }

  if (isRecord(keywordsRaw) && Array.isArray(keywordsRaw['keywords'])) {
    return keywordsRaw['keywords'].some((k) => {
      if (!isRecord(k)) return false;
      const name = toStringValue(k['name']).toLowerCase();
      return name.includes('softcore');
    });
  }

  return false;
}

export function isBlockedContentByPolicy(
  raw: unknown,
  opts?: { viewerIsAdmin?: boolean },
): boolean {
  // 이전에는 "한글 제목만 허용"이라 해외 작품이 거의 전부 걸러졌음.
  // 제목 자체가 없는 비정상 데이터만 차단하도록 완화한다.
  if (!hasDisplayTitle(raw)) return true;
  if (opts?.viewerIsAdmin) return false;
  return hasSoftcoreKeyword(raw);
}
