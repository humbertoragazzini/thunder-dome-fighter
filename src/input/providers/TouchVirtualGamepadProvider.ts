// ==================================================
// TOUCH VIRTUAL GAMEPAD INPUT PROVIDER
//
// WHAT IT DOES:
// Bridges touchscreen multi-touch events, on-screen virtual joysticks, and
// action buttons (such as virtual-gamepad-lib) into the centralized input system.
//
// HOW IT WORKS:
// Touch overlays push normalized motion vectors and button activations directly
// to this provider. On pollInput(), yields active touch signals and reports
// whether touch controls are actively being held.
//
// WHY IT EXISTS:
// First-class mobile and tablet browser gameplay support. Enables smooth 360-degree
// analog locomotion on smartphones without needing a physical controller or keyboard.
// ==================================================

import type { AttackActionType, CharacterActionInput } from "../../../shared/player/PlayerConfig";
import type { IInputProvider, InputDeviceType } from "../types";

export class TouchVirtualGamepadProvider implements IInputProvider {
  readonly id: InputDeviceType = "TOUCH";

  private active = false;
  private moveX = 0;
  private moveZ = 0;
  private lookYaw = 0;
  private jump = false;
  private sprint = false;
  private attackAction: AttackActionType = "NONE";

  initialize(): void {
    this.reset();
  }

  dispose(): void {
    this.reset();
  }

  public reset(): void {
    this.moveX = 0;
    this.moveZ = 0;
    this.jump = false;
    this.sprint = false;
    this.attackAction = "NONE";
    this.active = false;
  }

  public setMove(moveX: number, moveZ: number): void {
    this.moveX = Math.max(-1, Math.min(1, moveX));
    this.moveZ = Math.max(-1, Math.min(1, moveZ));
    if (this.moveX !== 0 || this.moveZ !== 0) {
      this.active = true;
    }
  }

  public setLookYaw(yaw: number): void {
    this.lookYaw = yaw;
    this.active = true;
  }

  public setJump(active: boolean): void {
    this.jump = active;
    if (active) this.active = true;
  }

  public setSprint(active: boolean): void {
    this.sprint = active;
    if (active) this.active = true;
  }

  public setAttackAction(action: AttackActionType): void {
    this.attackAction = action;
    if (action !== "NONE") this.active = true;
  }

  pollInput(): Partial<CharacterActionInput> | null {
    return {
      moveX: this.moveX,
      moveZ: this.moveZ,
      lookYaw: this.lookYaw,
      jump: this.jump,
      sprint: this.sprint,
      attackAction: this.attackAction,
    };
  }

  isActive(): boolean {
    return this.active;
  }
}
