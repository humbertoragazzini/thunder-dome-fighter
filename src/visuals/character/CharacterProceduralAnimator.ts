// ==================================================
// PROCEDURAL BIPED CHARACTER ANIMATOR
//
// WHAT IT DOES:
// Generates smooth, expressive trigonometric rotation angles and translation offsets
// for all 15 joints in the articulated character hierarchy based on speed,
// locomotion state (Idle, Walk, Sprint), vertical airborne phase (Jump, Fall, Land),
// and combat attacks (Punch, Kick).
//
// HOW IT WORKS:
// - Evaluates sinusoidal biped locomotion cycles with counter-balancing limb phases
//   (e.g., left arm swings forward while left leg swings back).
// - Incorporates realistic knee flexion on back-swings and foot tilt compensation.
// - Supports one-shot combat attacks (light punch, heavy cross, front kick) that blend
//   seamlessly over active movement.
// - Applies frame-rate-independent exponential smoothing to eliminate visual pops.
//
// WHY IT EXISTS:
// Delivers lively, humorous, high-personality cartoon animations without requiring
// external baked keyframe animation clips from Blender, while preparing clean bone
// targets for future skeletal models.
// ==================================================

import { Vector3 } from "@babylonjs/core";
import type { AttackActionType } from "../../../shared/player/PlayerConfig";
import { CHARACTER_PROPORTIONS } from "./CharacterRigConfig";
import type { CharacterAnimationState } from "./types";

const DEG_TO_RAD = Math.PI / 180;

export interface RigJointPose {
  torsoPositionOffset: Vector3;
  torsoRotation: Vector3;
  headRotation: Vector3;
  shoulderL_Rot: Vector3;
  elbowL_Rot: Vector3;
  wristL_Rot: Vector3;
  shoulderR_Rot: Vector3;
  elbowR_Rot: Vector3;
  wristR_Rot: Vector3;
  hipL_Rot: Vector3;
  kneeL_Rot: Vector3;
  ankleL_Rot: Vector3;
  hipR_Rot: Vector3;
  kneeR_Rot: Vector3;
  ankleR_Rot: Vector3;
}

export class CharacterProceduralAnimator {
  private currentState: CharacterAnimationState = "IDLE";
  private locomotionPhase = 0;
  private idlePhase = 0;

  // Active attack state tracking
  private activeAttack: AttackActionType = "NONE";
  private attackElapsedSec = 0;
  private attackDurationSec = 0.25;

  // Jump / airborne transition tracking
  private wasGrounded = true;
  private landingTimerSec = 0;

  // Current interpolated output pose (smoothed towards targets)
  readonly pose: RigJointPose = {
    torsoPositionOffset: Vector3.Zero(),
    torsoRotation: Vector3.Zero(),
    headRotation: Vector3.Zero(),
    shoulderL_Rot: Vector3.Zero(),
    elbowL_Rot: Vector3.Zero(),
    wristL_Rot: Vector3.Zero(),
    shoulderR_Rot: Vector3.Zero(),
    elbowR_Rot: Vector3.Zero(),
    wristR_Rot: Vector3.Zero(),
    hipL_Rot: Vector3.Zero(),
    kneeL_Rot: Vector3.Zero(),
    ankleL_Rot: Vector3.Zero(),
    hipR_Rot: Vector3.Zero(),
    kneeR_Rot: Vector3.Zero(),
    ankleR_Rot: Vector3.Zero(),
  };

