// ==================================================
// HUMANOID CHARACTER PHYSICS & ROTATION MATH
//
// Pure TypeScript deterministic routines for:
// - Diagonal input vector normalization
// - Relative-to-world velocity transformations
// - Shortest angular path rotations
//
// Invariant: ZERO external engine or DOM dependencies.
// ==================================================

import { CHARACTER_FORCES } from "./PlayerConfig.ts";

/**
 * Normalizes an 8-way movement input vector so diagonal running
 * does not exceed maximum unit speed (avoids 1.414x speed exploit).
 * Preserves sub-maximal inputs for analog walking.
 */
export function clampInputVector(
  moveX: number,
  moveZ: number,
): { x: number; z: number; magnitude: number } {
  // Reject NaN or infinite values
  const safeX = Number.isFinite(moveX) ? moveX : 0;
  const safeZ = Number.isFinite(moveZ) ? moveZ : 0;

  const lengthSq = safeX * safeX + safeZ * safeZ;

  if (lengthSq <= 0.00001) {
    return { x: 0, z: 0, magnitude: 0 };
  }

  const length = Math.sqrt(lengthSq);

  // If vector exceeds unit circle (e.g. W + D = 1.414), normalize to 1.0
  if (length > 1.0) {
    return {
      x: safeX / length,
      z: safeZ / length,
      magnitude: 1.0,
    };
  }

  // Preserve magnitude for gentle analog joystick tilts
  return {
    x: safeX,
    z: safeZ,
    magnitude: length,
  };
}

/**
 * Transforms a local relative movement input (WASD) into world-space
 * velocity vectors based on the character's horizontal look yaw.
 *
 * @param moveX Lateral input (-1 = left, +1 = right)
 * @param moveZ Longitudinal input (-1 = back, +1 = forward)
 * @param lookYaw Heading angle in radians around the vertical Y-axis
 * @param isSprinting Whether sprint speed multiplier applies
 * @param speedMultiplier Optional temporary kill-streak modifier (default: 1.0)
 */
export function calculateCharacterTargetVelocity(
  moveX: number,
  moveZ: number,
  lookYaw: number,
  isSprinting: boolean,
  speedMultiplier: number = 1.0,
): { vx: number; vz: number; speed: number } {
  const { x, z, magnitude } = clampInputVector(moveX, moveZ);

  if (magnitude === 0) {
    return { vx: 0, vz: 0, speed: 0 };
  }

  // Calculate target speed in meters/second
  const sprintFactor = isSprinting ? CHARACTER_FORCES.SPRINT_MULTIPLIER : 1.0;
  const effectiveSpeed =
    CHARACTER_FORCES.BASE_SPEED * sprintFactor * speedMultiplier * magnitude;

  // Rotate local input vector into world coordinates based on lookYaw:
  // Forward (Z+) rotates to (sin(yaw), cos(yaw))
  // Right (X+) rotates to (cos(yaw), -sin(yaw))
  const cosYaw = Math.cos(lookYaw);
  const sinYaw = Math.sin(lookYaw);

  const worldDirX = x * cosYaw + z * sinYaw;
  const worldDirZ = -x * sinYaw + z * cosYaw;

  return {
    vx: worldDirX * effectiveSpeed,
    vz: worldDirZ * effectiveSpeed,
    speed: effectiveSpeed,
  };
}

/**
 * Normalizes an angle in radians into the canonical interval [-PI, +PI].
 */
export function normalizeAngle(radians: number): number {
  let angle = radians % (2 * Math.PI);
  if (angle > Math.PI) {
    angle -= 2 * Math.PI;
  } else if (angle < -Math.PI) {
    angle += 2 * Math.PI;
  }
  return angle;
}

/**
 * Calculates the shortest signed angular difference between two yaw angles.
 * Returns a value in [-PI, +PI].
 * Positive = clockwise turn; Negative = counter-clockwise turn.
 */
export function calculateShortestAngleDelta(
  fromYaw: number,
  toYaw: number,
): number {
  return normalizeAngle(toYaw - fromYaw);
}

/**
 * Computes look yaw in radians from a 2D world direction vector.
 * +Z is 0 rad, +X is PI/2 rad.
 */
export function calculateYawFromDirection(dirX: number, dirZ: number): number {
  if (Math.abs(dirX) < 0.0001 && Math.abs(dirZ) < 0.0001) {
    return 0;
  }
  return Math.atan2(dirX, dirZ);
}
