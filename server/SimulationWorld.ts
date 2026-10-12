// ==================================================
// AUTHORITATIVE SERVER PHYSICS SIMULATION WORLD
//
// WHAT IT DOES:
// Runs a headless Havok physics scene (60 Hz fixed step) managing player
// capsule colliders, modular arena collision hulls, and FIFO input queues.
//
// HOW IT WORKS:
// Consumes client input packets from a jitter buffer, applies movement forces
// and yaw steering, steps physics via createPhysicsAccumulator, and exports state.
// Static collision hulls are instantiated from LevelDefinition via LevelCollisionLoader.
//
// WHY IT EXISTS:
// Enforces server authority (ADR-010). Ensures client inputs cannot cheat physics,
// glitch through walls, or produce desync across connected peers.
// ==================================================

import {
  NullEngine,
  Scene,
  TransformNode,
  Vector3,
  Quaternion,
  HavokPlugin,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeCapsule,
  PhysicsRaycastResult,
} from "@babylonjs/core";

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import HavokPhysics from "@babylonjs/havok";

import {
  PHYSICS_DT_MS,
  CHARACTER_CAPSULE,
  CHARACTER_FORCES,
  PLAYER_SPAWN_POSITION,
  PLAYER_MASS,
  LINEAR_DAMPING,
  ANGULAR_DAMPING,
  GRAVITY,
  MAX_SERVER_INPUT_QUEUE,
  SERVER_INPUT_BUFFER_TARGET,
  type PlayerInput,
  type PlayerInputCommand,
  type CharacterActionInput,
  type CharacterInputCommand,
  COMBAT_CONFIG,
} from "../shared/player/PlayerConfig";

import {
  calculateThrottleForce,
  calculateSteeringTorque,
  calculateBrakeForce,
  calculateHumanoidMovementForce,
  calculateJumpImpulse,
} from "../shared/player/PlayerPhysicsMath";

import { LevelCollisionLoader } from "../shared/levels/LevelCollisionLoader";
import {
  LEVEL_THUNDER_DOME_ALPHA,
  type LevelDefinition,
  type SpawnPoint,
} from "../shared/domain/Level";

// ==================================================
// ENTITIES CONFIGURATION
// ==================================================
export interface SimulationEntity {
  playerId: string;
  node: TransformNode;
  body: PhysicsBody;
  currentInput: CharacterActionInput | PlayerInput;
  pendingInputCommands: (CharacterInputCommand | PlayerInputCommand)[];
  inputBufferPrimed: boolean;
  lastProcessedInputSequence: number;
  isGrounded: boolean;
  leftLegGrounded: boolean;
  rightLegGrounded: boolean;
  jumpConsumed: boolean;

  // Combat runtime state
  lastAttackerSessionId?: string;
  lastDamageTimestamp?: number;
  attackCooldownUntil?: number;
  invulnerableUntil?: number;
}

// ==================================================
// PHYSICS CONFIGURATION
// ==================================================

const SCHEDULER_INTERVAL_MS = PHYSICS_DT_MS / 2;

// ==================================================
// FIXED-STEP PHYSICS ACCUMULATOR
//
// Collect real elapsed time and spend it using
// fixed physics steps. Generic accumulator with
// pre-step and post-step callbacks.
// ==================================================

function createPhysicsAccumulator(
  scene: Scene,
  physicsDtMs: number,
  onBeforePhysicsStep?: () => void,
  onAfterPhysicsStep?: () => void,
) {
  let accumulator = 0;
  let lastTime = performance.now();

  return function updatePhysics() {
    const now = performance.now();
    const elapsed = now - lastTime;

    lastTime = now;
    accumulator += elapsed;

    while (accumulator >= physicsDtMs) {
      onBeforePhysicsStep?.();

      scene._advancePhysicsEngineStep(physicsDtMs);

      onAfterPhysicsStep?.();

      accumulator -= physicsDtMs;
    }
  };
}

// ==================================================
// SIMULATOR WORLD
// ==================================================

