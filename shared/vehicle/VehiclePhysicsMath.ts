import { Vector3, Quaternion } from "@babylonjs/core";
import {
  MAX_THROTTLE_FORCE,
  MAX_STEERING_TORQUE,
  MAX_BRAKE_FORCE,
  BRAKE_DAMPING_FACTOR,
} from "./TestVehicleConfig";

// Reusable scratch vectors to prevent GC allocations during tight loops
const tempForward = new Vector3();

// ==================================================
// SHARED VEHICLE FORCES & TORQUES
//
// Pure calculations used identically by both client prediction
// and server authoritative Havok simulation.
// Invariant: Same inputs + same state + same constants = identical forces.
// ==================================================

/**
 * Calculates forward propulsion force along the vehicle's heading.
 *
 * @param currentRotation Vehicle's current rotation quaternion
 * @param throttle Normalized throttle input [0, 1]
 * @param result Optional target Vector3 to store the result
 */
export function calculateThrottleForce(
  currentRotation: Quaternion,
  throttle: number,
  result?: Vector3,
): Vector3 {
  const out = result ?? new Vector3();

  if (throttle <= 0) {
    out.set(0, 0, 0);
    return out;
  }

  Vector3.Forward().rotateByQuaternionToRef(currentRotation, tempForward);
  const magnitude = throttle * MAX_THROTTLE_FORCE;
  tempForward.scaleToRef(magnitude, out);
  return out;
}

/**
 * Calculates steering torque around the vertical Y-axis.
 *
 * @param steering Normalized steering input [-1, 1]
 * @param result Optional target Vector3 to store the result
 */
export function calculateSteeringTorque(
  steering: number,
  result?: Vector3,
): Vector3 {
  const out = result ?? new Vector3();

  if (steering === 0) {
    out.set(0, 0, 0);
    return out;
  }

  const torqueMagnitude = steering * MAX_STEERING_TORQUE;
  out.set(0, torqueMagnitude, 0);
  return out;
}

/**
 * Calculates braking force opposing horizontal movement.
 *
 * @param linearVelocity Vehicle's current linear velocity
 * @param brake Normalized brake input [0, 1]
 * @param result Optional target Vector3 to store the result
 */
export function calculateBrakeForce(
  linearVelocity: Vector3,
  brake: number,
  result?: Vector3,
): Vector3 {
  const out = result ?? new Vector3();

  if (brake <= 0) {
    out.set(0, 0, 0);
    return out;
  }

  const horizontalSpeed = Math.sqrt(
    linearVelocity.x * linearVelocity.x + linearVelocity.z * linearVelocity.z,
  );

  if (horizontalSpeed > 0.001) {
    const brakeMagnitude =
      Math.min(horizontalSpeed * BRAKE_DAMPING_FACTOR, MAX_BRAKE_FORCE) * brake;
    const invSpeed = -1 / horizontalSpeed;

    out.set(
      linearVelocity.x * invSpeed * brakeMagnitude,
      0,
      linearVelocity.z * invSpeed * brakeMagnitude,
    );
  } else {
    out.set(0, 0, 0);
  }

  return out;
}
