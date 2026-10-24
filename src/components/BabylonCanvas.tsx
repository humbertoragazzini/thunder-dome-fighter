// ==================================================
// BABYLON CANVAS 3D VIEWPORT & PREDICTION HOST
//
// WHAT IT DOES:
// Mounts the authoritative Babylon.js WebGL/WebGPU engine, initializes local
// Havok physics prediction, manages remote opponent interpolation, and orchestrates
// centralized multi-device player input (keyboard, gamepad, touchscreen).
//
// HOW IT WORKS:
// - Initializes headless Havok wasm plugin on the Babylon Scene with manual stepping.
// - Spawns upright humanoid capsule visual mesh (1.1m height, 0.4m radius) for local player.
// - Integrates CharacterInputController to poll hot-swappable keyboard/mouse, physical gamepad,
//   and mobile TouchGamepadOverlay virtual controls.
// - Advances 30 Hz fixed local prediction and decays visual discrepancy offsets.
// - Drives remote player monotonic snapshot interpolation with time dilation.
//
// WHY IT EXISTS:
// Primary game screen viewport. Bridges high-frequency input sampling, client prediction,
// authoritative network states, and smooth 60+ FPS visual rendering.
// ==================================================

import { useEffect, useRef, useState } from "react";

import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  Color4,
  Quaternion,
  HavokPlugin,
} from "@babylonjs/core";

import HavokPhysics from "@babylonjs/havok";

import { useAppStore } from "../store/useAppStore";
import { LocalPlayerPrediction } from "./LocalPlayerPrediction";
import { RemotePlayerInterpolation } from "./RemotePlayerInterpolation";
import { CharacterInputController } from "../input/CharacterInputController";
import type { TouchVirtualGamepadProvider } from "../input/providers/TouchVirtualGamepadProvider";
import { TouchGamepadOverlay } from "./ui/organisms/TouchGamepadOverlay";
import { CharacterVisualRig } from "../visuals/character/CharacterVisualRig";
import { HERO_PALETTE } from "../visuals/character/CharacterRigConfig";
import { LevelVisualLoader } from "../visuals/level/LevelVisualLoader";
import { CombatEffectsManager } from "../visuals/combat/CombatEffectsManager";
import { ItemVisualManager } from "../visuals/items/ItemVisualManager";
import {
  GRAVITY,
  type CharacterInputCommand,
  type PlayerInputCommand,
} from "../../shared/player/PlayerConfig";

interface BabylonCanvasProps {
  onSceneReady?: (scene: Scene) => void;
}

