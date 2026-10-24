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
  private lastPunchHand: "LEFT" | "RIGHT" = "RIGHT";

  public onInteract?: () => void;
  public onDropWeapon?: () => void;

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

    if (e.code === "KeyE") {
      this.onInteract?.();
    } else if (e.code === "KeyG") {
      this.onDropWeapon?.();
    }

    if (e.code === "KeyJ") {
      this.currentAttack = "LEFT_PUNCH";
    } else if (e.code === "KeyI" || e.code === "KeyU") {
      this.currentAttack = "RIGHT_PUNCH";
    } else if (e.code === "KeyK") {
      this.currentAttack = "KICK";
    } else if (e.code === "KeyL" || e.code === "KeyF") {
      this.currentAttack = "PUSH";
    } else if (e.code === "KeyB") {
      this.currentAttack = "BLOCK";
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.activeKeys.delete(e.code);
    if (e.code === "Space") {
      this.jumpPressed = false;
    }
    if (["KeyJ", "KeyI", "KeyU", "KeyK", "KeyL", "KeyF", "KeyB"].includes(e.code)) {
      this.currentAttack = "NONE";
    }
  };

  private handleMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON")) {
      return;
    }

    this.active = true;

    if (e.button === 0) {
      // Left Click: Alternating 1-2 punch combo (Left Punch -> Right Punch)
      if (this.lastPunchHand === "LEFT") {
        this.currentAttack = "RIGHT_PUNCH";
        this.lastPunchHand = "RIGHT";
      } else {
        this.currentAttack = "LEFT_PUNCH";
        this.lastPunchHand = "LEFT";
      }
    } else if (e.button === 1) {
      // Middle Click: Tactical Push / Shove
      this.currentAttack = "PUSH";
    } else if (e.button === 2) {
      // Right Click: Kick
      this.currentAttack = "KICK";
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      this.currentAttack = "NONE";
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
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
    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("blur", this.handleBlur);
  }

  dispose(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("mousedown", this.handleMouseDown);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("blur", this.handleBlur);
    this.activeKeys.clear();
  }

  public setLookYaw(yaw: number): void {
    this.currentYaw = yaw;
  }

  pollInput(): Partial<CharacterActionInput> | null {
    const isW = this.activeKeys.has("KeyW") || this.activeKeys.has("ArrowUp");
    const isS = this.activeKeys.has("KeyS") || this.activeKeys.has("ArrowDown");
    const isQ = this.activeKeys.has("KeyQ");
    const isE = this.activeKeys.has("KeyE");
    const isTurnLeft = this.activeKeys.has("KeyA") || this.activeKeys.has("ArrowLeft");
    const isTurnRight = this.activeKeys.has("KeyD") || this.activeKeys.has("ArrowRight");

    let moveX = 0;
    let moveZ = 0;

    if (isW && !isS) moveZ = 1;
    else if (isS && !isW) moveZ = -1;

    // Lateral strafe via Q/E
    if (isQ && !isE) moveX = -1;
    else if (isE && !isQ) moveX = 1;

    // Keyboard yaw steering via A/D (or Left/Right Arrows)
    if (isTurnLeft) {
      this.currentYaw -= 0.05;
    }
    if (isTurnRight) {
      this.currentYaw += 0.05;
    }

    const sprint = this.activeKeys.has("ShiftLeft") || this.activeKeys.has("ShiftRight");
    const jump = this.jumpPressed;
    const attackAction = this.currentAttack;

    if (moveX !== 0 || moveZ !== 0 || isTurnLeft || isTurnRight || jump || sprint || attackAction !== "NONE") {
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
