// frontend/src/features/picky/algorithm/brandLexicon.ts

export const BRAND_ALIASES: Record<string, string[]> = {
  // ===== Disney / Pixar / Animation =====
  디즈니: [
    "Disney",
    "Walt Disney",
    "Walt Disney Studios",
    "Walt Disney Animation Studios",
    "Disney Animation",
    "Disney Studios",
    "Disney Pictures",
    "Disney Feature Animation",
    "Disney+",
    "Disney Plus",
  ],
  디즈니플러스: ["Disney+", "Disney Plus", "Disney Plus Originals"],
  픽사: ["Pixar", "Pixar Animation Studios", "Disney Pixar", "Pixar Studios"],
  드림웍스: ["DreamWorks", "DreamWorks Animation", "DreamWorks Pictures"],
  일루미네이션: ["Illumination", "Illumination Entertainment"],
  "워너 애니": ["Warner Animation", "Warner Bros. Animation"],
  카툰네트워크: ["Cartoon Network", "CN"],
  어덜트스윔: ["Adult Swim"],
  니켈로디언: ["Nickelodeon", "Nick", "Paramount Nickelodeon"],

  // ===== Marvel / Star Wars / DC =====
  마블: ["Marvel", "Marvel Studios", "Marvel Entertainment", "MCU"],
  "마블 스튜디오": ["Marvel Studios", "Marvel Cinematic Universe", "MCU"],
  스타워즈: ["Star Wars", "Lucasfilm", "Disney Lucasfilm"],
  루카스필름: ["Lucasfilm"],
  디씨: ["DC", "DC Comics", "DC Studios"],
  워너브라더스: [
    "Warner Bros.",
    "Warner Brothers",
    "WB",
    "Warner Bros Pictures",
  ],
  뉴라인: ["New Line Cinema", "New Line"],
  HBO: ["HBO", "Home Box Office", "HBO Originals", "HBO Max", "Max"],
  HBO맥스: ["HBO Max", "Max"],

  // ===== Major Studios =====
  유니버설: ["Universal", "Universal Pictures"],
  파라마운트: ["Paramount", "Paramount Pictures"],
  소니: ["Sony", "Sony Pictures", "Columbia Pictures", "TriStar Pictures"],
  컬럼비아: ["Columbia Pictures"],
  "20세기폭스": ["20th Century", "20th Century Studios", "20th Century Fox"],
  서치라이트: ["Searchlight Pictures", "Fox Searchlight"],
  A24: ["A24"],
  블룸하우스: ["Blumhouse", "Blumhouse Productions"],
  라이언스게이트: ["Lionsgate"],
  미라맥스: ["Miramax"],
  MGM: ["MGM", "Metro-Goldwyn-Mayer"],

  // ===== Streaming / Platforms =====
  넷플릭스: ["Netflix", "Netflix Originals", "Netflix Original"],
  프라임: ["Prime Video", "Amazon Prime Video", "Amazon Studios"],
  애플티비: ["Apple TV+", "Apple TV Plus", "Apple Originals"],
  훌루: ["Hulu", "Hulu Originals"],
  쿠팡플레이: ["Coupang Play", "CoupangPlay"],
  티빙: ["TVING"],
  웨이브: ["Wavve"],
  왓챠: ["Watcha"],
  디즈니플러스오리지널: ["Disney+ Originals", "Disney Plus Originals"],

  // ===== Ghibli / Anime Studios =====
  지브리: [
    "Studio Ghibli",
    "Ghibli",
    "Hayao Miyazaki",
    "Miyazaki",
    "미야자키 하야오",
    "스튜디오 지브리",
  ],
  신카이: ["Makoto Shinkai", "Shinkai", "신카이 마코토"],
  호소다: ["Mamoru Hosoda", "Hosoda", "호소다 마모루"],

  토에이: ["Toei Animation", "Toei"],
  마파: ["MAPPA", "Studio MAPPA"],
  ufotable: ["ufotable"],
  매드하우스: ["Madhouse"],
  교토애니: ["Kyoto Animation", "KyoAni"],
  프로덕션IG: ["Production I.G", "Production IG"],
  본즈: ["Bones", "Studio Bones"],
  선라이즈: ["Sunrise", "Bandai Namco Filmworks"],
  트리거: ["TRIGGER", "Studio Trigger"],
  클로버웍스: ["CloverWorks"],
  "A-1": ["A-1 Pictures", "A1 Pictures"],
  WIT: ["WIT Studio", "WITSTUDIO"],
  스튜디오피에로: ["Studio Pierrot", "Pierrot"],
  타츠노코: ["Tatsunoko Production"],

  // ===== Big Franchises (Korean common) =====
  해리포터: ["Harry Potter", "Wizarding World"],
  반지의제왕: ["The Lord of the Rings", "LOTR"],
  호빗: ["The Hobbit"],
  미션임파서블: ["Mission: Impossible", "Mission Impossible"],
  분노의질주: ["Fast & Furious", "Fast and Furious"],
  쥬라기: ["Jurassic Park", "Jurassic World"],
  트랜스포머: ["Transformers"],
  스타트렉: ["Star Trek"],
  "007": ["James Bond", "007"],
  존윅: ["John Wick"],
  매트릭스: ["The Matrix", "Matrix"],
  터미네이터: ["Terminator"],
  에이리언: ["Alien", "Aliens"],
  프레데터: ["Predator"],
  인디아나존스: ["Indiana Jones"],
  탑건: ["Top Gun"],

  // ===== Korean broadcasters / labels (often used by users) =====
  tvN: ["tvN", "CJ ENM", "Studio Dragon", "StudioDragon"],
  JTBC: ["JTBC"],
  KBS: ["KBS"],
  SBS: ["SBS"],
  MBC: ["MBC"],
  스튜디오드래곤: ["Studio Dragon", "StudioDragon", "CJ ENM"],

  // ===== Extra English keys (so “disney pixar” also works) =====
  disney: ["Disney", "Walt Disney Animation Studios", "Disney+"],
  pixar: ["Pixar", "Pixar Animation Studios"],
  ghibli: ["Studio Ghibli", "Hayao Miyazaki"],
  marvel: ["Marvel Studios", "MCU"],
  "star wars": ["Star Wars", "Lucasfilm"],
  dc: ["DC Studios", "Warner Bros."],
};

function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function expandQueriesByBrandLexicon(query: string, max = 6): string[] {
  const q = (query || "").trim();
  if (!q) return [];
  const out = new Set<string>([q]);

  const nq = norm(q);
  for (const [k, aliases] of Object.entries(BRAND_ALIASES)) {
    const nk = norm(k);
    if (!nk) continue;

    if (nq.includes(nk)) {
      aliases.forEach((a) => out.add(a));
    }
  }

  return Array.from(out).slice(0, max);
}

export function expandKeywordsByBrandLexicon(
  keywords: string[],
  max = 24
): string[] {
  const base = (keywords || []).map((s) => (s || "").trim()).filter(Boolean);
  const out = new Set<string>(base);

  const normedBase = base.map(norm);
  for (const [k, aliases] of Object.entries(BRAND_ALIASES)) {
    const nk = norm(k);
    if (!nk) continue;

    // keyword 중 하나가 key를 포함하거나, key가 keyword를 포함하면 확장
    const hit = normedBase.some((x) => x.includes(nk) || nk.includes(x));
    if (hit) aliases.forEach((a) => out.add(a));
  }

  return Array.from(out).slice(0, max);
}