  /**
   * Evaluates procedural animation curves for the current frame
   */
  update(
    deltaSeconds: number,
    linearVelocity: Vector3,
    isGrounded: boolean,
    isSprinting: boolean,
    attackAction: AttackActionType = "NONE",
  ): RigJointPose {
    const config = CHARACTER_PROPORTIONS.animation;

    // 1. Detect landing event
    if (!this.wasGrounded && isGrounded) {
      this.landingTimerSec = 0.18; // Brief landing compression
    }
    this.wasGrounded = isGrounded;

    if (this.landingTimerSec > 0) {
      this.landingTimerSec = Math.max(0, this.landingTimerSec - deltaSeconds);
    }

    // 2. Trigger new attack if requested and none currently active
    if (attackAction !== "NONE" && this.activeAttack === "NONE") {
      this.activeAttack = attackAction;
      this.attackElapsedSec = 0;
      if (attackAction === "LIGHT_PUNCH") {
        this.attackDurationSec = config.lightPunchDurationSec;
      } else if (attackAction === "HEAVY_PUNCH") {
        this.attackDurationSec = config.heavyPunchDurationSec;
      } else if (attackAction === "KICK") {
        this.attackDurationSec = config.kickDurationSec;
      } else {
        this.attackDurationSec = 0.25;
      }
    }

    // Progress active attack
    if (this.activeAttack !== "NONE") {
      this.attackElapsedSec += deltaSeconds;
      if (this.attackElapsedSec >= this.attackDurationSec) {
        this.activeAttack = "NONE";
        this.attackElapsedSec = 0;
      }
    }

    // 3. Compute horizontal planar speed (m/s)
    const horizontalSpeed = Math.sqrt(
      linearVelocity.x * linearVelocity.x + linearVelocity.z * linearVelocity.z,
    );

    // 4. Determine state
    if (!isGrounded) {
      this.currentState = linearVelocity.y > 0.5 ? "JUMP_ASCENT" : "FALL";
    } else if (this.landingTimerSec > 0) {
      this.currentState = "LAND";
    } else if (horizontalSpeed > 5.0 || (isSprinting && horizontalSpeed > 1.0)) {
      this.currentState = "RUN";
    } else if (horizontalSpeed > 0.25) {
      this.currentState = "WALK";
    } else {
      this.currentState = "IDLE";
    }

    // 5. Advance phase timers
    this.idlePhase += config.idleBreathingFrequency * deltaSeconds;

    if (this.currentState === "RUN") {
      this.locomotionPhase += config.runCycleFrequency * deltaSeconds;
    } else if (this.currentState === "WALK") {
      const walkSpeedNormalized = Math.min(1.0, horizontalSpeed / 4.5);
      this.locomotionPhase +=
        config.walkCycleFrequency * deltaSeconds * Math.max(0.4, walkSpeedNormalized);
    }

    // 6. Calculate target joint poses for current state
    const target = this.calculateTargetPose(
      this.currentState,
      horizontalSpeed,
      isSprinting,
    );

    // 7. Layer combat attack animations over the base pose
    if (this.activeAttack !== "NONE") {
      this.applyCombatOverlay(target, this.activeAttack, this.attackElapsedSec / this.attackDurationSec);
    }

    // 8. Smooth outputs towards targets (eliminates pops)
    const blendRate = 22.0; // Responsive exponential convergence
    const alpha = 1.0 - Math.exp(-blendRate * deltaSeconds);

    this.smoothPose(this.pose, target, alpha);

    return this.pose;
  }

