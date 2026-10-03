// ==================================================
// PLAYER, PHYSICS & NETWORKING SHARED CONFIGURATION
//
// WHAT IT DOES:
// Declares physics constants (30 Hz), character capsule geometry, movement
// forces, input command interfaces, and legacy vehicle aliases.
//
// HOW IT WORKS:
// Exports pure, immutable configuration objects and types shared identically
// between client prediction and server Havok simulation.
//
// WHY IT EXISTS:
// Enforces ADR-010 (30 Hz server simulation) and Strangler Fig pattern for
// vehicle-to-humanoid transition. Ensures deterministic parity between client
// and server physics calculations.
// ==================================================

// ==================================================
// PHYSICS SIMULATION CONSTANTS
// ==================================================

export const PHYSICS_HZ = 30;
export const PHYSICS_DT_MS = 1000 / PHYSICS_HZ;
export const PHYSICS_DT_SECONDS = 1 / PHYSICS_HZ;

// ==================================================
// HUMANOID CHARACTER GEOMETRY & TUNING (PHASE 4 TARGET)
// ==================================================

export const CHARACTER_CAPSULE = {
  radius: 0.4, // 0.4m radius (0.8m diameter shoulder-to-shoulder)
  totalHeight: 1.8, // 1.8m standard human height
} as const;

export const CHARACTER_FORCES = {
  /** Base ground movement speed in meters per second */
  BASE_SPEED: 6.0,

  /** Sprint multiplier applied to base speed */
  SPRINT_MULTIPLIER: 1.35,

  /** Upward velocity impulse imparted on jump */
  JUMP_IMPULSE: 6.5,

  /** Raycast distance below capsule base to detect ground contact */
  GROUND_CHECK_DISTANCE: 0.15,

  /** Maximum walkable ground slope in radians (~45 degrees) */
  MAX_SLOPE_RADIANS: Math.PI / 4,
} as const;

// ==================================================
// LEGACY PLAYER BOX GEOMETRY (USED BY ACTIVE SIMULATION UNTIL PHASE 4)
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
// SERVER INPUT QUEUE & JITTER BUFFER
// ==================================================

// Maximum input commands stored per entity before rejecting new arrivals
export const MAX_SERVER_INPUT_QUEUE = 16;

// Jitter buffer target: commands accumulated before FIFO consumption starts
export const SERVER_INPUT_BUFFER_TARGET = 2;

// ==================================================
// LOCAL PREDICTION & RECONCILIATION
// ==================================================

export const MAX_PREDICTION_STEPS_PER_UPDATE = 5;
export const PREDICTION_HISTORY_MAX_FRAMES = 128;

// Tolerances beyond which reconciliation re-simulates physics
export const POSITION_RECONCILIATION_EPSILON = 0.02; // 2 cm
export const ROTATION_RECONCILIATION_EPSILON = 0.03; // ~1.7 degrees
export const VELOCITY_RECONCILIATION_EPSILON = 0.1; // 0.1 m/s
export const ANGULAR_VELOCITY_RECONCILIATION_EPSILON = 0.2; // 0.2 rad/s

// Visual error smoothing
export const VISUAL_CORRECTION_TIME_CONSTANT_MS = 100;
export const LOCAL_HARD_SNAP_DISTANCE = 3.0;
export const RESIDUAL_POSITION_EPSILON = 0.001; // 1 mm
export const RESIDUAL_ROTATION_EPSILON = 0.001;

// ==================================================
// REMOTE INTERPOLATION
// ==================================================

export const REMOTE_INTERPOLATION_TARGET_DELAY_TICKS = 3.0;
export const REMOTE_INTERPOLATION_DELAY_TOLERANCE_TICKS = 0.5;
export const REMOTE_TIME_SCALE_ACCELERATION = 1.03;
export const REMOTE_TIME_SCALE_DECELERATION = 0.97;
export const REMOTE_MAX_SNAPSHOTS = 32;

// ==================================================
// HUMANOID CHARACTER INPUT CONTRACTS (MODERN TARGET)
// ==================================================

export type AttackActionType =
  | "NONE"
  | "LIGHT_PUNCH"
  | "HEAVY_PUNCH"
  | "KICK"
  | "BLOCK";

/**
 * High-level intention of a player controlling a humanoid character.
 */
export interface CharacterActionInput {
  /** Lateral movement: -1.0 (left) to +1.0 (right) */
  moveX: number;

  /** Longitudinal movement: -1.0 (backward) to +1.0 (forward) */
  moveZ: number;

  /** Horizontal aim/look direction in radians around Y-axis [0, 2*PI) */
  lookYaw: number;

  /** Whether the jump action is pressed this frame */
  jump: boolean;

  /** Whether sprint modifier is actively held */
  sprint: boolean;

  /** Discrete combat action triggered this frame */
  attackAction: AttackActionType;
}

/**
 * Networked character input packet carrying a monotonic sequence number.
 */
export interface CharacterInputCommand extends CharacterActionInput {
  sequence: number;
}

// ==================================================
// LEGACY VEHICLE INPUTS (PRESERVED UNTIL PHASE 4 TRANSITION)
// ==================================================

/**
 * @deprecated Legacy vehicle input interface. Will be retired in Phase 4.
 */
export interface PlayerInput {
  throttle: number;
  steering: number;
  brake: number;
}

/**
 * @deprecated Legacy vehicle input command. Will be retired in Phase 4.
 */
export interface PlayerInputCommand {
  sequence: number;
  throttle: number;
  steering: number;
  brake: number;
}
