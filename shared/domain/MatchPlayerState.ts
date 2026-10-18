// ==================================================
// GENERIC DOMAIN CONTRACTS: MATCH PLAYER STATE & KILL MODIFIERS
//
// WHAT IT DOES:
// Defines the ephemeral in-match progression attributes (speedModifier, forceModifier,
// jumpModifier, currentKillStreak) and pure mathematical scaling rules awarded
// upon earning consecutive kills in designated game modes (FFA 20-player deathmatch).
//
// HOW IT WORKS:
// When enabled by the active GameMode (enableKillStreakModifiers === true),
// consecutive kills compute scalar multipliers that scale physical locomotion force,
// jump impulses, and punch knockback. If disabled (1v1, 3v3, 4v4), all multipliers
// remain locked to baseline 1.0x.
//
// WHY IT EXISTS:
// Enforces ADR-005 (Temporary Match Progression is Strictly Runtime State). Excites
// chaotic high-player arenas without permanently inflating PostgreSQL profile stats,
// and preserves competitive parity in 1v1 duels.
// ==================================================

/**
 * Ephemeral physical modifiers active for a player within an in-progress match.
 */
export interface MatchPlayerModifiers {
  /** Consecutive kills without dying in the current match */
  currentKillStreak: number;

  /** Locomotion speed multiplier (1.0 = normal, up to MAX_SPEED_MODIFIER) */
  speedModifier: number;

  /** Locomotion acceleration and punch knockback force multiplier (1.0 = normal, up to MAX_FORCE_MODIFIER) */
  forceModifier: number;

  /** Upward jump impulse multiplier (1.0 = normal, up to MAX_JUMP_MODIFIER) */
  jumpModifier: number;
}

/**
 * Progression multiplier ceilings to preserve physics stability in Havok
 */
export const MATCH_MODIFIER_LIMITS = {
  MAX_SPEED_MODIFIER: 1.30, // +30% maximum sprint speed
  MAX_FORCE_MODIFIER: 1.25, // +25% maximum acceleration / knockback
  MAX_JUMP_MODIFIER: 1.20,  // +20% maximum jump height
} as const;

/**
 * Baseline multipliers for fresh or defeated players
 */
export const DEFAULT_MATCH_PLAYER_MODIFIERS: Readonly<MatchPlayerModifiers> = Object.freeze({
  currentKillStreak: 0,
  speedModifier: 1.0,
  forceModifier: 1.0,
  jumpModifier: 1.0,
});

/**
 * Computes authoritative physical modifiers based on active kill streak and game mode rules.
 *
 * Ladder for enabled modes (FFA):
 * - Streak 0: 1.00x speed, 1.00x force, 1.00x jump
 * - Streak 1: 1.05x speed, 1.03x force, 1.00x jump (+5% speed, +3% force)
 * - Streak 2: 1.10x speed, 1.06x force, 1.05x jump (+10% speed, +6% force, +5% jump)
 * - Streak 3: 1.15x speed, 1.09x force, 1.10x jump (+15% speed, +9% force, +10% jump)
 * - Streak 4: 1.20x speed, 1.12x force, 1.15x jump (+20% speed, +12% force, +15% jump)
 * - Streak 5+: scales up to configured ceiling (1.30x speed, 1.25x force, 1.20x jump)
 *
 * Invariant: If enableModifiers is false (e.g. 1v1 duels), returns strictly 1.0x multipliers.
 */
export function computeKillStreakModifiers(
  currentKillStreak: number,
  enableModifiers: boolean,
): MatchPlayerModifiers {
  const streak = Math.max(0, currentKillStreak);

  // If disabled for this game mode, maintain strict competitive baseline 1.0x
  if (!enableModifiers || streak === 0) {
    return {
      currentKillStreak: streak,
      speedModifier: 1.0,
      forceModifier: 1.0,
      jumpModifier: 1.0,
    };
  }

  let speed = 1.0;
  let force = 1.0;
  let jump = 1.0;

  if (streak === 1) {
    speed = 1.05;
    force = 1.03;
    jump = 1.0;
  } else if (streak === 2) {
    speed = 1.10;
    force = 1.06;
    jump = 1.05;
  } else if (streak === 3) {
    speed = 1.15;
    force = 1.09;
    jump = 1.10;
  } else if (streak === 4) {
    speed = 1.20;
    force = 1.12;
    jump = 1.15;
  } else {
    // 5+ streak: gradual progression toward ceilings
    speed = Math.min(
      MATCH_MODIFIER_LIMITS.MAX_SPEED_MODIFIER,
      1.20 + (streak - 4) * 0.05,
    );
    force = Math.min(
      MATCH_MODIFIER_LIMITS.MAX_FORCE_MODIFIER,
      1.12 + (streak - 4) * 0.03,
    );
    jump = Math.min(
      MATCH_MODIFIER_LIMITS.MAX_JUMP_MODIFIER,
      1.15 + (streak - 4) * 0.02,
    );
  }

  return {
    currentKillStreak: streak,
    speedModifier: Math.round(speed * 100) / 100,
    forceModifier: Math.round(force * 100) / 100,
    jumpModifier: Math.round(jump * 100) / 100,
  };
}
