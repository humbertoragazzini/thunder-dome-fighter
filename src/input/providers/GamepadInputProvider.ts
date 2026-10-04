// ==================================================
// GAMEPAD INPUT PROVIDER
//
// WHAT IT DOES:
// Polls the HTML5 Gamepad API (navigator.getGamepads()) for connected physical
// gamepads (Xbox, PlayStation, DirectInput, or emulated gamepads).
//
// HOW IT WORKS:
// Reads analog thumbsticks with deadzone filtering to produce 360-degree analog
// locomotion and twin-stick directional aiming. Maps standard face buttons and
// triggers to jump, sprint, and combat actions.
//
// WHY IT EXISTS:
// Native console/controller support for competitive arena fighting games.
// Zero-friction plug-and-play with automatic connection detection.
// ==================================================

import type { AttackActionType, CharacterActionInput } from "../../../shared/player/PlayerConfig";
import type { IInputProvider, InputDeviceType } from "../types";

const STICK_DEADZONE = 0.15;
const AIM_STICK_DEADZONE = 0.25;

export class GamepadInputProvider implements IInputProvider {
  readonly id: InputDeviceType = "GAMEPAD";

  private active = false;
  private currentYaw = 0;

  initialize(): void {
    // Gamepad API is polled on-demand each frame; no event listeners required
  }

  dispose(): void {
    this.active = false;
  }

  private applyDeadzone(value: number, threshold: number): number {
    if (Math.abs(value) < threshold) {
      return 0;
    }
    // Remap remaining range [threshold, 1.0] to [0.0, 1.0]
    const sign = Math.sign(value);
    return sign * ((Math.abs(value) - threshold) / (1.0 - threshold));
  }

  pollInput(): Partial<CharacterActionInput> | null {
    if (typeof navigator === "undefined" || !navigator.getGamepads) {
      return null;
    }

    const gamepads = navigator.getGamepads();
    let activeGamepad: Gamepad | null = null;

    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && gp.connected) {
        activeGamepad = gp;
        break;
      }
    }

    if (!activeGamepad) {
      this.active = false;
      return null;
    }

    // Left Stick: Locomotion
    const rawX = activeGamepad.axes[0] ?? 0;
    const rawY = activeGamepad.axes[1] ?? 0;
    const moveX = this.applyDeadzone(rawX, STICK_DEADZONE);
    // Invert Y axis: thumbstick pushed forward is -1.0 in Gamepad API
    const moveZ = this.applyDeadzone(-rawY, STICK_DEADZONE);

    // Right Stick: Twin-Stick Look / Aim Direction
    const rawLookX = activeGamepad.axes[2] ?? 0;
    const rawLookY = activeGamepad.axes[3] ?? 0;
    const lookMagSq = rawLookX * rawLookX + rawLookY * rawLookY;

    if (lookMagSq > AIM_STICK_DEADZONE * AIM_STICK_DEADZONE) {
      // Invert Y so forward (+Z) is up
      this.currentYaw = Math.atan2(rawLookX, -rawLookY);
      this.active = true;
    }

    // Buttons mapping (Standard Gamepad Mapping)
    // 0: A / Cross (Jump)
    // 1: B / Circle (Kick)
    // 2: X / Square (Light Punch)
    // 3: Y / Triangle (Heavy Punch)
    // 4: L1 / LB (Block)
    // 5: R1 / RB (Sprint)
    // 6: L2 / LT (Block alternate)
    // 7: R2 / RT (Sprint alternate)
    // 10: L3 / Left Stick Click (Sprint toggle)
    const isPressed = (index: number) => {
      const btn = activeGamepad!.buttons[index];
      return btn ? btn.pressed || btn.value > 0.5 : false;
    };

    const jump = isPressed(0);
    const sprint = isPressed(5) || isPressed(7) || isPressed(10);

    let attackAction: AttackActionType = "NONE";
    if (isPressed(2)) {
      attackAction = "LIGHT_PUNCH";
    } else if (isPressed(3)) {
      attackAction = "HEAVY_PUNCH";
    } else if (isPressed(1)) {
      attackAction = "KICK";
    } else if (isPressed(4) || isPressed(6)) {
      attackAction = "BLOCK";
    }

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