export class SimulatorWorld {
  public isGameplayActive: boolean = false;
  private engine: NullEngine;
  private scene: Scene;
  private havokPlugin!: HavokPlugin;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private entities = new Map<string, SimulationEntity>();
  private serverTick = 0;
  private level: LevelDefinition;
  private levelCollisionLoader: LevelCollisionLoader | null = null;

  // Zero-allocation scratch buffers for 3-point downward ground probe
  private raycastResultCenter = new PhysicsRaycastResult();
  private raycastResultLeft = new PhysicsRaycastResult();
  private raycastResultRight = new PhysicsRaycastResult();
  private rayFrom = new Vector3();
  private rayTo = new Vector3();

  // ==================================================
  // CONSTRUCTOR
  //
  // Synchronous Babylon setup.
  // ==================================================

  constructor(level: LevelDefinition = LEVEL_THUNDER_DOME_ALPHA) {
    this.level = level;

    // Headless Babylon engine.
    this.engine = new NullEngine();

    // Server simulation scene.
    this.scene = new Scene(this.engine);
  }

  getServerTick(): number {
    return this.serverTick;
  }

  getLevel(): LevelDefinition {
    return this.level;
  }

  // ==================================================
  // ENTITY STATE
  // ==================================================

  forEachEntityState(
    callback: (
      playerId: string,
      x: number,
      y: number,
      z: number,
      rx: number,
      ry: number,
      rz: number,
      rw: number,
      vx: number,
      vy: number,
      vz: number,
      avx: number,
      avy: number,
      avz: number,
      lastProcessedInputSequence: number,
    ) => void,
  ) {
    for (const entity of this.entities.values()) {
      const linVel = entity.body.getLinearVelocity();
      const angVel = entity.body.getAngularVelocity();

      callback(
        entity.playerId,
        entity.node.position.x,
        entity.node.position.y,
        entity.node.position.z,
        entity.node.rotationQuaternion?.x ?? 0,
        entity.node.rotationQuaternion?.y ?? 0,
        entity.node.rotationQuaternion?.z ?? 0,
        entity.node.rotationQuaternion?.w ?? 1,
        linVel.x,
        linVel.y,
        linVel.z,
        angVel.x,
        angVel.y,
        angVel.z,
        entity.lastProcessedInputSequence,
      );
    }
  }

  spawnEntity(playerId: string, spawnPoint?: SpawnPoint) {
    if (this.entities.has(playerId)) {
      return;
    }

    // ==================================================
    // HUMANOID CHARACTER CAPSULE
    // ==================================================

    const playerNode = new TransformNode(`player-${playerId}`, this.scene);

    const spawnPos = spawnPoint?.position ?? PLAYER_SPAWN_POSITION;
    const spawnYaw = spawnPoint?.rotationYaw ?? 0;

    playerNode.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    playerNode.rotationQuaternion = Quaternion.FromEulerAngles(0, spawnYaw, 0);

    // HOW does physics treat it?
    const playerBody = new PhysicsBody(
      playerNode,
      PhysicsMotionType.DYNAMIC,
      false,
      this.scene,
    );

    // Upright humanoid capsule geometry (radius: 0.4m, total height: 1.1m)
    // Cylinder height = totalHeight - (2 * radius) = 0.3m
    const cylinderHeight =
      CHARACTER_CAPSULE.totalHeight - 2 * CHARACTER_CAPSULE.radius;

    const capsuleShape = new PhysicsShapeCapsule(
      new Vector3(0, -cylinderHeight / 2, 0), // Base hemisphere center
      new Vector3(0, cylinderHeight / 2, 0), // Top hemisphere center
      CHARACTER_CAPSULE.radius,
      this.scene,
    );

    // Connect shape to body
    playerBody.shape = capsuleShape;

    // ==================================================
    // PHYSICAL PROPERTIES & ROTATIONAL LOCKING
    // ==================================================

    playerBody.setMassProperties({
      mass: PLAYER_MASS,
      // In Havok, an inertia axis set to 0 yields infinite rotational resistance.
      // Locking X (pitch = 0) and Z (roll = 0) keeps the fighter permanently upright.
      // Y = 1 gives finite unit inertia so steering torque can rotate the character around the vertical axis.
      inertia: new Vector3(0, 1, 0),
    });

    // Locomotion tuning damping
    playerBody.setLinearDamping(LINEAR_DAMPING);
    playerBody.setAngularDamping(ANGULAR_DAMPING);

    const newPlayer: SimulationEntity = {
      playerId: playerId,
      node: playerNode,
      body: playerBody,
      currentInput: {
        moveX: 0,
        moveZ: 0,
        lookYaw: spawnYaw,
        jump: false,
        sprint: false,
        attackAction: "NONE",
        throttle: 0,
        steering: 0,
        brake: 0,
      } as CharacterActionInput & PlayerInput,
      pendingInputCommands: [],
      inputBufferPrimed: false,
      lastProcessedInputSequence: 0,
      isGrounded: false,
      leftLegGrounded: false,
      rightLegGrounded: false,
      jumpConsumed: false,
    };

    this.entities.set(playerId, newPlayer);

    console.log(
      "Humanoid capsule entity spawned:",
      playerId,
      "Total entities:",
      this.entities.size,
    );
  }

