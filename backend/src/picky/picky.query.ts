// backend/src/picky/picky.query.ts
import {
  LEXICON,
  STOPWORDS_EN,
  STOPWORDS_KO,
  NEGATION_PATTERNS,
  JUNK_TOKENS,
  type LexiconEntry,
} from './picky.lexicon';

export type ExpandedQuery = {
  normalized: string;
  tokens: string[];
  expandedTokens: string[];
  mustTokens: string[];
  shouldTokens: string[];
  notTokens: string[];
  entityHints: {
    company: string[];
    person: string[];
    keyword: string[];
    franchise: string[];
    network: string[];
  };
  tags: string[];
  mediaTypeHint?: Array<'movie' | 'tv'>;
};

const NEG_SET = new Set<string>(NEGATION_PATTERNS.map((x) => x.toLowerCase()));

export function normalizeQuery(q: string): string {
  // ⚠️ normalize를 너무 공격적으로 하면 "disney+" 같은 토큰이 사라짐
  // -> + 같은 일부는 공백으로 치환되더라도, LEXICON은 head/alias를 넓게 갖고 있어서 커버됨
  return (q || '')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ') // keep letters/numbers/spaces (unicode)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 토큰화:
 * - 한글/영문/숫자 기준 공백 분리
 * - stopwords/junk 제거는 "의미 있는 검색어"를 남기기 위해 최소한으로만
 */
export function tokenize(q: string): string[] {
  const normalized = normalizeQuery(q);
  if (!normalized) return [];

  const raw = normalized.split(' ').filter(Boolean);

  const tokens = raw
    .map((t) => t.trim())
    .filter((t) => t.length >= 1)
    .filter((t) => !JUNK_TOKENS.has(t));

  // stopwords 제거(짧은 단어는 과하게 제거하지 않도록)
  return tokens.filter((t) => {
    if (t.length <= 1) return true;

    const nk = t.toLowerCase();
    if (STOPWORDS_KO.has(nk)) return false;
    if (STOPWORDS_EN.has(nk)) return false;

    return true;
  });
}

function hasNegationNeighbor(tokens: string[], idx: number): boolean {
  const prev = (tokens[idx - 1] || '').toLowerCase();
  const next = (tokens[idx + 1] || '').toLowerCase();
  return NEG_SET.has(prev) || NEG_SET.has(next);
}

function toArrayUnique(set: Set<string>): string[] {
  return Array.from(set);
}

function safeEntry(token: string): LexiconEntry | undefined {
  // query.ts는 공백 제거 key도 같이 쓰므로, 여기서도 동일 전략 적용
  const t = token.toLowerCase();
  const keyNoSpace = t.replace(/\s+/g, '');
  return LEXICON[keyNoSpace] || LEXICON[t];
}

export function expandWithLexicon(query: string): ExpandedQuery {
  const normalized = normalizeQuery(query);
  const tokens = tokenize(query);

  const expanded = new Set<string>();
  const mustTokens = new Set<string>();
  const shouldTokens = new Set<string>();
  const notTokens = new Set<string>();
  const tags = new Set<string>();

  let mediaTypeHint: Array<'movie' | 'tv'> | undefined;

  const entityHints = {
    company: new Set<string>(),
    person: new Set<string>(),
    keyword: new Set<string>(),
    franchise: new Set<string>(),
    network: new Set<string>(),
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    expanded.add(t);

    const entry = safeEntry(t);
    if (!entry) continue;

    for (const x of entry.expand ?? []) expanded.add(String(x).toLowerCase());
    for (const x of entry.must ?? []) mustTokens.add(String(x).toLowerCase());
    for (const x of entry.should ?? [])
      shouldTokens.add(String(x).toLowerCase());
    for (const x of entry.not ?? []) notTokens.add(String(x).toLowerCase());
    for (const x of entry.tags ?? []) tags.add(String(x));

    if (entry.mediaTypeHint?.length) mediaTypeHint = entry.mediaTypeHint;

    const eh = entry.entityHints;
    if (eh) {
      for (const x of eh.company ?? []) entityHints.company.add(String(x));
      for (const x of eh.person ?? []) entityHints.person.add(String(x));
      for (const x of eh.keyword ?? []) entityHints.keyword.add(String(x));
      for (const x of eh.franchise ?? []) entityHints.franchise.add(String(x));
      for (const x of eh.network ?? []) entityHints.network.add(String(x));
    }

    // “공포 빼고” 같은 패턴: 토큰 주변에 negation 있으면 notTokens 강화
    if (hasNegationNeighbor(tokens, i)) {
      notTokens.add(t);
      for (const x of entry.expand ?? [])
        notTokens.add(String(x).toLowerCase());
    }
  }

  return {
    normalized,
    tokens,
    expandedTokens: toArrayUnique(expanded),
    mustTokens: toArrayUnique(mustTokens),
    shouldTokens: toArrayUnique(shouldTokens),
    notTokens: toArrayUnique(notTokens),
    entityHints: {
      company: toArrayUnique(entityHints.company),
      person: toArrayUnique(entityHints.person),
      keyword: toArrayUnique(entityHints.keyword),
      franchise: toArrayUnique(entityHints.franchise),
      network: toArrayUnique(entityHints.network),
    },
    tags: toArrayUnique(tags),
    mediaTypeHint,
  };
}

/**
 * 검색어 품질 평가(룰 기반)
 * - Gemini 분류와 같이 써도 되고, 없으면 이거라도 걸러서 "인기 리스트만" 방지에 도움 됨
 */
export function ruleBasedQueryQuality(query: string): {
  ok: boolean;
  reason?: string;
} {
  const n = normalizeQuery(query);
  if (!n) return { ok: false, reason: '검색어가 비어 있어요.' };
  if (n.length < 2) return { ok: false, reason: '검색어가 너무 짧아요.' };

  if (n.length > 100) {
    return {
      ok: true,
      reason: '검색어가 길어서 핵심 키워드 위주로 처리될 수 있어요.',
    };
  }

  // 의미 없는 반복/문자 폭발(간단 휴리스틱)
  const only = n.replace(/[a-z0-9가-힣\s]/g, '');
  if (only.length > 0)
    return { ok: true, reason: '특수문자가 많아서 일부가 무시될 수 있어요.' };

  // 너무 일반어만 남은 경우
  const tks = tokenize(n);
  const meaningful = tks.filter(
    (t) => t.length >= 2 && !STOPWORDS_KO.has(t) && !STOPWORDS_EN.has(t),
  );
  if (meaningful.length === 0)
    return { ok: false, reason: '의미 있는 키워드가 부족해요.' };

  return { ok: true };
}
