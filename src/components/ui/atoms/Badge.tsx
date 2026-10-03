// ==================================================
// ATOM: ARCADE STATUS BADGE COMPONENT
//
// WHAT IT DOES:
// Displays a compact, colorful status badge for rankings, game modes,
// server latency, or state tags.
//
// HOW IT WORKS:
// - Renders a pill container with variants (`amber`, `emerald`, `red`, `cyan`, `purple`, `slate`).
// - Supports pulsing status dot and optional leading icon.
//
// WHY IT EXISTS:
// Conveys player status, server health, and game mode tags uniformly across the UI.
// ==================================================

import type { ReactNode } from "react";

export type BadgeVariant = "amber" | "emerald" | "red" | "cyan" | "purple" | "slate";

export interface BadgeProps {
  variant?: BadgeVariant;
  pulse?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  red: "bg-red-500/20 text-red-300 border-red-500/40",
  cyan: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  purple: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  slate: "bg-slate-800/80 text-slate-300 border-slate-700",
};

const dotColors: Record<BadgeVariant, string> = {
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  red: "bg-red-400",
  cyan: "bg-cyan-400",
  purple: "bg-purple-400",
  slate: "bg-slate-400",
};

export function Badge({
  variant = "amber",
  pulse = false,
  icon,
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border tracking-wider select-none ${variantStyles[variant]} ${className}`}
      style={{ fontFamily: "var(--font-tech)" }}
    >
      {pulse && (
        <span className={`w-2 h-2 rounded-full animate-pulse ${dotColors[variant]}`} />
      )}
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