  /**
   * Computes target rotations and offsets for a specific locomotion state
   */
  private calculateTargetPose(
    state: CharacterAnimationState,
    _horizontalSpeed: number,
    _isSprinting: boolean,
  ): RigJointPose {
    const config = CHARACTER_PROPORTIONS.animation;
    const pose: RigJointPose = {
      torsoPositionOffset: Vector3.Zero(),
      torsoRotation: Vector3.Zero(),
      headRotation: Vector3.Zero(),
      shoulderL_Rot: Vector3.Zero(),
      elbowL_Rot: Vector3.Zero(),
      wristL_Rot: Vector3.Zero(),
      shoulderR_Rot: Vector3.Zero(),
      elbowR_Rot: Vector3.Zero(),
      wristR_Rot: Vector3.Zero(),
      hipL_Rot: Vector3.Zero(),
      kneeL_Rot: Vector3.Zero(),
      ankleL_Rot: Vector3.Zero(),
      hipR_Rot: Vector3.Zero(),
      kneeR_Rot: Vector3.Zero(),
      ankleR_Rot: Vector3.Zero(),
    };

    if (state === "IDLE") {
      // Gentle rhythmic breathing
      const breath = Math.sin(this.idlePhase);
      pose.torsoPositionOffset.y = breath * 0.008;
      pose.headRotation.x = breath * 0.03;

      // Relaxed arms slightly angled at sides and flared outward to clear torso
      pose.shoulderL_Rot.z = -8 * DEG_TO_RAD;
      pose.shoulderR_Rot.z = 8 * DEG_TO_RAD;
      pose.elbowL_Rot.x = -14 * DEG_TO_RAD; // Forward bend in front of torso
      pose.elbowR_Rot.x = -14 * DEG_TO_RAD;

      // Rested feet
      return pose;
    }

    if (state === "WALK" || state === "RUN") {
      const isRun = state === "RUN";
      const maxSwingDeg = isRun ? config.runLegSwingDeg : config.walkLegSwingDeg;
      const swingRad = maxSwingDeg * DEG_TO_RAD;

      const phase = this.locomotionPhase;
      const sinPhase = Math.sin(phase);
      const cosPhase = Math.cos(phase);

      // Torso bobbing and leaning
      const bobAmount = isRun ? config.torsoBobbingMeters * 1.5 : config.torsoBobbingMeters;
      pose.torsoPositionOffset.y = Math.abs(cosPhase) * bobAmount - (bobAmount * 0.5);

      if (isRun) {
        pose.torsoRotation.x = config.runTorsoLeanDeg * DEG_TO_RAD; // Forward sprint lean
        pose.headRotation.x = -config.runTorsoLeanDeg * 0.7 * DEG_TO_RAD; // Keep eyes on horizon
      }

      // Torso slight pelvic twist counter to leg swing
      pose.torsoRotation.y = sinPhase * config.torsoTwistDeg * DEG_TO_RAD;

      // Leg swings: Hip swings back and forth
      const hipL = sinPhase * swingRad;
      const hipR = -sinPhase * swingRad;
      pose.hipL_Rot.x = hipL;
      pose.hipR_Rot.x = hipR;

      // Knee flexion: Knee bends backwards when leg pushes back/recovers
      const maxKneeRad = config.kneeBendMaxDeg * DEG_TO_RAD;
      pose.kneeL_Rot.x = Math.max(0, sinPhase) * maxKneeRad;
      pose.kneeR_Rot.x = Math.max(0, -sinPhase) * maxKneeRad;

      // Ankle tilt: Compensate foot angle so toes point forward
      pose.ankleL_Rot.x = -hipL * 0.6;
      pose.ankleR_Rot.x = -hipR * 0.6;

      // Counter-balancing arm swings (opposite to legs)
      const armMultiplier = config.armSwingMultiplier;
      const armL = -sinPhase * swingRad * armMultiplier;
      const armR = sinPhase * swingRad * armMultiplier;

      pose.shoulderL_Rot.x = armL;
      pose.shoulderR_Rot.x = armR;

      // Natural forward elbow bends (pumping during run)
      const elbowBase = isRun
        ? -config.elbowBendSprintDeg * DEG_TO_RAD
        : -config.elbowBendRelaxedDeg * DEG_TO_RAD;

      pose.elbowL_Rot.x = elbowBase - (isRun ? Math.max(0, sinPhase) * 25 * DEG_TO_RAD : 0);
      pose.elbowR_Rot.x = elbowBase - (isRun ? Math.max(0, -sinPhase) * 25 * DEG_TO_RAD : 0);

      // Outward shoulder flare to clear torso
      pose.shoulderL_Rot.z = -(isRun ? 14 : 9) * DEG_TO_RAD;
      pose.shoulderR_Rot.z = (isRun ? 14 : 9) * DEG_TO_RAD;

      return pose;
    }

    if (state === "JUMP_ASCENT") {
      // Tuck knees and throw arms forward/upward for momentum
      pose.torsoPositionOffset.y = 0.02;
      pose.hipL_Rot.x = -20 * DEG_TO_RAD;
      pose.hipR_Rot.x = -20 * DEG_TO_RAD;
      pose.kneeL_Rot.x = config.jumpKneeTuckDeg * DEG_TO_RAD;
      pose.kneeR_Rot.x = config.jumpKneeTuckDeg * DEG_TO_RAD;

      pose.shoulderL_Rot.x = -config.jumpArmRaiseDeg * DEG_TO_RAD;
      pose.shoulderR_Rot.x = -config.jumpArmRaiseDeg * DEG_TO_RAD;
      pose.shoulderL_Rot.z = -25 * DEG_TO_RAD;
      pose.shoulderR_Rot.z = 25 * DEG_TO_RAD;
      pose.elbowL_Rot.x = -40 * DEG_TO_RAD;
      pose.elbowR_Rot.x = -40 * DEG_TO_RAD;
      return pose;
    }

    if (state === "FALL") {
      // Extend legs downward, arms out wide for balance
      pose.hipL_Rot.x = 5 * DEG_TO_RAD;
      pose.hipR_Rot.x = 5 * DEG_TO_RAD;
      pose.kneeL_Rot.x = 10 * DEG_TO_RAD;
      pose.kneeR_Rot.x = 10 * DEG_TO_RAD;

      pose.shoulderL_Rot.x = -10 * DEG_TO_RAD;
      pose.shoulderR_Rot.x = -10 * DEG_TO_RAD;
      pose.shoulderL_Rot.z = -config.fallArmSpreadDeg * DEG_TO_RAD;
      pose.shoulderR_Rot.z = config.fallArmSpreadDeg * DEG_TO_RAD;
      pose.elbowL_Rot.x = -20 * DEG_TO_RAD;
      pose.elbowR_Rot.x = -20 * DEG_TO_RAD;
      return pose;
    }

    if (state === "LAND") {
      // Crouch / impact compression
      pose.torsoPositionOffset.y = -0.04;
      pose.hipL_Rot.x = -25 * DEG_TO_RAD;
      pose.hipR_Rot.x = -25 * DEG_TO_RAD;
      pose.kneeL_Rot.x = 45 * DEG_TO_RAD;
      pose.kneeR_Rot.x = 45 * DEG_TO_RAD;
      pose.shoulderL_Rot.z = -20 * DEG_TO_RAD;
      pose.shoulderR_Rot.z = 20 * DEG_TO_RAD;
      pose.elbowL_Rot.x = -25 * DEG_TO_RAD;
      pose.elbowR_Rot.x = -25 * DEG_TO_RAD;
      return pose;
    }

    return pose;
  }

