// backend/src/picky/brand-hints.ts
const BRAND_HINTS: Record<string, string[]> = {
  // --- Disney 계열 ---
  디즈니: [
    'Disney',
    'Walt Disney',
    'Walt Disney Pictures',
    'Disney Animation',
    'Walt Disney Animation Studios',
  ],
  월트디즈니: ['Walt Disney', 'Walt Disney Pictures'],
  디즈니애니: ['Walt Disney Animation Studios', 'Disney Animation'],
  픽사: ['Pixar', 'Pixar Animation Studios'],
  마블: ['Marvel', 'Marvel Studios'],
  루카스필름: ['Lucasfilm'],
  스타워즈: ['Lucasfilm', 'Star Wars'],
  '20세기폭스': ['20th Century Studios', '20th Century Fox'],
  폭스: ['20th Century Studios', '20th Century Fox'],

  // --- 워너/파라마운트/유니버설/소니 ---
  워너: ['Warner Bros.', 'Warner Bros Pictures'],
  dc: ['DC', 'DC Films', 'Warner Bros.'],
  파라마운트: ['Paramount', 'Paramount Pictures'],
  유니버설: ['Universal', 'Universal Pictures'],
  소니: ['Sony Pictures', 'Columbia Pictures', 'TriStar Pictures'],
  콜럼비아: ['Columbia Pictures'],
  트라이스타: ['TriStar Pictures'],
  엠지엠: ['MGM', 'Metro-Goldwyn-Mayer'],
  라이언스게이트: ['Lionsgate'],
  a24: ['A24'],
  블룸하우스: ['Blumhouse', 'Blumhouse Productions'],
  스튜디오카날: ['StudioCanal'],
  미라맥스: ['Miramax'],
  드림웍스: ['DreamWorks', 'DreamWorks Pictures', 'DreamWorks Animation'],
  일루미네이션: ['Illumination', 'Illumination Entertainment'],
  라이트스톰: ['Lightstorm Entertainment'],

  // --- 넷플/애플/아마존/하BO 등 ---
  넷플릭스: ['Netflix', 'Netflix Studios'],
  애플tv: ['Apple TV+', 'Apple Original Films'],
  애플티비: ['Apple TV+', 'Apple Original Films'],
  아마존: ['Amazon Studios', 'Amazon MGM Studios'],
  hbo: ['HBO', 'HBO Films'],
  하bo: ['HBO', 'HBO Films'],

  // --- 일본 애니/스튜디오 ---
  지브리: ['Studio Ghibli', 'Ghibli'],
  미야자키: ['Hayao Miyazaki', 'Studio Ghibli'],
  토에이: ['Toei Animation', 'Toei Company'],
  토에이애니: ['Toei Animation'],
  교토애니: ['Kyoto Animation'],
  쿄애니: ['Kyoto Animation'],
  마파: ['MAPPA'],
  매드하우스: ['Madhouse'],
  본즈: ['Bones'],
  선라이즈: ['Sunrise'],
  피에로: ['Studio Pierrot'],
  위트스튜디오: ['WIT STUDIO'],
  트리거: ['TRIGGER'],
  유포터블: ['ufotable'],
  'a-1': ['A-1 Pictures'],
  클로버웍스: ['CloverWorks'],
  jc스태프: ['J.C.STAFF', 'J.C. Staff'],
  프로덕션ig: ['Production I.G'],
  샤프트: ['SHAFT'],
  사이언스사루: ['Science SARU'],
  토호: ['TOHO'],

  // --- 한국 제작/배급 (TMDB company로 잡히는 것들) ---
  cj: ['CJ ENM', 'CJ Entertainment'],
  'cj enm': ['CJ ENM', 'CJ Entertainment'],
  쇼박스: ['Showbox'],
  롯데엔터: ['Lotte Entertainment'],
  new: ['Next Entertainment World', 'NEW'],
  스튜디오드래곤: ['Studio Dragon'],
  tvn: ['tvN', 'CJ ENM'],
  jtbc: ['JTBC'],
  kbs: ['KBS'],
  sbs: ['SBS'],
  mbc: ['MBC'],

  // --- 기타 유명 브랜드/스튜디오 ---
  라라랜드: ['Summit Entertainment', 'Black Label Media'],
  지브리감성: ['Studio Ghibli'],
  미니언즈: ['Illumination'],
  해리포터: ['Warner Bros.'],
  반지의제왕: ['New Line Cinema', 'Warner Bros.'],
  마블감성: ['Marvel Studios'],
  디즈니감성: ['Walt Disney Pictures'],
};

const KO_HASHTAG_ALIASES: Array<[RegExp, string[]]> = [
  [/디즈니\s*플러스|디플|디\+|disney\+/i, ['Disney', 'Walt Disney', 'Disney+']],
  [/넷플|netflix/i, ['Netflix']],
  [/아마존\s*프라임|prime\s*video/i, ['Amazon Studios', 'Amazon MGM Studios']],
  [/애플\s*tv|apple\s*tv/i, ['Apple TV+', 'Apple Original Films']],
  [
    /일본\s*애니|japanese\s*anime|anime/i,
    ['Studio Ghibli', 'Toei Animation', 'MAPPA', 'Madhouse'],
  ],
];

export function extractBrandCompanyQueries(rawQuery: string): {
  brands: string[];
  companyQueries: string[];
} {
  const q = rawQuery.toLowerCase();
  const brands: string[] = [];
  const companyQueries: string[] = [];

  // direct dictionary hits
  for (const [ko, queries] of Object.entries(BRAND_HINTS)) {
    if (q.includes(ko.toLowerCase())) {
      brands.push(ko);
      for (const cq of queries) companyQueries.push(cq);
    }
  }

  // regex aliases
  for (const [re, queries] of KO_HASHTAG_ALIASES) {
    if (re.test(rawQuery)) {
      brands.push(re.source);
      for (const cq of queries) companyQueries.push(cq);
    }
  }

  return { brands: uniq(brands), companyQueries: uniq(companyQueries) };
}

export function detectAnime(rawQuery: string): boolean {
  const q = rawQuery.toLowerCase();
  return (
    q.includes('애니') ||
    q.includes('animation') ||
    q.includes('anime') ||
    q.includes('지브리') ||
    q.includes('픽사') ||
    q.includes('디즈니')
  );
}

export function detectOriginalLanguage(rawQuery: string): string | undefined {
  const q = rawQuery.toLowerCase();

  // “일본/일본어/자막/일드/애니” 등
  if (
    q.includes('일본') ||
    q.includes('일본어') ||
    q.includes('japan') ||
    q.includes('jp') ||
    q.includes('일드')
  )
    return 'ja';
  if (
    q.includes('한국') ||
    q.includes('한국어') ||
    q.includes('korea') ||
    q.includes('kr')
  )
    return 'ko';
  return undefined;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
