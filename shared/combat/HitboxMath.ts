// ==================================================
// AUTHORITATIVE HITBOX & HURTBOX 3D MATHEMATICS
//
// WHAT IT DOES:
// Pure 3D spatial vector mathematics for computing:
// 1. World-space positions and radii of attacking limb hitboxes (Fists, Feet, Palms).
// 2. World-space positions and radii of target hurtbox body zones (Head, Torso, Limbs).
// 3. Volumetric collision resolution and priority selection (Head > Torso > Limbs).
//
// HOW IT WORKS:
// - Uses forward kinematics rotation around character yaw:
//     World = Pos + RotY(Yaw) * LocalOffset
// - Evaluates isotropic sphere overlap tests for continuous, deterministic 3D checks.
// - Returns detailed hit result including exact 3D contact point, struck body zone,
//   damage multiplier, and knockback vector.
//
// WHY IT EXISTS:
// Completely replaces imprecise forward-cone checks with true articulated limb
// combat. Allows ducking, jumping, sidestepping, and genuine whiffs in 3D space.
// ==================================================

import type { AttackActionType } from "../player/PlayerConfig";
import {
  ATTACK_FRAME_DATA,
  HURTBOX_GEOMETRY,
  HURTBOX_ZONE_CONFIG,
  type AttackFrameData,
  type HurtboxZone,
} from "./CombatConfig";

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface WorldSphereVolume {
  center: Vector3D;
  radius: number;
}

export interface TargetHurtboxProfile {
  targetSessionId: string;
  head: WorldSphereVolume;
  torso: WorldSphereVolume;
  limbs: WorldSphereVolume[];
}

export interface HitResolutionResult {
  targetSessionId: string;
  hitZone: HurtboxZone;
  isCritical: boolean;
  finalDamage: number;
  knockbackImpulse: number;
  knockbackDirection: Vector3D;
  contactPoint: Vector3D;
  distance: number;
}

/**
 * Transforms a local 3D offset into world space using character root position and yaw angle.
 */
export function transformLocalToWorld(
  rootPos: Vector3D,
  yawRad: number,
  localOffset: Vector3D,
): Vector3D {
  const sinYaw = Math.sin(yawRad);
  const cosYaw = Math.cos(yawRad);

  return {
    x: rootPos.x + localOffset.x * cosYaw + localOffset.z * sinYaw,
    y: rootPos.y + localOffset.y,
    z: rootPos.z - localOffset.x * sinYaw + localOffset.z * cosYaw,
  };
}

/**
 * Computes world-space sphere volume for the attacking limb during an active attack frame.
 */
export function computeAttackingLimbHitbox(
  attackerPos: Vector3D,
  yawRad: number,
  action: Extract<AttackActionType, "LEFT_PUNCH" | "RIGHT_PUNCH" | "KICK" | "PUSH">,
  extensionProgress: number = 1.0, // 0.0 to 1.0 forward limb extension
): WorldSphereVolume {
  const frameData: AttackFrameData = ATTACK_FRAME_DATA[action];
  const reach = frameData.forwardReachMeters * Math.max(0.6, Math.min(1.0, extensionProgress));

  let localX = 0;
  let localY = frameData.elevationOffsetMeters;
  const localZ = reach;

  if (action === "LEFT_PUNCH") {
    localX = -0.14; // Left shoulder/fist alignment
  } else if (action === "RIGHT_PUNCH") {
    localX = 0.14; // Right shoulder/fist alignment
  } else if (action === "KICK") {
    localX = 0.08; // Right leg trajectory
  } else if (action === "PUSH") {
    localX = 0.0; // Centered dual-hand shove
  }

  const center = transformLocalToWorld(attackerPos, yawRad, {
    x: localX,
    y: localY,
    z: localZ,
  });

  return {
    center,
    radius: frameData.hitboxRadius,
  };
}

/**
 * Computes world-space hurtbox profile (Head, Torso, Limbs) for a potential target fighter.
 */
