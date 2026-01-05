// frontend/src/components/content/contentCard.ui.tsx

import React from "react";
import { normalizeAge } from "./contentCard.utils";
import { logoUrl } from "./contentCard.meta";

function ageBadgeClass(v: string) {
  switch (v) {
    case "ALL":
      return "bg-green-500";
    case "12":
      return "bg-yellow-400";
    case "15":
      return "bg-orange-500";
    case "18":
      return "bg-red-600";
    default:
      return "bg-black/60";
  }
}

export function AgeBadge({ value }: { value: string }) {
  const v = normalizeAge(value);
  if (!v || v === "—") return null;

  return (
    <div
      className={[
        "w-[22px] h-[22px] rounded-[4px]",
        "flex items-center justify-center",
        "text-white font-extrabold",
        "shadow-sm",
        ageBadgeClass(v),
      ].join(" ")}
      aria-label={`연령등급 ${v}`}
      title={`연령등급 ${v}`}
    >
      <span className={v === "ALL" ? "text-[9px]" : "text-[12px]"}>{v}</span>
    </div>
  );
}

export function Chip({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "green" | "purple" | "blue";
}) {
  const base =
    "inline-flex items-center h-[20px] rounded-[5px] text-[10px] font-bold leading-none " +
    "px-[8px] shadow-sm backdrop-blur-sm";

  const cls =
    tone === "green"
      ? "bg-green-500/90 text-white"
      : tone === "purple"
      ? "bg-purple-600/90 text-white"
      : tone === "blue"
      ? "bg-sky-500/90 text-white"
      : "bg-black/45 text-white";

  return <div className={`${base} ${cls}`}>{children}</div>;
}

export type ProviderLogo = { name: string; path: string };

export function ProviderBadges({
  providerLogos,
  providerNames,
}: {
  providerLogos: ProviderLogo[];
  providerNames: string[];
}) {
  const MAX_PROVIDER_BADGES = 3;

  const visibleProviders = providerLogos.slice(0, MAX_PROVIDER_BADGES);
  const visibleProviderNames = providerNames.slice(0, 2);

  const hasProviders = providerLogos.length > 0 || providerNames.length > 0;
  if (!hasProviders) return null;

  return providerLogos.length > 0 ? (
    <div className="flex items-center gap-1 flex-nowrap">
      {visibleProviders.map((p) => (
        <div
          key={p.name}
          className="w-[22px] h-[22px] rounded-[4px] bg-black/45 backdrop-blur-sm overflow-hidden flex items-center justify-center shadow-sm"
          title={p.name}
          aria-label={p.name}
        >
          <img
            src={logoUrl(p.path, "w92")}
            srcSet={`${logoUrl(p.path, "w92")} 1x, ${logoUrl(p.path, "w185")} 2x`}
            alt={p.name}
            className="w-full h-full object-contain"
            loading="lazy"
            decoding="async"
          />
        </div>
      ))}
    </div>
  ) : (
    <div className="flex items-center gap-1">
      {visibleProviderNames.map((n) => (
        <span
          key={n}
          className="max-w-[120px] truncate px-2 py-1 rounded-[6px] bg-black/45 backdrop-blur-sm text-[10px] font-semibold text-white/85"
          title={n}
        >
          {n}
        </span>
      ))}
    </div>
  );
}
