import {
  Scene,
  TransformNode,
  PhysicsBody,
  PhysicsShapeBox,
  PhysicsShapeCapsule,
  PhysicsRaycastResult,
  PhysicsMotionType,
  PhysicsPrestepType,
  Vector3,
  Quaternion,
  HavokPlugin,
  Mesh,
} from "@babylonjs/core";

import {
  PHYSICS_DT_MS,
  CHARACTER_CAPSULE,
  CHARACTER_FORCES,
  PLAYER_MASS,
  LINEAR_DAMPING,
  ANGULAR_DAMPING,
  FLOOR_SIZE,
  FLOOR_POSITION,
  MAX_PREDICTION_STEPS_PER_UPDATE,
  PREDICTION_HISTORY_MAX_FRAMES,
  VISUAL_CORRECTION_TIME_CONSTANT_MS,
  LOCAL_HARD_SNAP_DISTANCE,
  type PlayerInput,
  type PlayerInputCommand,
  type CharacterActionInput,
  type CharacterInputCommand,
} from "../../shared/player/PlayerConfig";

import {
  calculateThrottleForce,
  calculateSteeringTorque,
  calculateBrakeForce,
  calculateHumanoidMovementForce,
  calculateJumpImpulse,
} from "../../shared/player/PlayerPhysicsMath";

import {
  type PredictedHistoryFrame,
} from "../../shared/networking/PredictionMath";

import {
  isPredictionWithinTolerance,
  calculateVisualPositionOffset,
  calculateVisualRotationOffset,
  calculateCorrectionDecayFactor,
  decayPositionError,
  decayRotationError,
} from "../../shared/networking/ReconciliationMath";

export interface AuthoritativePlayerState {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  rw: number;
  vx: number;
  vy: number;
  vz: number;
  avx: number;
  avy: number;
  avz: number;
  lastProcessedInputSequence: number;
}

// ==================================================
// LOCAL PLAYER PREDICTION & RECONCILIATION
//
// Coordinates 30 Hz fixed Havok prediction, prediction history,
// epsilon-based reconciliation decisions, rollback/replay, and
// visual error-offset decay (1:1 during normal play).
// All mathematical formulas are delegated to shared math modules.
// ==================================================

export class LocalPlayerPrediction {
  private scene: Scene;
  private havokPlugin: HavokPlugin;
  private onSendInput: (
    command: CharacterInputCommand | PlayerInputCommand,
  ) => void;

  // Local prediction physics representation (hidden from camera)
  private predictionNode: TransformNode;
  private predictionBody: PhysicsBody;

  // Static prediction floor collider
  private floorNode: TransformNode;
  private floorBody: PhysicsBody;

  // Dual timeline tracking:
  // sequence: order of user input commands
  // currentPredictionTick: physical fixed 30 Hz steps synchronized from server baseline
  private nextInputSequence = 1;
  private currentPredictionTick = 0;
  private pendingInputs: (CharacterInputCommand | PlayerInputCommand)[] = [];
  private predictionHistory: PredictedHistoryFrame[] = [];

  // Fixed timestep accumulator
  private accumulator = 0;

  // State guards
  private hasReceivedInitialAuthoritativeState = false;
  private lastReconciledServerTick = -1;

  // 3-point ground probe state
  private isGrounded = false;
  private leftLegGrounded = false;
  private rightLegGrounded = false;
  private jumpConsumed = false;
  private raycastResultCenter = new PhysicsRaycastResult();
  private raycastResultLeft = new PhysicsRaycastResult();
  private raycastResultRight = new PhysicsRaycastResult();
  private rayFrom = new Vector3();
  private rayTo = new Vector3();

  // Visual error offset smoothing:
  // Normal movement is 1:1 with physics (zero constant lag).
  // Only actual reconciliation discrepancies are offset and decayed over time.
  private visualPositionError = new Vector3(0, 0, 0);
  private visualRotationError = Quaternion.Identity();

