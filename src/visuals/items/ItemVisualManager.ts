// ==================================================
// CLIENT 3D ITEM & WEAPON PICKUP VISUAL MANAGER
//
// WHAT IT DOES:
// Manages synchronized 3D meshes for arena items and weapons:
// - Spawns stylized hovering/rotating 3D models for health packs and weapons.
// - Drives procedural hovering animation (idle rotation and sine-wave bobbing).
// - Listens to authoritative network state (itemPickups MapSchema) to show/hide
//   available and cooling-down spawners.
// - Plays visual burst effects and procedural audio chimes when items are picked up.
//
// HOW IT WORKS:
// - Uses Babylon.js procedural geometry (crosses, cylinders, blades, hammers, blasters)
//   with emissive materials matching the item catalog's accentColor.
// - Subscribes to room message events 'item:collected', 'item:respawned', and
//   'player:item-equipped' for responsive feedback.
//
// WHY IT EXISTS:
// Enforces Phase 12 client-side visual requirements for generic items and
// arena pickups, giving players clear 3D spatial awareness of available resources.
// ==================================================

import {
  Scene,
  TransformNode,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
  ParticleSystem,
  DynamicTexture,
} from "@babylonjs/core";
import type { Room } from "@colyseus/sdk";
import { GAME_ITEMS } from "../../../shared/domain/GameItem";

interface ItemVisualEntry {
  spawnId: string;
  itemId: string;
  rootNode: TransformNode;
  meshNode: TransformNode;
  baseY: number;
  isAvailable: boolean;
  accentColor: string;
  materials: StandardMaterial[];
}

export class ItemVisualManager {
  private scene: Scene;
  private room: Room | null = null;
  private items = new Map<string, ItemVisualEntry>();
  private animElapsedTime: number = 0;
  private audioCtx: AudioContext | null = null;
  private healParticleTexture: DynamicTexture | null = null;

  constructor(scene: Scene, room?: Room | null) {
    this.scene = scene;
    this.createHealParticleTexture();

    if (room) {
      this.attachRoom(room);
    }
  }

  public attachRoom(room: Room): void {
    this.room = room;

    // Listen to network events for audio-visual feedback
    room.onMessage("item:collected", (message: {
      playerId: string;
      spawnId: string;
      itemId: string;
      healthRestored: number;
      remainingHealth: number;
    }) => {
      this.handleItemCollected(message.spawnId, message.itemId, message.playerId === room.sessionId);
    });

    room.onMessage("item:respawned", (message: {
      spawnId: string;
      itemId: string;
    }) => {
      this.handleItemRespawned(message.spawnId);
    });

    room.onMessage("player:item-equipped", (message: {
      playerId: string;
      itemId: string;
      ammo: number;
    }) => {
      if (message.playerId === room.sessionId && message.itemId !== "FISTS") {
        this.playEquipChime();
      }
    });
  }

