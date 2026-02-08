// backend/src/picky/picky.lexicon.ts

export type PickyLexiconEntry = {
  /** query 확장에 쓰는 alias들 (동의어/약칭/영문명/표기 흔들림) */
  aliases: string[];
  /** TMDB company 검색에 넣을 힌트(영문 공식명 위주) */
  companyHints?: string[];
};

export type PickyLexicon = Record<string, PickyLexiconEntry>;

/**
 * picky.query.ts 호환용
 */
export type LexiconEntry = {
  expand?: string[];
  must?: string[];
  should?: string[];
  not?: string[];
  tags?: string[];
  mediaTypeHint?: Array<'movie' | 'tv'>;
  entityHints?: {
    company?: string[];
    person?: string[];
    keyword?: string[];
    franchise?: string[];
    network?: string[];
  };
};

const norm = (s: string) => (s ?? '').trim().toLowerCase();
const normKey = (s: string) => norm(s).replace(/\s+/g, '');

const uniqStrings = (arr: Array<string | undefined | null>) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const t = (v ?? '').trim();
    if (!t) continue;
    const k = norm(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
};

const E = (aliases: string[], companyHints?: string[]): PickyLexiconEntry => ({
  aliases: uniqStrings(aliases),
  companyHints: companyHints ? uniqStrings(companyHints) : undefined,
});

/**
 * ------------------------------------------------------------------------------------
 * ✅ STOPWORDS / JUNK / NEGATION (picky.query.ts에서 그대로 import)
 * ------------------------------------------------------------------------------------
 */
export const STOPWORDS_KO: ReadonlySet<string> = new Set(
  [
    '추천',
    '추천해',
    '추천해줘',
    '추천좀',
    '영화',
    '드라마',
    '시리즈',
    '작품',
    '컨텐츠',
    '콘텐츠',
    '보고싶어',
    '보고 싶어',
    '볼만한',
    '비슷한',
    '같은',
    '느낌',
    '분위기',
    '장르',
    '종류',
    '전부',
    '위주',
    '중',
    '더',
    '좀',
    '제발',
    '해주세요',
    '해줘',
    '찾아줘',
    '알려줘',
    '보고싶은',
  ].map((s) => norm(s)),
);

export const STOPWORDS_EN: ReadonlySet<string> = new Set(
  [
    'recommend',
    'recommendation',
    'please',
    'movie',
    'movies',
    'film',
    'films',
    'tv',
    'series',
    'show',
    'shows',
    'like',
    'similar',
    'something',
    'anything',
    'a',
    'an',
    'and',
    'or',
    'the',
    'of',
    'to',
    'for',
    'in',
    'on',
    'with',
    'without',
    'about',
  ].map((s) => norm(s)),
);

export const JUNK_TOKENS: ReadonlySet<string> = new Set([
  '',
  ' ',
  '\n',
  '\t',
  ',',
  '.',
  '…',
  '!',
  '?',
  ':',
  ';',
  '/',
  '\\',
  '|',
  '-',
  '_',
  '~',
  '`',
  '"',
  "'",
  '“',
  '”',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '<',
  '>',
  '@',
  '#',
  '$',
  '%',
  '^',
  '&',
  '*',
  '+',
  '=',
]);

export const NEGATION_PATTERNS: readonly string[] = [
  // EN
  'no',
  'not',
  "don't",
  'dont',
  'without',
  'avoid',
  'exclude',
  'except',
  'excluding',
  // KO
  '안',
  '않',
  '싫',
  '싫어',
  '싫은',
  '빼고',
  '제외',
  '말고',
  '없이',
] as const;

/**
 * ------------------------------------------------------------------------------------
 * ✅ 대용량 브랜드/프랜차이즈/장르 렉시콘
 * ------------------------------------------------------------------------------------
 * ⚠️ 아래 PICKY_LEXICON은 네가 준 데이터(대용량)를 그대로 유지/확장한 구조.
 * 필요하면 이 블록에 계속 추가만 하면 됨.
 */
