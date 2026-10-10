// ==================================================
// CHARACTER VISUAL RIG TYPES & CONTRACTS
//
// WHAT IT DOES:
// Defines the core interface contracts, joint identifiers, and color palette
// structures for character visual rigs in Thunder Dome Fighter.
//
// HOW IT WORKS:
// - `ICharacterVisual` establishes a uniform adapter interface implemented by both
//   procedural cube rigs (`CharacterVisualRig`) and future Blender GLB models (`GlbCharacterVisual`).
// - Decouples rendering and visual skeletal articulation from physics collision and networking.
// - Provides strongly-typed joint enums matching standard 3D skeletal naming conventions.
//
// WHY IT EXISTS:
// Ensures competitive fair play: cosmetics and visual models can be swapped
// seamlessly without altering server hitboxes, prediction logic, or physics kinematics.
// ==================================================

import type { TransformNode, Vector3, Color3 } from "@babylonjs/core";
import type { AttackActionType } from "../../../shared/player/PlayerConfig";

/**
 * Standard joint identifiers matching canonical humanoid skeleton conventions
 */
export type CharacterJointId =
  | "torso"
  | "head"
  | "shoulder_l"
  | "elbow_l"
  | "wrist_l"
  | "shoulder_r"
  | "elbow_r"
  | "wrist_r"
  | "hip_l"
  | "knee_l"
  | "ankle_l"
  | "hip_r"
  | "knee_r"
  | "ankle_r";

/**
 * Procedural animation states for biped locomotion and combat
 */
export type CharacterAnimationState =
  | "IDLE"
  | "WALK"
  | "RUN"
  | "JUMP_ASCENT"
  | "FALL"
  | "LAND"
  | "LIGHT_PUNCH"
  | "HEAVY_PUNCH"
  | "KICK"
  | "BLOCK";

/**
 * Stylized material color palette for character customization and team identification
 */
export interface CharacterPalette {
  name: string;
  suitPrimary: Color3;    // Main torso and limb suit color
  suitSecondary: Color3;  // Accents, joint rings, trim
  fists: Color3;          // Boxing gloves / chunky fists
  boots: Color3;          // Cartoon sneakers / boots
  skin: Color3;           // Face / neck skin tone
  visor: Color3;          // Expressive visor / eyes
  visorGlow: Color3;      // Emissive glow for eyes / visor
}

/**
 * Uniform visual character contract.
 * Implemented by both procedural cube hierarchies and imported Blender .glb rigs.
 */
export interface ICharacterVisual {
  /**
   * Root transform node that attaches to physics prediction or interpolation transform
   */
  readonly rootNode: TransformNode;

  /**
   * Advance procedural animation cycles or skeletal animation groups
   * @param deltaSeconds Frame elapsed time in seconds
   * @param linearVelocity Instantaneous 3D velocity vector (m/s)
   * @param isGrounded Whether the character's feet are touching the ground
   * @param isSprinting Whether the sprint modifier is active
   * @param attackAction Current attack intention (LIGHT_PUNCH, HEAVY_PUNCH, KICK, etc.)
   */
  update(
    deltaSeconds: number,
    linearVelocity: Vector3,
    isGrounded: boolean,
    isSprinting: boolean,
    attackAction?: AttackActionType,
  ): void;

  /**
   * Apply a stylized material color palette
   */
  setPalette(palette: CharacterPalette): void;

  /**
   * Dispose all meshes, joint nodes, and materials
   */
  dispose(): void;
}
