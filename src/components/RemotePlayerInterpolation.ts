import {
  Scene,
  Vector3,
  Quaternion,
  Mesh,
  MeshBuilder,
} from "@babylonjs/core";

import {
  PHYSICS_DT_SECONDS,
  PLAYER_BOX_SIZE,
  REMOTE_INTERPOLATION_TARGET_DELAY_TICKS,
  REMOTE_INTERPOLATION_DELAY_TOLERANCE_TICKS,
  REMOTE_MAX_SNAPSHOTS,
} from "../../shared/player/PlayerConfig";

import {
  advanceMonotonicRenderTick,
  calculateInterpolationTimeScale,
  calculateInterpolationAlpha,
  interpolateHermitePosition,
  interpolateRotation,
} from "../../shared/networking/InterpolationMath";

export interface RemotePlayerSnapshot {
  serverTick: number;
  position: Vector3;
  rotation: Quaternion;
  linearVelocity: Vector3;
}

export interface RemotePlayerVisual {
  mesh: Mesh;
  snapshots: RemotePlayerSnapshot[];
}

// ==================================================
// REMOTE PLAYER SNAPSHOT INTERPOLATION
//
// Remote players are strictly visual (no client Havok).
// Stores snapshot history and renders at a monotonic
// render tick with time-dilation drift correction.
// Uses Cubic Hermite Spline for position (scaled by tickSpan dt)
// and Quaternion Slerp for orientation.
// ==================================================

export class RemotePlayerInterpolation {
  private remotePlayers = new Map<string, RemotePlayerVisual>();

  // Monotonic render clock tracking
  private latestServerTick = -1;
  private remoteRenderTick = -1;
  private isClockInitialized = false;

  // ==================================================
  // NETWORK STATE UPDATE
  //
  // Buffers unique snapshots and manages remote mesh lifecycle.
  // Never recalculates render tick from arrival timestamp.
  // ==================================================

  onNetworkStateUpdate(
    state: {
      serverTick: number;
      players: Map<string, any> | { [key: string]: any };
    },
    localSessionId: string,
    scene: Scene,
  ) {
    if (!state?.players) {
      return;
    }

    if (state.serverTick > this.latestServerTick) {
      this.latestServerTick = state.serverTick;

      // Initialize remote clock on first usable server tick
      if (!this.isClockInitialized) {
        this.remoteRenderTick = Math.max(
          0,
          state.serverTick - REMOTE_INTERPOLATION_TARGET_DELAY_TICKS,
        );
        this.isClockInitialized = true;
      }
    }

    const activeRemotePlayerIds = new Set<string>();

    // Support MapSchema, Map, and plain object iteration
    const playerEntries: Array<[string, any]> = [];
    if (
      state.players &&
      typeof (state.players as any)[Symbol.iterator] === "function"
    ) {
      for (const [playerId, playerState] of state.players as any) {
        if (playerState) {
          playerEntries.push([playerId, playerState]);
        }
      }
    } else if (
      state.players &&
      typeof (state.players as any).forEach === "function"
    ) {
      (state.players as any).forEach((playerState: any, playerId: string) => {
        if (playerState) {
          playerEntries.push([playerId, playerState]);
        }
      });
    } else if (state.players && typeof state.players === "object") {
      for (const [playerId, playerState] of Object.entries(state.players)) {
        if (playerState) {
          playerEntries.push([playerId, playerState]);
        }
      }
    }

    for (const [playerId, playerState] of playerEntries) {
      // Guard against malformed or missing state objects
      if (!playerState || typeof playerState.x !== "number") {
        continue;
      }

      // Local player is handled by LocalPlayerPrediction; skip here
      if (playerId === localSessionId) {
        continue;
      }

      activeRemotePlayerIds.add(playerId);

      let visual = this.remotePlayers.get(playerId);

      const linearVelocity = new Vector3(
        playerState.vx ?? 0,
        playerState.vy ?? 0,
        playerState.vz ?? 0,
      );

      // First time remote player appears: spawn visual mesh immediately
      if (!visual) {
        const mesh = MeshBuilder.CreateBox(
          `remote-player-${playerId}`,
          {
            width: PLAYER_BOX_SIZE.width,
            height: PLAYER_BOX_SIZE.height,
            depth: PLAYER_BOX_SIZE.depth,
          },
          scene,
        );

        mesh.position.set(playerState.x, playerState.y, playerState.z);
        mesh.rotationQuaternion = new Quaternion(
          playerState.rx,
          playerState.ry,
          playerState.rz,
          playerState.rw,
        );

        visual = {
          mesh,
          snapshots: [
            {
              serverTick: state.serverTick,
              position: new Vector3(
                playerState.x,
                playerState.y,
                playerState.z,
              ),
              rotation: new Quaternion(
                playerState.rx,
                playerState.ry,
                playerState.rz,
                playerState.rw,
              ),
              linearVelocity,
            },
          ],
        };

        this.remotePlayers.set(playerId, visual);
        continue;
      }

      // Existing player: skip duplicate ticks
      const latest = visual.snapshots[visual.snapshots.length - 1];
      if (latest && latest.serverTick === state.serverTick) {
        continue;
      }

      visual.snapshots.push({
        serverTick: state.serverTick,
        position: new Vector3(playerState.x, playerState.y, playerState.z),
        rotation: new Quaternion(
          playerState.rx,
          playerState.ry,
          playerState.rz,
          playerState.rw,
        ),
        linearVelocity,
      });

      if (visual.snapshots.length > REMOTE_MAX_SNAPSHOTS) {
        visual.snapshots.shift();
      }
    }

    // Dispose remote players no longer present
    for (const [playerId, visual] of this.remotePlayers) {
      if (!activeRemotePlayerIds.has(playerId)) {
        visual.mesh.dispose();
        this.remotePlayers.delete(playerId);
      }
    }
  }

