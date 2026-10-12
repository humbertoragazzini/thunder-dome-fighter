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
// PHYSICS SIMULATION CONSTANTS (60 Hz)
// ==================================================

export const PHYSICS_HZ = 60;
export const PHYSICS_DT_MS = 1000 / PHYSICS_HZ;
export const PHYSICS_DT_SECONDS = 1 / PHYSICS_HZ;

// ==================================================
// HUMANOID CHARACTER GEOMETRY & TUNING (PHASE 4 TARGET)
// ==================================================

export const CHARACTER_CAPSULE = {
  radius: 0.4, // 0.4m radius (0.8m diameter shoulder-to-shoulder)
  totalHeight: 1.1, // 1.1m cartoon humanoid brawler height
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

  /** Maximum horizontal acceleration force applied to reach target speed */
  MAX_ACCELERATION_FORCE: 60.0,

  /** Air control responsiveness multiplier [0.0 - 1.0] when not grounded */
  AIR_CONTROL_FACTOR: 0.25,
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
export const MAX_SERVER_INPUT_QUEUE = 32;

// Jitter buffer target: commands accumulated before FIFO consumption starts (2 ticks = 33ms at 60 Hz)
export const SERVER_INPUT_BUFFER_TARGET = 2;

// ==================================================
// LOCAL PREDICTION & RECONCILIATION
// ==================================================

export const MAX_PREDICTION_STEPS_PER_UPDATE = 8;
export const PREDICTION_HISTORY_MAX_FRAMES = 256;

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

// Target render delay: 6 ticks = 100ms behind server baseline at 60 Hz
export const REMOTE_INTERPOLATION_TARGET_DELAY_TICKS = 6.0;
export const REMOTE_INTERPOLATION_DELAY_TOLERANCE_TICKS = 1.0;
export const REMOTE_TIME_SCALE_ACCELERATION = 1.03;
export const REMOTE_TIME_SCALE_DECELERATION = 0.97;
export const REMOTE_MAX_SNAPSHOTS = 64;

// ==================================================
// HUMANOID CHARACTER INPUT CONTRACTS (MODERN TARGET)
// ==================================================

export type AttackActionType =
  | "NONE"
  | "LEFT_PUNCH"
  | "RIGHT_PUNCH"
  | "LIGHT_PUNCH"
  | "HEAVY_PUNCH"
  | "KICK"
  | "PUSH"
  | "BLOCK";

// ==================================================
// COMBAT & DAMAGE SPECIFICATION (PHASE 9 VERTICAL SLICE)
// ==================================================

export interface CombatMoveDefinition {
  damage: number;
  range: number;
  coneAngleRad: number;
  knockbackImpulse: number;
  cooldownSeconds: number;
}

export const COMBAT_CONFIG = {
  LEFT_PUNCH: {
    damage: 7,
    range: 2.0,
    coneAngleRad: (60 * Math.PI) / 180, // ±60 degrees forward cone
    knockbackImpulse: 1.5,
    cooldownSeconds: 0.25,
  },
  RIGHT_PUNCH: {
    damage: 7,
    range: 2.0,
    coneAngleRad: (60 * Math.PI) / 180, // ±60 degrees forward cone
    knockbackImpulse: 2.0,
    cooldownSeconds: 0.3,
  },
  // Aliases for backwards compatibility with tests / legacy inputs
  LIGHT_PUNCH: {
    damage: 7,
    range: 2.0,
    coneAngleRad: (60 * Math.PI) / 180,
    knockbackImpulse: 1.5,
    cooldownSeconds: 0.25,
  },
  HEAVY_PUNCH: {
    damage: 7,
    range: 2.0,
    coneAngleRad: (60 * Math.PI) / 180,
    knockbackImpulse: 2.0,
    cooldownSeconds: 0.3,
  },
  KICK: {
    damage: 12,
    range: 2.5,
    coneAngleRad: (50 * Math.PI) / 180, // ±50 degrees forward cone
    knockbackImpulse: 3.5,
    cooldownSeconds: 0.55,
  },
  PUSH: {
    damage: 3,
    range: 1.8,
    coneAngleRad: (45 * Math.PI) / 180, // ±45 degrees forward cone
    knockbackImpulse: 8.0, // High horizontal knockback impulse to shove opponents into the void
    cooldownSeconds: 0.9,
  },
  BLOCK: {
    damage: 0,
    range: 0,
    coneAngleRad: 0,
    knockbackImpulse: 0,
    cooldownSeconds: 0.1,
  },

  /** Duration a defeated player waits before respawning at team base */
  RESPAWN_DELAY_SECONDS: 3.0,

  /** Duration of invulnerability granted upon respawn */
  RESPAWN_INVULNERABILITY_SECONDS: 2.0,

  /** Total kills required to immediately trigger match victory */
  MATCH_WIN_KILLS: 3,

  /** Time window in seconds where void falls are credited to the last attacker */
  VOID_FALL_ATTRIBUTION_WINDOW_SECONDS: 10.0,
} as const;

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