export const PICKY_LEXICON: PickyLexicon = {
  // ===========================================================================
  // Disney / Pixar / Marvel / Lucasfilm / 20th / Searchlight
  // ===========================================================================
  디즈니: E(
    [
      '디즈니',
      'Disney',
      'Walt Disney',
      'Walt Disney Pictures',
      'Walt Disney Studios',
      'Disney Pictures',
      '디즈니 영화',
      '디즈니 애니',
      '디즈니 애니메이션',
      'Disney Animation',
      'Disney Animated',
      '월트 디즈니',
    ],
    [
      'Walt Disney Pictures',
      'Walt Disney Animation Studios',
      'Walt Disney Studios',
    ],
  ),
  disney: E(
    [
      'Disney',
      'Walt Disney',
      'Walt Disney Pictures',
      'Walt Disney Animation Studios',
    ],
    ['Walt Disney Pictures', 'Walt Disney Animation Studios'],
  ),
  'walt disney': E(
    ['Walt Disney', 'Walt Disney Pictures'],
    ['Walt Disney Pictures'],
  ),
  'walt disney pictures': E(
    ['Walt Disney Pictures', 'Disney Pictures'],
    ['Walt Disney Pictures'],
  ),
  'walt disney animation': E(
    [
      'Walt Disney Animation',
      'Walt Disney Animation Studios',
      'Disney Animation Studios',
      'Disney Animation',
    ],
    ['Walt Disney Animation Studios'],
  ),
  디즈니플러스: E(
    [
      '디즈니플러스',
      '디즈니 플러스',
      'Disney+',
      'Disney Plus',
      '디플',
      '디즈니+',
      'disney+',
    ],
    ['Disney'],
  ),
  'disney+': E(['Disney+', 'Disney Plus'], ['Disney']),
  '20세기폭스': E(
    ['20세기폭스', '20th Century Fox', '20th Century', '20세기 스튜디오'],
    ['20th Century Studios', '20th Century Fox'],
  ),
  '20th century': E(
    ['20th Century', '20th Century Fox', '20th Century Studios'],
    ['20th Century Studios', '20th Century Fox'],
  ),
  '20th century studios': E(
    ['20th Century Studios', '20th Century', '20세기 스튜디오'],
    ['20th Century Studios'],
  ),
  searchlight: E(
    ['Searchlight', 'Searchlight Pictures', '폭스 서치라이트', '서치라이트'],
    ['Searchlight Pictures'],
  ),
  'searchlight pictures': E(
    ['Searchlight Pictures', 'Searchlight'],
    ['Searchlight Pictures'],
  ),
  touchstone: E(
    ['Touchstone', 'Touchstone Pictures', '터치스톤'],
    ['Touchstone Pictures'],
  ),
  'buena vista': E(
    [
      'Buena Vista',
      'Buena Vista Pictures',
      'Buena Vista Distribution',
      '부에나 비스타',
    ],
    ['Buena Vista'],
  ),

  pixar: E(
    ['Pixar', '픽사', 'Pixar Animation Studios', '픽사 애니'],
    ['Pixar Animation Studios'],
  ),
  픽사: E(
    ['픽사', 'Pixar', 'Pixar Animation Studios'],
    ['Pixar Animation Studios'],
  ),
  'pixar animation': E(
    ['Pixar Animation Studios', 'Pixar Animation'],
    ['Pixar Animation Studios'],
  ),

  마블: E(
    ['마블', 'Marvel', 'Marvel Studios', 'MCU', '마블 스튜디오'],
    ['Marvel Studios'],
  ),
  marvel: E(['Marvel', 'Marvel Studios', 'MCU'], ['Marvel Studios']),
  mcu: E(
    ['MCU', 'Marvel Cinematic Universe', '마블 시네마틱 유니버스'],
    ['Marvel Studios'],
  ),
  lucasfilm: E(['Lucasfilm', '루카스필름'], ['Lucasfilm']),
  스타워즈: E(
    ['스타워즈', 'Star Wars', '루카스필름', 'Lucasfilm'],
    ['Lucasfilm'],
  ),
  'star wars': E(['Star Wars', 'Lucasfilm'], ['Lucasfilm']),
  starwars: E(['StarWars', 'Star Wars'], ['Lucasfilm']),

  // ===========================================================================
  // Warner Bros / DC / HBO / Max / Cartoon Network / Adult Swim
  // ===========================================================================
  워너: E(
    [
      '워너',
      'Warner',
      'Warner Bros',
      'Warner Bros.',
      'Warner Bros Pictures',
      '워너브라더스',
    ],
    ['Warner Bros. Pictures', 'Warner Bros.'],
  ),
  warner: E(
    ['Warner', 'Warner Bros', 'Warner Bros. Pictures'],
    ['Warner Bros. Pictures'],
  ),
  'warner bros': E(
    ['Warner Bros', 'Warner Bros.', 'Warner Brothers'],
    ['Warner Bros.'],
  ),
  'warner bros pictures': E(
    ['Warner Bros. Pictures', 'Warner Bros Pictures'],
    ['Warner Bros. Pictures'],
  ),
  newline: E(
    ['New Line', 'New Line Cinema', '뉴라인', '뉴라인 시네마'],
    ['New Line Cinema'],
  ),
  'new line cinema': E(['New Line Cinema', 'New Line'], ['New Line Cinema']),

  dc: E(
    ['DC', 'DC Comics', 'DC Films', 'DC Studios', '디씨'],
    ['DC Films', 'DC Studios'],
  ),
  'dc studios': E(['DC Studios', 'DC', 'DC Films'], ['DC Studios', 'DC Films']),
  디씨: E(['디씨', 'DC', 'DC Films', 'DC Studios'], ['DC Films', 'DC Studios']),

  hbo: E(['HBO', 'HBO Originals', 'HBO Max', 'Max', '에이치비오'], ['HBO']),
  'hbo max': E(['HBO Max', 'HBOMax', 'Max', 'HBO맥스'], ['HBO']),
  max: E(['Max', 'HBO Max'], ['HBO']),

  cartoonnetwork: E(
    ['Cartoon Network', '카툰네트워크', 'CN'],
    ['Cartoon Network'],
  ),
  'cartoon network': E(
    ['Cartoon Network', 'CN', '카툰네트워크'],
    ['Cartoon Network'],
  ),
  adultswim: E(['Adult Swim', '어덜트 스윔'], ['Adult Swim']),
  'adult swim': E(['Adult Swim', 'AS', '어덜트스윔'], ['Adult Swim']),

  // ===========================================================================
  // Universal / Focus / DreamWorks / Illumination / Working Title / Peacock
  // ===========================================================================
  유니버설: E(
    ['유니버설', 'Universal', 'Universal Pictures', '유니버설 픽처스'],
    ['Universal Pictures'],
  ),
  universal: E(['Universal', 'Universal Pictures'], ['Universal Pictures']),
  'universal pictures': E(
    ['Universal Pictures', 'Universal'],
    ['Universal Pictures'],
  ),
  focus: E(['Focus Features', '포커스', '포커스 피처스'], ['Focus Features']),
  'focus features': E(['Focus Features', 'Focus'], ['Focus Features']),
  workingtitle: E(
    ['Working Title', 'Working Title Films', '워킹 타이틀'],
    ['Working Title Films'],
  ),
  'working title': E(
    ['Working Title', 'Working Title Films'],
    ['Working Title Films'],
  ),
  블룸하우스: E(
    ['Blumhouse', '블룸하우스', 'Blumhouse Productions'],
    ['Blumhouse Productions'],
  ),
  blumhouse: E(
    ['Blumhouse', 'Blumhouse Productions'],
    ['Blumhouse Productions'],
  ),

  드림웍스: E(
    ['드림웍스', 'DreamWorks', 'DreamWorks Animation', '드림웍스 애니'],
    ['DreamWorks Animation'],
  ),
  dreamworks: E(
    ['DreamWorks', 'DreamWorks Animation'],
    ['DreamWorks Animation'],
  ),
  illumination: E(
    ['Illumination', '일루미네이션', 'Illumination Entertainment'],
    ['Illumination Entertainment'],
  ),
  일루미네이션: E(
    ['일루미네이션', 'Illumination'],
    ['Illumination Entertainment'],
  ),
  peacock: E(['Peacock', '피콕', 'NBC Peacock'], ['NBCUniversal']),
  'peacock tv': E(['Peacock', 'Peacock TV'], ['NBCUniversal']),

  // ===========================================================================
  // Paramount / Nickelodeon / CBS / Showtime / Paramount+
  // ===========================================================================
  paramount: E(
    [
      'Paramount',
      '파라마운트',
      'Paramount Pictures',
      'Paramount+',
      'Paramount Plus',
      '파라마운트+',
    ],
    ['Paramount Pictures'],
  ),
  'paramount pictures': E(
    ['Paramount Pictures', 'Paramount'],
    ['Paramount Pictures'],
  ),
  'paramount+': E(
    ['Paramount+', 'Paramount Plus', '파라마운트+', '파플'],
    ['Paramount Pictures'],
  ),
  nickelodeon: E(
    ['Nickelodeon', '니켈로디언', 'Nickelodeon Movies'],
    ['Nickelodeon'],
  ),
  'nickelodeon movies': E(
    ['Nickelodeon Movies', 'Nick Movies'],
    ['Nickelodeon'],
  ),
  cbs: E(['CBS', 'CBS Studios'], ['CBS']),
  'cbs studios': E(['CBS Studios', 'CBS'], ['CBS']),
  showtime: E(['Showtime', '쇼타임'], ['Showtime']),
  'showtime networks': E(['Showtime', 'Showtime Networks'], ['Showtime']),

  // ===========================================================================
  // Sony / Columbia / TriStar / Screen Gems / Sony Animation / Crunchyroll
  // ===========================================================================
  소니: E(
    [
      '소니',
      'Sony',
      'Sony Pictures',
      'Sony Pictures Entertainment',
      '소니픽처스',
    ],
    ['Sony Pictures', 'Sony Pictures Entertainment'],
  ),
  sony: E(
    ['Sony', 'Sony Pictures', 'Sony Pictures Entertainment'],
    ['Sony Pictures'],
  ),
  'sony pictures': E(
    ['Sony Pictures', 'Sony Pictures Entertainment'],
    ['Sony Pictures'],
  ),
  columbia: E(
    ['Columbia', 'Columbia Pictures', '컬럼비아', '콜럼비아'],
    ['Columbia Pictures'],
  ),
  'columbia pictures': E(
    ['Columbia Pictures', 'Columbia'],
    ['Columbia Pictures'],
  ),
  tristar: E(
    ['TriStar', 'TriStar Pictures', '트라이스타'],
    ['TriStar Pictures'],
  ),
  'tristar pictures': E(['TriStar Pictures', 'TriStar'], ['TriStar Pictures']),
  screengems: E(['Screen Gems', '스크린 젬스', '스크린젬스'], ['Screen Gems']),
  'screen gems': E(['Screen Gems'], ['Screen Gems']),
  'sony pictures animation': E(
    ['Sony Pictures Animation', '소니 애니메이션', 'SPA'],
    ['Sony Pictures Animation'],
  ),
  crunchyroll: E(['Crunchyroll', '크런치롤', '크런치 롤'], ['Crunchyroll']),
  funimation: E(['Funimation', '퍼니메이션'], ['Funimation']),
  aniplex: E(['Aniplex', '애니플렉스', '애니플렉스 일본'], ['Aniplex']),

  // ===========================================================================
  // Amazon / MGM / Apple / Lionsgate / A24 / Miramax / Legendary / Skydance
  // ===========================================================================
  아마존: E(
    [
      '아마존',
      'Amazon',
      'Prime Video',
      'Amazon MGM Studios',
      '아마프라',
      '프라임비디오',
    ],
    ['Amazon MGM Studios'],
  ),
  'prime video': E(
    ['Prime Video', 'Amazon Prime Video', '프라임비디오', '프라임'],
    ['Amazon MGM Studios'],
  ),
  'amazon mgm': E(['Amazon MGM Studios', 'Amazon MGM'], ['Amazon MGM Studios']),
  mgm: E(
    ['MGM', 'Metro-Goldwyn-Mayer', '메트로 골드윈 메이어'],
    ['Metro-Goldwyn-Mayer'],
  ),
  'amazon studios': E(['Amazon Studios'], ['Amazon Studios']),

  애플tv: E(
    ['애플tv', 'Apple TV+', 'Apple TV Plus', 'Apple TV', '애플티비'],
    ['Apple'],
  ),
  'apple tv+': E(
    ['Apple TV+', 'Apple TV Plus', '애플tv+', '애플티비+'],
    ['Apple'],
  ),

  라이언스게이트: E(
    ['라이언스게이트', 'Lionsgate', 'Lions Gate'],
    ['Lionsgate'],
  ),
  lionsgate: E(['Lionsgate', 'Lions Gate'], ['Lionsgate']),
  a24: E(['A24', '에이투포', 'A-24'], ['A24']),
  miramax: E(['Miramax', '미라맥스'], ['Miramax']),
  legendary: E(
    ['Legendary', '레전더리', 'Legendary Pictures'],
    ['Legendary Pictures'],
  ),
  'legendary pictures': E(
    ['Legendary Pictures', 'Legendary'],
    ['Legendary Pictures'],
  ),
  skydance: E(['Skydance', '스카이댄스', 'Skydance Media'], ['Skydance Media']),
  'skydance media': E(['Skydance Media', 'Skydance'], ['Skydance Media']),

  // ===========================================================================
  // Netflix / Hulu / Max / Starz / AMC+ / Shudder / MUBI / Criterion
  // ===========================================================================
  넷플릭스: E(
    ['넷플릭스', '넷플', 'Netflix', 'Netflix Original', '넷플 오리지널'],
    ['Netflix'],
  ),
  netflix: E(['Netflix', 'Netflix Original'], ['Netflix']),
  hulu: E(['Hulu', '훌루'], ['Hulu']),
  starz: E(['Starz', '스타즈'], ['Starz']),
  'amc+': E(['AMC+', 'AMC Plus', 'amc plus'], ['AMC']),
  shudder: E(['Shudder', '셔더'], ['Shudder']),
  mubi: E(['MUBI', '무비'], ['MUBI']),
  'criterion channel': E(
    ['Criterion Channel', '크라이테리언', '크리테리언'],
    ['The Criterion Collection'],
  ),

  // ===========================================================================
  // Japan major companies / distributors
  // ===========================================================================
  toei: E(
    ['Toei', 'Toei Animation', '토에이', '토에이 애니'],
    ['Toei Animation'],
  ),
  토에이: E(['토에이', 'Toei', 'Toei Animation'], ['Toei Animation']),
  toho: E(['TOHO', 'Toho', '도호'], ['TOHO']),
  kadokawa: E(['KADOKAWA', 'Kadokawa', '카도카와'], ['KADOKAWA']),

  // ===========================================================================
  // Ghibli / Japan Anime Studios
  // ===========================================================================
  지브리: E(
    [
      '지브리',
      'Studio Ghibli',
      'Ghibli',
      '스튜디오 지브리',
      '미야자키',
      'Miyazaki',
      '하야오',
    ],
    ['Studio Ghibli'],
  ),
  ghibli: E(['Studio Ghibli', 'Ghibli'], ['Studio Ghibli']),
  miyazaki: E(
    ['Miyazaki', 'Hayao Miyazaki', '미야자키', '하야오'],
    ['Studio Ghibli'],
  ),

  sunrise: E(
    ['Sunrise', '선라이즈', 'Bandai Namco Filmworks'],
    ['Sunrise', 'Bandai Namco Filmworks'],
  ),
  bandainamco: E(
    ['Bandai Namco Filmworks', '반다이남코'],
    ['Bandai Namco Filmworks'],
  ),
  madhouse: E(['MADHOUSE', 'Madhouse', '매드하우스'], ['Madhouse']),
  mappa: E(['MAPPA', 'Mappa', '마파'], ['MAPPA']),
  bones: E(['BONES', 'Bones', '본즈'], ['Bones']),
  'kyoto animation': E(
    ['Kyoto Animation', 'KyoAni', '쿄애니', '교토 애니메이션'],
    ['Kyoto Animation'],
  ),
  kyoani: E(['KyoAni', 'Kyoto Animation', '쿄애니'], ['Kyoto Animation']),
  ufotable: E(['ufotable', '유포테이블'], ['ufotable']),
  'wit studio': E(['Wit Studio', 'WIT', '위트 스튜디오'], ['Wit Studio']),
  'production i.g': E(
    ['Production I.G', '프로덕션 I.G', 'IG'],
    ['Production I.G'],
  ),
  'a-1': E(['A-1 Pictures', 'A1', 'A-1', '에이원픽쳐스'], ['A-1 Pictures']),
  'a-1 pictures': E(['A-1 Pictures', 'A1'], ['A-1 Pictures']),
  cloverworks: E(['CloverWorks', '클로버웍스'], ['CloverWorks']),
  trigger: E(['TRIGGER', 'Trigger', '트리거'], ['Trigger']),
  pierrot: E(
    ['Pierrot', 'Studio Pierrot', '스튜디오 피에로', '피에로'],
    ['Pierrot', 'Studio Pierrot'],
  ),

  // ===========================================================================
  // Korea: broadcasters / platforms / studios & distributors
  // ===========================================================================
  cj: E(['CJ', 'CJ ENM', '씨제이', '씨제이이엔엠'], ['CJ ENM']),
  'cj enm': E(['CJ ENM', 'CJ', 'tvN'], ['CJ ENM']),
  스튜디오드래곤: E(
    ['스튜디오드래곤', 'Studio Dragon', '스드'],
    ['Studio Dragon'],
  ),
  jtbc: E(['JTBC', '제이티비씨'], ['JTBC']),
  sll: E(
    ['SLL', 'JTBC Studios', 'jtbc studios', '에스엘엘'],
    ['SLL', 'JTBC Studios'],
  ),
  tvn: E(['tvN', '티비엔'], ['tvN']),
  tving: E(['TVING', '티빙'], ['TVING']),
  웨이브: E(['웨이브', 'Wavve'], ['Wavve']),
  쿠팡플레이: E(['쿠팡플레이', 'Coupang Play'], ['Coupang Play']),
  왓챠: E(['왓챠', 'WATCHA', 'Watcha'], ['Watcha']),

  // ===========================================================================
  // Big franchises / IP keywords
  // ===========================================================================
  원피스: E(
    ['원피스', 'One Piece', 'ONE PIECE', '와노쿠니', '밀짚모자'],
    undefined,
  ),
  'one piece': E(['One Piece', '원피스'], undefined),
  나루토: E(['나루토', 'Naruto', '나뭇잎마을'], undefined),
  naruto: E(['Naruto', '나루토'], undefined),
  귀멸: E(['귀멸의칼날', '귀멸', 'Demon Slayer', 'Kimetsu'], undefined),
  'demon slayer': E(['Demon Slayer', '귀멸의칼날', 'Kimetsu'], undefined),

  해리포터: E(
    ['해리포터', 'Harry Potter', 'Wizarding World', '호그와트'],
    undefined,
  ),
  'harry potter': E(['Harry Potter', 'Wizarding World'], undefined),

  // ===========================================================================
  // Genres / moods / intents
  // ===========================================================================
  '일본 애니': E(
    ['일본 애니', '일본 애니메이션', 'Japan anime', 'Anime', '애니 추천'],
    undefined,
  ),
  애니: E(['애니', '애니메이션', 'Anime', 'Animation'], undefined),

  힐링: E(
    ['힐링', '치유', '따뜻한', '잔잔한', '감성', 'cozy', 'healing'],
    undefined,
  ),
  감성: E(
    ['감성', '잔잔한', '따뜻한', '몽글몽글', '여운', 'emotional'],
    undefined,
  ),
  가족: E(
    ['가족', 'family', '가족영화', '패밀리', 'kids', 'children'],
    undefined,
  ),
  모험: E(['모험', 'adventure', '어드벤처'], undefined),
  판타지: E(['판타지', 'fantasy', '마법', '이세계'], undefined),
  로맨스: E(['로맨스', 'romance', '멜로', '사랑'], undefined),
  성장: E(['성장', 'coming of age', '청춘', '성장물'], undefined),
  공포: E(['공포', '호러', 'horror', '무서운', '점프스케어'], undefined),
  스릴러: E(['스릴러', 'thriller', '서스펜스', '추적'], undefined),
  코미디: E(['코미디', 'comedy', '유쾌', '웃긴'], undefined),
  액션: E(['액션', 'action', '전투', '격투'], undefined),
  sf: E(['sf', 'sci-fi', '공상과학', '우주', '미래'], undefined),
  미스터리: E(['미스터리', 'mystery', '추리'], undefined),
  범죄: E(['범죄', 'crime', '느와르'], undefined),
  다큐: E(['다큐', 'documentary', '다큐멘터리', '실화'], undefined),
};