  constructor(
    scene: Scene,
    havokPlugin: HavokPlugin,
    onSendInput: (command: CharacterInputCommand | PlayerInputCommand) => void,
  ) {
    this.scene = scene;
    this.havokPlugin = havokPlugin;
    this.onSendInput = onSendInput;

    // --------------------------------------------------
    // Static floor collider for local prediction world
    // --------------------------------------------------
    this.floorNode = new TransformNode("prediction-floor", scene);
    this.floorNode.position.set(
      FLOOR_POSITION.x,
      FLOOR_POSITION.y,
      FLOOR_POSITION.z,
    );
    this.floorNode.rotationQuaternion = Quaternion.Identity();

    this.floorBody = new PhysicsBody(
      this.floorNode,
      PhysicsMotionType.STATIC,
      true,
      scene,
    );

    const floorShape = new PhysicsShapeBox(
      Vector3.Zero(),
      Quaternion.Identity(),
      new Vector3(FLOOR_SIZE.width, FLOOR_SIZE.height, FLOOR_SIZE.depth),
      scene,
    );
    this.floorBody.shape = floorShape;

    // --------------------------------------------------
    // Local dynamic humanoid capsule prediction body
    // --------------------------------------------------
    this.predictionNode = new TransformNode("local-prediction-node", scene);
    this.predictionNode.rotationQuaternion = Quaternion.Identity();

    this.predictionBody = new PhysicsBody(
      this.predictionNode,
      PhysicsMotionType.DYNAMIC,
      false,
      scene,
    );

    const cylinderHeight =
      CHARACTER_CAPSULE.totalHeight - 2 * CHARACTER_CAPSULE.radius;

    const capsuleShape = new PhysicsShapeCapsule(
      new Vector3(0, -cylinderHeight / 2, 0),
      new Vector3(0, cylinderHeight / 2, 0),
      CHARACTER_CAPSULE.radius,
      scene,
    );
    this.predictionBody.shape = capsuleShape;

    this.predictionBody.setMassProperties({
      mass: PLAYER_MASS,
      inertia: new Vector3(0, 1, 0),
    });
    this.predictionBody.setLinearDamping(LINEAR_DAMPING);
    this.predictionBody.setAngularDamping(ANGULAR_DAMPING);
  }

