// ==================================================
// COMBAT AUDIO-VISUAL EFFECTS & FEEDBACK MANAGER
//
// WHAT IT DOES:
// Manages real-time visual sparks, procedural audio synthesis, and camera
// feedback for authoritative combat impact events:
// - Dynamic 3D particle spark bursts scaled by hit zone (Head/Crit, Torso, Limbs).
// - Zero-latency procedural Web Audio synthesis (punches, kicks, crits, whooshes).
// - Micro camera punch / shake on critical headshots.
//
// HOW IT WORKS:
// - Uses Babylon.js ParticleSystem with procedural textures for high-performance bursts.
// - Uses browser AudioContext to synthesize punch impacts without external assets.
//
// WHY IT EXISTS:
// Provides instant tactile satisfaction on hits, making combat feel juicy and responsive.
// ==================================================

import {
  Scene,
  Vector3,
  Color4,
  ParticleSystem,
  DynamicTexture,
  type ArcRotateCamera,
} from "@babylonjs/core";
import type { AttackActionType } from "../../../shared/player/PlayerConfig";
import type { HurtboxZone } from "../../../shared/combat/CombatConfig";

export class CombatEffectsManager {
  private scene: Scene;
  private audioCtx: AudioContext | null = null;
  private sparkTexture: DynamicTexture | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.createSparkTexture();
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

  private createSparkTexture(): void {
    const size = 64;
    this.sparkTexture = new DynamicTexture("combat-spark-tex", size, this.scene, false);
    const ctx = this.sparkTexture.getContext() as CanvasRenderingContext2D;
    const center = size / 2;

    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    gradient.addColorStop(0.3, "rgba(255, 220, 100, 0.9)");
    gradient.addColorStop(0.7, "rgba(255, 100, 20, 0.4)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();
    this.sparkTexture.update();
  }

  /**
   * Spawns localized visual impact spark burst at the 3D contact point.
   */
  public spawnHitSparks(
    contactPoint: Vector3,
    zone: HurtboxZone = "TORSO",
    isCritical: boolean = false,
  ): void {
    if (!this.sparkTexture) return;

    const particleSystem = new ParticleSystem("hit-sparks", isCritical ? 36 : 18, this.scene);
    particleSystem.particleTexture = this.sparkTexture;
    particleSystem.emitter = contactPoint;

    // Colors by zone
    if (isCritical || zone === "HEAD") {
      // Brilliant Gold / Yellow Critical Sparks
      particleSystem.color1 = new Color4(1.0, 0.9, 0.2, 1.0);
      particleSystem.color2 = new Color4(1.0, 0.5, 0.0, 1.0);
      particleSystem.colorDead = new Color4(0.8, 0.1, 0.0, 0.0);
      particleSystem.minSize = 0.15;
      particleSystem.maxSize = 0.35;
      particleSystem.minEmitPower = 3.5;
      particleSystem.maxEmitPower = 7.0;
    } else if (zone === "TORSO") {
      // Vivid Orange / Red Body Blow Sparks
      particleSystem.color1 = new Color4(1.0, 0.4, 0.1, 1.0);
      particleSystem.color2 = new Color4(1.0, 0.1, 0.1, 1.0);
      particleSystem.colorDead = new Color4(0.2, 0.0, 0.0, 0.0);
      particleSystem.minSize = 0.12;
      particleSystem.maxSize = 0.24;
      particleSystem.minEmitPower = 2.5;
      particleSystem.maxEmitPower = 5.0;
    } else {
      // Cool Cyan / White Glancing Limb Sparks
      particleSystem.color1 = new Color4(0.5, 0.9, 1.0, 1.0);
      particleSystem.color2 = new Color4(0.2, 0.6, 1.0, 1.0);
      particleSystem.colorDead = new Color4(0.0, 0.1, 0.3, 0.0);
      particleSystem.minSize = 0.08;
      particleSystem.maxSize = 0.18;
      particleSystem.minEmitPower = 2.0;
      particleSystem.maxEmitPower = 4.0;
    }

    particleSystem.minLifeTime = 0.12;
    particleSystem.maxLifeTime = 0.28;
    particleSystem.emitRate = 300;
    particleSystem.gravity = new Vector3(0, -9.81, 0);
    particleSystem.targetStopDuration = 0.08;
    particleSystem.disposeOnStop = true;

    particleSystem.start();
  }

  /**
   * Procedural Audio Synthesis: punch thud, headshot snap, or push whoosh.
   */
  public playHitSound(
    action: AttackActionType = "LEFT_PUNCH",
    zone: HurtboxZone = "TORSO",
    isCritical: boolean = false,
  ): void {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (isCritical || zone === "HEAD") {
        // High impact head snap / critical crack
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.start(now);
        osc.stop(now + 0.18);
      } else if (action === "PUSH") {
        // Deep whoosh shove
        osc.type = "sine";
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        // Solid body blow thud (triangle wave)
        osc.type = "triangle";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);

        gain.gain.setValueAtTime(0.30, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch {
      // Audio autoplay policy or background tab restriction - non-fatal
    }
  }

  /**
   * Applies subtle micro punch/shake to the camera on impact
   */
  public applyCameraImpact(camera: ArcRotateCamera | null, isCritical: boolean): void {
    if (!camera) return;
    const punch = isCritical ? 0.35 : 0.15;
    camera.radius = Math.max(3.0, camera.radius - punch);
  }

  public dispose(): void {
    this.sparkTexture?.dispose();
    this.sparkTexture = null;
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