export const PICKY_ALIASES: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(PICKY_LEXICON)) out[k] = PICKY_LEXICON[k].aliases;
  return out;
})();

export const BRAND_HINTS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(PICKY_LEXICON)) {
    const hints = PICKY_LEXICON[k].companyHints;
    if (hints?.length) out[k] = hints;
  }
  return out;
})();

/**
 * 해시태그/약칭 패턴들 (자주 쓰이는 것만 regex로 빠르게 잡기)
 */
const KO_HASHTAG_ALIASES: Array<{ re: RegExp; key: string }> = [
  // platforms
  {
    re: /디즈니\+|디즈니플러스|디즈니 플러스|디플|Disney\s*\+|Disney\s*Plus/i,
    key: '디즈니플러스',
  },
  { re: /넷플|넷플릭스|Netflix/i, key: '넷플릭스' },
  { re: /프라임\s*비디오|Prime\s*Video|Amazon\s*Prime/i, key: 'prime video' },
  { re: /애플\s*tv\+|Apple\s*TV\+|Apple\s*TV\s*Plus/i, key: 'apple tv+' },
  { re: /HBO\s*Max|HBOMax|\bMax\b/i, key: 'hbo max' },
  { re: /Paramount\+|Paramount\s*Plus|파라마운트\+/i, key: 'paramount+' },

  // brands/studios
  { re: /디즈니|Disney/i, key: '디즈니' },
  { re: /픽사|Pixar/i, key: '픽사' },
  { re: /마블|Marvel|MCU/i, key: '마블' },
  { re: /루카스필름|Lucasfilm/i, key: 'lucasfilm' },
  { re: /스타\s*워즈|Star\s*Wars/i, key: '스타워즈' },
  { re: /워너|Warner|Warner\s*Bros/i, key: '워너' },
  { re: /\bDC\b|DC\s*Studios|DC\s*Films|디씨/i, key: 'dc' },

  // ghibli & anime studios
  { re: /지브리|Ghibli|스튜디오\s*지브리|미야자키|Miyazaki/i, key: '지브리' },
  { re: /MAPPA|마파/i, key: 'mappa' },
  { re: /ufotable|유포테이블/i, key: 'ufotable' },
  { re: /Kyoto\s*Animation|KyoAni|쿄애니|교토/i, key: 'kyoto animation' },

  // k-content
  { re: /티빙|TVING/i, key: 'tving' },
  { re: /웨이브|Wavve/i, key: '웨이브' },
  { re: /쿠팡\s*플레이|Coupang\s*Play/i, key: '쿠팡플레이' },
  { re: /왓챠|Watcha|WATCHA/i, key: '왓챠' },

  // phrases
  { re: /일본\s*애니|일본\s*애니메이션|Japan\s*anime/i, key: '일본 애니' },
  { re: /애니|애니메이션|Anime|Animation/i, key: '애니' },
];