  /**
   * Performs 3-point downward ray probe (Center, Left Leg, Right Leg) to detect walkable ground contact.
   */
  public checkGrounded(): boolean {
    const footLateralOffset = 0.2;
    const capsuleHalfHeight = CHARACTER_CAPSULE.totalHeight / 2;
    const totalProbeLength =
      capsuleHalfHeight + CHARACTER_FORCES.GROUND_CHECK_DISTANCE;
    const minWalkableNormalY = Math.cos(CHARACTER_FORCES.MAX_SLOPE_RADIANS);

    const posX = this.predictionNode.position.x;
    const posY = this.predictionNode.position.y;
    const posZ = this.predictionNode.position.z;

    const currentYaw = this.predictionNode.rotationQuaternion
      ? this.predictionNode.rotationQuaternion.toEulerAngles().y
      : 0;

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
        ignoreBody: this.predictionBody,
      },
    );
    const centerGrounded =
      this.raycastResultCenter.hasHit &&
      this.raycastResultCenter.hitNormalWorld.y >= minWalkableNormalY;

    // 2. Left Leg Probe
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
      ignoreBody: this.predictionBody,
    });
    this.leftLegGrounded =
      this.raycastResultLeft.hasHit &&
      this.raycastResultLeft.hitNormalWorld.y >= minWalkableNormalY;

    // 3. Right Leg Probe
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
        ignoreBody: this.predictionBody,
      },
    );
    this.rightLegGrounded =
      this.raycastResultRight.hasHit &&
      this.raycastResultRight.hitNormalWorld.y >= minWalkableNormalY;

    this.isGrounded =
      centerGrounded || this.leftLegGrounded || this.rightLegGrounded;
    return this.isGrounded;
  }

  // ==================================================
  // IMMEDIATE NEUTRAL COMMAND
  //
  // Sent on window blur to stop stuck inputs over the network.
  // Does NOT push to pendingInputs to avoid unsimulated sequence gaps.
  // ==================================================

  sendNeutralInput() {
    if (!this.hasReceivedInitialAuthoritativeState) {
      return;
    }

    const command: CharacterInputCommand = {
      sequence: this.nextInputSequence++,
      moveX: 0,
      moveZ: 0,
      lookYaw: this.predictionNode.rotationQuaternion
        ? this.predictionNode.rotationQuaternion.toEulerAngles().y
        : 0,
      jump: false,
      sprint: false,
      attackAction: "NONE",
    };

    this.onSendInput(command);
  }

  // ==================================================
  // UNIFIED PREDICTION STEP FUNCTION
  //
  // Used for both normal forward prediction AND reconciliation replay.
  // Applies controls, advances Havok one step, advances prediction tick,
  // and records a PredictedHistoryFrame along the current timeline branch.
  // ==================================================

  private simulatePredictionStep(
    command: CharacterInputCommand | PlayerInputCommand,
    dtMs: number,
    recordHistory: boolean = false,
  ): void {
    this.checkGrounded();

    if ("moveX" in command && typeof command.moveX === "number") {
      const charCmd = command as CharacterInputCommand;
      const currentLinearVelocity = this.predictionBody.getLinearVelocity();

      // 1. 8-Way Locomotion Force
      const movementForce = calculateHumanoidMovementForce(
        charCmd.moveX,
        charCmd.moveZ,
        charCmd.lookYaw,
        charCmd.sprint,
        currentLinearVelocity,
        this.isGrounded,
      );
      this.predictionBody.applyForce(
        movementForce,
        this.predictionNode.position,
      );

      // 2. Yaw Orientation via angular velocity
      const currentYaw = this.predictionNode.rotationQuaternion
        ? this.predictionNode.rotationQuaternion.toEulerAngles().y
        : 0;
      let diffYaw = charCmd.lookYaw - currentYaw;
      while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
      while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
      const targetAngularVelY = diffYaw * 30;
      this.predictionBody.setAngularVelocity(new Vector3(0, targetAngularVelY, 0));

      // 3. Jump Impulse
      if (charCmd.jump) {
        if (!this.jumpConsumed && this.isGrounded) {
          const jumpImpulse = calculateJumpImpulse(true, true);
          this.predictionBody.applyImpulse(
            jumpImpulse,
            this.predictionNode.position,
          );
          this.jumpConsumed = true;
        }
      } else {
        this.jumpConsumed = false;
      }
    } else {
      const vehicleCmd = command as PlayerInputCommand;
      const currentRotation =
        this.predictionNode.rotationQuaternion ?? Quaternion.Identity();

      if (vehicleCmd.throttle > 0) {
        const throttleForce = calculateThrottleForce(
          currentRotation,
          vehicleCmd.throttle,
        );
        this.predictionBody.applyForce(
          throttleForce,
          this.predictionNode.position,
        );
      }

      if (vehicleCmd.steering !== 0) {
        const steeringTorque = calculateSteeringTorque(vehicleCmd.steering);
        this.predictionBody.applyTorque(steeringTorque);
      }

      if (vehicleCmd.brake > 0) {
        const linearVelocity = this.predictionBody.getLinearVelocity();
        const brakeForce = calculateBrakeForce(linearVelocity, vehicleCmd.brake);
        this.predictionBody.applyForce(brakeForce, this.predictionNode.position);
      }
    }

    // Advance local client Havok by exactly one fixed physics step
    this.scene._advancePhysicsEngineStep(dtMs);

    // Advance local simulation tick
    this.currentPredictionTick++;

    // Record predicted state in history along this simulation branch
    if (recordHistory) {
      const linVel = this.predictionBody.getLinearVelocity();
      const angVel = this.predictionBody.getAngularVelocity();
      const rot = (
        this.predictionNode.rotationQuaternion ?? Quaternion.Identity()
      ).clone();

      this.predictionHistory.push({
        sequence: command.sequence,
        expectedServerTick: this.currentPredictionTick,
        position: this.predictionNode.position.clone(),
        rotation: rot,
        linearVelocity: linVel,
        angularVelocity: angVel,
      });

      if (this.predictionHistory.length > PREDICTION_HISTORY_MAX_FRAMES) {
        this.predictionHistory.shift();
      }
    }
  }

  // ==================================================
  // LOCAL PREDICTION LOOP (30 Hz)
  // ==================================================

  updatePrediction(
    heldInput: CharacterActionInput | PlayerInput,
    deltaSeconds: number,
  ) {
    if (!this.hasReceivedInitialAuthoritativeState) {
      return;
    }

    this.accumulator += deltaSeconds * 1000;

    // Protection against suspended tabs or severe frame stalls
    const maxAccumulatedMs = PHYSICS_DT_MS * MAX_PREDICTION_STEPS_PER_UPDATE;
    if (this.accumulator > maxAccumulatedMs) {
      this.accumulator = maxAccumulatedMs;
    }

    while (this.accumulator >= PHYSICS_DT_MS) {
      let command: CharacterInputCommand | PlayerInputCommand;

      if ("moveX" in heldInput && typeof heldInput.moveX === "number") {
        command = {
          sequence: this.nextInputSequence++,
          moveX: heldInput.moveX,
          moveZ: heldInput.moveZ,
          lookYaw: heldInput.lookYaw,
          jump: heldInput.jump,
          sprint: heldInput.sprint,
          attackAction: heldInput.attackAction,
        };
      } else {
        const veh = heldInput as PlayerInput;
        command = {
          sequence: this.nextInputSequence++,
          throttle: veh.throttle,
          steering: veh.steering,
          brake: veh.brake,
        };
      }

      this.pendingInputs.push(command);
      this.onSendInput(command);

      // Normal prediction: simulate step and record history
      this.simulatePredictionStep(command, PHYSICS_DT_MS, true);

      this.accumulator -= PHYSICS_DT_MS;
    }
  }

  // ==================================================
  // HAVOK BODY TELEPORT HELPER
  // ==================================================

  private teleportPhysicsBody(): void {
    this.predictionBody.setPrestepType(PhysicsPrestepType.TELEPORT);
    this.havokPlugin.setPhysicsBodyTransformation(
      this.predictionBody,
      this.predictionNode,
    );
    this.predictionBody.setPrestepType(PhysicsPrestepType.DISABLED);
  }

  // ==================================================
  // AUTHORITATIVE STATE & RECONCILIATION
  // ==================================================

  handleAuthoritativeState(
    playerState: AuthoritativePlayerState,
    serverTick: number,
    localVisualMesh: Mesh,
  ) {
    // --------------------------------------------------
    // First packet: initialize baseline timeline & visual mesh
    // --------------------------------------------------
    if (!this.hasReceivedInitialAuthoritativeState) {
      this.predictionNode.position.set(
        playerState.x,
        playerState.y,
        playerState.z,
      );
      this.predictionNode.rotationQuaternion = new Quaternion(
        playerState.rx,
        playerState.ry,
        playerState.rz,
        playerState.rw,
      );

      this.teleportPhysicsBody();
      this.predictionBody.setLinearVelocity(
        new Vector3(playerState.vx, playerState.vy, playerState.vz),
      );
      this.predictionBody.setAngularVelocity(
        new Vector3(playerState.avx, playerState.avy, playerState.avz),
      );

      localVisualMesh.position.set(
        playerState.x,
        playerState.y,
        playerState.z,
      );
      localVisualMesh.rotationQuaternion ??= Quaternion.Identity();
      localVisualMesh.rotationQuaternion.set(
        playerState.rx,
        playerState.ry,
        playerState.rz,
        playerState.rw,
      );

      this.currentPredictionTick = serverTick;
      this.hasReceivedInitialAuthoritativeState = true;
      this.lastReconciledServerTick = serverTick;
      return;
    }

    // --------------------------------------------------
    // Guard: do not reconcile the same server tick multiple times
    // --------------------------------------------------
    if (serverTick <= this.lastReconciledServerTick) {
      return;
    }
    this.lastReconciledServerTick = serverTick;

    const authoritativeState = {
      position: new Vector3(playerState.x, playerState.y, playerState.z),
      rotation: new Quaternion(
        playerState.rx,
        playerState.ry,
        playerState.rz,
        playerState.rw,
      ),
      linearVelocity: new Vector3(
        playerState.vx,
        playerState.vy,
        playerState.vz,
      ),
      angularVelocity: new Vector3(
        playerState.avx,
        playerState.avy,
        playerState.avz,
      ),
    };

    // --------------------------------------------------
    // EPSILON COMPARISON (TEMPORAL IDENTITY)
    //
    // Locate the historical predicted state corresponding to the exact
    // physical moment represented by this authoritative packet (expectedServerTick === serverTick).
    // --------------------------------------------------
    const predictedFrame = this.predictionHistory.find(
      (frame) => frame.expectedServerTick === serverTick,
    );

    let withinTolerance = false;
    if (predictedFrame) {
      const checkResult = isPredictionWithinTolerance(
        predictedFrame,
        authoritativeState,
      );
      withinTolerance = checkResult.withinTolerance;
    }

    // --------------------------------------------------
    // CASE A: WITHIN TOLERANCE (NORMAL PREDICTION)
    //
    // Historical state matches authoritative snapshot.
    // Drop acknowledged commands and old history.
    // Skip Havok rewind and replay completely!
    // --------------------------------------------------
    if (withinTolerance) {
      this.pendingInputs = this.pendingInputs.filter(
        (cmd) => cmd.sequence > playerState.lastProcessedInputSequence,
      );
      this.predictionHistory = this.predictionHistory.filter(
        (frame) => frame.expectedServerTick > serverTick,
      );
      return;
    }

    // --------------------------------------------------
    // CASE B: EXCEEDS TOLERANCE (TRUE MISPREDICTION)
    //
    // Rollback Havok to authoritative baseline, flush old history,
    // replay unacknowledged inputs in order, rebuild corrected history,
    // and compute visual error offset so visible mesh does not snap.
    // --------------------------------------------------

    // 1. Capture current visible transform before correction
    const oldVisualPos = localVisualMesh.position.clone();
    const oldVisualRot = (
      localVisualMesh.rotationQuaternion ?? Quaternion.Identity()
    ).clone();

    // 2. Reset prediction body to authoritative past state
    this.predictionNode.position.copyFrom(authoritativeState.position);
    this.predictionNode.rotationQuaternion = authoritativeState.rotation.clone();

    this.teleportPhysicsBody();
    this.predictionBody.setLinearVelocity(authoritativeState.linearVelocity);
    this.predictionBody.setAngularVelocity(authoritativeState.angularVelocity);

    // 3. Reset timeline baseline and flush obsolete history
    this.currentPredictionTick = serverTick;
    this.predictionHistory = [];

    // 4. Discard acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(
      (cmd) => cmd.sequence > playerState.lastProcessedInputSequence,
    );

    // 5. Replay unacknowledged inputs in order, actively rebuilding corrected history
    for (const cmd of this.pendingInputs) {
      this.simulatePredictionStep(cmd, PHYSICS_DT_MS, true);
    }

    // 6. Compute visual error offsets: oldVisual - newCorrectedPredicted
    calculateVisualPositionOffset(
      oldVisualPos,
      this.predictionNode.position,
      this.visualPositionError,
    );
    calculateVisualRotationOffset(
      oldVisualRot,
      this.predictionNode.rotationQuaternion ?? Quaternion.Identity(),
      this.visualRotationError,
    );

    // Hard snap guard against extreme teleport anomalies
    if (this.visualPositionError.length() > LOCAL_HARD_SNAP_DISTANCE) {
      this.visualPositionError.set(0, 0, 0);
      this.visualRotationError.copyFrom(Quaternion.Identity());
    }
  }

  // ==================================================
  // LOCAL VISUAL ERROR-OFFSET SMOOTHING
  //
  // Normal movement is 1:1 with physics (visual error = 0).
  // When reconciliation occurs, visual error offset absorbs the jump
  // and decays exponentially toward 0 over VISUAL_CORRECTION_TIME_CONSTANT_MS.
  // ==================================================

  updateVisualSmoothing(localVisualMesh: Mesh, deltaSeconds: number) {
    if (!this.hasReceivedInitialAuthoritativeState) {
      return;
    }

    const decayFactor = calculateCorrectionDecayFactor(
      deltaSeconds,
      VISUAL_CORRECTION_TIME_CONSTANT_MS,
    );

    decayPositionError(
      this.visualPositionError,
      decayFactor,
      this.visualPositionError,
    );
    
    decayRotationError(
      this.visualRotationError,
      decayFactor,
      this.visualRotationError,
    );

    // Visual position = predicted position + decaying error offset
    this.predictionNode.position.addToRef(
      this.visualPositionError,
      localVisualMesh.position,
    );

    // Visual rotation = decaying rotation offset * predicted rotation
    localVisualMesh.rotationQuaternion ??= Quaternion.Identity();
    this.visualRotationError.multiplyToRef(
      this.predictionNode.rotationQuaternion ?? Quaternion.Identity(),
      localVisualMesh.rotationQuaternion,
    );
  }

  // ==================================================
  // CLEANUP
  // ==================================================

  dispose() {
    this.predictionBody.shape?.dispose();
    this.predictionBody.dispose();
    this.predictionNode.dispose();

    this.floorBody.shape?.dispose();
    this.floorBody.dispose();
    this.floorNode.dispose();

    this.pendingInputs = [];
    this.predictionHistory = [];
  }
}
