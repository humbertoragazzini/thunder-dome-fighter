// ==================================================
// COMPONENT: MATCH POWER HUD
//
// WHAT IT DOES:
// Displays real-time kill streak counter and active physical boost badges
// (+% speed, +% force, +% jump) during match gameplay.
//
// HOW IT WORKS:
// Gated to display only when killStreak > 0 and multipliers exceed 1.0x
// (active exclusively in FFA deathmatch mode).
// Renders animated badges with glowing borders, flaming streak counters,
// and stat percentage callouts.
//
// WHY IT EXISTS:
// Satisfies Phase 11.5 requirements by providing clear, immediate visual
// feedback for in-match progression and kill streak momentum.
// ==================================================

import { FaBolt, FaFire, FaPersonWalkingArrowRight } from "react-icons/fa6";
import { GiUpgrade } from "react-icons/gi";

export interface MatchPowerHUDProps {
  killStreak: number;
  speedModifier: number;
  forceModifier: number;
  jumpModifier: number;
  className?: string;
}

export function MatchPowerHUD({
  killStreak,
  speedModifier,
  forceModifier,
  jumpModifier,
  className = "",
}: MatchPowerHUDProps) {
  // Purely invisible if no streak or multipliers are baseline (e.g. 1v1 duels)
  if (killStreak <= 0 || (speedModifier <= 1.0 && forceModifier <= 1.0 && jumpModifier <= 1.0)) {
    return null;
  }

  const speedBonusPct = Math.round((speedModifier - 1.0) * 100);
  const forceBonusPct = Math.round((forceModifier - 1.0) * 100);
  const jumpBonusPct = Math.round((jumpModifier - 1.0) * 100);

  return (
    <div
      className={`flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-amber-500/40 px-3.5 py-1.5 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.25)] animate-fade-in ${className}`}
    >
      {/* Kill Streak Callout */}
      <div className="flex items-center gap-1.5 text-amber-400 font-black text-xs uppercase tracking-wider">
        <FaFire className="animate-bounce text-amber-500 text-sm" />
        <span style={{ fontFamily: "var(--font-game)" }}>STREAK x{killStreak}</span>
      </div>

      <div className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />

      {/* Physical Multipliers */}
      <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold">
        {speedBonusPct > 0 && (
          <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-md">
            <FaPersonWalkingArrowRight className="text-[10px]" />
            +{speedBonusPct}% SPEED
          </span>
        )}

        {forceBonusPct > 0 && (
          <span className="flex items-center gap-1 text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-md">
            <FaBolt className="text-[10px]" />
            +{forceBonusPct}% FORCE
          </span>
        )}

        {jumpBonusPct > 0 && (
          <span className="flex items-center gap-1 text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-md">
            <GiUpgrade className="text-[10px]" />
            +{jumpBonusPct}% JUMP
          </span>
        )}
      </div>
    </div>
  );
}