const KEYWORD_STOPLIST = new Set(
  [
    '추천',
    '영화',
    '드라마',
    '애니',
    '애니메이션',
    '작품',
    '컨텐츠',
    '콘텐츠',
    '보고싶어',
    '보고 싶어',
    '비슷한',
    '같은',
    '느낌',
    '분위기',
  ].map((s) => norm(s)),
);

const LEXICON_KEYS = Object.keys(PICKY_LEXICON);
const LEXICON_KEYS_LOWER = LEXICON_KEYS.map((k) => k.toLowerCase());

const PICKY_KEY_BY_NORM = new Map<string, string>();
for (const k of LEXICON_KEYS) PICKY_KEY_BY_NORM.set(norm(k), k);

const getPickyEntry = (k: string): PickyLexiconEntry | undefined => {
  const direct = PICKY_LEXICON[k];
  if (direct) return direct;
  const nk = norm(k);
  const orig = PICKY_KEY_BY_NORM.get(nk);
  return orig ? PICKY_LEXICON[orig] : undefined;
};

export function expandQueriesByBrandLexicon(query: string, max = 6): string[] {
  const q = (query || '').trim();
  if (!q) return [];

  const out: string[] = [q];
  const hitKeys: string[] = [];

  const lower = q.toLowerCase();

  // 1) regex 기반 히트
  for (const { re, key } of KO_HASHTAG_ALIASES) {
    if (re.test(q)) hitKeys.push(key);
  }

  // 2) 표제어 직접 포함 히트(캐시된 key 배열 사용)
  for (let i = 0; i < LEXICON_KEYS_LOWER.length; i++) {
    const kLower = LEXICON_KEYS_LOWER[i];
    if (kLower.length < 2) continue;
    if (lower.includes(kLower)) hitKeys.push(LEXICON_KEYS[i]);
  }

  const keys = uniqStrings(hitKeys).slice(0, 6);
  for (const k of keys) {
    const entry = getPickyEntry(k);
    if (!entry) continue;

    // query 확장: 원문 + "원문 + alias" + alias 단독
    for (const a of entry.aliases) {
      if (out.length >= max) break;
      const composed = `${q} ${a}`.trim();
      if (!out.some((x) => norm(x) === norm(composed))) out.push(composed);
    }
    for (const a of entry.aliases) {
      if (out.length >= max) break;
      if (!out.some((x) => norm(x) === norm(a))) out.push(a);
    }
    if (out.length >= max) break;
  }

  return out.slice(0, max);
}

