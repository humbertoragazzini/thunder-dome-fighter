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
  Quaternion,
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
  private scene: Scene;
  private animator: CharacterProceduralAnimator;

  // Authoritative Socket Weapon Attachment (Phase 12)
  private attachedWeaponMesh: Mesh | null = null;
  private attachedWeaponMaterials: StandardMaterial[] = [];
  private currentWeaponId: string = "FISTS";

  // Physical ragdoll collapse state on knockout
  private isRagdoll: boolean = false;
  private ragdollVelocity: Vector3 = Vector3.Zero();
  private ragdollAngularVelocity: Vector3 = Vector3.Zero();

  constructor(
    name: string,
    scene: Scene,
    palette: CharacterPalette = HERO_PALETTE,
  ) {
    this.name = name;
    this.scene = scene;
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
    isStunned: boolean = false,
  ): void {
    if (this.isRagdoll) {
      this.updateRagdollPhysics(deltaSeconds);
      return;
    }

    const pose = this.animator.update(
      deltaSeconds,
      linearVelocity,
      isGrounded,
      isSprinting,
      attackAction,
      isStunned,
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
   * Triggers a momentary flinch animation reaction when taking a hit
   */
  triggerFlinch(zone: "HEAD" | "TORSO" | "LIMBS" = "TORSO"): void {
    this.animator.triggerFlinch(zone);
  }

  /**
   * Triggers physical ragdoll collapse when player HP drops to 0
   */
  triggerRagdoll(knockbackImpulse?: Vector3): void {
    this.isRagdoll = true;
    if (knockbackImpulse) {
      this.ragdollVelocity.set(
        knockbackImpulse.x,
        Math.max(3.5, knockbackImpulse.y + 2.0),
        knockbackImpulse.z,
      );
    } else {
      this.ragdollVelocity.set(0, 3.5, -2.0);
    }
    // Violent random tumbling spin
    this.ragdollAngularVelocity.set(
      (Math.random() - 0.5) * 12.0,
      (Math.random() - 0.5) * 8.0,
      (Math.random() - 0.5) * 10.0,
    );
  }

  /**
   * Restores character from ragdoll upon respawn
   */
  resetFromRagdoll(): void {
    this.isRagdoll = false;
    this.ragdollVelocity.set(0, 0, 0);
    this.ragdollAngularVelocity.set(0, 0, 0);
    if (this.rootNode.rotationQuaternion) {
      this.rootNode.rotationQuaternion = Quaternion.Identity();
    }
    this.torsoNode.rotation.set(0, 0, 0);
    this.headJoint.rotation.set(0, 0, 0);
    this.shoulderLeftJoint.rotation.set(0, 0, 0);
    this.elbowLeftJoint.rotation.set(0, 0, 0);
    this.wristLeftJoint.rotation.set(0, 0, 0);
    this.shoulderRightJoint.rotation.set(0, 0, 0);
    this.elbowRightJoint.rotation.set(0, 0, 0);
    this.wristRightJoint.rotation.set(0, 0, 0);
    this.hipLeftJoint.rotation.set(0, 0, 0);
    this.kneeLeftJoint.rotation.set(0, 0, 0);
    this.ankleLeftJoint.rotation.set(0, 0, 0);
    this.hipRightJoint.rotation.set(0, 0, 0);
    this.kneeRightJoint.rotation.set(0, 0, 0);
    this.ankleRightJoint.rotation.set(0, 0, 0);
  }

  getIsRagdoll(): boolean {
    return this.isRagdoll;
  }

  private updateRagdollPhysics(deltaSeconds: number): void {
    // 1. Gravity acceleration
    this.ragdollVelocity.y -= 19.6 * deltaSeconds;

    // 2. Linear displacement
    this.rootNode.position.addInPlace(this.ragdollVelocity.scale(deltaSeconds));

    // 3. Angular tumble
    if (!this.rootNode.rotationQuaternion) {
      this.rootNode.rotationQuaternion = Quaternion.Identity();
    }
    const deltaRot = Quaternion.FromEulerAngles(
      this.ragdollAngularVelocity.x * deltaSeconds,
      this.ragdollAngularVelocity.y * deltaSeconds,
      this.ragdollAngularVelocity.z * deltaSeconds,
    );
    this.rootNode.rotationQuaternion = deltaRot.multiply(this.rootNode.rotationQuaternion);

    // 4. Floor bounce / friction
    const floorY = -0.80;
    const planarDistSq =
      this.rootNode.position.x * this.rootNode.position.x +
      this.rootNode.position.z * this.rootNode.position.z;
    const isOverFloor = planarDistSq <= 12.0 * 12.0;

    if (isOverFloor && this.rootNode.position.y <= floorY) {
      this.rootNode.position.y = floorY;
      if (this.ragdollVelocity.y < 0) {
        this.ragdollVelocity.y = -this.ragdollVelocity.y * 0.25; // Restitution
      }
      this.ragdollVelocity.x *= 0.85; // Ground friction
      this.ragdollVelocity.z *= 0.85;
      this.ragdollAngularVelocity.scaleInPlace(0.80);
    }

    // 5. Limp articulated joints (flop downward with gravity)
    this.headJoint.rotation.x = Math.PI * 0.35; // Head sags back
    this.shoulderLeftJoint.rotation.z = -Math.PI * 0.45; // Arms splay outward
    this.shoulderRightJoint.rotation.z = Math.PI * 0.45;
    this.elbowLeftJoint.rotation.x = -Math.PI * 0.3;
    this.elbowRightJoint.rotation.x = -Math.PI * 0.3;
    this.hipLeftJoint.rotation.x = Math.PI * 0.35; // Legs bend limp
    this.hipRightJoint.rotation.x = Math.PI * 0.25;
    this.kneeLeftJoint.rotation.x = Math.PI * 0.4;
    this.kneeRightJoint.rotation.x = Math.PI * 0.4;
  }

  /**
   * Attaches or detaches visual weapon meshes socketed to the right wrist joint
   */
  attachWeapon(itemId: string): void {
    if (itemId === this.currentWeaponId) return;

    this.detachWeapon();
    this.currentWeaponId = itemId;

    if (!itemId || itemId === "FISTS") {
      return;
    }

    if (itemId === "ENERGY_BLADE") {
      const rootBlade = new Mesh(`${this.name}-weapon-root`, this.scene);
      rootBlade.parent = this.wristRightJoint;
      rootBlade.position.set(0, -0.15, 0.18);
      rootBlade.rotation.x = Math.PI * 0.45;

      const hilt = MeshBuilder.CreateCylinder(
        `${this.name}-blade-hilt`,
        { diameter: 0.04, height: 0.22 },
        this.scene,
      );
      hilt.parent = rootBlade;
      const hiltMat = new StandardMaterial(`${this.name}-mat-hilt`, this.scene);
      hiltMat.diffuseColor = new Color3(0.15, 0.15, 0.2);
      hilt.material = hiltMat;
      this.attachedWeaponMaterials.push(hiltMat);

      const blade = MeshBuilder.CreateBox(
        `${this.name}-blade-beam`,
        { width: 0.02, height: 0.85, depth: 0.08 },
        this.scene,
      );
      blade.parent = rootBlade;
      blade.position.set(0, 0.45, 0);
      const bladeMat = new StandardMaterial(`${this.name}-mat-energy-blade`, this.scene);
      bladeMat.diffuseColor = new Color3(0.1, 0.8, 1.0);
      bladeMat.emissiveColor = new Color3(0.2, 0.9, 1.0);
      blade.material = bladeMat;
      this.attachedWeaponMaterials.push(bladeMat);

      this.attachedWeaponMesh = rootBlade;
    } else if (itemId === "THUNDER_HAMMER") {
      const rootHammer = new Mesh(`${this.name}-weapon-root`, this.scene);
      rootHammer.parent = this.wristRightJoint;
      rootHammer.position.set(0, -0.15, 0.18);
      rootHammer.rotation.x = Math.PI * 0.45;

      const shaft = MeshBuilder.CreateCylinder(
        `${this.name}-hammer-shaft`,
        { diameter: 0.05, height: 1.0 },
        this.scene,
      );
      shaft.parent = rootHammer;
      shaft.position.set(0, 0.35, 0);
      const shaftMat = new StandardMaterial(`${this.name}-mat-hammer-shaft`, this.scene);
      shaftMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
      shaft.material = shaftMat;
      this.attachedWeaponMaterials.push(shaftMat);

      const head = MeshBuilder.CreateBox(
        `${this.name}-hammer-head`,
        { width: 0.28, height: 0.24, depth: 0.38 },
        this.scene,
      );
      head.parent = rootHammer;
      head.position.set(0, 0.85, 0);
      const headMat = new StandardMaterial(`${this.name}-mat-hammer-head`, this.scene);
      headMat.diffuseColor = new Color3(0.8, 0.6, 0.1);
      headMat.emissiveColor = new Color3(0.9, 0.7, 0.2);
      head.material = headMat;
      this.attachedWeaponMaterials.push(headMat);

      this.attachedWeaponMesh = rootHammer;
    } else if (itemId === "PLASMA_PISTOL") {
      const rootPistol = new Mesh(`${this.name}-weapon-root`, this.scene);
      rootPistol.parent = this.wristRightJoint;
      rootPistol.position.set(0, -0.12, 0.15);
      rootPistol.rotation.x = Math.PI * 0.5;

      const grip = MeshBuilder.CreateBox(
        `${this.name}-pistol-grip`,
        { width: 0.05, height: 0.16, depth: 0.06 },
        this.scene,
      );
      grip.parent = rootPistol;
      grip.rotation.x = -Math.PI * 0.15;
      const gripMat = new StandardMaterial(`${this.name}-mat-pistol-grip`, this.scene);
      gripMat.diffuseColor = new Color3(0.15, 0.15, 0.2);
      grip.material = gripMat;
      this.attachedWeaponMaterials.push(gripMat);

      const barrel = MeshBuilder.CreateBox(
        `${this.name}-pistol-barrel`,
        { width: 0.06, height: 0.1, depth: 0.35 },
        this.scene,
      );
      barrel.parent = rootPistol;
      barrel.position.set(0, 0.08, 0.12);
      const barrelMat = new StandardMaterial(`${this.name}-mat-pistol-barrel`, this.scene);
      barrelMat.diffuseColor = new Color3(0.6, 0.2, 0.9);
      barrelMat.emissiveColor = new Color3(0.7, 0.3, 1.0);
      barrel.material = barrelMat;
      this.attachedWeaponMaterials.push(barrelMat);

      this.attachedWeaponMesh = rootPistol;
    }
  }

  detachWeapon(): void {
    if (this.attachedWeaponMesh) {
      this.attachedWeaponMesh.dispose();
      this.attachedWeaponMesh = null;
    }
    for (const mat of this.attachedWeaponMaterials) {
      mat.dispose();
    }
    this.attachedWeaponMaterials = [];
    this.currentWeaponId = "FISTS";
  }

  /**
   * Cleans up all Babylon nodes, meshes, and materials
   */
  dispose(): void {
    this.detachWeapon();

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
