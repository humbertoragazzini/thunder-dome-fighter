// ==================================================
// CHARACTER RIG TUNING CONFIGURATION & PALETTES
//
// WHAT IT DOES:
// Centralized tuning repository for humanoid character proportions, joint offsets,
// procedural animation swing amplitudes, and visual color palettes.
//
// HOW IT WORKS:
// - All dimensions are specified in meters and calibrated to fit cleanly inside
//   the 1.1m authoritative Havok capsule collider.
// - Supports live hot-reloading (Vite HMR): tweaking values here updates character
//   geometry and animations in real-time in the browser.
// - Decoupled from physics collision so aesthetic adjustments never alter hitboxes.
//
// WHY IT EXISTS:
// Gives artists and designers a single, clearly documented place to dial in
// the exact "funny humanoid guy" cartoon brawler aesthetic and proportions.
// ==================================================

import { Color3 } from "@babylonjs/core";
import type { CharacterPalette } from "./types";

/**
 * Master tunable proportions for the 15-cube articulated character hierarchy.
 * Units: meters (m) and degrees (deg).
 */
export const CHARACTER_PROPORTIONS = {
  // Global visual scale multiplier
  overallScale: 1.0,

  // --------------------------------------------------
  // TORSO / CHEST (Central Anchor)
  // --------------------------------------------------
  torso: {
    width: 0.34,      // Lateral chest width (shoulder to shoulder span)
    height: 0.34,     // Vertical torso height
    depth: 0.22,      // Front-to-back torso thickness
    elevationY: 0.06, // Torso center height relative to capsule center
  },

  // --------------------------------------------------
  // HEAD & VISOR (Expressive Goofy Face)
  // --------------------------------------------------
  head: {
    width: 0.26,      // Head box width
    height: 0.26,     // Head box height
    depth: 0.26,      // Head box depth
    neckOffsetY: 0.17,// Height of neck pivot relative to torso center
    visorWidth: 0.20, // Visor / eye mask width
    visorHeight: 0.08,// Visor / eye mask height
    visorDepth: 0.04, // Protrusion beyond front of head
    visorOffsetY: 0.02,// Vertical offset of eyes on the head
  },

  // --------------------------------------------------
  // ARMS (Shoulder Joint -> Upper Arm -> Elbow Joint -> Forearm -> Wrist -> Fist)
  // --------------------------------------------------
  arms: {
    shoulderSpanX: 0.21,   // Lateral distance from torso center to shoulder pivot
    shoulderOffsetY: 0.12, // Vertical position of shoulder pivot on torso
    upperArm: {
      width: 0.10,
      height: 0.16,
      depth: 0.10,
    },
    forearm: {
      width: 0.09,
      height: 0.15,
      depth: 0.09,
    },
    fist: {
      width: 0.12,  // Chunky cartoon boxing fist / hand
      height: 0.12,
      depth: 0.12,
    },
  },

  // --------------------------------------------------
  // LEGS (Hip Joint -> Thigh -> Knee Joint -> Shin -> Ankle Joint -> Boot)
  // --------------------------------------------------
  legs: {
    hipSpanX: 0.10,       // Lateral distance from torso center to hip pivot
    hipOffsetY: -0.17,    // Vertical position of hip pivot at bottom of torso
    thigh: {
      width: 0.12,
      height: 0.18,
      depth: 0.12,
    },
    shin: {
      width: 0.11,
      height: 0.18,
      depth: 0.11,
    },
    boot: {
      width: 0.13,        // Cartoon sneaker / boot width
      height: 0.08,       // Boot sole height
      depth: 0.19,        // Elongated forward sneaker depth
      forwardOffsetZ: 0.04,// Pushes sneaker forward for natural foot look
    },
  },

  // --------------------------------------------------
  // PROCEDURAL ANIMATION TUNING
  // --------------------------------------------------
  animation: {
    // Frequencies (radians/sec)
    idleBreathingFrequency: 2.5,
    walkCycleFrequency: 8.0,
    runCycleFrequency: 13.0,

    // Movement amplitudes (degrees)
    walkLegSwingDeg: 28,      // Max leg swing in walk
    runLegSwingDeg: 46,       // Max leg swing in sprint
    armSwingMultiplier: 0.85, // Arm swing amplitude relative to legs
    kneeBendMaxDeg: 48,       // Knee flexion angle during backward leg lift
    elbowBendRelaxedDeg: 25,  // Slight natural elbow bend while walking
    elbowBendSprintDeg: 75,   // Deep 75-degree elbow bend while sprinting
    runTorsoLeanDeg: 12,      // Forward torso lean angle during sprint
    torsoBobbingMeters: 0.02, // Vertical pelvic bounce during locomotion
    torsoTwistDeg: 5,         // Pelvic rotation counter to limb swing

    // Jump & Air parameters
    jumpKneeTuckDeg: 35,      // Knees bent while ascending
    jumpArmRaiseDeg: 40,      // Arms thrown forward/upward for air balance
    fallArmSpreadDeg: 25,     // Arms out wide during descent

    // Attack kinematics
    lightPunchDurationSec: 0.22,
    heavyPunchDurationSec: 0.38,
    kickDurationSec: 0.32,
    punchReachMeters: 0.28,   // Forward fist extension
    punchShoulderThrustDeg: 35,
    kickHipThrustDeg: 65,     // High front snap kick angle
  },
};

// ==================================================
// STYLIZED COLOR PALETTES
// ==================================================

/**
 * Local Player (Hero) Palette: Electric Cyan & Arcade Amber
 */
export const HERO_PALETTE: CharacterPalette = {
  name: "Hero-Cyan",
  suitPrimary: new Color3(0.12, 0.58, 0.95),   // Electric Cyan
  suitSecondary: new Color3(0.08, 0.18, 0.32), // Dark Navy Slate
  fists: new Color3(0.98, 0.72, 0.12),         // Arcade Amber / Gold
  boots: new Color3(0.98, 0.72, 0.12),         // Arcade Amber / Gold
  skin: new Color3(0.96, 0.82, 0.72),          // Stylized Warm Skin
  visor: new Color3(0.1, 0.9, 1.0),            // Glowing Cyan Eyes
  visorGlow: new Color3(0.0, 0.6, 0.8),
};

/**
 * Remote Opponent Palette: Crimson Fire & Obsidian
 */
export const OPPONENT_PALETTE: CharacterPalette = {
  name: "Opponent-Crimson",
  suitPrimary: new Color3(0.92, 0.22, 0.22),   // Fiery Crimson Red
  suitSecondary: new Color3(0.18, 0.08, 0.10), // Charcoal Obsidian
  fists: new Color3(0.15, 0.15, 0.18),         // Obsidian Boxing Gloves
  boots: new Color3(0.15, 0.15, 0.18),         // Obsidian Combat Boots
  skin: new Color3(0.92, 0.78, 0.68),          // Warm Tone
  visor: new Color3(1.0, 0.8, 0.1),            // Glowing Amber Eyes
  visorGlow: new Color3(0.8, 0.5, 0.0),
};
