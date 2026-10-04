// ==================================================
// INPUT SYSTEM ARCHITECTURE & INTERFACES
//
// WHAT IT DOES:
// Defines abstract contracts for pluggable input providers (Keyboard, Gamepad, Touch)
// and centralized input device management.
//
// HOW IT WORKS:
// Each input provider translates physical or touch events into partial
// CharacterActionInput structures. The centralized CharacterInputController
// merges active inputs, manages device hot-swapping, and emits clean packets.
//
// WHY IT EXISTS:
// Decouples rendering and simulation from specific hardware input APIs.
// Allows seamless switching between keyboard, physical gamepads, and mobile touch.
// ==================================================

import type { CharacterActionInput } from "../../shared/player/PlayerConfig";

export type InputDeviceType = "KEYBOARD_MOUSE" | "GAMEPAD" | "TOUCH";

export interface IInputProvider {
  /** Unique device identifier */
  readonly id: InputDeviceType;

  /** Initialize event listeners or polling hooks */
  initialize(): void;

  /** Tear down event listeners */
  dispose(): void;

  /** Poll current hardware state and return normalized action inputs */
  pollInput(): Partial<CharacterActionInput> | null;

  /** Whether this provider had active input signals in the current/recent frame */
  isActive(): boolean;
}