  removeEntity(playerId: string) {
    // Find the player's physics entity.
    const entity = this.entities.get(playerId);

    // Player does not exist.
    if (!entity) {
      return;
    }

    // Dispose its collision shape.
    entity.body.shape?.dispose();

    // Remove the body from physics.
    entity.body.dispose();

    // Remove the TransformNode.
    entity.node.dispose();

    // Remove it from our registry (stored input is automatically destroyed).
    this.entities.delete(playerId);

    console.log(
      "Entity removed:",
      playerId,
      "Total entities:",
      this.entities.size,
    );
  }

  // ==================================================
  // PLAYER INPUT & CONTROLS
  // ==================================================

  enqueueEntityInput(
    playerId: string,
    command: CharacterInputCommand | PlayerInputCommand,
  ) {
    const entity = this.entities.get(playerId);

    if (!entity) {
      return;
    }

    // Bounded queue: reject incoming command if queue is full.
    // Never drop older commands already queued, as that would corrupt authoritative timeline continuity.
    if (entity.pendingInputCommands.length >= MAX_SERVER_INPUT_QUEUE) {
      console.warn(
        `[SimulationWorld] Input queue full (${MAX_SERVER_INPUT_QUEUE}) for player ${playerId}. Rejecting sequence ${command.sequence}.`,
      );
      return;
    }

    entity.pendingInputCommands.push(command);
  }

