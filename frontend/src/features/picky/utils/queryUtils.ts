// frontend/src/features/picky/utils/queryUtils.ts
// ✅ 이번 정리에서는 "컴파일 깨짐 방지"를 위해 기존 exports는 유지.
// ✅ 다만 pickyApi에서는 추론 로직(inferMediaTypes/inferYearRange/extractIncludeKeywords)을 더 이상 사용하지 않음.

export type MediaType = "movie" | "tv";

export function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

export function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const STOP = new Set([
  "추천",
  "영화",
  "드라마",
  "애니",
  "애니메이션",
  "시리즈",
  "작품",
  "콘텐츠",
  "컨텐츠",
  "보고",
  "싶어",
  "싶은",
  "좀",
  "진짜",
  "그냥",
  "완전",
  "느낌",
  "비슷한",
  "같은",
  "찾아줘",
  "부탁",
]);

// ✅ UI 표시용 태그 정도는 프론트에서 유지(칩/배지에 활용)
export function extractTagsFromQuery(q: string) {
  const cleaned = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 2)
    .filter((w) => !STOP.has(w));

  return uniq(cleaned).slice(0, 12);
}

// ----- 아래는 "레거시" (현재 pickyApi에서는 사용하지 않음) -----

export function extractIncludeKeywords(q: string, tags: string[] = []) {
  const tokens = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .filter((t) => !STOP.has(t));

  return uniq([...tags, ...tokens]).slice(0, 30);
}

export function inferMediaTypes(q: string): MediaType[] {
  const lower = q.toLowerCase();
  const wantsTv = /드라마|시리즈|tv|티비|예능/.test(lower);
  const wantsMovie = /영화|movie|극장|상영/.test(lower);
  if (wantsTv && wantsMovie) return ["movie", "tv"];
  if (wantsTv) return ["tv"];
  if (wantsMovie) return ["movie"];
  return ["movie", "tv"];
}

export function inferYearRange(q: string): { from?: number; to?: number } {
  const decade = q.match(/(19|20)\d0년대/);
  if (decade) {
    const base = Number(decade[0].slice(0, 4));
    return { from: base, to: base + 9 };
  }
  const year = q.match(/(19|20)\d{2}년/);
  if (year) {
    const y = Number(year[0].slice(0, 4));
    return { from: y, to: y };
  }
  return {};
}

export function isMostlyAscii(arr: string[]) {
  if (!arr.length) return false;
  const asciiCount = arr.reduce(
    (acc, s) => acc + (/^[\x00-\x7F]+$/.test(s) ? 1 : 0),
    0
  );
  return asciiCount / arr.length >= 0.8;
}

export function yearFromItem(item: {
  release_date?: string;
  first_air_date?: string;
}) {
  const date = item.release_date || item.first_air_date || "";
  if (!date) return undefined;
  const y = new Date(date).getFullYear();
  return Number.isFinite(y) ? y : undefined;
}
