// ==================================================
// CENTRALIZED CHARACTER INPUT CONTROLLER
//
// WHAT IT DOES:
// Orchestrates all pluggable input sources (Keyboard/Mouse, Physical Gamepads,
// and Mobile Touchscreen overlays) into a unified CharacterActionInput stream.
//
// HOW IT WORKS:
// Polls registered input providers on each tick. Detects device activity to
// automatically hot-swap active input devices. Merges signals and emits
// sanitized, authoritative input commands.
//
// WHY IT EXISTS:
// Single source of input truth. Shields client prediction and server networking
// from hardware-specific event listeners and polling quirks.
// ==================================================

import type { CharacterActionInput } from "../../shared/player/PlayerConfig";
import type { IInputProvider, InputDeviceType } from "./types";
import { KeyboardMouseInputProvider } from "./providers/KeyboardMouseInputProvider";
import { GamepadInputProvider } from "./providers/GamepadInputProvider";
import { TouchVirtualGamepadProvider } from "./providers/TouchVirtualGamepadProvider";

export class CharacterInputController {
  private providers: Map<InputDeviceType, IInputProvider> = new Map();
  private activeDevice: InputDeviceType = "KEYBOARD_MOUSE";
  private onActiveDeviceChange?: (device: InputDeviceType) => void;

  readonly keyboard: KeyboardMouseInputProvider;
  readonly gamepad: GamepadInputProvider;
  readonly touch: TouchVirtualGamepadProvider;

  constructor() {
    this.keyboard = new KeyboardMouseInputProvider();
    this.gamepad = new GamepadInputProvider();
    this.touch = new TouchVirtualGamepadProvider();

    this.registerProvider(this.keyboard);
    this.registerProvider(this.gamepad);
    this.registerProvider(this.touch);
  }

  public initialize(onActiveDeviceChange?: (device: InputDeviceType) => void): void {
    this.onActiveDeviceChange = onActiveDeviceChange;
    for (const provider of this.providers.values()) {
      provider.initialize();
    }
  }

  public dispose(): void {
    for (const provider of this.providers.values()) {
      provider.dispose();
    }
    this.providers.clear();
  }

  public registerProvider(provider: IInputProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getActiveDevice(): InputDeviceType {
    return this.activeDevice;
  }

  public pollInput(): CharacterActionInput {
    // Poll all active providers
    const keyboardInput = this.keyboard.pollInput();
    const gamepadInput = this.gamepad.pollInput();
    const touchInput = this.touch.pollInput();

    // Hot-swapping device detection: prioritize device that has active non-zero signals
    let selectedInput = keyboardInput;
    let newActiveDevice: InputDeviceType = this.activeDevice;

    if (this.touch.isActive()) {
      selectedInput = touchInput;
      newActiveDevice = "TOUCH";
    } else if (this.gamepad.isActive()) {
      selectedInput = gamepadInput;
      newActiveDevice = "GAMEPAD";
    } else if (this.keyboard.isActive()) {
      selectedInput = keyboardInput;
      newActiveDevice = "KEYBOARD_MOUSE";
    }

    if (newActiveDevice !== this.activeDevice) {
      this.activeDevice = newActiveDevice;
      this.onActiveDeviceChange?.(newActiveDevice);
    }

    return {
      moveX: selectedInput?.moveX ?? 0,
      moveZ: selectedInput?.moveZ ?? 0,
      lookYaw: selectedInput?.lookYaw ?? 0,
      jump: selectedInput?.jump ?? false,
      sprint: selectedInput?.sprint ?? false,
      attackAction: selectedInput?.attackAction ?? "NONE",
    };
  }
}