export function expandKeywordsByBrandLexicon(
  keywords: string[],
  max = 24,
): string[] {
  const base = uniqStrings(keywords);
  const extra: string[] = [];

  for (const k of base) {
    const entry = getPickyEntry(k);
    if (!entry) continue;
    for (const a of entry.aliases) extra.push(a);
  }

  const merged = uniqStrings([...base, ...extra]).filter(
    (k) => !KEYWORD_STOPLIST.has(norm(k)),
  );
  return merged.slice(0, max);
}

export function inferPickySignals(
  prompt: string,
  includeKeywords: string[],
  opts?: { maxInclude?: number },
): {
  includeExpanded: string[];
  companyQueries: string[];
  detectedOriginalLanguage: string | null;
} {
  const p = (prompt || '').trim();
  const base = uniqStrings(includeKeywords);

  const hitKeys: string[] = [];

  for (const { re, key } of KO_HASHTAG_ALIASES) {
    if (re.test(p)) hitKeys.push(key);
  }

  const pl = p.toLowerCase();
  for (let i = 0; i < LEXICON_KEYS_LOWER.length; i++) {
    const kLower = LEXICON_KEYS_LOWER[i];
    if (kLower.length < 2) continue;
    if (pl.includes(kLower)) hitKeys.push(LEXICON_KEYS[i]);
  }

  const expandedFromPrompt = expandKeywordsByBrandLexicon(hitKeys, 18);
  const includeExpanded = expandKeywordsByBrandLexicon(
    [...base, ...expandedFromPrompt],
    opts?.maxInclude ?? 24,
  );

  const companyQueries: string[] = [];
  for (const k of uniqStrings([...hitKeys, ...base])) {
    const entry = getPickyEntry(k);
    if (!entry?.companyHints?.length) continue;
    companyQueries.push(...entry.companyHints);
  }

  let detectedOriginalLanguage: string | null = null;
  if (/(일본|japan|anime|애니|일드|j-drama)/i.test(p))
    detectedOriginalLanguage = 'ja';
  if (/(한국|korea|k-drama|국내|한국 드라마|한국영화)/i.test(p))
    detectedOriginalLanguage = 'ko';
  if (/(english|미드|usa|america)/i.test(p))
    detectedOriginalLanguage = detectedOriginalLanguage ?? 'en';

  return {
    includeExpanded,
    companyQueries: uniqStrings(companyQueries).slice(0, 12),
    detectedOriginalLanguage,
  };
}

