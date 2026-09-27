import { useEffect, useRef } from "react";

import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  Color4,
  MeshBuilder,
  Quaternion,
  HavokPlugin,
} from "@babylonjs/core";

import HavokPhysics from "@babylonjs/havok";

import { useAppStore } from "../store/useAppStore";
import { LocalPlayerPrediction } from "./LocalPlayerPrediction";
import { RemotePlayerInterpolation } from "./RemotePlayerInterpolation";
import {
  PLAYER_BOX_SIZE,
  FLOOR_SIZE,
  FLOOR_POSITION,
  GRAVITY,
  type PlayerInput,
  type PlayerInputCommand,
} from "../../shared/vehicle/TestVehicleConfig";

interface BabylonCanvasProps {
  onSceneReady?: (scene: Scene) => void;
}

export function BabylonCanvas({ onSceneReady }: BabylonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  const localPredictionRef = useRef<LocalPlayerPrediction | null>(null);
  const remoteInterpolationRef = useRef<RemotePlayerInterpolation | null>(null);
  const stateChangeHandlerRef = useRef<((state: any) => void) | null>(null);

  const room = useAppStore((state) => state.room);
  const setReady = useAppStore((state) => state.setReady);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let disposed = false;

    // Track currently held keyboard inputs
    const activeCodes = new Set<string>();
    const currentHeldInput: PlayerInput = {
      throttle: 0,
      steering: 0,
      brake: 0,
    };

    const updateHeldInput = () => {
      const isW = activeCodes.has("KeyW");
      const isS = activeCodes.has("KeyS");
      const isA = activeCodes.has("KeyA");
      const isD = activeCodes.has("KeyD");

      currentHeldInput.throttle = isW ? 1 : 0;
      currentHeldInput.brake = isS ? 1 : 0;

      if (isA && isD) {
        currentHeldInput.steering = 0;
      } else if (isA) {
        currentHeldInput.steering = -1;
      } else if (isD) {
        currentHeldInput.steering = 1;
      } else {
        currentHeldInput.steering = 0;
      }
    };

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

      // Visible local player mesh (smoothly follows predicted present state)
      const localPlayerMesh = MeshBuilder.CreateBox(
        "local-player",
        {
          width: PLAYER_BOX_SIZE.width,
          height: PLAYER_BOX_SIZE.height,
          depth: PLAYER_BOX_SIZE.depth,
        },
        scene,
      );

      localPlayerMesh.position.set(0, 1, 0);
      localPlayerMesh.rotationQuaternion = Quaternion.Identity();

      // Static floor visual mesh
      const floor = MeshBuilder.CreateBox(
        "floor",
        {
          width: FLOOR_SIZE.width,
          height: FLOOR_SIZE.height,
          depth: FLOOR_SIZE.depth,
        },
        scene,
      );

      floor.position.set(
        FLOOR_POSITION.x,
        FLOOR_POSITION.y,
        FLOOR_POSITION.z,
      );

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

      camera.attachControl(canvas, true);

      // Prevent WASD from rotating the camera
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
        (command: PlayerInputCommand) => {
          room?.send("player-input", command);
        },
      );
      localPredictionRef.current = localPrediction;

      const remoteInterpolation = new RemotePlayerInterpolation();
      remoteInterpolationRef.current = remoteInterpolation;

      // ==================================================
      // COLYSEUS STATE SYNCHRONIZATION
      // ==================================================

      const handleStateChange = (state: any) => {
        if (!state?.players || !room) {
          return;
        }

        const localState =
          typeof state.players.get === "function"
            ? state.players.get(room.sessionId)
            : state.players[room.sessionId];

        if (localState) {
          localPrediction.handleAuthoritativeState(
            localState,
            state.serverTick ?? 0,
            localPlayerMesh,
          );
        }

        remoteInterpolation.onNetworkStateUpdate(
          state,
          room.sessionId,
          scene,
        );
      };

      if (room) {
        room.onStateChange(handleStateChange);
        stateChangeHandlerRef.current = handleStateChange;

        // Process already-synchronized state immediately if available upon mount
        if (room.state) {
          handleStateChange(room.state);
        }
      }

      if (disposed) {
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
      // 2. Smooth visible local player mesh toward corrected prediction
      // 3. Smooth remote players via continuous fractional interpolation
      // 4. Render Babylon scene
      // ==================================================

      engine.runRenderLoop(() => {
        const deltaSeconds = engine.getDeltaTime() / 1000;

        // 1. Fixed 30 Hz local prediction loop
        localPrediction.updatePrediction(currentHeldInput, deltaSeconds);

        // 2. Frame-rate-independent visual smoothing
        localPrediction.updateVisualSmoothing(
          localPlayerMesh,
          deltaSeconds,
        );

        // 3. Monotonic remote interpolation with time dilation
        remoteInterpolation.updateRender(deltaSeconds);

        // 4. Render scene
        scene.render();
      });
    }

    initializeBabylon();

    // ==================================================
    // WINDOW & INPUT EVENT LISTENERS
    // ==================================================

    const handleResize = () => {
      engineRef.current?.resize();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD"
      ) {
        activeCodes.add(event.code);
        updateHeldInput();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (
        event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD"
      ) {
        activeCodes.delete(event.code);
        updateHeldInput();
      }
    };

    // Prevent stuck throttle / steering when browser loses focus
    const handleBlur = () => {
      activeCodes.clear();
      currentHeldInput.throttle = 0;
      currentHeldInput.steering = 0;
      currentHeldInput.brake = 0;

      // Dispatches immediate neutral command over WebSocket without unsimulated pendingInputs push
      localPredictionRef.current?.sendNeutralInput();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    // ==================================================
    // CLEANUP
    // ==================================================

    return () => {
      disposed = true;

      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);

      // Clean up Colyseus signal listener explicitly without removeAllListeners()
      if (room && stateChangeHandlerRef.current) {
        room.onStateChange.remove(stateChangeHandlerRef.current);
        stateChangeHandlerRef.current = null;
      }

      localPredictionRef.current?.dispose();
      localPredictionRef.current = null;

      remoteInterpolationRef.current?.dispose();
      remoteInterpolationRef.current = null;

      sceneRef.current?.dispose();
      engineRef.current?.dispose();

      sceneRef.current = null;
      engineRef.current = null;

      setReady(false);
    };
  }, [room, onSceneReady, setReady]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block outline-none touch-none"
    />
  );
}