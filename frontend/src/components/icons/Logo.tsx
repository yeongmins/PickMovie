interface LogoProps {
  className?: string;
  showText?: boolean;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

const LOGO_SIZES: Record<
  NonNullable<LogoProps["size"]>,
  { icon: string; text: string }
> = {
  sm: { icon: "w-8 h-8", text: "text-xl" },
  md: { icon: "w-12 h-12", text: "text-3xl" },
  lg: { icon: "w-16 h-16", text: "text-4xl" },
  xl: { icon: "w-24 h-24", text: "text-6xl" },
};

export function Logo({
  className = "",
  showText = true,
  showIcon = true,
  size = "md",
}: LogoProps) {
  const currentSize = LOGO_SIZES[size];

  return (
    <div
      className={`flex items-center ${showIcon ? "gap-3" : ""} ${className}`}
    >
      {showIcon && (
        <div className={`${currentSize.icon} relative flex-shrink-0 logo-icon`}>
          <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="logoGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#9333EA" />
                <stop offset="100%" stopColor="#EC4899" />
              </linearGradient>
              <linearGradient
                id="filmGradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#A855F7" />
                <stop offset="100%" stopColor="#F472B6" />
              </linearGradient>
            </defs>

            <circle
              cx="50"
              cy="50"
              r="45"
              fill="url(#logoGradient)"
              opacity="0.2"
            />
            <rect
              x="25"
              y="30"
              width="50"
              height="40"
              rx="4"
              fill="url(#filmGradient)"
            />

            <circle cx="30" cy="35" r="2" fill="#0f0f14" />
            <circle cx="40" cy="35" r="2" fill="#0f0f14" />
            <circle cx="50" cy="35" r="2" fill="#0f0f14" />
            <circle cx="60" cy="35" r="2" fill="#0f0f14" />
            <circle cx="70" cy="35" r="2" fill="#0f0f14" />

            <circle cx="30" cy="65" r="2" fill="#0f0f14" />
            <circle cx="40" cy="65" r="2" fill="#0f0f14" />
            <circle cx="50" cy="65" r="2" fill="#0f0f14" />
            <circle cx="60" cy="65" r="2" fill="#0f0f14" />
            <circle cx="70" cy="65" r="2" fill="#0f0f14" />

            <rect
              x="30"
              y="42"
              width="40"
              height="16"
              rx="2"
              fill="#0f0f14"
              opacity="0.3"
            />
            <path d="M 45 46 L 45 54 L 53 50 Z" fill="white" />

            <path
              d="M 78 25 L 80 30 L 85 28 L 82 33 L 87 35 L 82 37 L 85 42 L 80 40 L 78 45 L 76 40 L 71 42 L 74 37 L 69 35 L 74 33 L 71 28 L 76 30 Z"
              fill="#F472B6"
              opacity="0.8"
            />
          </svg>
        </div>
      )}

      {showText && (
        <div className={currentSize.text}>
          <span
            className="font-bold"
            style={{
              backgroundImage: "linear-gradient(90deg,#7c3aed,#ec4899)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Pick
          </span>
          <span className="text-white font-bold">Movie</span>
        </div>
      )}
    </div>
  );
}
