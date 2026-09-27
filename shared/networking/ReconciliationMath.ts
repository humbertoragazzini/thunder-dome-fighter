import { Vector3, Quaternion } from "@babylonjs/core";
import {
  POSITION_RECONCILIATION_EPSILON,
  ROTATION_RECONCILIATION_EPSILON,
  VELOCITY_RECONCILIATION_EPSILON,
  ANGULAR_VELOCITY_RECONCILIATION_EPSILON,
  RESIDUAL_POSITION_EPSILON,
  RESIDUAL_ROTATION_EPSILON,
} from "../vehicle/TestVehicleConfig";
import {
  type PredictedHistoryFrame,
  calculatePositionDistance,
  calculateRotationDifferenceAngle,
  calculateVelocityDistance,
} from "./PredictionMath";

// Reusable scratch objects
const tempInvQuat = new Quaternion();
const identityQuat = Quaternion.Identity();

export interface AuthoritativeMotionState {
  position: Vector3;
  rotation: Quaternion;
  linearVelocity: Vector3;
  angularVelocity: Vector3;
}

export interface ToleranceCheckResult {
  withinTolerance: boolean;
  positionError: number;
  rotationError: number;
  velocityError: number;
  angularVelocityError: number;
}

// ==================================================
// RECONCILIATION DECISION & VISUAL ERROR MATH
// ==================================================

/**
 * Checks whether a client prediction history frame matches the authoritative server state
 * within configurable epsilon tolerances.
 */
export function isPredictionWithinTolerance(
  predicted: PredictedHistoryFrame,
  authoritative: AuthoritativeMotionState,
  tolerances: {
    positionEpsilon?: number;
    rotationEpsilon?: number;
    velocityEpsilon?: number;
    angularVelocityEpsilon?: number;
  } = {},
): ToleranceCheckResult {
  const posEps = tolerances.positionEpsilon ?? POSITION_RECONCILIATION_EPSILON;
  const rotEps = tolerances.rotationEpsilon ?? ROTATION_RECONCILIATION_EPSILON;
  const velEps = tolerances.velocityEpsilon ?? VELOCITY_RECONCILIATION_EPSILON;
  const angVelEps =
    tolerances.angularVelocityEpsilon ?? ANGULAR_VELOCITY_RECONCILIATION_EPSILON;

  const positionError = calculatePositionDistance(
    predicted.position,
    authoritative.position,
  );
  const rotationError = calculateRotationDifferenceAngle(
    predicted.rotation,
    authoritative.rotation,
  );
  const velocityError = calculateVelocityDistance(
    predicted.linearVelocity,
    authoritative.linearVelocity,
  );
  const angularVelocityError = calculateVelocityDistance(
    predicted.angularVelocity,
    authoritative.angularVelocity,
  );

  const withinTolerance =
    positionError <= posEps &&
    rotationError <= rotEps &&
    velocityError <= velEps &&
    angularVelocityError <= angVelEps;

  return {
    withinTolerance,
    positionError,
    rotationError,
    velocityError,
    angularVelocityError,
  };
}

/**
 * Calculates visual position error offset: oldVisualPosition - newCorrectedPredictedPosition.
 */
export function calculateVisualPositionOffset(
  oldVisualPos: Vector3,
  newPredictedPos: Vector3,
  result?: Vector3,
): Vector3 {
  const out = result ?? new Vector3();
  oldVisualPos.subtractToRef(newPredictedPos, out);
  return out;
}

/**
 * Calculates visual rotation error offset: oldVisualRotation * (newCorrectedPredictedRotation)^-1.
 * Applying: visualRotation = offset * newCorrectedPredictedRotation.
 */
export function calculateVisualRotationOffset(
  oldVisualRot: Quaternion,
  newPredictedRot: Quaternion,
  result?: Quaternion,
): Quaternion {
  const out = result ?? new Quaternion();
  Quaternion.InverseToRef(newPredictedRot, tempInvQuat);
  oldVisualRot.multiplyToRef(tempInvQuat, out);
  return out;
}

/**
 * Calculates exponential decay factor over deltaSeconds: exp(-deltaSeconds / (timeConstantMs / 1000)).
 * Returns a scalar in (0, 1].
 */
export function calculateCorrectionDecayFactor(
  deltaSeconds: number,
  timeConstantMs: number,
): number {
  if (timeConstantMs <= 0 || deltaSeconds <= 0) {
    return 0;
  }
  const timeConstantSec = timeConstantMs / 1000;
  return Math.exp(-deltaSeconds / timeConstantSec);
}

/**
 * Decays visual position offset by decayFactor.
 * Explicitly snaps to (0, 0, 0) when length drops below residual epsilon.
 */
export function decayPositionError(
  currentOffset: Vector3,
  decayFactor: number,
  result?: Vector3,
): Vector3 {
  const out = result ?? new Vector3();
  currentOffset.scaleToRef(decayFactor, out);

  if (out.lengthSquared() < RESIDUAL_POSITION_EPSILON * RESIDUAL_POSITION_EPSILON) {
    out.set(0, 0, 0);
  }

  return out;
}

/**
 * Decays visual rotation error offset toward Identity quaternion.
 * Explicitly snaps to Identity when angular error drops below residual epsilon.
 */
export function decayRotationError(
  currentRotOffset: Quaternion,
  decayFactor: number,
  result?: Quaternion,
): Quaternion {
  const out = result ?? new Quaternion();

  // Decay factor in [0, 1]; slerp interpolation factor t = 1 - decayFactor (toward Identity)
  const slerpT = Math.max(0, Math.min(1, 1 - decayFactor));
  Quaternion.SlerpToRef(currentRotOffset, identityQuat, slerpT, out);

  const angleFromIdentity = calculateRotationDifferenceAngle(out, identityQuat);
  if (angleFromIdentity < RESIDUAL_ROTATION_EPSILON) {
    out.copyFrom(identityQuat);
  }

  return out;
}