  /**
   * Performs 3-point downward ray probe (Center, Left Leg, Right Leg) to detect walkable ground contact.
   * Reuses pre-allocated raycast buffers to ensure zero memory allocations during 30 Hz ticks.
   */
  public checkGrounded(entity: SimulationEntity): boolean {
    const footLateralOffset = 0.2; // 0.2m lateral offset for feet
    const capsuleHalfHeight = CHARACTER_CAPSULE.totalHeight / 2;
    const totalProbeLength =
      capsuleHalfHeight + CHARACTER_FORCES.GROUND_CHECK_DISTANCE;
    const minWalkableNormalY = Math.cos(CHARACTER_FORCES.MAX_SLOPE_RADIANS); // ~0.7071 (45 degrees)

    const posX = entity.node.position.x;
    const posY = entity.node.position.y;
    const posZ = entity.node.position.z;

    // Determine current yaw angle
    let currentYaw = 0;
    if (
      "lookYaw" in entity.currentInput &&
      typeof entity.currentInput.lookYaw === "number"
    ) {
      currentYaw = entity.currentInput.lookYaw;
    } else if (entity.node.rotationQuaternion) {
      currentYaw = entity.node.rotationQuaternion.toEulerAngles().y;
    }

    const cosYaw = Math.cos(currentYaw);
    const sinYaw = Math.sin(currentYaw);

    // 1. Center Probe
    this.rayFrom.set(posX, posY, posZ);
    this.rayTo.set(posX, posY - totalProbeLength, posZ);
    this.raycastResultCenter.reset();
    this.havokPlugin.raycast(
      this.rayFrom,
      this.rayTo,
      this.raycastResultCenter,
      {
        ignoreBody: entity.body,
      },
    );
    const centerGrounded =
      this.raycastResultCenter.hasHit &&
      this.raycastResultCenter.hitNormalWorld.y >= minWalkableNormalY;

    // 2. Left Leg Probe (offset along local -X)
    const leftOffsetX = -footLateralOffset * cosYaw;
    const leftOffsetZ = footLateralOffset * sinYaw;
    this.rayFrom.set(posX + leftOffsetX, posY, posZ + leftOffsetZ);
    this.rayTo.set(
      posX + leftOffsetX,
      posY - totalProbeLength,
      posZ + leftOffsetZ,
    );
    this.raycastResultLeft.reset();
    this.havokPlugin.raycast(this.rayFrom, this.rayTo, this.raycastResultLeft, {
      ignoreBody: entity.body,
    });
    entity.leftLegGrounded =
      this.raycastResultLeft.hasHit &&
      this.raycastResultLeft.hitNormalWorld.y >= minWalkableNormalY;

    // 3. Right Leg Probe (offset along local +X)
    const rightOffsetX = footLateralOffset * cosYaw;
    const rightOffsetZ = -footLateralOffset * sinYaw;
    this.rayFrom.set(posX + rightOffsetX, posY, posZ + rightOffsetZ);
    this.rayTo.set(
      posX + rightOffsetX,
      posY - totalProbeLength,
      posZ + rightOffsetZ,
    );
    this.raycastResultRight.reset();
    this.havokPlugin.raycast(
      this.rayFrom,
      this.rayTo,
      this.raycastResultRight,
      {
        ignoreBody: entity.body,
      },
    );
    entity.rightLegGrounded =
      this.raycastResultRight.hasHit &&
      this.raycastResultRight.hitNormalWorld.y >= minWalkableNormalY;

    entity.isGrounded =
      centerGrounded || entity.leftLegGrounded || entity.rightLegGrounded;
    return entity.isGrounded;
  }

