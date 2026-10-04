import { Vector3, Quaternion } from "@babylonjs/core";
import {
  MAX_THROTTLE_FORCE,
  MAX_STEERING_TORQUE,
  MAX_BRAKE_FORCE,
  BRAKE_DAMPING_FACTOR,
  CHARACTER_FORCES,
  PLAYER_MASS,
  PHYSICS_DT_SECONDS,
} from "./PlayerConfig";

// Reusable scratch vectors to prevent GC allocations during tight loops
const tempForward = new Vector3();

// ==================================================
// SHARED PLAYER FORCES & TORQUES
//
// Pure calculations used identically by both client prediction
// and server authoritative Havok simulation.
// Invariant: Same inputs + same state + same constants = identical forces.
// ==================================================

/**
 * Calculates forward propulsion force along the player's heading.
 *
 * @param currentRotation Player's current rotation quaternion
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
 * @param linearVelocity Player's current linear velocity
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

/**
 * Calculates 8-way horizontal movement force for a humanoid character.
 *
 * @param moveX Lateral input [-1.0 (left), 1.0 (right)]
 * @param moveZ Longitudinal input [-1.0 (backward), 1.0 (forward)]
 * @param lookYaw Player look azimuth in radians around Y
 * @param sprint Whether sprint modifier is active
 * @param currentLinearVelocity Current linear velocity of the physics body
 * @param isGrounded Whether the character is currently touching a walkable surface
 * @param result Optional target Vector3 to store the result
 */
export function calculateHumanoidMovementForce(
  moveX: number,
  moveZ: number,
  lookYaw: number,
  sprint: boolean,
  currentLinearVelocity: Vector3,
  isGrounded: boolean,
  result?: Vector3,
): Vector3 {
  const out = result ?? new Vector3();

  // Normalize input vector if magnitude > 1 (e.g. diagonal input)
  const inputLenSq = moveX * moveX + moveZ * moveZ;
  let normX = moveX;
  let normZ = moveZ;

  if (inputLenSq > 1.0) {
    const invLen = 1.0 / Math.sqrt(inputLenSq);
    normX *= invLen;
    normZ *= invLen;
  }

  const speed =
    CHARACTER_FORCES.BASE_SPEED *
    (sprint ? CHARACTER_FORCES.SPRINT_MULTIPLIER : 1.0);

  // Rotate local input vector into world space based on lookYaw
  const sinYaw = Math.sin(lookYaw);
  const cosYaw = Math.cos(lookYaw);
  const targetVelX = (normX * cosYaw + normZ * sinYaw) * speed;
  const targetVelZ = (-normX * sinYaw + normZ * cosYaw) * speed;

  // Proportional acceleration force toward target velocity: F = (v_target - v_current) * (m / dt)
  const controlFactor = isGrounded ? 1.0 : CHARACTER_FORCES.AIR_CONTROL_FACTOR;
  const maxForce = CHARACTER_FORCES.MAX_ACCELERATION_FORCE * controlFactor;

  const rawForceX =
    (targetVelX - currentLinearVelocity.x) *
    (PLAYER_MASS / PHYSICS_DT_SECONDS) *
    controlFactor;
  const rawForceZ =
    (targetVelZ - currentLinearVelocity.z) *
    (PLAYER_MASS / PHYSICS_DT_SECONDS) *
    controlFactor;

  const forceLenSq = rawForceX * rawForceX + rawForceZ * rawForceZ;
  const maxForceSq = maxForce * maxForce;

  if (forceLenSq > maxForceSq && forceLenSq > 0.0001) {
    const scale = maxForce / Math.sqrt(forceLenSq);
    out.set(rawForceX * scale, 0, rawForceZ * scale);
  } else {
    out.set(rawForceX, 0, rawForceZ);
  }

  return out;
}

/**
 * Calculates discrete upward jump impulse for a humanoid character.
 *
 * @param isGrounded Whether the character is currently in contact with the ground
 * @param jumpRequested Whether the jump action is triggered this frame
 * @param result Optional target Vector3 to store the result
 */
export function calculateJumpImpulse(
  isGrounded: boolean,
  jumpRequested: boolean,
  result?: Vector3,
): Vector3 {
  const out = result ?? new Vector3();
  if (isGrounded && jumpRequested) {
    out.set(0, CHARACTER_FORCES.JUMP_IMPULSE, 0);
  } else {
    out.set(0, 0, 0);
  }
  return out;
}
