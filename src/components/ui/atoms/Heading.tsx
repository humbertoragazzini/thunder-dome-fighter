// ==================================================
// ATOM: ARCADE HEADING COMPONENT
//
// WHAT IT DOES:
// Renders punchy, playful fighting game titles and headers using
// the custom display fonts (`Luckiest Guy` / `Bangers`).
//
// HOW IT WORKS:
// - Offers levels `h1` through `h4` with arcade text shadows.
// - Supports color schemes: `gold` (amber gradient), `fire` (red/orange gradient),
//   `neon` (cyan gradient), and `white`.
//
// WHY IT EXISTS:
// Ensures consistent typography hierarchy and comic/arcade fighting energy.
// ==================================================

import type { ReactNode } from "react";

export type HeadingLevel = "h1" | "h2" | "h3" | "h4";
export type HeadingColor = "gold" | "fire" | "neon" | "white";

export interface HeadingProps {
  level?: HeadingLevel;
  color?: HeadingColor;
  font?: "game" | "arcade";
  children: ReactNode;
  className?: string;
}

const colorStyles: Record<HeadingColor, string> = {
  gold: "bg-gradient-to-b from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_3px_2px_rgba(0,0,0,0.9)]",
  fire: "bg-gradient-to-b from-yellow-300 via-orange-400 to-red-600 bg-clip-text text-transparent drop-shadow-[0_3px_2px_rgba(0,0,0,0.9)]",
  neon: "bg-gradient-to-b from-cyan-200 via-cyan-400 to-teal-500 bg-clip-text text-transparent drop-shadow-[0_3px_2px_rgba(0,0,0,0.9)]",
  white: "text-slate-100 drop-shadow-[0_3px_2px_rgba(0,0,0,0.9)]",
};

const levelStyles: Record<HeadingLevel, string> = {
  h1: "text-4xl md:text-6xl tracking-wider text-shadow-punch uppercase",
  h2: "text-3xl md:text-4xl tracking-wider text-shadow-arcade uppercase",
  h3: "text-2xl md:text-3xl tracking-wide uppercase",
  h4: "text-xl md:text-2xl tracking-normal uppercase",
};

export function Heading({
  level = "h2",
  color = "gold",
  font = "game",
  children,
  className = "",
}: HeadingProps) {
  const Tag = level;
  const fontVar = font === "game" ? "var(--font-game)" : "var(--font-arcade)";

  return (
    <Tag
      style={{ fontFamily: fontVar }}
      className={`font-black select-none ${levelStyles[level]} ${colorStyles[color]} ${className}`}
    >
      {children}
    </Tag>
  );
}