  private applyEntityInputs() {
    for (const entity of this.entities.values()) {
      // If gameplay is not active (e.g. WAITING_FOR_PLAYERS or COUNTDOWN),
      // drain queued commands and zero horizontal velocity to prevent pre-match drift.
      if (!this.isGameplayActive) {
        entity.pendingInputCommands.length = 0;
        const currentVel = entity.body.getLinearVelocity();
        entity.body.setLinearVelocity(new Vector3(0, currentVel.y, 0));
        entity.body.setAngularVelocity(Vector3.Zero());
        continue;
      }

      // Buffer Priming & Jitter Margin Management:
      // On startup or after starvation, wait until SERVER_INPUT_BUFFER_TARGET commands
      // are buffered to absorb normal network arrival jitter.
      if (!entity.inputBufferPrimed) {
        if (entity.pendingInputCommands.length >= SERVER_INPUT_BUFFER_TARGET) {
          entity.inputBufferPrimed = true;
        }
      }

      // If buffer is primed and has commands, consume at most ONE command per physics tick
      if (entity.inputBufferPrimed && entity.pendingInputCommands.length > 0) {
        const nextCommand = entity.pendingInputCommands.shift()!;
        entity.currentInput = nextCommand;
        entity.lastProcessedInputSequence = nextCommand.sequence;
      } else if (
        entity.inputBufferPrimed &&
        entity.pendingInputCommands.length === 0
      ) {
        // Queue Starvation:
        // Network starvation occurred. The shared Havok world still advances.
        // Continue using the entity's last known currentInput.
        // Do NOT advance lastProcessedInputSequence (no phantom acknowledgments).
        // Reset inputBufferPrimed to false to rebuild the jitter margin before consumption resumes.
        // Starvation creates temporary prediction divergence that client reconciliation corrects later.
        entity.inputBufferPrimed = false;
      }

      // Perform 3-point downward ground detection
      this.checkGrounded(entity);

      const currentInput = entity.currentInput;

      // Handle Modern Humanoid Input (CharacterActionInput)
      if ("moveX" in currentInput && typeof currentInput.moveX === "number") {
        const charInput = currentInput as CharacterActionInput;
        const currentLinearVelocity = entity.body.getLinearVelocity();

        // 1. 8-Way Directional Locomotion Force
        const movementForce = calculateHumanoidMovementForce(
          charInput.moveX,
          charInput.moveZ,
          charInput.lookYaw,
          charInput.sprint,
          currentLinearVelocity,
          entity.isGrounded,
        );
        entity.body.applyForce(movementForce, entity.node.position);

        // 2. Yaw Orientation (rotate body around vertical Y-axis to match lookYaw)
        const currentYaw = entity.node.rotationQuaternion
          ? entity.node.rotationQuaternion.toEulerAngles().y
          : 0;
        let diffYaw = charInput.lookYaw - currentYaw;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        const targetAngularVelY = diffYaw * 30; // 30 Hz target response
        entity.body.setAngularVelocity(new Vector3(0, targetAngularVelY, 0));

        // 3. Discrete Jump Impulse when Grounded
        if (charInput.jump) {
          if (!entity.jumpConsumed && entity.isGrounded) {
            const jumpImpulse = calculateJumpImpulse(true, true);
            entity.body.applyImpulse(jumpImpulse, entity.node.position);
            entity.jumpConsumed = true;
          }
        } else {
          entity.jumpConsumed = false;
        }
      } else {
        // Fallback: Legacy Vehicle Inputs (throttle, steering, brake)
        const vehicleInput = currentInput as PlayerInput;
        const currentRotation =
          entity.node.rotationQuaternion ?? Quaternion.Identity();

        if (vehicleInput.throttle > 0) {
          const throttleForce = calculateThrottleForce(
            currentRotation,
            vehicleInput.throttle,
          );
          entity.body.applyForce(throttleForce, entity.node.position);
        }

        if (vehicleInput.steering !== 0) {
          const steeringTorque = calculateSteeringTorque(vehicleInput.steering);
          entity.body.applyTorque(steeringTorque);
        }

        if (vehicleInput.brake > 0) {
          const linearVelocity = entity.body.getLinearVelocity();
          const brakeForce = calculateBrakeForce(
            linearVelocity,
            vehicleInput.brake,
          );
          entity.body.applyForce(brakeForce, entity.node.position);
        }
      }
    }
  }

  // ==================================================
  // INITIALIZE
  //
  // Async setup such as loading Havok.
  // ==================================================