export function computeTargetHurtboxProfile(
  targetSessionId: string,
  targetPos: Vector3D,
  targetYawRad: number,
): TargetHurtboxProfile {
  // 1. Head Zone
  const headCenter = transformLocalToWorld(targetPos, targetYawRad, {
    x: 0,
    y: HURTBOX_GEOMETRY.HEAD.localCenterY,
    z: 0,
  });

  // 2. Torso Zone
  const torsoCenter = transformLocalToWorld(targetPos, targetYawRad, {
    x: 0,
    y: HURTBOX_GEOMETRY.TORSO.localCenterY,
    z: 0,
  });

  // 3. Limbs (Left Arm, Right Arm, Left Leg, Right Leg)
  const armL = transformLocalToWorld(targetPos, targetYawRad, {
    x: -HURTBOX_GEOMETRY.ARMS.shoulderSpanX,
    y: HURTBOX_GEOMETRY.ARMS.localCenterY,
    z: 0,
  });

  const armR = transformLocalToWorld(targetPos, targetYawRad, {
    x: HURTBOX_GEOMETRY.ARMS.shoulderSpanX,
    y: HURTBOX_GEOMETRY.ARMS.localCenterY,
    z: 0,
  });

  const legL = transformLocalToWorld(targetPos, targetYawRad, {
    x: -HURTBOX_GEOMETRY.LEGS.hipSpanX,
    y: HURTBOX_GEOMETRY.LEGS.localCenterY,
    z: 0,
  });

  const legR = transformLocalToWorld(targetPos, targetYawRad, {
    x: HURTBOX_GEOMETRY.LEGS.hipSpanX,
    y: HURTBOX_GEOMETRY.LEGS.localCenterY,
    z: 0,
  });

  return {
    targetSessionId,
    head: { center: headCenter, radius: HURTBOX_GEOMETRY.HEAD.radius },
    torso: { center: torsoCenter, radius: HURTBOX_GEOMETRY.TORSO.radius },
    limbs: [
      { center: armL, radius: HURTBOX_GEOMETRY.ARMS.radius },
      { center: armR, radius: HURTBOX_GEOMETRY.ARMS.radius },
      { center: legL, radius: HURTBOX_GEOMETRY.LEGS.radius },
      { center: legR, radius: HURTBOX_GEOMETRY.LEGS.radius },
    ],
  };
}

/**
 * Checks if two 3D spheres intersect.
 */
export function checkSpheresOverlap(a: WorldSphereVolume, b: WorldSphereVolume): boolean {
  const dx = a.center.x - b.center.x;
  const dy = a.center.y - b.center.y;
  const dz = a.center.z - b.center.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const sumRadius = a.radius + b.radius;
  return distSq <= sumRadius * sumRadius;
}

/**
 * Computes mid-contact point between two overlapping spheres.
 */
function calculateContactPoint(a: WorldSphereVolume, b: WorldSphereVolume): Vector3D {
  return {
    x: (a.center.x + b.center.x) * 0.5,
    y: (a.center.y + b.center.y) * 0.5,
    z: (a.center.z + b.center.z) * 0.5,
  };
}

/**
 * Tests an attacking limb hitbox against a target's multi-zone hurtboxes.
 * Priority: HEAD (crit) > TORSO (standard) > LIMBS (glance).
 */
export function resolveHitboxVsHurtboxes(
  attackerPos: Vector3D,
  hitbox: WorldSphereVolume,
  action: Extract<AttackActionType, "LEFT_PUNCH" | "RIGHT_PUNCH" | "KICK" | "PUSH">,
  targetProfile: TargetHurtboxProfile,
  comboBonusDamage: number = 0,
): HitResolutionResult | null {
  const frameData = ATTACK_FRAME_DATA[action];

  // 1. Check HEAD (Critical Zone)
  if (checkSpheresOverlap(hitbox, targetProfile.head)) {
    return buildHitResult(
      attackerPos,
      hitbox,
      targetProfile.head,
      "HEAD",
      frameData,
      targetProfile.targetSessionId,
      comboBonusDamage,
    );
  }

  // 2. Check TORSO (Standard Body Blow)
  if (checkSpheresOverlap(hitbox, targetProfile.torso)) {
    return buildHitResult(
      attackerPos,
      hitbox,
      targetProfile.torso,
      "TORSO",
      frameData,
      targetProfile.targetSessionId,
      comboBonusDamage,
    );
  }

  // 3. Check LIMBS (Glancing Hit)
  for (const limbSphere of targetProfile.limbs) {
    if (checkSpheresOverlap(hitbox, limbSphere)) {
      return buildHitResult(
        attackerPos,
        hitbox,
        limbSphere,
        "LIMBS",
        frameData,
        targetProfile.targetSessionId,
        comboBonusDamage,
      );
    }
  }

  return null;
}

function buildHitResult(
  attackerPos: Vector3D,
  hitbox: WorldSphereVolume,
  struckZone: WorldSphereVolume,
  zone: HurtboxZone,
  frameData: AttackFrameData,
  targetSessionId: string,
  comboBonusDamage: number,
): HitResolutionResult {
  const zoneConfig = HURTBOX_ZONE_CONFIG[zone];
  const baseDmg = frameData.baseDamage + comboBonusDamage;
  const finalDamage = Math.round(baseDmg * zoneConfig.damageMultiplier);
  const knockbackImpulse = frameData.baseKnockbackImpulse * zoneConfig.knockbackMultiplier;

  // Direction from attacker root towards struck target center (normalized horizontal)
  const dx = struckZone.center.x - attackerPos.x;
  const dy = struckZone.center.y - attackerPos.y;
  const dz = struckZone.center.z - attackerPos.z;
  const horizontalDist = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));

  const knockbackDirection: Vector3D = {
    x: dx / horizontalDist,
    y: dy > 0.2 ? 0.25 : 0.1, // Slight upward pop
    z: dz / horizontalDist,
  };

  const contactPoint = calculateContactPoint(hitbox, struckZone);

  return {
    targetSessionId,
    hitZone: zone,
    isCritical: zoneConfig.isCritical,
    finalDamage,
    knockbackImpulse,
    knockbackDirection,
    contactPoint,
    distance: horizontalDist,
  };
}
