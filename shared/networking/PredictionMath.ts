import { Vector3, Quaternion } from "@babylonjs/core";

// ==================================================
// PREDICTION STATE HISTORY & COMPARISON MATH
// ==================================================

/**
 * Historical snapshot of client prediction state recorded immediately
 * after simulating an input command.
 */
export interface PredictedHistoryFrame {
  /** Input sequence number simulated for this step */
  sequence: number;

  /** Expected authoritative server simulation tick for this step */
  expectedServerTick: number;

  /** Position in world space */
  position: Vector3;

  /** Orientation quaternion */
  rotation: Quaternion;

  /** Linear velocity in world space */
  linearVelocity: Vector3;

  /** Angular velocity in world space */
  angularVelocity: Vector3;
}

/**
 * Calculates Euclidean distance between two positions in meters.
 */
export function calculatePositionDistance(p1: Vector3, p2: Vector3): number {
  return Vector3.Distance(p1, p2);
}

/**
 * Calculates angular difference in radians between two rotations.
 *
 * IMPORTANT: Quaternions q and -q represent the exact same 3D orientation.
 * We take Math.abs(Dot(q1, q2)) before acos to prevent artificial 360-degree errors.
 */
export function calculateRotationDifferenceAngle(
  q1: Quaternion,
  q2: Quaternion,
): number {
  const dot = Math.abs(Quaternion.Dot(q1, q2));
  const clampedDot = Math.min(1, Math.max(-1, dot));
  return 2 * Math.acos(clampedDot);
}

/**
 * Calculates Euclidean difference magnitude between two velocity vectors.
 */
export function calculateVelocityDistance(v1: Vector3, v2: Vector3): number {
  return Vector3.Distance(v1, v2);
}