/**
 * ------------------------------------------------------------------------------------
 * ✅ picky.query.ts 호환 LEXICON 생성(자동)
 * ------------------------------------------------------------------------------------
 */
const mergeLexiconEntry = (
  a: LexiconEntry | undefined,
  b: LexiconEntry,
): LexiconEntry => {
  const mergeArr = (x?: string[], y?: string[]) =>
    uniqStrings([...(x ?? []), ...(y ?? [])]);
  return {
    expand: mergeArr(a?.expand, b.expand),
    must: mergeArr(a?.must, b.must),
    should: mergeArr(a?.should, b.should),
    not: mergeArr(a?.not, b.not),
    tags: mergeArr(a?.tags, b.tags),
    mediaTypeHint: b.mediaTypeHint ?? a?.mediaTypeHint,
    entityHints: {
      company: mergeArr(a?.entityHints?.company, b.entityHints?.company),
      person: mergeArr(a?.entityHints?.person, b.entityHints?.person),
      keyword: mergeArr(a?.entityHints?.keyword, b.entityHints?.keyword),
      franchise: mergeArr(a?.entityHints?.franchise, b.entityHints?.franchise),
      network: mergeArr(a?.entityHints?.network, b.entityHints?.network),
    },
  };
};

const putLexicon = (
  map: Record<string, LexiconEntry>,
  term: string,
  entry: LexiconEntry,
) => {
  const k1 = norm(term);
  const k2 = normKey(term);
  map[k1] = mergeLexiconEntry(map[k1], entry);
  map[k2] = mergeLexiconEntry(map[k2], entry);
};