  /**
   * Layers combat strike kinematics over the base locomotion pose
   */
  private applyCombatOverlay(
    pose: RigJointPose,
    action: AttackActionType,
    progress: number, // 0.0 to 1.0
  ): void {
    const config = CHARACTER_PROPORTIONS.animation;
    // Bell curve punch curve: 0 -> peak at 0.4 -> 0
    const attackEnvelope = Math.sin(Math.min(1.0, progress) * Math.PI);

    if (action === "LIGHT_PUNCH") {
      // Rapid Right Jab / Lead Straight Punch
      pose.torsoRotation.y -= attackEnvelope * 18 * DEG_TO_RAD; // Right shoulder rotates forward
      pose.shoulderR_Rot.x = -attackEnvelope * 85 * DEG_TO_RAD; // Forward shoulder extension
      pose.shoulderR_Rot.y = -attackEnvelope * 15 * DEG_TO_RAD;
      pose.elbowR_Rot.x = -(1.0 - attackEnvelope) * 20 * DEG_TO_RAD; // Snaps straight forward
      pose.wristR_Rot.x = attackEnvelope * 10 * DEG_TO_RAD;

      // Left arm guards chest and face
      pose.shoulderL_Rot.x = -20 * DEG_TO_RAD;
      pose.shoulderL_Rot.z = -12 * DEG_TO_RAD;
      pose.elbowL_Rot.x = -70 * DEG_TO_RAD; // Forearm flexed forward in front of face
    } else if (action === "HEAVY_PUNCH") {
      // Deep lunging cross punch
      pose.torsoRotation.x += attackEnvelope * 15 * DEG_TO_RAD;
      pose.torsoRotation.y -= attackEnvelope * 30 * DEG_TO_RAD; // Right shoulder rotates forward

      pose.shoulderR_Rot.x = -attackEnvelope * 95 * DEG_TO_RAD;
      pose.shoulderR_Rot.z = attackEnvelope * 10 * DEG_TO_RAD;
      pose.elbowR_Rot.x = -(1.0 - attackEnvelope) * 15 * DEG_TO_RAD;
      pose.wristR_Rot.z = attackEnvelope * 25 * DEG_TO_RAD;

      // Left arm drops back for counterbalance
      pose.shoulderL_Rot.x = attackEnvelope * 35 * DEG_TO_RAD;
    } else if (action === "KICK") {
      // High front snap kick with right leg
      const kickEnvelope = Math.sin(Math.min(1.0, progress) * Math.PI);
      pose.torsoRotation.x = -kickEnvelope * 18 * DEG_TO_RAD; // Lean back for balance

      pose.hipR_Rot.x = -kickEnvelope * config.kickHipThrustDeg * DEG_TO_RAD; // High hip lift forward
      pose.kneeR_Rot.x = (1.0 - kickEnvelope) * 35 * DEG_TO_RAD; // Chamber back, then snap straight
      pose.ankleR_Rot.x = kickEnvelope * 20 * DEG_TO_RAD; // Point toes

      // Arms out for balance
      pose.shoulderL_Rot.z = -35 * DEG_TO_RAD;
      pose.shoulderR_Rot.z = 35 * DEG_TO_RAD;
      pose.elbowL_Rot.x = -20 * DEG_TO_RAD;
      pose.elbowR_Rot.x = -20 * DEG_TO_RAD;
    }
  }