export function BabylonCanvas({ onSceneReady }: BabylonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  const localPredictionRef = useRef<LocalPlayerPrediction | null>(null);
  const remoteInterpolationRef = useRef<RemotePlayerInterpolation | null>(null);
  const inputControllerRef = useRef<CharacterInputController | null>(null);
  const localPlayerRigRef = useRef<CharacterVisualRig | null>(null);
  const levelVisualLoaderRef = useRef<LevelVisualLoader | null>(null);
  const combatEffectsRef = useRef<CombatEffectsManager | null>(null);
  const itemVisualManagerRef = useRef<ItemVisualManager | null>(null);
  const stateChangeHandlerRef = useRef<((state: any) => void) | null>(null);

  const [touchProvider, setTouchProvider] = useState<TouchVirtualGamepadProvider | null>(null);

  const room = useAppStore((state) => state.room);
  const setReady = useAppStore((state) => state.setReady);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let disposed = false;

    // Centralized multi-device input controller
    const inputController = new CharacterInputController();
    inputController.keyboard.onInteract = () => {
      room?.send("player:interact");
    };
    inputController.keyboard.onDropWeapon = () => {
      room?.send("player:drop-weapon");
    };
    inputController.initialize();
    inputControllerRef.current = inputController;
    setTouchProvider(inputController.touch);

    async function initializeBabylon() {
      // ==================================================
      // ENGINE & SCENE
      // ==================================================

      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });

      engineRef.current = engine;

      const scene = new Scene(engine);
      sceneRef.current = scene;

      scene.clearColor = new Color4(0.08, 0.09, 0.12, 1.0);

      // ==================================================
      // HAVOK PHYSICS (CLIENT PREDICTION WORLD)
      //
      // Enable Havok on the existing scene, but disable automatic
      // scene stepping so physics is manually controlled by the
      // 30 Hz fixed accumulator and reconciliation replay.
      // ==================================================

      const havokInstance = await HavokPhysics();
      const havokPlugin = new HavokPlugin(true, havokInstance);

      scene.enablePhysics(
        new Vector3(GRAVITY.x, GRAVITY.y, GRAVITY.z),
        havokPlugin,
      );
      scene.physicsEnabled = false;

      // ==================================================
      // VISUAL MESHES
      // ==================================================

      // Articulated 15-cube humanoid character rig (Approach B)
      const localPlayerRig = new CharacterVisualRig(
        "local-player",
        scene,
        HERO_PALETTE,
      );
      localPlayerRig.rootNode.position.set(0, 1, 0);
      localPlayerRig.rootNode.rotationQuaternion = Quaternion.Identity();
      localPlayerRigRef.current = localPlayerRig;

      // Modular Arena Environment Visuals (Circular floor, platforms, forcefield, sky, lights)
      const levelVisualLoader = new LevelVisualLoader(scene);
      levelVisualLoaderRef.current = levelVisualLoader;

      // ==================================================
      // CAMERA & LIGHT
      // ==================================================

      const camera = new ArcRotateCamera(
        "camera",
        -Math.PI / 2,
        Math.PI / 3,
        10,
        Vector3.Zero(),
        scene,
      );

      camera.lockedTarget = localPlayerRig.rootNode;
      camera.attachControl(canvas, true);

      // Prevent WASD and Arrow keys from rotating the camera
      camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

      const light = new HemisphericLight(
        "light",
        new Vector3(0, 1, 0),
        scene,
      );
      light.intensity = 0.9;

      // ==================================================
      // PREDICTION & INTERPOLATION MANAGERS
      // ==================================================

      const localPrediction = new LocalPlayerPrediction(
        scene,
        havokPlugin,
        (command: CharacterInputCommand | PlayerInputCommand) => {
          room?.send("player-input", command);
        },
      );
      localPredictionRef.current = localPrediction;

      const remoteInterpolation = new RemotePlayerInterpolation();
      remoteInterpolationRef.current = remoteInterpolation;

      const combatEffects = new CombatEffectsManager(scene);
      combatEffectsRef.current = combatEffects;

      const itemVisualManager = new ItemVisualManager(scene, room);
      itemVisualManagerRef.current = itemVisualManager;

      // ==================================================
      // COLYSEUS STATE SYNCHRONIZATION
      // ==================================================

      const handleStateChange = (state: any) => {
        if (!state?.players || !room) {
          return;
        }

        if (state.itemPickups) {
          itemVisualManager.updateState(state.itemPickups);
        }

        const localState =
          typeof state.players.get === "function"
            ? state.players.get(room.sessionId)
            : state.players[room.sessionId];

        if (localState) {
          localPrediction.handleAuthoritativeState(
            localState,
            state.serverTick ?? 0,
            localPlayerRig.rootNode,
          );

          // Local ragdoll handling on knockout / respawn
          if (localState.isDead && !localPlayerRig.getIsRagdoll()) {
            localPlayerRig.triggerRagdoll();
          } else if (!localState.isDead && localPlayerRig.getIsRagdoll()) {
            localPlayerRig.resetFromRagdoll();
          }
        }

        remoteInterpolation.onNetworkStateUpdate(
          state,
          room.sessionId,
          scene,
          localState?.teamIndex,
        );
      };

      if (room) {
        room.onStateChange(handleStateChange);
        stateChangeHandlerRef.current = handleStateChange;

        // Authoritative combat event listener
        room.onMessage("combat:damage-applied", (event: any) => {
          if (!event?.hitPoint) return;
          const hitVec = new Vector3(event.hitPoint.x, event.hitPoint.y, event.hitPoint.z);
          combatEffects.spawnHitSparks(hitVec, event.hitZone, event.isCritical);
          combatEffects.playHitSound(event.attackAction, event.hitZone, event.isCritical);

          const isLocalVictim = event.victimPlayerId === room.sessionId;
          const victimRig = isLocalVictim
            ? localPlayerRig
            : remoteInterpolation.getRemoteRig(event.victimPlayerId);

          if (victimRig) {
            victimRig.triggerFlinch(event.hitZone);
            if (event.remainingHealth <= 0) {
              const knockbackVec = event.knockbackForce
                ? new Vector3(event.knockbackForce.x, event.knockbackForce.y, event.knockbackForce.z)
                : undefined;
              victimRig.triggerRagdoll(knockbackVec);
            }
          }

          if (isLocalVictim) {
            const camera = scene.activeCamera as ArcRotateCamera;
            combatEffects.applyCameraImpact(camera, event.isCritical);
          }
        });

        // Process already-synchronized state immediately if available upon mount
        if (room.state) {
          handleStateChange(room.state);
        }
      }

      if (disposed) {
        localPlayerRig.dispose();
        combatEffects.dispose();
        itemVisualManager.dispose();
        scene.dispose();
        engine.dispose();
        return;
      }

      setReady(true);
      onSceneReady?.(scene);

      // ==================================================
      // RENDER LOOP
      //
      // Runs at native display refresh rate (60 / 120 / 144+ FPS):
      // 1. Advance fixed 30 Hz local prediction physics
      // 2. Smooth visible local player rig toward corrected prediction
      // 3. Drive procedural limb swings & combat strikes
      // 4. Smooth remote players via continuous fractional interpolation
      // 5. Render Babylon scene
      // ==================================================

      engine.runRenderLoop(() => {
        const deltaSeconds = engine.getDeltaTime() / 1000;
        const currentInput = inputController.pollInput();

        // 1. Fixed 30 Hz local prediction loop
        localPrediction.updatePrediction(currentInput, deltaSeconds);

        // 2. Frame-rate-independent visual smoothing
        localPrediction.updateVisualSmoothing(
          localPlayerRig.rootNode,
          deltaSeconds,
        );

        const localState = room?.state?.players
          ? typeof room.state.players.get === "function"
            ? room.state.players.get(room.sessionId)
            : room.state.players[room.sessionId]
          : null;

        // Synchronize equipped weapon on local character rig
        localPlayerRig.attachWeapon(localState?.heldItemId ?? "FISTS");

        // Animate floating arena item pickups
        itemVisualManager.update(deltaSeconds);

        // 3. Procedural biped locomotion and combat gestures
        localPlayerRig.update(
          deltaSeconds,
          localPrediction.getLinearVelocity(),
          localPrediction.getIsGrounded(),
          currentInput.sprint,
          currentInput.attackAction,
          Boolean(localState?.isStunned),
        );

        // 4. Monotonic remote interpolation with time dilation
        remoteInterpolation.updateRender(deltaSeconds);

        // 5. Render scene
        scene.render();
      });
    }

    initializeBabylon();

    // ==================================================
    // WINDOW LISTENERS
    // ==================================================

    const handleResize = () => {
      engineRef.current?.resize();
    };

    // Dispatches immediate neutral command over WebSocket without unsimulated pendingInputs push
    const handleBlur = () => {
      localPredictionRef.current?.sendNeutralInput();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("blur", handleBlur);

    // ==================================================
    // CLEANUP
    // ==================================================

    return () => {
      disposed = true;

      window.removeEventListener("resize", handleResize);
      window.removeEventListener("blur", handleBlur);

      inputController.dispose();
      inputControllerRef.current = null;
      setTouchProvider(null);

      // Clean up Colyseus signal listener explicitly without removeAllListeners()
      if (room && stateChangeHandlerRef.current) {
        room.onStateChange.remove(stateChangeHandlerRef.current);
        stateChangeHandlerRef.current = null;
      }

      localPlayerRigRef.current?.dispose();
      localPlayerRigRef.current = null;

      levelVisualLoaderRef.current?.dispose();
      levelVisualLoaderRef.current = null;

      localPredictionRef.current?.dispose();
      localPredictionRef.current = null;

      remoteInterpolationRef.current?.dispose();
      remoteInterpolationRef.current = null;

      combatEffectsRef.current?.dispose();
      combatEffectsRef.current = null;

      itemVisualManagerRef.current?.dispose();
      itemVisualManagerRef.current = null;

      sceneRef.current?.dispose();
      engineRef.current?.dispose();

      sceneRef.current = null;
      engineRef.current = null;

      setReady(false);
    };
  }, [room, onSceneReady, setReady]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full block outline-none touch-none"
      />
      {touchProvider && <TouchGamepadOverlay touchProvider={touchProvider} />}
    </div>
  );
}