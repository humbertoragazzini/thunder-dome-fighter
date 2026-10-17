// ==================================================
// SHARED COMBAT CONFIGURATION & FRAME DATA
//
// WHAT IT DOES:
// Centralized tuning and specifications for authoritative brawler combat:
// - Exact fighting-game frame data (Startup, Active, Recovery windows in ms).
// - Articulated limb hitbox generation (fists, feet, dual hands).
// - Discrete multi-zone hurtbox dimensions and damage multipliers (Head, Torso, Limbs).
// - Hit stun duration, action interruption rules, and combo buffering.
//
// HOW IT WORKS:
// Exports pure, immutable configuration objects consumed identically by:
// - Server SimulationWorld (authoritative hit detection and timeline resolution).
// - Client CharacterProceduralAnimator (synchronized visual kinematics).
// - CombatEffectsManager (particle and audio triggers).
//
// WHY IT EXISTS:
// Ensures 100% deterministic parity between client visual strikes and server
// hitbox activation. Eliminates phantom hits and arbitrary trade spam.
// ==================================================

import type { AttackActionType } from "../player/PlayerConfig";

export type HurtboxZone = "HEAD" | "TORSO" | "LIMBS";

export type AttackingLimb = "LEFT_FIST" | "RIGHT_FIST" | "RIGHT_FOOT" | "DUAL_HANDS";

export interface AttackFrameData {
  action: AttackActionType;
  limb: AttackingLimb;
  baseDamage: number;
  baseKnockbackImpulse: number;
  hitboxRadius: number;
  forwardReachMeters: number;
  elevationOffsetMeters: number;
  startupMs: number;
  activeMs: number;
  recoveryMs: number;
  totalDurationMs: number;
}

export interface HurtboxZoneConfig {
  zone: HurtboxZone;
  damageMultiplier: number;
  knockbackMultiplier: number;
  hitStunDurationMs: number;
  isCritical: boolean;
}

export const HURTBOX_ZONE_CONFIG: Record<HurtboxZone, HurtboxZoneConfig> = {
  HEAD: {
    zone: "HEAD",
    damageMultiplier: 1.5,
    knockbackMultiplier: 1.4,
    hitStunDurationMs: 300,
    isCritical: true,
  },
  TORSO: {
    zone: "TORSO",
    damageMultiplier: 1.0,
    knockbackMultiplier: 1.0,
    hitStunDurationMs: 220,
    isCritical: false,
  },
  LIMBS: {
    zone: "LIMBS",
    damageMultiplier: 0.75,
    knockbackMultiplier: 0.75,
    hitStunDurationMs: 150,
    isCritical: false,
  },
} as const;

export const ATTACK_FRAME_DATA: Record<
  Extract<AttackActionType, "LEFT_PUNCH" | "RIGHT_PUNCH" | "KICK" | "PUSH">,
  AttackFrameData
> = {
  LEFT_PUNCH: {
    action: "LEFT_PUNCH",
    limb: "LEFT_FIST",
    baseDamage: 7,
    baseKnockbackImpulse: 1.5,
    hitboxRadius: 0.22,
    forwardReachMeters: 0.85,
    elevationOffsetMeters: 0.15,
    startupMs: 60,
    activeMs: 100,
    recoveryMs: 100,
    totalDurationMs: 260,
  },
  RIGHT_PUNCH: {
    action: "RIGHT_PUNCH",
    limb: "RIGHT_FIST",
    baseDamage: 7,
    baseKnockbackImpulse: 2.2,
    hitboxRadius: 0.24,
    forwardReachMeters: 0.95,
    elevationOffsetMeters: 0.12,
    startupMs: 120,
    activeMs: 120,
    recoveryMs: 160,
    totalDurationMs: 400,
  },
  KICK: {
    action: "KICK",
    limb: "RIGHT_FOOT",
    baseDamage: 12,
    baseKnockbackImpulse: 3.5,
    hitboxRadius: 0.28,
    forwardReachMeters: 1.20,
    elevationOffsetMeters: -0.10,
    startupMs: 180,
    activeMs: 150,
    recoveryMs: 220,
    totalDurationMs: 550,
  },
  PUSH: {
    action: "PUSH",
    limb: "DUAL_HANDS",
    baseDamage: 3,
    baseKnockbackImpulse: 8.0,
    hitboxRadius: 0.38,
    forwardReachMeters: 0.90,
    elevationOffsetMeters: 0.05,
    startupMs: 150,
    activeMs: 160,
    recoveryMs: 300,
    totalDurationMs: 610,
  },
} as const;

export const COMBO_RULES = {
  /**
   * If a RIGHT_PUNCH is executed during the active or early recovery window of a LEFT_PUNCH,
   * trigger a 1-2 combo: reduced startup and bonus combo damage.
   */
  LEFT_TO_RIGHT_COMBO: {
    startupReductionFactor: 0.35, // 35% faster startup (120ms -> 78ms)
    bonusDamage: 2, // 7 -> 9 damage
    windowStartMs: 80, // Available 80ms after Left Punch starts
    windowEndMs: 220, // Available until 220ms (during recovery)
  },
} as const;

/**
 * Spatial relative dimensions of body hurtbox zones centered on the character root.
 */
export const HURTBOX_GEOMETRY = {
  HEAD: {
    localCenterY: 0.36,
    radius: 0.18,
    halfExtents: { x: 0.14, y: 0.14, z: 0.14 },
  },
  TORSO: {
    localCenterY: 0.06,
    radius: 0.24,
    halfExtents: { x: 0.18, y: 0.18, z: 0.13 },
  },
  ARMS: {
    shoulderSpanX: 0.22,
    localCenterY: 0.04,
    radius: 0.12,
    halfExtents: { x: 0.08, y: 0.20, z: 0.08 },
  },
  LEGS: {
    hipSpanX: 0.11,
    localCenterY: -0.32,
    radius: 0.14,
    halfExtents: { x: 0.09, y: 0.22, z: 0.12 },
  },
} as const;