  private initAudio(): void {
    if (!this.audioCtx && typeof window !== "undefined") {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
  }

  private playHealChime(): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sine";
      // Cheerful rising two-tone chime (523Hz C5 -> 659Hz E5 -> 784Hz G5)
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.18);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      // AudioContext unavailable
    }
  }

  private playEquipChime(): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "triangle";
      // High-tech weapon cocking / energy surge sound
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // AudioContext unavailable
    }
  }

  private createHealParticleTexture(): void {
    const size = 64;
    this.healParticleTexture = new DynamicTexture("heal-cross-tex", size, this.scene, false);
    const ctx = this.healParticleTexture.getContext() as CanvasRenderingContext2D;
    const center = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#10b981";

    // Green medical cross icon for healing bursts
    const armW = 8;
    const armL = 28;
    ctx.fillRect(center - armW / 2, center - armL / 2, armW, armL);
    ctx.fillRect(center - armL / 2, center - armW / 2, armL, armW);

    this.healParticleTexture.update();
  }

  private spawnHealEffect(position: Vector3): void {
    if (!this.healParticleTexture) return;

    const ps = new ParticleSystem("heal-burst", 25, this.scene);
    ps.particleTexture = this.healParticleTexture;
    ps.emitter = position.clone().addInPlace(new Vector3(0, 0.5, 0));
    ps.minEmitBox = new Vector3(-0.4, 0, -0.4);
    ps.maxEmitBox = new Vector3(0.4, 0.2, 0.4);

    ps.color1 = new Color4(0.2, 1.0, 0.5, 1.0);
    ps.color2 = new Color4(0.1, 0.8, 0.4, 0.8);
    ps.colorDead = new Color4(0.0, 0.5, 0.2, 0.0);

    ps.minSize = 0.2;
    ps.maxSize = 0.45;
    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 0.8;

    ps.emitRate = 120;
    ps.gravity = new Vector3(0, 2.5, 0); // Floats upward
    ps.direction1 = new Vector3(-0.5, 1.5, -0.5);
    ps.direction2 = new Vector3(0.5, 2.5, 0.5);

    ps.targetStopDuration = 0.25;
    ps.disposeOnStop = true;
    ps.start();
  }

  /**
   * Synchronizes visual pickup meshes with authoritative state
   */
  public updateState(itemPickupsMap?: Map<string, any> | { [key: string]: any }): void {
    if (!itemPickupsMap) return;

    const entries: Array<[string, any]> = [];
    if (typeof (itemPickupsMap as any)[Symbol.iterator] === "function") {
      for (const [id, pickup] of itemPickupsMap as any) {
        entries.push([id, pickup]);
      }
    } else {
      for (const id of Object.keys(itemPickupsMap)) {
        entries.push([id, (itemPickupsMap as any)[id]]);
      }
    }

    const seenIds = new Set<string>();

    for (const [spawnId, pickup] of entries) {
      if (!pickup || typeof pickup.x !== "number") continue;
      seenIds.add(spawnId);

      let visual = this.items.get(spawnId);
      if (!visual) {
        visual = this.createItemVisual(spawnId, pickup);
        this.items.set(spawnId, visual);
      }

      // Update availability visual state
      const isAvailable = Boolean(pickup.isAvailable);
      if (visual.isAvailable !== isAvailable) {
        visual.isAvailable = isAvailable;
        visual.meshNode.setEnabled(isAvailable);
      }
    }

    // Clean up removed pickups
    for (const [id, visual] of this.items.entries()) {
      if (!seenIds.has(id)) {
        this.disposeVisualEntry(visual);
        this.items.delete(id);
      }
    }
  }

  /**
   * Creates stylized 3D procedural meshes for items
   */
  private createItemVisual(spawnId: string, pickup: any): ItemVisualEntry {
    const rootNode = new TransformNode(`item-root-${spawnId}`, this.scene);
    rootNode.position.set(pickup.x, pickup.y, pickup.z);

    const meshNode = new TransformNode(`item-mesh-${spawnId}`, this.scene);
    meshNode.parent = rootNode;

    const itemId: string = pickup.itemId ?? "HEALTH_PACK_SMALL";
    const itemDef = GAME_ITEMS[itemId];
    const materials: StandardMaterial[] = [];
    const accentColor = itemDef?.accentColor ?? "#10b981";

    if (itemId === "HEALTH_PACK_SMALL" || itemId === "HEALTH_PACK_LARGE") {
      // 3D Glowing Medical Stim Pack
      const isLarge = itemId === "HEALTH_PACK_LARGE";
      const scale = isLarge ? 1.3 : 1.0;

      // Vertical central cylinder
      const capsule = MeshBuilder.CreateCylinder(
        `item-capsule-${spawnId}`,
        { height: 0.5 * scale, diameter: 0.28 * scale },
        this.scene,
      );
      capsule.parent = meshNode;

      const matCapsule = new StandardMaterial(`mat-capsule-${spawnId}`, this.scene);
      matCapsule.diffuseColor = Color3.FromHexString(accentColor);
      matCapsule.emissiveColor = Color3.FromHexString(accentColor).scale(0.7);
      capsule.material = matCapsule;
      materials.push(matCapsule);

      // Horizontal cross bar
      const crossH = MeshBuilder.CreateBox(
        `item-cross-h-${spawnId}`,
        { width: 0.38 * scale, height: 0.12 * scale, depth: 0.3 * scale },
        this.scene,
      );
      crossH.parent = meshNode;

      const matCross = new StandardMaterial(`mat-cross-${spawnId}`, this.scene);
      matCross.diffuseColor = new Color3(1.0, 1.0, 1.0);
      matCross.emissiveColor = new Color3(0.8, 0.8, 0.8);
      crossH.material = matCross;
      materials.push(matCross);

      // Pulsing vital ring below pickup
      const ring = MeshBuilder.CreateTorus(
        `item-ring-${spawnId}`,
        { diameter: 0.65 * scale, thickness: 0.04 * scale },
        this.scene,
      );
      ring.parent = meshNode;
      ring.position.y = -0.3 * scale;
      ring.material = matCapsule;
    } else if (itemId === "ENERGY_BLADE") {
      // Glowing Cyan Katana
      const blade = MeshBuilder.CreateBox(
        `item-blade-${spawnId}`,
        { width: 0.04, height: 0.95, depth: 0.1 },
        this.scene,
      );
      blade.parent = meshNode;
      blade.position.y = 0.3;

      const matBlade = new StandardMaterial(`mat-blade-${spawnId}`, this.scene);
      matBlade.diffuseColor = Color3.FromHexString(accentColor);
      matBlade.emissiveColor = Color3.FromHexString(accentColor).scale(0.8);
      blade.material = matBlade;
      materials.push(matBlade);

      const hilt = MeshBuilder.CreateCylinder(
        `item-hilt-${spawnId}`,
        { height: 0.25, diameter: 0.06 },
        this.scene,
      );
      hilt.parent = meshNode;
      hilt.position.y = -0.25;

      const matHilt = new StandardMaterial(`mat-hilt-${spawnId}`, this.scene);
      matHilt.diffuseColor = new Color3(0.2, 0.2, 0.25);
      hilt.material = matHilt;
      materials.push(matHilt);
    } else if (itemId === "THUNDER_HAMMER") {
      // Golden Kinetic Warhammer
      const shaft = MeshBuilder.CreateCylinder(
        `item-shaft-${spawnId}`,
        { height: 1.1, diameter: 0.07 },
        this.scene,
      );
      shaft.parent = meshNode;

      const matShaft = new StandardMaterial(`mat-shaft-${spawnId}`, this.scene);
      matShaft.diffuseColor = new Color3(0.25, 0.25, 0.3);
      shaft.material = matShaft;
      materials.push(matShaft);

      const head = MeshBuilder.CreateBox(
        `item-head-${spawnId}`,
        { width: 0.32, height: 0.28, depth: 0.48 },
        this.scene,
      );
      head.parent = meshNode;
      head.position.y = 0.48;

      const matHead = new StandardMaterial(`mat-head-${spawnId}`, this.scene);
      matHead.diffuseColor = Color3.FromHexString(accentColor);
      matHead.emissiveColor = Color3.FromHexString(accentColor).scale(0.7);
      head.material = matHead;
      materials.push(matHead);
    } else if (itemId === "PLASMA_PISTOL") {
      // Purple Plasma Blaster
      const body = MeshBuilder.CreateBox(
        `item-body-${spawnId}`,
        { width: 0.08, height: 0.15, depth: 0.45 },
        this.scene,
      );
      body.parent = meshNode;

      const matBody = new StandardMaterial(`mat-pistol-${spawnId}`, this.scene);
      matBody.diffuseColor = Color3.FromHexString(accentColor);
      matBody.emissiveColor = Color3.FromHexString(accentColor).scale(0.8);
      body.material = matBody;
      materials.push(matBody);

      const grip = MeshBuilder.CreateBox(
        `item-grip-${spawnId}`,
        { width: 0.06, height: 0.22, depth: 0.09 },
        this.scene,
      );
      grip.parent = meshNode;
      grip.position.set(0, -0.15, -0.1);
      grip.rotation.x = -0.3;

      const matGrip = new StandardMaterial(`mat-grip-${spawnId}`, this.scene);
      matGrip.diffuseColor = new Color3(0.18, 0.18, 0.22);
      grip.material = matGrip;
      materials.push(matGrip);
    }

    const isAvailable = Boolean(pickup.isAvailable);
    meshNode.setEnabled(isAvailable);

    return {
      spawnId,
      itemId,
      rootNode,
      meshNode,
      baseY: pickup.y,
      isAvailable,
      accentColor,
      materials,
    };
  }

  /**
   * Advances procedural hovering animation (rotation + sine-wave bobbing)
   */
  public update(deltaSeconds: number): void {
    this.animElapsedTime += deltaSeconds;

    const rotationStep = deltaSeconds * 1.6; // ~90 deg per second
    const bobOffset = Math.sin(this.animElapsedTime * 2.8) * 0.12;

    for (const visual of this.items.values()) {
      if (!visual.isAvailable) continue;

      visual.meshNode.rotation.y += rotationStep;
      visual.meshNode.position.y = bobOffset;
    }
  }

  private handleItemCollected(spawnId: string, itemId: string, isLocalPlayer: boolean): void {
    const visual = this.items.get(spawnId);
    if (visual) {
      visual.isAvailable = false;
      visual.meshNode.setEnabled(false);
      this.spawnHealEffect(visual.rootNode.position);
    }
    if (isLocalPlayer) {
      this.playHealChime();
    }
  }

  private handleItemRespawned(spawnId: string): void {
    const visual = this.items.get(spawnId);
    if (visual) {
      visual.isAvailable = true;
      visual.meshNode.setEnabled(true);
    }
  }

  private disposeVisualEntry(visual: ItemVisualEntry): void {
    visual.meshNode.dispose();
    visual.rootNode.dispose();
    for (const mat of visual.materials) {
      mat.dispose();
    }
  }

  public dispose(): void {
    for (const visual of this.items.values()) {
      this.disposeVisualEntry(visual);
    }
    this.items.clear();

    if (this.healParticleTexture) {
      this.healParticleTexture.dispose();
      this.healParticleTexture = null;
    }

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