  async initialize(onAfterPhysicsStep?: () => void) {
    console.log("world initializing");

    // ==================================================
    // HAVOK WASM
    // ==================================================

    // Find this file.
    const currentFile = fileURLToPath(import.meta.url);

    // Find this file's directory.
    const currentDirectory = dirname(currentFile);

    // Build absolute path to Havok WASM.
    const havokWasmPath = resolve(
      currentDirectory,
      "../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm",
    );

    // Read WASM from disk.
    const havokWasmBuffer = await readFile(havokWasmPath);

    // Extract exact WASM bytes.
    const havokWasm = havokWasmBuffer.buffer.slice(
      havokWasmBuffer.byteOffset,
      havokWasmBuffer.byteOffset + havokWasmBuffer.byteLength,
    );

    // Start Havok.
    const havokInstance = await HavokPhysics({
      wasmBinary: havokWasm,
    });

    // ==================================================
    // BABYLON + HAVOK
    // ==================================================

    // Babylon bridge to Havok.
    this.havokPlugin = new HavokPlugin(true, havokInstance);

    // Enable physics with Earth-like gravity.
    this.scene.enablePhysics(
      new Vector3(GRAVITY.x, GRAVITY.y, GRAVITY.z),
      this.havokPlugin,
    );

    // ==================================================
    // LEVEL STATIC COLLISION HULLS
    // ==================================================

    this.levelCollisionLoader = new LevelCollisionLoader(
      this.level,
      this.scene,
    );

    // ==================================================
    // MANUAL PHYSICS CONTROL
    // ==================================================

    // Babylon will not automatically advance physics.
    this.scene.physicsEnabled = false;

    // Create our fixed-step accumulator with pre-step and post-step callbacks.
    const updatePhysics = createPhysicsAccumulator(
      this.scene,
      PHYSICS_DT_MS,
      () => {
        this.applyEntityInputs();
      },
      () => {
        this.serverTick++;
        onAfterPhysicsStep?.();
      },
    );

    this.scheduler = setInterval(() => {
      updatePhysics();
    }, SCHEDULER_INTERVAL_MS);

    // ==================================================
    // CURRENT STATE
    // ==================================================

  // ==================================================
  // COMBAT & SPATIAL QUERIES (PHASE 9)
  // ==================================================

  /**
   * Performs forward cone spatial hit check against other humanoid fighters.
   * Returns the closest valid target within range and horizontal cone angle.
   */
  public checkMeleeHit(
    attackerSessionId: string,
    range: number,
    coneAngleRad: number,
  ): { targetSessionId: string; distance: number } | null {
    const attacker = this.entities.get(attackerSessionId);
    if (!attacker) return null;

    const atkPos = attacker.node.position;
    let atkYaw = 0;
    if (
      "lookYaw" in attacker.currentInput &&
      typeof attacker.currentInput.lookYaw === "number"
    ) {
      atkYaw = attacker.currentInput.lookYaw;
    } else if (attacker.node.rotationQuaternion) {
      atkYaw = attacker.node.rotationQuaternion.toEulerAngles().y;
    }

    const cosCone = Math.cos(coneAngleRad);
    let bestTarget: { targetSessionId: string; distance: number } | null = null;
    let minDistance = Infinity;

    for (const [targetId, target] of this.entities.entries()) {
      if (targetId === attackerSessionId) continue;

      const tgtPos = target.node.position;
      const dx = tgtPos.x - atkPos.x;
      const dy = tgtPos.y - atkPos.y;
      const dz = tgtPos.z - atkPos.z;

      // Vertical tolerance check (within capsule height)
      if (Math.abs(dy) > CHARACTER_CAPSULE.totalHeight * 1.5) {
        continue;
      }

      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      if (horizontalDist > range) {
        continue;
      }

      // If practically touching, consider it a direct hit
      if (horizontalDist < 0.25) {
        if (horizontalDist < minDistance) {
          minDistance = horizontalDist;
          bestTarget = { targetSessionId: targetId, distance: horizontalDist };
        }
        continue;
      }

      // Check forward cone angle
      // Forward direction for yaw: (sin(yaw), cos(yaw))
      const dirX = dx / horizontalDist;
      const dirZ = dz / horizontalDist;
      const forwardX = Math.sin(atkYaw);
      const forwardZ = Math.cos(atkYaw);
      const dot = forwardX * dirX + forwardZ * dirZ;

      if (dot >= cosCone) {
        if (horizontalDist < minDistance) {
          minDistance = horizontalDist;
          bestTarget = { targetSessionId: targetId, distance: horizontalDist };
        }
      }
    }

    return bestTarget;
  }

  /**
   * Applies horizontal knockback impulse from attacker towards target body.
   */
  public applyKnockbackImpulse(
    attackerSessionId: string,
    targetSessionId: string,
    impulseMagnitude: number,
  ): void {
    const attacker = this.entities.get(attackerSessionId);
    const target = this.entities.get(targetSessionId);
    if (!target) return;

    let dirX = 0;
    let dirZ = 1;

    if (attacker) {
      const dx = target.node.position.x - attacker.node.position.x;
      const dz = target.node.position.z - attacker.node.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.05) {
        dirX = dx / dist;
        dirZ = dz / dist;
      } else {
        // Fallback to attacker's forward look yaw
        let yaw = 0;
        if ("lookYaw" in attacker.currentInput && typeof attacker.currentInput.lookYaw === "number") {
          yaw = attacker.currentInput.lookYaw;
        }
        dirX = Math.sin(yaw);
        dirZ = Math.cos(yaw);
      }
    }

    // Apply linear impulse with a slight upward lift (0.5 m/s) to break static friction
    const impulseVec = new Vector3(
      dirX * impulseMagnitude * PLAYER_MASS,
      0.5 * PLAYER_MASS,
      dirZ * impulseMagnitude * PLAYER_MASS,
    );
    target.body.applyImpulse(impulseVec, target.node.position);
  }