const looksLikeMediaHint = (k: string) => {
  const x = norm(k);
  if (/(movie|film|영화)/i.test(x)) return ['movie'] as Array<'movie' | 'tv'>;
  if (/(tv|series|show|드라마|시리즈)/i.test(x))
    return ['tv'] as Array<'movie' | 'tv'>;
  return undefined;
};

const inferTagBucket = (
  k: string,
  e: PickyLexiconEntry,
): { tag: string; bucket: keyof NonNullable<LexiconEntry['entityHints']> } => {
  const nk = norm(k);

  if (e.companyHints?.length) {
    if (
      /(netflix|disney\+|prime|apple|hbo|max|paramount|peacock|hulu|tving|wavve|watcha|coupang)/i.test(
        nk,
      )
    ) {
      return { tag: 'network', bucket: 'network' };
    }
    return { tag: 'company', bucket: 'company' };
  }

  if (
    /(원피스|나루토|블리치|드래곤볼|진격|귀멸|주술|건담|에반|코난|포켓몬|해리포터|반지의제왕|스타트렉|007|배트맨|스파이더맨|겨울왕국|토이스토리|미니언즈|슈렉)/i.test(
      k,
    )
  ) {
    return { tag: 'franchise', bucket: 'franchise' };
  }

  return { tag: 'keyword', bucket: 'keyword' };
};

