// frontend/src/assets/logo/index.ts
import appletvIcon from "./appletv_icon.png";
import cgvLogo from "./cgv_logo.svg";
import disneyLogo from "./disneyplus_logo.png";
import laftelIcon from "./laftel_icon.png";
import lotteLogo from "./lotte_logo.svg";
import megaboxLogo from "./megabox_logo.svg";
import netflexIcon from "./netflex_icon.png";
import tvingIcon from "./tving_icon.png";
import watchaIcon from "./watcha_icon.svg";
import wavveIcon from "./wavve_icon.png";
import youtubeIcon from "./youtube_icon.png";

export type LogoKey =
  | "NETFLIX"
  | "DISNEY"
  | "APPLE_TV"
  | "TVING"
  | "WAVVE"
  | "WATCHA"
  | "LAFTEL"
  | "YOUTUBE"
  | "CGV"
  | "LOTTE"
  | "MEGABOX";

export const LOGO_SRC: Record<LogoKey, string> = {
  NETFLIX: netflexIcon,
  DISNEY: disneyLogo,
  APPLE_TV: appletvIcon,
  TVING: tvingIcon,
  WAVVE: wavveIcon,
  WATCHA: watchaIcon,
  LAFTEL: laftelIcon,
  YOUTUBE: youtubeIcon,
  CGV: cgvLogo,
  LOTTE: lotteLogo,
  MEGABOX: megaboxLogo,
};

function normalizeName(name: string) {
  const raw = String(name || "").trim();
  const lower = raw.toLowerCase();
  const compact = lower.replace(/[\s._-]+/g, "");
  return { raw, lower, compact };
}

/** provider_name(또는 그 비슷한 값) → LogoKey 매핑 */
export function pickLogoKeyByProviderName(name: string): LogoKey | null {
  const { raw, compact } = normalizeName(name);
  if (!raw) return null;

  // OTT
  if (compact.includes("netflix") || raw.includes("넷플릭스")) return "NETFLIX";
  if (
    compact.includes("disney") ||
    compact.includes("disneyplus") ||
    raw.includes("디즈니")
  )
    return "DISNEY";
  if (
    compact.includes("appletv") ||
    compact.includes("appletvplus") ||
    raw.includes("애플")
  )
    return "APPLE_TV";
  if (compact.includes("tving") || raw.includes("티빙")) return "TVING";
  if (compact.includes("wavve") || raw.includes("웨이브")) return "WAVVE";
  if (compact.includes("watcha") || raw.includes("왓챠")) return "WATCHA";
  if (compact.includes("laftel") || raw.includes("라프텔")) return "LAFTEL";
  if (compact.includes("youtube") || raw.includes("유튜브")) return "YOUTUBE";

  // Theaters (혹시 providerOriginal로 넘어오는 경우 대비)
  if (compact.includes("cgv") || raw.includes("CGV")) return "CGV";
  if (compact.includes("megabox") || raw.includes("메가박스")) return "MEGABOX";
  if (compact.includes("lotte") || raw.includes("롯데")) return "LOTTE";

  return null;
}

/** provider_name → 로고 src 바로 반환 (없으면 null) */
export function getLogoSrcByProviderName(name: string): string | null {
  const key = pickLogoKeyByProviderName(name);
  return key ? LOGO_SRC[key] : null;
}
