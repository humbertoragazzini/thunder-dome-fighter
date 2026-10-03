// ==================================================
// ATOM: ARCADE SPINNER COMPONENT
//
// WHAT IT DOES:
// Renders a high-energy circular loading spinner with neon glowing accents.
//
// HOW IT WORKS:
// - Uses CSS keyframe rotation on SVG elements with customizable sizes and colors.
//
// WHY IT EXISTS:
// Standardizes loading feedback across auth forms, matchmaking, and match loading.
// ==================================================

export type SpinnerSize = "sm" | "md" | "lg" | "xl";
export type SpinnerColor = "amber" | "cyan" | "red" | "white";

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  className?: string;
}

const sizeMap: Record<SpinnerSize, string> = {
  sm: "w-4 h-4 border-2",
  md: "w-8 h-8 border-3",
  lg: "w-12 h-12 border-4",
  xl: "w-16 h-16 border-4",
};

const colorMap: Record<SpinnerColor, string> = {
  amber: "border-amber-500/20 border-t-amber-400",
  cyan: "border-cyan-500/20 border-t-cyan-400",
  red: "border-red-500/20 border-t-red-400",
  white: "border-white/20 border-t-white",
};

export function Spinner({ size = "md", color = "amber", className = "" }: SpinnerProps) {
  return (
    <div
      className={`inline-block rounded-full animate-spin ${sizeMap[size]} ${colorMap[color]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