  // ==================================================
  // MONOTONIC RENDER INTERPOLATION LOOP
  //
  // Called every render frame (60 / 120 / 144+ FPS).
  // Advances remoteRenderTick strictly forward using time dilation.
  // Interpolates between bounding snapshots using Hermite spline (position)
  // and Slerp (rotation).
  // ==================================================

  updateRender(deltaSeconds: number) {
    if (!this.isClockInitialized || this.latestServerTick < 0) {
      return;
    }

    // 1. Adaptive time scale calculation
    const currentDelay = this.latestServerTick - this.remoteRenderTick;
    const timeScale = calculateInterpolationTimeScale(
      currentDelay,
      REMOTE_INTERPOLATION_TARGET_DELAY_TICKS,
      REMOTE_INTERPOLATION_DELAY_TOLERANCE_TICKS,
    );

    // 2. Monotonic advance (strictly forward)
    const proposedTick = advanceMonotonicRenderTick(
      this.remoteRenderTick,
      deltaSeconds,
      timeScale,
    );

    // 3. Cap render clock to latest known server tick so buffer underruns
    // pause cleanly at newest snapshot instead of running into the future
    this.remoteRenderTick = Math.min(proposedTick, this.latestServerTick);

    // 4. Update each remote visual mesh
    for (const visual of this.remotePlayers.values()) {
      const count = visual.snapshots.length;

      if (count === 0) {
        continue;
      }

      visual.mesh.rotationQuaternion ??= Quaternion.Identity();

      // Exactly 1 snapshot: hold immediately
      if (count === 1) {
        visual.mesh.position.copyFrom(visual.snapshots[0].position);
        visual.mesh.rotationQuaternion.copyFrom(visual.snapshots[0].rotation);
        continue;
      }

      // Render tick before oldest snapshot: hold oldest
      if (this.remoteRenderTick <= visual.snapshots[0].serverTick) {
        visual.mesh.position.copyFrom(visual.snapshots[0].position);
        visual.mesh.rotationQuaternion.copyFrom(visual.snapshots[0].rotation);
        continue;
      }

      // Render tick at or past newest snapshot: hold newest (no extrapolation)
      if (
        this.remoteRenderTick >= visual.snapshots[count - 1].serverTick
      ) {
        visual.mesh.position.copyFrom(visual.snapshots[count - 1].position);
        visual.mesh.rotationQuaternion.copyFrom(
          visual.snapshots[count - 1].rotation,
        );
        continue;
      }

      // Locate surrounding bounding snapshots A and B
      let snapshotA = visual.snapshots[0];
      let snapshotB = visual.snapshots[count - 1];

      for (let i = 0; i < count - 1; i++) {
        if (
          visual.snapshots[i].serverTick <= this.remoteRenderTick &&
          visual.snapshots[i + 1].serverTick >= this.remoteRenderTick
        ) {
          snapshotA = visual.snapshots[i];
          snapshotB = visual.snapshots[i + 1];
          break;
        }
      }

      // Actual tick span accounts for potential skipped network packets
      const tickSpan = snapshotB.serverTick - snapshotA.serverTick;
      const snapshotDeltaTimeSeconds = tickSpan * PHYSICS_DT_SECONDS;

      const alpha = calculateInterpolationAlpha(
        this.remoteRenderTick,
        snapshotA.serverTick,
        snapshotB.serverTick,
      );

      // Cubic Hermite position interpolation with interval-scaled velocity tangents
      interpolateHermitePosition(
        snapshotA.position,
        snapshotB.position,
        snapshotA.linearVelocity,
        snapshotB.linearVelocity,
        alpha,
        snapshotDeltaTimeSeconds,
        visual.mesh.position,
      );

      // Spherical linear rotation interpolation
      interpolateRotation(
        snapshotA.rotation,
        snapshotB.rotation,
        alpha,
        visual.mesh.rotationQuaternion,
      );
    }
  }

  // ==================================================
  // CLEANUP
  // ==================================================

  dispose() {
    for (const visual of this.remotePlayers.values()) {
      visual.mesh.dispose();
    }
    this.remotePlayers.clear();
  }
}
