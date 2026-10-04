// ==================================================
// KEYBOARD & MOUSE INPUT PROVIDER
//
// WHAT IT DOES:
// Captures DOM keydown, keyup, and pointer events, translating raw keyboard
// inputs into normalized 8-way movement, jump, sprint, and combat actions.
//
// HOW IT WORKS:
// Maintains a Set of actively depressed key codes. On pollInput(), computes
// normalized (moveX, moveZ) from WASD/Arrows, checks Space/Shift/combat keys,
// and resets one-shot triggers.
//
// WHY IT EXISTS:
// Primary desktop control scheme. Decoupled from canvas components to ensure
// clean input testing and consistent event capture across the whole window.
// ==================================================

import type { AttackActionType, CharacterActionInput } from "../../../shared/player/PlayerConfig";
import type { IInputProvider, InputDeviceType } from "../types";

export class KeyboardMouseInputProvider implements IInputProvider {
  readonly id: InputDeviceType = "KEYBOARD_MOUSE";

  private activeKeys = new Set<string>();
  private active = false;
  private currentYaw = 0;
  private jumpPressed = false;
  private currentAttack: AttackActionType = "NONE";

  private handleKeyDown = (e: KeyboardEvent) => {
    // Avoid capturing inputs if the user is typing in an input field / textarea
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }

    this.activeKeys.add(e.code);
    this.active = true;

    if (e.code === "Space") {
      this.jumpPressed = true;
    }

    if (e.code === "KeyJ") {
      this.currentAttack = "LIGHT_PUNCH";
    } else if (e.code === "KeyK") {
      this.currentAttack = "HEAVY_PUNCH";
    } else if (e.code === "KeyL") {
      this.currentAttack = "KICK";
    } else if (e.code === "KeyI") {
      this.currentAttack = "BLOCK";
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.activeKeys.delete(e.code);
    if (e.code === "Space") {
      this.jumpPressed = false;
    }
    if (["KeyJ", "KeyK", "KeyL", "KeyI"].includes(e.code)) {
      this.currentAttack = "NONE";
    }
  };

  private handleBlur = () => {
    this.activeKeys.clear();
    this.jumpPressed = false;
    this.currentAttack = "NONE";
    this.active = false;
  };

  initialize(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
  }

  dispose(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.activeKeys.clear();
  }

  public setLookYaw(yaw: number): void {
    this.currentYaw = yaw;
  }

  pollInput(): Partial<CharacterActionInput> | null {
    const isW = this.activeKeys.has("KeyW") || this.activeKeys.has("ArrowUp");
    const isS = this.activeKeys.has("KeyS") || this.activeKeys.has("ArrowDown");
    const isA = this.activeKeys.has("KeyA") || this.activeKeys.has("ArrowLeft");
    const isD = this.activeKeys.has("KeyD") || this.activeKeys.has("ArrowRight");

    let moveX = 0;
    let moveZ = 0;

    if (isW && !isS) moveZ = 1;
    else if (isS && !isW) moveZ = -1;

    if (isA && !isD) moveX = -1;
    else if (isD && !isA) moveX = 1;

    // Optional keyboard yaw steering (Q/E for turning if mouse is inactive)
    if (this.activeKeys.has("KeyQ")) {
      this.currentYaw -= 0.05;
    }
    if (this.activeKeys.has("KeyE")) {
      this.currentYaw += 0.05;
    }

    const sprint = this.activeKeys.has("ShiftLeft") || this.activeKeys.has("ShiftRight");
    const jump = this.jumpPressed;
    const attackAction = this.currentAttack;

    if (moveX !== 0 || moveZ !== 0 || jump || sprint || attackAction !== "NONE") {
      this.active = true;
    }

    return {
      moveX,
      moveZ,
      lookYaw: this.currentYaw,
      jump,
      sprint,
      attackAction,
    };
  }

  isActive(): boolean {
    return this.active;
  }
}
