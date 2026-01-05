// frontend/src/lib/originalBadge.ts
export type MediaType = "movie" | "tv";

export type OriginalOttKey =
  | "netflix"
  | "disney"
  | "prime"
  | "apple"
  | "wavve"
  | "tving"
  | "coupang";

export type OriginalBadge = {
  ott: OriginalOttKey;
  label: string;
  confidence: "high" | "medium" | "low";
};

type DetectMode = "strict" | "balanced" | "loose";

type DetectOriginalInput = {
  mediaType: MediaType;

  // ✅ 이미 너희가 가지고 있는 provider 뱃지/목록에서 "이름"만 뽑아서 넣으면 됨
  providerNames?: string[];

  // ✅ 상세(모달/디테일)에서만 들어오는 값들 (있으면 정확도↑)
  productionCompanyNames?: string[];
  networkNames?: string[]; // tv networks
  keywordNames?: string[];

  // KR 기준이면 보통 이 모드가 누락을 잘 잡음
  mode?: DetectMode;
};

const SIGNATURES: Array<{
  ott: OriginalOttKey;
  label: string;
  providerTokens: string[];
  companyTokens: string[];
  networkTokens: string[];
}> = [
  {
    ott: "netflix",
    label: "NETFLIX ORIGINAL",
    providerTokens: ["netflix"],
    companyTokens: ["netflix"],
    networkTokens: ["netflix"],
  },
  {
    ott: "disney",
    label: "DISNEY+ ORIGINAL",
    providerTokens: ["disney plus", "disney+"],
    companyTokens: ["disney", "disney+", "disney plus"],
    networkTokens: ["disney+", "disney plus"],
  },
  {
    ott: "prime",
    label: "PRIME ORIGINAL",
    providerTokens: ["amazon prime video", "prime video"],
    companyTokens: ["amazon", "amazon studios"],
    networkTokens: ["prime video", "amazon"],
  },
  {
    ott: "apple",
    label: "APPLE ORIGINAL",
    providerTokens: ["apple tv plus", "apple tv+"],
    companyTokens: ["apple original", "apple tv+"],
    networkTokens: ["apple tv+"],
  },

  // 국내 OTT (원하면 ORIGINAL 라벨로 써도 되고, 그냥 EXCLUSIVE로 바꿔도 됨)
  {
    ott: "wavve",
    label: "WAVVE ORIGINAL",
    providerTokens: ["wavve"],
    companyTokens: ["wavve"],
    networkTokens: ["wavve"],
  },
  {
    ott: "tving",
    label: "TVING ORIGINAL",
    providerTokens: ["tving"],
    companyTokens: ["tving"],
    networkTokens: ["tving"],
  },
  {
    ott: "coupang",
    label: "COUPANG PLAY ORIGINAL",
    providerTokens: ["coupang play"],
    companyTokens: ["coupang"],
    networkTokens: ["coupang play"],
  },
];

function norm(s: string) {
  return s.trim().toLowerCase();
}

function setOf(arr?: string[]) {
  return new Set((arr ?? []).map((v) => norm(v)).filter(Boolean));
}

function includesAnyToken(valueSet: Set<string>, tokens: string[]) {
  const t = tokens.map(norm);
  for (const v of valueSet) {
    for (const token of t) {
      if (!token) continue;
      if (v === token) return true;
      if (v.includes(token)) return true;
    }
  }
  return false;
}

function countMatchedOttProviders(providerSet: Set<string>) {
  let count = 0;
  for (const s of SIGNATURES) {
    if (includesAnyToken(providerSet, s.providerTokens)) count += 1;
  }
  return count;
}

/**
 * ✅ 영화/TV 공통 오리지널 판정
 * - strict: provider + (company/network/keyword) 필요 (가장 보수적)
 * - balanced(추천): provider + (company/network/keyword OR "해당 OTT만 단독 제공")이면 true
 * - loose: provider만 있으면 true (가장 공격적)
 */
export function detectOriginalBadge(input: DetectOriginalInput): OriginalBadge | null {
  const mode: DetectMode = input.mode ?? "balanced";

  const providerSet = setOf(input.providerNames);
  const companySet = setOf(input.productionCompanyNames);
  const networkSet = setOf(input.networkNames);
  const keywordSet = setOf(input.keywordNames);

  const keywordHints =
    [...keywordSet].some((k) => k.includes("original")) ||
    [...keywordSet].some((k) => k.includes("오리지널"));

  const matchedOttProviderCount = countMatchedOttProviders(providerSet);
  const isExclusiveToOneOtt = matchedOttProviderCount === 1; // ✅ “넷플만 있음” 같은 케이스 잡는 핵심

  for (const sig of SIGNATURES) {
    const hasProvider = includesAnyToken(providerSet, sig.providerTokens);
    if (!hasProvider) continue;

    const hasCompany = includesAnyToken(companySet, sig.companyTokens);
    const hasNetwork = includesAnyToken(networkSet, sig.networkTokens);

    if (mode === "loose") {
      return { ott: sig.ott, label: sig.label, confidence: "low" };
    }

    if (mode === "strict") {
      if (hasCompany || hasNetwork || keywordHints) {
        return { ott: sig.ott, label: sig.label, confidence: "high" };
      }
      continue;
    }

    // balanced
    if (hasCompany || hasNetwork || keywordHints) {
      return { ott: sig.ott, label: sig.label, confidence: "high" };
    }
    if (isExclusiveToOneOtt) {
      // ✅ 영화에서 production_companies가 Netflix로 안 잡히는 케이스를 여기서 살림
      return { ott: sig.ott, label: sig.label, confidence: "medium" };
    }
  }

  return null;
}

/** ProviderBadge 배열(너희 프로젝트에 이미 존재)에서 provider_name/name/providerName 어떤 형태든 이름만 추출 */
export function extractProviderNames(badges: Array<any> | undefined | null): string[] {
  if (!badges?.length) return [];
  const names = badges
    .map((b) => b?.provider_name ?? b?.providerName ?? b?.name)
    .filter(Boolean)
    .map((s: string) => s.trim());
  return Array.from(new Set(names));
}
