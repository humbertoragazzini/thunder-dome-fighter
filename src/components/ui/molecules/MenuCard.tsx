// ==================================================
// MOLECULE: INTERACTIVE MENU CARD COMPONENT
//
// WHAT IT DOES:
// Displays a prominent, clickable menu card for navigation options such as
// "Enter Arena", "Cuadrangular Championships", or "Custom Lobbies".
//
// HOW IT WORKS:
// - Uses glassmorphic backdrop with dynamic border glow on hover (`hover:border-amber-400`).
// - Supports locked/disabled status with a badge tag and reduced opacity.
// - Features an energetic icon slot, punchy title, and short descriptive subtitle.
//
// WHY IT EXISTS:
// Provides the core tactile interaction units in the Main Menu and Game Mode selectors.
// ==================================================

import type { ReactNode } from "react";
import { Badge, type BadgeVariant } from "../atoms/Badge";
import { Heading } from "../atoms/Heading";

export interface MenuCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  badgeText?: string;
  badgeVariant?: BadgeVariant;
  badgePulse?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  accentColor?: "amber" | "fire" | "cyan" | "purple";
  className?: string;
}

const borderHoverStyles = {
  amber: "hover:border-amber-400 hover:shadow-[0_0_25px_rgba(245,158,11,0.25)]",
  fire: "hover:border-red-500 hover:shadow-[0_0_25px_rgba(239,68,68,0.25)]",
  cyan: "hover:border-cyan-400 hover:shadow-[0_0_25px_rgba(6,182,212,0.25)]",
  purple: "hover:border-purple-400 hover:shadow-[0_0_25px_rgba(168,85,247,0.25)]",
};

export function MenuCard({
  title,
  description,
  icon,
  badgeText,
  badgeVariant = "amber",
  badgePulse = false,
  disabled = false,
  onClick,
  accentColor = "amber",
  className = "",
}: MenuCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex flex-col items-start p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border-2 border-slate-800 text-left transition-all duration-200 select-none ${
        disabled
          ? "opacity-60 cursor-not-allowed grayscale"
          : `cursor-pointer hover:-translate-y-1.5 active:translate-y-0 ${borderHoverStyles[accentColor]}`
      } ${className}`}
    >
      {/* Top row: Icon & Optional Badge */}
      <div className="flex items-center justify-between w-full mb-4">
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-3xl group-hover:scale-110 transition-transform duration-200 flex items-center justify-center">
          {icon}
        </div>
        {badgeText && (
          <Badge variant={badgeVariant} pulse={badgePulse}>
            {badgeText}
          </Badge>
        )}
      </div>

      {/* Title */}
      <Heading
        level="h3"
        color={accentColor === "fire" ? "fire" : accentColor === "cyan" ? "neon" : "gold"}
        className="mb-1.5 transition-colors"
      >
        {title}
      </Heading>

      {/* Description */}
      <p
        className="text-xs md:text-sm text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors"
        style={{ fontFamily: "var(--font-tech)" }}
      >
        {description}
      </p>
    </button>
  );
}