export const LEXICON: Record<string, LexiconEntry> = (() => {
  const map: Record<string, LexiconEntry> = {};

  for (const head of Object.keys(PICKY_LEXICON)) {
    const entry = PICKY_LEXICON[head];
    const { tag, bucket } = inferTagBucket(head, entry);

    const expand = uniqStrings([
      head,
      ...entry.aliases,
      ...(entry.companyHints ?? []),
    ]).map((s) => norm(s));
    const mediaHint = looksLikeMediaHint(head);

    const base: LexiconEntry = {
      expand,
      tags: [tag],
      mediaTypeHint: mediaHint,
      entityHints: {
        company:
          bucket === 'company' ? uniqStrings(entry.companyHints ?? []) : [],
        network:
          bucket === 'network' ? uniqStrings(entry.companyHints ?? []) : [],
        franchise: bucket === 'franchise' ? [head, ...entry.aliases] : [],
        keyword: bucket === 'keyword' ? [head, ...entry.aliases] : [],
        person: [],
      },
      should: bucket === 'keyword' ? [head] : [],
    };

    putLexicon(map, head, base);
    for (const a of entry.aliases) putLexicon(map, a, base);
    for (const ch of entry.companyHints ?? []) putLexicon(map, ch, base);
  }

  // 자주 쓰는 일반 토큰 보강
  const commonMedia: Array<[string, LexiconEntry]> = [
    [
      '영화',
      {
        tags: ['media'],
        mediaTypeHint: ['movie'],
        should: ['movie'],
        expand: ['movie', 'film', '영화'],
      },
    ],
    [
      '드라마',
      {
        tags: ['media'],
        mediaTypeHint: ['tv'],
        should: ['tv', 'series'],
        expand: ['tv', 'series', '드라마', '시리즈'],
      },
    ],
    [
      '애니',
      {
        tags: ['format'],
        should: ['animation', 'anime'],
        expand: ['anime', 'animation', '애니', '애니메이션'],
      },
    ],
    [
      '애니메이션',
      {
        tags: ['format'],
        should: ['animation', 'anime'],
        expand: ['anime', 'animation', '애니', '애니메이션'],
      },
    ],
  ];
  for (const [k, v] of commonMedia) putLexicon(map, k, v);

  for (const n of NEGATION_PATTERNS)
    putLexicon(map, n, { tags: ['negation'], expand: [n] });

  return map;
})();
