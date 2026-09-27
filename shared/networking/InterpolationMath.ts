import { Vector3, Quaternion } from "@babylonjs/core";
import {
  PHYSICS_DT_SECONDS,
  REMOTE_TIME_SCALE_ACCELERATION,
  REMOTE_TIME_SCALE_DECELERATION,
} from "../vehicle/TestVehicleConfig";

// ==================================================
// REMOTE INTERPOLATION & TIME CALCULATIONS
// ==================================================

/**
 * Advances the remote render clock monotonically forward based on frame delta time and time dilation.
 * The returned value strictly increases (never moves backward).
 */
export function advanceMonotonicRenderTick(
  currentTick: number,
  deltaSeconds: number,
  timeScale: number,
): number {
  if (deltaSeconds <= 0) {
    return currentTick;
  }
  const effectiveTimeScale = Math.max(0.1, Math.min(2.0, timeScale));
  const tickAdvance = (deltaSeconds / PHYSICS_DT_SECONDS) * effectiveTimeScale;
  return currentTick + tickAdvance;
}

/**
 * Calculates adaptive time scale to keep the remote render clock at approximately targetDelay
 * ticks behind the newest received server snapshot.
 *
 * @param currentDelay Current delay in ticks: latestServerTick - remoteRenderTick
 * @param targetDelay Target delay in ticks (e.g. 3.0)
 * @param toleranceTicks Dead-zone tolerance where timeScale remains 1.0 (e.g. 0.5)
 */
export function calculateInterpolationTimeScale(
  currentDelay: number,
  targetDelay: number,
  toleranceTicks: number,
): number {
  if (currentDelay > targetDelay + toleranceTicks) {
    // Falling too far behind server: speed up clock slightly
    return REMOTE_TIME_SCALE_ACCELERATION;
  }

  if (currentDelay < targetDelay - toleranceTicks) {
    // Creeping too close to newest snapshot: slow down clock slightly
    return REMOTE_TIME_SCALE_DECELERATION;
  }

  // Inside dead-band: normal real-time speed
  return 1.0;
}

/**
 * Calculates normalized interpolation factor alpha in [0, 1] between two snapshot ticks.
 */
export function calculateInterpolationAlpha(
  renderTick: number,
  tick0: number,
  tick1: number,
): number {
  const span = tick1 - tick0;
  if (span <= 0) {
    return 0;
  }
  const rawAlpha = (renderTick - tick0) / span;
  return Math.max(0, Math.min(1, rawAlpha));
}

/**
 * Evaluates a Cubic Hermite Spline for position interpolation between two snapshots.
 *
 * IMPORTANT: Velocity is in meters/second, while alpha is normalized in [0, 1].
 * Therefore tangents M0 and M1 MUST be scaled by the actual time interval (dt)
 * between snapshots: M0 = V0 * dt, M1 = V1 * dt.
 *
 * Basis polynomials:
 * h00 = 2t³ - 3t² + 1
 * h10 =   t³ - 2t² + t
 * h01 = -2t³ + 3t²
 * h11 =   t³ -  t²
 *
 * P(t) = h00*P0 + h10*M0 + h01*P1 + h11*M1
 */
export function interpolateHermitePosition(
  p0: Vector3,
  p1: Vector3,
  v0: Vector3,
  v1: Vector3,
  alpha: number,
  snapshotDeltaTimeSeconds: number,
  result?: Vector3,
): Vector3 {
  const out = result ?? new Vector3();
  const t = Math.max(0, Math.min(1, alpha));
  const t2 = t * t;
  const t3 = t2 * t;

  // Cubic Hermite basis functions
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  // Tangents scaled by snapshot interval
  const dt = Math.max(0.0001, snapshotDeltaTimeSeconds);
  const m0x = v0.x * dt;
  const m0y = v0.y * dt;
  const m0z = v0.z * dt;

  const m1x = v1.x * dt;
  const m1y = v1.y * dt;
  const m1z = v1.z * dt;

  out.x = h00 * p0.x + h10 * m0x + h01 * p1.x + h11 * m1x;
  out.y = h00 * p0.y + h10 * m0y + h01 * p1.y + h11 * m1y;
  out.z = h00 * p0.z + h10 * m0z + h01 * p1.z + h11 * m1z;

  return out;
}

/**
 * Spherical linear interpolation between two orientations.
 */
export function interpolateRotation(
  q0: Quaternion,
  q1: Quaternion,
  alpha: number,
  result?: Quaternion,
): Quaternion {
  const out = result ?? new Quaternion();
  const t = Math.max(0, Math.min(1, alpha));
  Quaternion.SlerpToRef(q0, q1, t, out);
  return out;
}