  /**
   * Identifies any entities whose vertical position fell below the arena boundaries.
   * Returns list of session IDs that experienced a void fall.
   */
  public checkVoidFalls(): string[] {
    const fallenPlayerIds: string[] = [];
    const voidY = this.level.boundaries.min.y;

    for (const [playerId, entity] of this.entities.entries()) {
      if (entity.node.position.y < voidY) {
        fallenPlayerIds.push(playerId);
      }
    }

    return fallenPlayerIds;
  }

  /**
   * Authoritatively relocates an entity to designated spawn position,
   * zeroes linear and angular velocities, and resets pending inputs.
   */
  public respawnEntity(playerId: string, spawnPoint?: SpawnPoint): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;

    const spawnPos = spawnPoint?.position ?? PLAYER_SPAWN_POSITION;
    const spawnYaw = spawnPoint?.rotationYaw ?? 0;

    entity.node.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    entity.node.rotationQuaternion = Quaternion.FromEulerAngles(0, spawnYaw, 0);

    // Reset physics linear and angular velocity in Havok
    entity.body.setLinearVelocity(Vector3.Zero());
    entity.body.setAngularVelocity(Vector3.Zero());

    // Clear jump state and reset current input
    entity.jumpConsumed = false;
    entity.pendingInputCommands = [];
    entity.inputBufferPrimed = false;

    // Set 2-second invulnerability
    entity.invulnerableUntil = performance.now() + COMBAT_CONFIG.RESPAWN_INVULNERABILITY_SECONDS * 1000;
  }

  public isEntityInvulnerable(playerId: string): boolean {
    const entity = this.entities.get(playerId);
    if (!entity || !entity.invulnerableUntil) return false;
    return performance.now() < entity.invulnerableUntil;
  }

  public setEntityInvulnerable(playerId: string, durationMs: number): void {
    const entity = this.entities.get(playerId);
    if (entity) {
      entity.invulnerableUntil = performance.now() + durationMs;
    }
  }

  public setEntityDamageAttribution(playerId: string, attackerSessionId: string): void {
    const entity = this.entities.get(playerId);
    if (entity) {
      entity.lastAttackerSessionId = attackerSessionId;
      entity.lastDamageTimestamp = performance.now();
    }
  }

  public getEntityLastAttacker(playerId: string): { attackerSessionId?: string; timestamp?: number } {
    const entity = this.entities.get(playerId);
    return {
      attackerSessionId: entity?.lastAttackerSessionId,
      timestamp: entity?.lastDamageTimestamp,
    };
  }

  public setAttackCooldown(playerId: string, cooldownDurationSec: number): void {
    const entity = this.entities.get(playerId);
    if (entity) {
      entity.attackCooldownUntil = performance.now() + cooldownDurationSec * 1000;
    }
  }

  public isAttackOnCooldown(playerId: string): boolean {
    const entity = this.entities.get(playerId);
    if (!entity || !entity.attackCooldownUntil) return false;
    return performance.now() < entity.attackCooldownUntil;
  }

  public setGameplayActive(active: boolean): void {
    this.isGameplayActive = active;
  }

  public dispose(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }

    // Clean up all entity bodies and transform nodes
    const playerIds = Array.from(this.entities.keys());
    for (const id of playerIds) {
      this.removeEntity(id);
    }
    this.entities.clear();

    this.levelCollisionLoader?.dispose();
    this.levelCollisionLoader = null;
    this.havokPlugin?.dispose();
    this.havokPlugin = null as any;
    this.scene?.dispose();
    this.engine?.dispose();
  }
}
