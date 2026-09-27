// ==================================================
// VEHICLE, PHYSICS & NETWORKING SHARED CONFIGURATION
//
// Pure TypeScript constants and interfaces shared between
// client prediction and server simulation.
// No Babylon, Scene, React, or Colyseus dependencies.
// ==================================================

// ==================================================
// PHYSICS
// ==================================================

export const PHYSICS_HZ = 30;
export const PHYSICS_DT_MS = 1000 / PHYSICS_HZ;
export const PHYSICS_DT_SECONDS = 1 / PHYSICS_HZ;

// ==================================================
// VEHICLE GEOMETRY & TUNING
// ==================================================

export const PLAYER_BOX_SIZE = {
  width: 1.8,
  height: 1.5,
  depth: 4.5,
} as const;

export const PLAYER_SPAWN_POSITION = {
  x: 0,
  y: -0.4,
  z: 0,
} as const;

export const PLAYER_MASS = 1;
export const LINEAR_DAMPING = 0.5;
export const ANGULAR_DAMPING = 2.5;

// ==================================================
// VEHICLE FORCES
// ==================================================

export const MAX_THROTTLE_FORCE = 25;
export const MAX_STEERING_TORQUE = 5;
export const MAX_BRAKE_FORCE = 20;
export const BRAKE_DAMPING_FACTOR = 10;

// ==================================================
// ENVIRONMENT & FLOOR
// ==================================================

export const FLOOR_SIZE = {
  width: 50,
  height: 0.1,
  depth: 50,
} as const;

export const FLOOR_POSITION = {
  x: 0,
  y: -1.5,
  z: 0,
} as const;

export const GRAVITY = {
  x: 0,
  y: -9.8,
  z: 0,
} as const;

// ==================================================
// SERVER INPUT QUEUE
// ==================================================

// Maximum input commands stored per entity before rejecting new arrivals
export const MAX_SERVER_INPUT_QUEUE = 16;

// Jitter buffer target: commands accumulated before FIFO consumption starts
export const SERVER_INPUT_BUFFER_TARGET = 2;

// ==================================================
// LOCAL PREDICTION
// ==================================================

// Maximum fixed prediction steps evaluated per render update (avoids death spiral)
export const MAX_PREDICTION_STEPS_PER_UPDATE = 5;

// Maximum history frames kept for reconciliation comparison
export const PREDICTION_HISTORY_MAX_FRAMES = 128;

// ==================================================
// RECONCILIATION TOLERANCES (EPSILONS)
//
// Starting tuning values. If discrepancy between client prediction
// and server authoritative state at matching tick is below these values,
// reconciliation is skipped entirely.
// ==================================================

export const POSITION_RECONCILIATION_EPSILON = 0.02; // 2 cm
export const ROTATION_RECONCILIATION_EPSILON = 0.03; // ~1.7 degrees
export const VELOCITY_RECONCILIATION_EPSILON = 0.10; // 0.1 m/s
export const ANGULAR_VELOCITY_RECONCILIATION_EPSILON = 0.20; // 0.2 rad/s

// ==================================================
// VISUAL CORRECTION & ERROR DECAY
//
// Normal predicted movement is 1:1 with physics (no trailing lag filter).
// Only actual reconciliation discrepancies are offset and decayed.
// ==================================================

// Timescale for exponential decay (mesh converges smoothly to corrected predicted physics)
export const VISUAL_CORRECTION_TIME_CONSTANT_MS = 100;

// Discrepancy beyond which visual smoothing snaps immediately to avoid rubber-banding
export const LOCAL_HARD_SNAP_DISTANCE = 3.0;

// Residual thresholds below which offsets are explicitly zeroed to avoid lingering floating-point dust
export const RESIDUAL_POSITION_EPSILON = 0.001; // 1 mm
export const RESIDUAL_ROTATION_EPSILON = 0.001; // 0.001 radians

// ==================================================
// REMOTE INTERPOLATION
// ==================================================

// Target buffer delay in server ticks (3 ticks * 33.3ms = 100ms)
export const REMOTE_INTERPOLATION_TARGET_DELAY_TICKS = 3.0;

// Dead-band tolerance around target delay where timeScale remains exactly 1.0
export const REMOTE_INTERPOLATION_DELAY_TOLERANCE_TICKS = 0.5;

// Gentle speedup when buffer is falling behind (delay > target + tolerance)
export const REMOTE_TIME_SCALE_ACCELERATION = 1.03;

// Gentle slowdown when buffer is creeping too close to newest tick (delay < target - tolerance)
export const REMOTE_TIME_SCALE_DECELERATION = 0.97;

// Maximum snapshots stored in remote interpolation history
export const REMOTE_MAX_SNAPSHOTS = 32;

// ==================================================
// INPUT INTERFACES
// ==================================================

// Physical pedal and steering state
export interface PlayerInput {
  throttle: number;
  steering: number;
  brake: number;
}

// Networked input command carrying monotonic sequence number
export interface PlayerInputCommand {
  sequence: number;
  throttle: number;
  steering: number;
  brake: number;
}
