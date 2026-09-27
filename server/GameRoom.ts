import { Client, Room } from "colyseus";
import { GameState, PlayerState } from "./GameState";
import { SimulatorWorld } from "./SimulationWorld";
import type { PlayerInputCommand } from "../shared/player/PlayerConfig";

// ==================================================
// INPUT VALIDATION & CLAMPING
// ==================================================

export function validateAndClampPlayerInputCommand(
  rawInput: unknown,
  lastAcceptedSequence: number,
): PlayerInputCommand | null {
  if (!rawInput || typeof rawInput !== "object") {
    return null;
  }

  const { sequence, throttle, steering, brake } = rawInput as Record<string, unknown>;

  // Validate sequence: finite positive integer strictly newer than previously accepted sequence
  if (
    typeof sequence !== "number" ||
    !Number.isInteger(sequence) ||
    sequence <= 0 ||
    sequence <= lastAcceptedSequence
  ) {
    return null;
  }

  // Validate presence, numeric type, and finite values.
  // Reject NaN, Infinity, -Infinity, strings, null, etc.
  if (
    typeof throttle !== "number" || !Number.isFinite(throttle) ||
    typeof steering !== "number" || !Number.isFinite(steering) ||
    typeof brake !== "number" || !Number.isFinite(brake)
  ) {
    return null;
  }

  // Clamp values to their authoritative physical intention ranges.
  const sanitizedThrottle = Math.max(0, Math.min(1, throttle));
  const sanitizedSteering = Math.max(-1, Math.min(1, steering));
  const sanitizedBrake = Math.max(0, Math.min(1, brake));

  return {
    sequence,
    throttle: sanitizedThrottle,
    steering: sanitizedSteering,
    brake: sanitizedBrake,
  };
}

export class GameRoom extends Room {
  // ==================================================
  // NETWORK STATE
  //
  // This is synchronized to connected clients.
  // ==================================================

  state = new GameState();

  // Track monotonic input sequence per connected client session
  private lastAcceptedSequenceBySessionId = new Map<string, number>();

  // ==================================================
  // SERVER PHYSICS WORLD
  // ==================================================

  private simulationWorld!: SimulatorWorld;

  private syncSimulationState() {
    this.state.serverTick = this.simulationWorld.getServerTick();

    this.simulationWorld.forEachEntityState(
      (
        playerId,
        x,
        y,
        z,
        rx,
        ry,
        rz,
        rw,
        vx,
        vy,
        vz,
        avx,
        avy,
        avz,
        lastProcessedInputSequence,
      ) => {
        const currentPlayer = this.state.players.get(playerId);

        if (!currentPlayer) return;

        currentPlayer.x = x;
        currentPlayer.y = y;
        currentPlayer.z = z;
        currentPlayer.rx = rx;
        currentPlayer.ry = ry;
        currentPlayer.rz = rz;
        currentPlayer.rw = rw;
        currentPlayer.vx = vx;
        currentPlayer.vy = vy;
        currentPlayer.vz = vz;
        currentPlayer.avx = avx;
        currentPlayer.avy = avy;
        currentPlayer.avz = avz;
        currentPlayer.lastProcessedInputSequence = lastProcessedInputSequence;
      },
    );
  }

  // ==================================================
  // ROOM CREATION
  // ==================================================

  async onCreate(options: {
    serverName: string;
    serverSlot: number;
  }) {
    this.maxClients = 25;

    this.autoDispose = false;

    this.patchRate = 1000 / 30;

    this.metadata = {
      serverName: options.serverName,
      serverSlot: options.serverSlot,
    };

    this.simulationWorld = new SimulatorWorld();

    await this.simulationWorld.initialize(() => {
      this.syncSimulationState();
    });

    // Register input network message
    this.onMessage("player-input", (client, message) => {
      this.handlePlayerInput(client, message);
    });
  }

  // ==================================================
  // PLAYER INPUT HANDLING
  // ==================================================

  private handlePlayerInput(client: Client, message: unknown) {
    const lastAcceptedSeq = this.lastAcceptedSequenceBySessionId.get(client.sessionId) ?? 0;
    const sanitizedInput = validateAndClampPlayerInputCommand(message, lastAcceptedSeq);

    if (!sanitizedInput) {
      return;
    }

    // Update monotonic accepted sequence for this session
    this.lastAcceptedSequenceBySessionId.set(client.sessionId, sanitizedInput.sequence);

    // Sender identity comes strictly from client.sessionId.
    // Never accept or trust a client-supplied playerId.
    this.simulationWorld.enqueueEntityInput(client.sessionId, sanitizedInput);
  }

  // ==================================================
  // PLAYER JOIN
  // ==================================================

  onJoin(client: Client) {
    console.log("Player joined:", client.sessionId);
    this.simulationWorld.spawnEntity(client.sessionId);
    // Create the network state for this player.
    const playerState = new PlayerState();

    playerState.playerId = client.sessionId;

    // Add it to the synchronized players map.
    this.state.players.set(
      client.sessionId,
      playerState,
    );
  }

  // ==================================================
  // PLAYER LEAVE
  // ==================================================

  onLeave(client: Client) {
    console.log("Player leaving:", client.sessionId);

    this.simulationWorld.removeEntity(client.sessionId);

    // Remove synchronized network state.
    this.state.players.delete(client.sessionId);

    // Remove sequence tracking so no stale state survives
    this.lastAcceptedSequenceBySessionId.delete(client.sessionId);
  }
}