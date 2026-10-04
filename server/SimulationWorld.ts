import {
  NullEngine,
  Scene,
  TransformNode,
  Vector3,
  Quaternion,
  HavokPlugin,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeCapsule,
} from "@babylonjs/core";

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import HavokPhysics from "@babylonjs/havok";

import {
  PHYSICS_DT_MS,
  CHARACTER_CAPSULE,
  PLAYER_SPAWN_POSITION,
  PLAYER_MASS,
  LINEAR_DAMPING,
  ANGULAR_DAMPING,
  FLOOR_SIZE,
  FLOOR_POSITION,
  GRAVITY,
  MAX_SERVER_INPUT_QUEUE,
  SERVER_INPUT_BUFFER_TARGET,
  type PlayerInput,
  type PlayerInputCommand,
} from "../shared/player/PlayerConfig";

import {
  calculateThrottleForce,
  calculateSteeringTorque,
  calculateBrakeForce,
} from "../shared/player/PlayerPhysicsMath";

// ==================================================
// ENTITIES CONFIGURATION
// ==================================================
interface SimulationEntity {
  playerId: string;
  node: TransformNode;
  body: PhysicsBody;
  currentInput: PlayerInput;
  pendingInputCommands: PlayerInputCommand[];
  inputBufferPrimed: boolean;
  lastProcessedInputSequence: number;
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
  private engine: NullEngine;
  private scene: Scene;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private entities = new Map<string, SimulationEntity>();
  private serverTick = 0;

  // ==================================================
  // CONSTRUCTOR
  //
  // Synchronous Babylon setup.
  // ==================================================

  constructor() {
    // Headless Babylon engine.
    this.engine = new NullEngine();

    // Server simulation scene.
    this.scene = new Scene(this.engine);
  }

  getServerTick(): number {
    return this.serverTick;
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

  spawnEntity(playerId: string) {
    if (this.entities.has(playerId)) {
      return;
    }

    // ==================================================
    // HUMANOID CHARACTER CAPSULE
    // ==================================================

    const playerNode = new TransformNode(`player-${playerId}`, this.scene);

    playerNode.position.set(
      PLAYER_SPAWN_POSITION.x,
      PLAYER_SPAWN_POSITION.y,
      PLAYER_SPAWN_POSITION.z,
    );

    playerNode.rotationQuaternion = Quaternion.Identity();

    // HOW does physics treat it?
    const playerBody = new PhysicsBody(
      playerNode,
      PhysicsMotionType.DYNAMIC,
      false,
      this.scene,
    );

    // Upright humanoid capsule geometry (radius: 0.4m, total height: 1.8m)
    // Cylinder height = totalHeight - (2 * radius) = 1.0m
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
      // Locking inertia prevents physical collisions from tumbling the fighter
      inertia: new Vector3(0, 0, 0),
    });

    // Locomotion tuning damping
    playerBody.setLinearDamping(LINEAR_DAMPING);
    playerBody.setAngularDamping(ANGULAR_DAMPING);

    const newPlayer: SimulationEntity = {
      playerId: playerId,
      node: playerNode,
      body: playerBody,
      currentInput: {
        throttle: 0,
        steering: 0,
        brake: 0,
      },
      pendingInputCommands: [],
      inputBufferPrimed: false,
      lastProcessedInputSequence: 0,
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

  enqueueEntityInput(playerId: string, command: PlayerInputCommand) {
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

  private applyEntityInputs() {
    for (const entity of this.entities.values()) {
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
        entity.currentInput = {
          throttle: nextCommand.throttle,
          steering: nextCommand.steering,
          brake: nextCommand.brake,
        };
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

      const currentInput = entity.currentInput;
      const currentRotation =
        entity.node.rotationQuaternion ?? Quaternion.Identity();

      // 1. THROTTLE: Apply forward force along entity heading
      if (currentInput.throttle > 0) {
        const throttleForce = calculateThrottleForce(
          currentRotation,
          currentInput.throttle,
        );
        entity.body.applyForce(throttleForce, entity.node.position);
      }

      // 2. STEERING: Apply torque around vertical Y axis
      if (currentInput.steering !== 0) {
        const steeringTorque = calculateSteeringTorque(currentInput.steering);
        entity.body.applyTorque(steeringTorque);
      }

      // 3. BRAKE: Apply opposing force to horizontal velocity
      if (currentInput.brake > 0) {
        const linearVelocity = entity.body.getLinearVelocity();
        const brakeForce = calculateBrakeForce(
          linearVelocity,
          currentInput.brake,
        );
        entity.body.applyForce(brakeForce, entity.node.position);
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
    const havokPlugin = new HavokPlugin(true, havokInstance);

    // Enable physics with Earth-like gravity.
    this.scene.enablePhysics(
      new Vector3(GRAVITY.x, GRAVITY.y, GRAVITY.z),
      havokPlugin,
    );

    // ==================================================
    // FLOOR
    // ==================================================

    // WHERE is it?
    const floorNode = new TransformNode("floor", this.scene);

    floorNode.position.set(
      FLOOR_POSITION.x,
      FLOOR_POSITION.y,
      FLOOR_POSITION.z,
    );

    floorNode.rotationQuaternion = Quaternion.Identity();

    // HOW does physics treat it?
    const floorBody = new PhysicsBody(
      floorNode,
      PhysicsMotionType.STATIC,
      true,
      this.scene,
    );

    // WHAT collision shape does it have?
    const floorShape = new PhysicsShapeBox(
      Vector3.Zero(),
      Quaternion.Identity(),
      new Vector3(FLOOR_SIZE.width, FLOOR_SIZE.height, FLOOR_SIZE.depth),
      this.scene,
    );

    // Connect shape to body.
    floorBody.shape = floorShape;

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

    console.log("world initialized");
  }

  public dispose(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
    this.scene?.dispose();
    this.engine?.dispose();
  }
}
