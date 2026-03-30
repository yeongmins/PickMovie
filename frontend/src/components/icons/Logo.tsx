// frontend/src/components/common/Logo.tsx
interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

const LOGO_SIZES: Record<NonNullable<LogoProps["size"]>, { text: string }> = {
  sm: { text: "text-xl" },
  md: { text: "text-3xl" },
  lg: { text: "text-4xl" },
  xl: { text: "text-6xl" },
};

export function Logo({
  className = "",
  showText = true,
  size = "md",
}: LogoProps) {
  const currentSize = LOGO_SIZES[size];

  if (!showText) return null;

  return (
    <div className={`flex items-center ${className}`}>
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
    </div>
  );
}
