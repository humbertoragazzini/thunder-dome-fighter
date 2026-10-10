// ==================================================
// ARTICULATED 15-CUBE CHARACTER VISUAL RIG
//
// WHAT IT DOES:
// Constructs and manages the hierarchical 15-cube cartoon brawler character model
// in Babylon.js, complete with joint pivots, stylized materials, and procedural
// animation driving.
//
// HOW IT WORKS:
// - Builds a forward-kinematics transform tree rooted at `rootNode`:
//   Torso -> Neck/Head (with Visor)
//   Torso -> Shoulder.L/R -> Elbow.L/R -> Wrist.L/R -> Fist.L/R
//   Torso -> Hip.L/R -> Knee.L/R -> Ankle.L/R -> Boot.L/R
// - Local mesh origins are positioned relative to joint pivots so rotations swing naturally.
// - Each frame, passes physics inputs to `CharacterProceduralAnimator` and applies
//   computed Euler rotations to each joint node.
// - Manages palette styling and clean asset teardown.
//
// WHY IT EXISTS:
// Fulfills Approach B ("humanoid funny guys made of cubes with joints"), anchoring
// expressive visual motion to the authoritative 1.1m Havok physics capsule.
// ==================================================

import {
  Scene,
  TransformNode,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  Color3,
} from "@babylonjs/core";
import type { AttackActionType } from "../../../shared/player/PlayerConfig";
import {
  CHARACTER_PROPORTIONS,
  HERO_PALETTE,
} from "./CharacterRigConfig";
import { CharacterProceduralAnimator } from "./CharacterProceduralAnimator";
import type { CharacterPalette, ICharacterVisual } from "./types";

export class CharacterVisualRig implements ICharacterVisual {
  readonly rootNode: TransformNode;

  // Joint transform pivots (Forward Kinematics tree)
  private torsoNode: TransformNode;
  private headJoint: TransformNode;

  private shoulderLeftJoint: TransformNode;
  private elbowLeftJoint: TransformNode;
  private wristLeftJoint: TransformNode;

  private shoulderRightJoint: TransformNode;
  private elbowRightJoint: TransformNode;
  private wristRightJoint: TransformNode;

  private hipLeftJoint: TransformNode;
  private kneeLeftJoint: TransformNode;
  private ankleLeftJoint: TransformNode;

  private hipRightJoint: TransformNode;
  private kneeRightJoint: TransformNode;
  private ankleRightJoint: TransformNode;

  // Visual meshes (15 body cubes + facial visor)
  private meshes: Mesh[] = [];

  // Stylized materials
  private matSuitPrimary: StandardMaterial;
  private matSuitSecondary: StandardMaterial;
  private matSkin: StandardMaterial;
  private matVisor: StandardMaterial;
  private matFists: StandardMaterial;
  private matBoots: StandardMaterial;

  // Character identity and animator
  readonly name: string;
  private animator: CharacterProceduralAnimator;