  /**
   * Smoothly interpolates pose towards target using exponential blend
   */
  private smoothPose(current: RigJointPose, target: RigJointPose, alpha: number): void {
    Vector3.LerpToRef(current.torsoPositionOffset, target.torsoPositionOffset, alpha, current.torsoPositionOffset);
    Vector3.LerpToRef(current.torsoRotation, target.torsoRotation, alpha, current.torsoRotation);
    Vector3.LerpToRef(current.headRotation, target.headRotation, alpha, current.headRotation);

    Vector3.LerpToRef(current.shoulderL_Rot, target.shoulderL_Rot, alpha, current.shoulderL_Rot);
    Vector3.LerpToRef(current.elbowL_Rot, target.elbowL_Rot, alpha, current.elbowL_Rot);
    Vector3.LerpToRef(current.wristL_Rot, target.wristL_Rot, alpha, current.wristL_Rot);

    Vector3.LerpToRef(current.shoulderR_Rot, target.shoulderR_Rot, alpha, current.shoulderR_Rot);
    Vector3.LerpToRef(current.elbowR_Rot, target.elbowR_Rot, alpha, current.elbowR_Rot);
    Vector3.LerpToRef(current.wristR_Rot, target.wristR_Rot, alpha, current.wristR_Rot);

    Vector3.LerpToRef(current.hipL_Rot, target.hipL_Rot, alpha, current.hipL_Rot);
    Vector3.LerpToRef(current.kneeL_Rot, target.kneeL_Rot, alpha, current.kneeL_Rot);
    Vector3.LerpToRef(current.ankleL_Rot, target.ankleL_Rot, alpha, current.ankleL_Rot);

    Vector3.LerpToRef(current.hipR_Rot, target.hipR_Rot, alpha, current.hipR_Rot);
    Vector3.LerpToRef(current.kneeR_Rot, target.kneeR_Rot, alpha, current.kneeR_Rot);
    Vector3.LerpToRef(current.ankleR_Rot, target.ankleR_Rot, alpha, current.ankleR_Rot);
  }
}
