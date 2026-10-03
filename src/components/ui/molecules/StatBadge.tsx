// ==================================================
// MOLECULE: FIGHTER STAT BADGE COMPONENT
//
// WHAT IT DOES:
// Displays a stylized combat statistic block with a game icon,
// numeric readout, and title (e.g. Kills, Wins, K/D Ratio, Win Rate).
//
// HOW IT WORKS:
// - Pairs an icon container with a bold number formatted with `var(--font-game)`
//   and a label styled with `var(--font-tech)`.
// - Supports color schemes: `amber`, `emerald`, `red`, `cyan`, `slate`.
//
// WHY IT EXISTS:
// Standardizes competitive metric visualization across player banners,
// profiles, and match results screens.
// ==================================================

import type { ReactNode } from "react";

export type StatColor = "amber" | "emerald" | "red" | "cyan" | "slate";

export interface StatBadgeProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  color?: StatColor;
  className?: string;
}

const colorStyles: Record<
  StatColor,
  { bg: string; border: string; text: string; iconBg: string }
> = {
  amber: {
    bg: "bg-amber-950/40",
    border: "border-amber-500/30",
    text: "text-amber-400",
    iconBg: "bg-amber-500/20 text-amber-300",
  },
  emerald: {
    bg: "bg-emerald-950/40",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    iconBg: "bg-emerald-500/20 text-emerald-300",
  },
  red: {
    bg: "bg-red-950/40",
    border: "border-red-500/30",
    text: "text-red-400",
    iconBg: "bg-red-500/20 text-red-300",
  },
  cyan: {
    bg: "bg-cyan-950/40",
    border: "border-cyan-500/30",
    text: "text-cyan-400",
    iconBg: "bg-cyan-500/20 text-cyan-300",
  },
  slate: {
    bg: "bg-slate-900/60",
    border: "border-slate-700/60",
    text: "text-slate-200",
    iconBg: "bg-slate-800 text-slate-300",
  },
};

export function StatBadge({
  icon,
  label,
  value,
  color = "amber",
  className = "",
}: StatBadgeProps) {
  const styles = colorStyles[color];

  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-2 rounded-lg border backdrop-blur-sm select-none ${styles.bg} ${styles.border} ${className}`}
    >
      <div className={`p-2 rounded-md shrink-0 flex items-center justify-center text-lg ${styles.iconBg}`}>
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <span
          className={`text-lg font-black leading-tight tracking-wider truncate ${styles.text}`}
          style={{ fontFamily: "var(--font-game)" }}
        >
          {value}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate"
          style={{ fontFamily: "var(--font-tech)" }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