  constructor(
    name: string,
    scene: Scene,
    palette: CharacterPalette = HERO_PALETTE,
  ) {
    this.name = name;
    this.animator = new CharacterProceduralAnimator();

    // --------------------------------------------------
    // 1. Root & Torso Anchor
    // --------------------------------------------------
    this.rootNode = new TransformNode(`${name}-root`, scene);

    this.torsoNode = new TransformNode(`${name}-torso-pivot`, scene);
    this.torsoNode.parent = this.rootNode;
    this.torsoNode.position.set(0, CHARACTER_PROPORTIONS.torso.elevationY, 0);

    // --------------------------------------------------
    // 2. Materials Setup
    // --------------------------------------------------
    this.matSuitPrimary = new StandardMaterial(`${name}-mat-primary`, scene);
    this.matSuitSecondary = new StandardMaterial(`${name}-mat-secondary`, scene);
    this.matSkin = new StandardMaterial(`${name}-mat-skin`, scene);
    this.matVisor = new StandardMaterial(`${name}-mat-visor`, scene);
    this.matFists = new StandardMaterial(`${name}-mat-fists`, scene);
    this.matBoots = new StandardMaterial(`${name}-mat-boots`, scene);

    this.setPalette(palette);

    // --------------------------------------------------
    // 3. Torso Mesh (Central Body)
    // --------------------------------------------------
    const pTorso = CHARACTER_PROPORTIONS.torso;
    const torsoMesh = MeshBuilder.CreateBox(
      `${name}-mesh-torso`,
      { width: pTorso.width, height: pTorso.height, depth: pTorso.depth },
      scene,
    );
    torsoMesh.parent = this.torsoNode;
    torsoMesh.position.set(0, 0, 0);
    torsoMesh.material = this.matSuitPrimary;
    this.meshes.push(torsoMesh);

    // --------------------------------------------------
    // 4. Head & Expressive Visor Mask
    // --------------------------------------------------
    const pHead = CHARACTER_PROPORTIONS.head;
    this.headJoint = new TransformNode(`${name}-joint-head`, scene);
    this.headJoint.parent = this.torsoNode;
    this.headJoint.position.set(0, pHead.neckOffsetY, 0);

    const headMesh = MeshBuilder.CreateBox(
      `${name}-mesh-head`,
      { width: pHead.width, height: pHead.height, depth: pHead.depth },
      scene,
    );
    headMesh.parent = this.headJoint;
    headMesh.position.set(0, pHead.height / 2, 0); // Bottom sits at neck pivot
    headMesh.material = this.matSkin;
    this.meshes.push(headMesh);

    const visorMesh = MeshBuilder.CreateBox(
      `${name}-mesh-visor`,
      { width: pHead.visorWidth, height: pHead.visorHeight, depth: pHead.visorDepth },
      scene,
    );
    visorMesh.parent = this.headJoint;
    visorMesh.position.set(
      0,
      pHead.height / 2 + pHead.visorOffsetY,
      pHead.depth / 2 + pHead.visorDepth / 2 - 0.005, // Slightly embedded into face
    );
    visorMesh.material = this.matVisor;
    this.meshes.push(visorMesh);

    // --------------------------------------------------
    // 5. Left Arm (Shoulder -> UpperArm -> Elbow -> Forearm -> Wrist -> Fist)
    // --------------------------------------------------
    const pArms = CHARACTER_PROPORTIONS.arms;
    this.shoulderLeftJoint = new TransformNode(`${name}-joint-shoulder-l`, scene);
    this.shoulderLeftJoint.parent = this.torsoNode;
    this.shoulderLeftJoint.position.set(-pArms.shoulderSpanX, pArms.shoulderOffsetY, 0);

    const upperArmLeftMesh = MeshBuilder.CreateBox(
      `${name}-mesh-upperarm-l`,
      { width: pArms.upperArm.width, height: pArms.upperArm.height, depth: pArms.upperArm.depth },
      scene,
    );
    upperArmLeftMesh.parent = this.shoulderLeftJoint;
    upperArmLeftMesh.position.set(0, -pArms.upperArm.height / 2, 0);
    upperArmLeftMesh.material = this.matSuitPrimary;
    this.meshes.push(upperArmLeftMesh);

    this.elbowLeftJoint = new TransformNode(`${name}-joint-elbow-l`, scene);
    this.elbowLeftJoint.parent = this.shoulderLeftJoint;
    this.elbowLeftJoint.position.set(0, -pArms.upperArm.height, 0);

    const forearmLeftMesh = MeshBuilder.CreateBox(
      `${name}-mesh-forearm-l`,
      { width: pArms.forearm.width, height: pArms.forearm.height, depth: pArms.forearm.depth },
      scene,
    );
    forearmLeftMesh.parent = this.elbowLeftJoint;
    forearmLeftMesh.position.set(0, -pArms.forearm.height / 2, 0);
    forearmLeftMesh.material = this.matSuitSecondary;
    this.meshes.push(forearmLeftMesh);

    this.wristLeftJoint = new TransformNode(`${name}-joint-wrist-l`, scene);
    this.wristLeftJoint.parent = this.elbowLeftJoint;
    this.wristLeftJoint.position.set(0, -pArms.forearm.height, 0);

    const fistLeftMesh = MeshBuilder.CreateBox(
      `${name}-mesh-fist-l`,
      { width: pArms.fist.width, height: pArms.fist.height, depth: pArms.fist.depth },
      scene,
    );
    fistLeftMesh.parent = this.wristLeftJoint;
    fistLeftMesh.position.set(0, -pArms.fist.height / 2, 0);
    fistLeftMesh.material = this.matFists;
    this.meshes.push(fistLeftMesh);

    // --------------------------------------------------
    // 6. Right Arm (Shoulder -> UpperArm -> Elbow -> Forearm -> Wrist -> Fist)
    // --------------------------------------------------
    this.shoulderRightJoint = new TransformNode(`${name}-joint-shoulder-r`, scene);
    this.shoulderRightJoint.parent = this.torsoNode;
    this.shoulderRightJoint.position.set(pArms.shoulderSpanX, pArms.shoulderOffsetY, 0);

    const upperArmRightMesh = MeshBuilder.CreateBox(
      `${name}-mesh-upperarm-r`,
      { width: pArms.upperArm.width, height: pArms.upperArm.height, depth: pArms.upperArm.depth },
      scene,
    );
    upperArmRightMesh.parent = this.shoulderRightJoint;
    upperArmRightMesh.position.set(0, -pArms.upperArm.height / 2, 0);
    upperArmRightMesh.material = this.matSuitPrimary;
    this.meshes.push(upperArmRightMesh);

    this.elbowRightJoint = new TransformNode(`${name}-joint-elbow-r`, scene);
    this.elbowRightJoint.parent = this.shoulderRightJoint;
    this.elbowRightJoint.position.set(0, -pArms.upperArm.height, 0);

    const forearmRightMesh = MeshBuilder.CreateBox(
      `${name}-mesh-forearm-r`,
      { width: pArms.forearm.width, height: pArms.forearm.height, depth: pArms.forearm.depth },
      scene,
    );
    forearmRightMesh.parent = this.elbowRightJoint;
    forearmRightMesh.position.set(0, -pArms.forearm.height / 2, 0);
    forearmRightMesh.material = this.matSuitSecondary;
    this.meshes.push(forearmRightMesh);

    this.wristRightJoint = new TransformNode(`${name}-joint-wrist-r`, scene);
    this.wristRightJoint.parent = this.elbowRightJoint;
    this.wristRightJoint.position.set(0, -pArms.forearm.height, 0);

    const fistRightMesh = MeshBuilder.CreateBox(
      `${name}-mesh-fist-r`,
      { width: pArms.fist.width, height: pArms.fist.height, depth: pArms.fist.depth },
      scene,
    );
    fistRightMesh.parent = this.wristRightJoint;
    fistRightMesh.position.set(0, -pArms.fist.height / 2, 0);
    fistRightMesh.material = this.matFists;
    this.meshes.push(fistRightMesh);

    // --------------------------------------------------
    // 7. Left Leg (Hip -> Thigh -> Knee -> Shin -> Ankle -> Boot)
    // --------------------------------------------------
    const pLegs = CHARACTER_PROPORTIONS.legs;
    this.hipLeftJoint = new TransformNode(`${name}-joint-hip-l`, scene);
    this.hipLeftJoint.parent = this.torsoNode;
    this.hipLeftJoint.position.set(-pLegs.hipSpanX, pLegs.hipOffsetY, 0);

    const thighLeftMesh = MeshBuilder.CreateBox(
      `${name}-mesh-thigh-l`,
      { width: pLegs.thigh.width, height: pLegs.thigh.height, depth: pLegs.thigh.depth },
      scene,
    );
    thighLeftMesh.parent = this.hipLeftJoint;
    thighLeftMesh.position.set(0, -pLegs.thigh.height / 2, 0);
    thighLeftMesh.material = this.matSuitPrimary;
    this.meshes.push(thighLeftMesh);

    this.kneeLeftJoint = new TransformNode(`${name}-joint-knee-l`, scene);
    this.kneeLeftJoint.parent = this.hipLeftJoint;
    this.kneeLeftJoint.position.set(0, -pLegs.thigh.height, 0);

    const shinLeftMesh = MeshBuilder.CreateBox(
      `${name}-mesh-shin-l`,
      { width: pLegs.shin.width, height: pLegs.shin.height, depth: pLegs.shin.depth },
      scene,
    );
    shinLeftMesh.parent = this.kneeLeftJoint;
    shinLeftMesh.position.set(0, -pLegs.shin.height / 2, 0);
    shinLeftMesh.material = this.matSuitSecondary;
    this.meshes.push(shinLeftMesh);

    this.ankleLeftJoint = new TransformNode(`${name}-joint-ankle-l`, scene);
    this.ankleLeftJoint.parent = this.kneeLeftJoint;
    this.ankleLeftJoint.position.set(0, -pLegs.shin.height, 0);

    const bootLeftMesh = MeshBuilder.CreateBox(
      `${name}-mesh-boot-l`,
      { width: pLegs.boot.width, height: pLegs.boot.height, depth: pLegs.boot.depth },
      scene,
    );
    bootLeftMesh.parent = this.ankleLeftJoint;
    bootLeftMesh.position.set(0, -pLegs.boot.height / 2, pLegs.boot.forwardOffsetZ);
    bootLeftMesh.material = this.matBoots;
    this.meshes.push(bootLeftMesh);

    // --------------------------------------------------
    // 8. Right Leg (Hip -> Thigh -> Knee -> Shin -> Ankle -> Boot)
    // --------------------------------------------------
    this.hipRightJoint = new TransformNode(`${name}-joint-hip-r`, scene);
    this.hipRightJoint.parent = this.torsoNode;
    this.hipRightJoint.position.set(pLegs.hipSpanX, pLegs.hipOffsetY, 0);

    const thighRightMesh = MeshBuilder.CreateBox(
      `${name}-mesh-thigh-r`,
      { width: pLegs.thigh.width, height: pLegs.thigh.height, depth: pLegs.thigh.depth },
      scene,
    );
    thighRightMesh.parent = this.hipRightJoint;
    thighRightMesh.position.set(0, -pLegs.thigh.height / 2, 0);
    thighRightMesh.material = this.matSuitPrimary;
    this.meshes.push(thighRightMesh);

    this.kneeRightJoint = new TransformNode(`${name}-joint-knee-r`, scene);
    this.kneeRightJoint.parent = this.hipRightJoint;
    this.kneeRightJoint.position.set(0, -pLegs.thigh.height, 0);

    const shinRightMesh = MeshBuilder.CreateBox(
      `${name}-mesh-shin-r`,
      { width: pLegs.shin.width, height: pLegs.shin.height, depth: pLegs.shin.depth },
      scene,
    );
    shinRightMesh.parent = this.kneeRightJoint;
    shinRightMesh.position.set(0, -pLegs.shin.height / 2, 0);
    shinRightMesh.material = this.matSuitSecondary;
    this.meshes.push(shinRightMesh);

    this.ankleRightJoint = new TransformNode(`${name}-joint-ankle-r`, scene);
    this.ankleRightJoint.parent = this.kneeRightJoint;
    this.ankleRightJoint.position.set(0, -pLegs.shin.height, 0);

    const bootRightMesh = MeshBuilder.CreateBox(
      `${name}-mesh-boot-r`,
      { width: pLegs.boot.width, height: pLegs.boot.height, depth: pLegs.boot.depth },
      scene,
    );
    bootRightMesh.parent = this.ankleRightJoint;
    bootRightMesh.position.set(0, -pLegs.boot.height / 2, pLegs.boot.forwardOffsetZ);
    bootRightMesh.material = this.matBoots;
    this.meshes.push(bootRightMesh);
  }

  /**
   * Applies a stylized material palette across all character parts
   */
  setPalette(palette: CharacterPalette): void {
    this.matSuitPrimary.diffuseColor = palette.suitPrimary;
    this.matSuitPrimary.specularColor = new Color3(0.2, 0.2, 0.2);

    this.matSuitSecondary.diffuseColor = palette.suitSecondary;
    this.matSuitSecondary.specularColor = new Color3(0.15, 0.15, 0.15);

    this.matSkin.diffuseColor = palette.skin;
    this.matSkin.specularColor = new Color3(0.1, 0.1, 0.1);

    this.matVisor.diffuseColor = palette.visor;
    this.matVisor.emissiveColor = palette.visorGlow;

    this.matFists.diffuseColor = palette.fists;
    this.matFists.specularColor = new Color3(0.3, 0.3, 0.3);

    this.matBoots.diffuseColor = palette.boots;
    this.matBoots.specularColor = new Color3(0.2, 0.2, 0.2);
  }

  /**
   * Advances procedural animation cycle and applies poses to all joints
   */
  update(
    deltaSeconds: number,
    linearVelocity: Vector3,
    isGrounded: boolean,
    isSprinting: boolean,
    attackAction: AttackActionType = "NONE",
  ): void {
    const pose = this.animator.update(
      deltaSeconds,
      linearVelocity,
      isGrounded,
      isSprinting,
      attackAction,
    );

    // Apply Torso offset & rotation
    this.torsoNode.position.set(
      pose.torsoPositionOffset.x,
      CHARACTER_PROPORTIONS.torso.elevationY + pose.torsoPositionOffset.y,
      pose.torsoPositionOffset.z,
    );
    this.torsoNode.rotation.copyFrom(pose.torsoRotation);

    // Apply Head rotation
    this.headJoint.rotation.copyFrom(pose.headRotation);

    // Apply Arm rotations
    this.shoulderLeftJoint.rotation.copyFrom(pose.shoulderL_Rot);
    this.elbowLeftJoint.rotation.copyFrom(pose.elbowL_Rot);
    this.wristLeftJoint.rotation.copyFrom(pose.wristL_Rot);

    this.shoulderRightJoint.rotation.copyFrom(pose.shoulderR_Rot);
    this.elbowRightJoint.rotation.copyFrom(pose.elbowR_Rot);
    this.wristRightJoint.rotation.copyFrom(pose.wristR_Rot);

    // Apply Leg rotations
    this.hipLeftJoint.rotation.copyFrom(pose.hipL_Rot);
    this.kneeLeftJoint.rotation.copyFrom(pose.kneeL_Rot);
    this.ankleLeftJoint.rotation.copyFrom(pose.ankleL_Rot);

    this.hipRightJoint.rotation.copyFrom(pose.hipR_Rot);
    this.kneeRightJoint.rotation.copyFrom(pose.kneeR_Rot);
    this.ankleRightJoint.rotation.copyFrom(pose.ankleR_Rot);
  }

  /**
   * Cleans up all Babylon nodes, meshes, and materials
   */
  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    this.meshes = [];

    this.matSuitPrimary.dispose();
    this.matSuitSecondary.dispose();
    this.matSkin.dispose();
    this.matVisor.dispose();
    this.matFists.dispose();
    this.matBoots.dispose();

    this.rootNode.dispose();
  }
}
