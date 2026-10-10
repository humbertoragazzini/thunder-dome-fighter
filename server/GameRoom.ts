// ==================================================
// AUTHORITATIVE MULTIPLAYER GAME ROOM
//
// WHAT IT DOES:
// Manages the real-time Colyseus room lifecycle, WebSocket authentication
// handshake, input ingestion, and synchronized authoritative game state.
//
// HOW IT WORKS:
// - onAuth: Verifies JWT token, active PostgreSQL session, and prevents duplicate player connections.
// - onJoin: Enforces single-session invariant, spawns Havok capsule, balances teams, and triggers COUNTDOWN.
// - handlePlayerInput: Validates sequence numbers, sanitizes inputs, and gates commands to PLAYING state.
// - syncSimulationState: Broadcasts physics body transforms to all clients at 60 Hz.
// - Match State Machine: Authoritatively manages WAITING -> COUNTDOWN -> PLAYING -> MATCH_END.
// - onLeave: Despawns entities, aborts countdown or awards forfeit win if players drop.
// - onDispose: Disposes headless Havok physics world, clears timers, and frees memory.
//
// WHY IT EXISTS:
// Serves as the authoritative master simulation node. The server dictates
// physics, positions, health, and outcomes; clients stream inputs only.
// ==================================================

import { type Client, Room, ServerError } from "colyseus";
import { GameState, PlayerState } from "./GameState";
import { SimulatorWorld } from "./SimulationWorld";
import {
  type PlayerInputCommand,
  type CharacterInputCommand,
  type AttackActionType,
  PHYSICS_DT_MS,
} from "../shared/player/PlayerConfig";
import { verifySessionToken, type AuthenticatedUser } from "./auth/TokenVerifier.ts";
import { resolveSpawnPoint } from "../shared/levels/SpawnPointResolver";
import { GAME_MODES, type GameMode, type GameModeId } from "../shared/domain/GameMode";
import { LEVELS, type LevelDefinition } from "../shared/domain/Level";
import { assignPlayerTeam } from "../shared/match/TeamAssignment";

export interface GameRoomOptions {
  serverName?: string;
  serverSlot?: number;
  modeId?: GameModeId;
  levelId?: string;
}

// ==================================================
// INPUT VALIDATION & CLAMPING
// ==================================================

export function validateAndClampPlayerInputCommand(
  rawInput: unknown,
  lastAcceptedSequence: number,
): CharacterInputCommand | PlayerInputCommand | null {
  if (!rawInput || typeof rawInput !== "object") {
    return null;
  }

  const data = rawInput as Record<string, unknown>;
  const sequence = data.sequence;

  // Validate sequence: finite positive integer strictly newer than previously accepted sequence
  if (
    typeof sequence !== "number" ||
    !Number.isInteger(sequence) ||
    sequence <= 0 ||
    sequence <= lastAcceptedSequence
  ) {
    return null;
  }

  // Modern humanoid input detection (moveX or moveZ or lookYaw present)
  if ("moveX" in data || "moveZ" in data) {
    const moveX =
      typeof data.moveX === "number" && Number.isFinite(data.moveX)
        ? data.moveX
        : 0;
    const moveZ =
      typeof data.moveZ === "number" && Number.isFinite(data.moveZ)
        ? data.moveZ
        : 0;
    const lookYaw =
      typeof data.lookYaw === "number" && Number.isFinite(data.lookYaw)
        ? data.lookYaw
        : 0;
    const jump = typeof data.jump === "boolean" ? data.jump : false;
    const sprint = typeof data.sprint === "boolean" ? data.sprint : false;
    const attackAction =
      typeof data.attackAction === "string" &&
      ["NONE", "LIGHT_PUNCH", "HEAVY_PUNCH", "KICK", "BLOCK"].includes(
        data.attackAction,
      )
        ? (data.attackAction as AttackActionType)
        : "NONE";

    // Normalize lookYaw to [0, 2*PI)
    const twoPi = Math.PI * 2;
    const normalizedYaw = ((lookYaw % twoPi) + twoPi) % twoPi;

    return {
      sequence,
      moveX: Math.max(-1, Math.min(1, moveX)),
      moveZ: Math.max(-1, Math.min(1, moveZ)),
      lookYaw: normalizedYaw,
      jump,
      sprint,
      attackAction,
    };
  }

  // Fallback: Legacy vehicle input validation
  const { throttle, steering, brake } = data;
  if (
    typeof throttle !== "number" ||
    !Number.isFinite(throttle) ||
    typeof steering !== "number" ||
    !Number.isFinite(steering) ||
    typeof brake !== "number" ||
    !Number.isFinite(brake)
  ) {
    return null;
  }

  return {
    sequence,
    throttle: Math.max(0, Math.min(1, throttle)),
    steering: Math.max(-1, Math.min(1, steering)),
    brake: Math.max(0, Math.min(1, brake)),
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

  // Match state machine timers
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private matchDurationTimer: ReturnType<typeof setInterval> | null = null;
  public static readonly COUNTDOWN_DURATION_SEC = 3;
  public static readonly MATCH_DURATION_SEC = 180;

  // ==================================================
  // SERVER PHYSICS WORLD & GAME RULES
  // ==================================================

  private simulationWorld!: SimulatorWorld;
  private gameMode!: GameMode;
  private level!: LevelDefinition;

  getGameMode(): GameMode {
    return this.gameMode;
  }

  getLevel(): LevelDefinition {
    return this.level;
  }

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

  async onCreate(options: GameRoomOptions = {}) {
    const requestedModeId = options.modeId && options.modeId in GAME_MODES ? options.modeId : "1v1";
    this.gameMode = GAME_MODES[requestedModeId];

    const requestedLevelId = options.levelId && options.levelId in LEVELS ? options.levelId : "thunder-dome-alpha";
    this.level = LEVELS[requestedLevelId];

    this.maxClients = this.gameMode.maxPlayers;
    this.autoDispose = false;
    this.patchRate = PHYSICS_DT_MS;

    this.state.modeId = this.gameMode.id;
    this.state.levelId = this.level.id;
    this.state.matchStatus = "WAITING_FOR_PLAYERS";
    this.state.countdownSeconds = 0;
    this.state.remainingTimeSeconds = GameRoom.MATCH_DURATION_SEC;
    this.state.winningTeamIndex = -1;
    this.state.winningPlayerId = "";

    if ((this as any)._listing) {
      this.metadata = {
        serverName: options.serverName ?? "Thunder Dome Arena",
        serverSlot: options.serverSlot ?? 1,
        modeId: this.gameMode.id,
        levelId: this.level.id,
      };
    }

    this.simulationWorld = new SimulatorWorld(this.level);

    await this.simulationWorld.initialize(() => {
      this.syncSimulationState();
    });

    // Register input network message
    this.onMessage("player-input", (client, message) => {
      this.handlePlayerInput(client, message);
    });
  }

  // ==================================================
  // WEBSOCKET AUTHENTICATION HOOK
  // ==================================================

  async onAuth(client: Client, options: unknown): Promise<AuthenticatedUser> {
    const token =
      typeof options === "object" && options !== null && "token" in options
        ? (options as { token: unknown }).token
        : undefined;

    if (!token || typeof token !== "string") {
      throw new ServerError(401, "Authentication token required to enter arena.");
    }

    let user: AuthenticatedUser;
    try {
      user = await verifySessionToken(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid session token.";
      throw new ServerError(401, message);
    }

    // Prevent duplicate active connections for the same player identity in this room
    if (this.clients && Array.isArray(this.clients)) {
      const isAlreadyConnected = this.clients.some(
        (existingClient) =>
          existingClient !== client &&
          (existingClient.auth as AuthenticatedUser | undefined)?.playerId === user.playerId,
      );

      if (isAlreadyConnected) {
        throw new ServerError(409, `Player ${user.playerName} is already active in this match.`);
      }
    }

    return user;
  }

  // ==================================================
  // PLAYER INPUT HANDLING
  // ==================================================

  private handlePlayerInput(client: Client, message: unknown) {
    // Authoritative Invariant: Physical inputs are strictly rejected unless in PLAYING state
    if (this.state.matchStatus !== "PLAYING") {
      return;
    }

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

  onJoin(client: Client, options?: unknown) {
    const auth = client.auth as AuthenticatedUser;
    console.log(`🎮 Player joined: ${auth.playerName} (${auth.playerId}) [Session: ${client.sessionId}]`);

    // Defensive redundancy: Prevent duplicate active connections for the same player identity
    if (auth?.playerId && this.clients && Array.isArray(this.clients)) {
      const isDuplicate = this.clients.some(
        (existingClient) =>
          existingClient !== client &&
          (existingClient.auth as AuthenticatedUser | undefined)?.playerId === auth.playerId,
      );

      if (isDuplicate) {
        throw new ServerError(409, `Player ${auth.playerName} is already active in this match.`);
      }
    }

    // Ensure client is tracked in this.clients (for headless test environments)
    if (this.clients && !this.clients.includes(client)) {
      this.clients.push(client);
    }

    // Optional requested team index from client join options
    const requestedTeam =
      typeof options === "object" &&
      options !== null &&
      "teamIndex" in options &&
      typeof (options as Record<string, unknown>).teamIndex === "number"
        ? (options as { teamIndex: number }).teamIndex
        : undefined;

    // Deterministically assign player to a team and slot
    const teamAssignment = assignPlayerTeam(
      this.gameMode,
      this.state.players.values(),
      requestedTeam,
    );

    // Deterministically resolve starting spawn location based on team affinity and slot
    const spawnPoint = resolveSpawnPoint(
      this.level,
      teamAssignment.slotInTeam,
      teamAssignment.teamIndex >= 0 ? teamAssignment.teamIndex : undefined,
    );

    this.simulationWorld.spawnEntity(client.sessionId, spawnPoint);

    // Create the network state for this player.
    const playerState = new PlayerState();
    playerState.playerId = client.sessionId;
    playerState.teamIndex = teamAssignment.teamIndex;
    playerState.x = spawnPoint.position.x;
    playerState.y = spawnPoint.position.y;
    playerState.z = spawnPoint.position.z;

    const halfYaw = spawnPoint.rotationYaw / 2;
    playerState.rx = 0;
    playerState.ry = Math.sin(halfYaw);
    playerState.rz = 0;
    playerState.rw = Math.cos(halfYaw);

    // Add it to the synchronized players map.
    this.state.players.set(
      client.sessionId,
      playerState,
    );

    // Match State Machine: Evaluate if minimum required players are present to start countdown
    if (this.state.matchStatus === "WAITING_FOR_PLAYERS") {
      if (this.state.players.size >= this.gameMode.minPlayers) {
        this.startCountdown();
      }
    }
  }

  // ==================================================
  // PLAYER LEAVE
  // ==================================================

  onLeave(client: Client) {
    const auth = client.auth as AuthenticatedUser | undefined;
    const playerName = auth?.playerName ?? client.sessionId;
    console.log(`👋 Player leaving: ${playerName} [Session: ${client.sessionId}]`);

    // Clean up tracking in this.clients (for headless test environments)
    if (this.clients) {
      const clientIndex = this.clients.indexOf(client);
      if (clientIndex !== -1) {
        this.clients.splice(clientIndex, 1);
      }
    }

    this.simulationWorld.removeEntity(client.sessionId);

    // Remove synchronized network state.
    this.state.players.delete(client.sessionId);

    // Remove sequence tracking so no stale state survives
    this.lastAcceptedSequenceBySessionId.delete(client.sessionId);

    // Match State Machine: Check if leaving player aborts countdown or triggers forfeit
    if (this.state.matchStatus === "COUNTDOWN") {
      if (this.state.players.size < this.gameMode.minPlayers) {
        this.abortCountdown();
      }
    } else if (this.state.matchStatus === "PLAYING") {
      if (this.state.players.size === 1) {
        const [remainingSession, remainingPlayer] = Array.from(this.state.players.entries())[0];
        this.endMatch("FORFEIT", remainingSession, remainingPlayer?.teamIndex);
      } else if (this.state.players.size === 0) {
        this.endMatch("ALL_DISCONNECTED");
      }
    }
  }

  // ==================================================
  // MATCH STATE MACHINE METHODS
  // ==================================================

  public startCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.state.matchStatus = "COUNTDOWN";
    this.state.countdownSeconds = GameRoom.COUNTDOWN_DURATION_SEC;
    console.log(`⏱️ Starting match countdown: ${this.state.countdownSeconds}s...`);

    this.countdownTimer = setInterval(() => {
      this.state.countdownSeconds--;

      if (this.state.countdownSeconds <= 0) {
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
        this.startMatch();
      }
    }, 1000);
  }

  public abortCountdown() {
    console.log("⚠️ Player disconnected during countdown. Reverting to WAITING_FOR_PLAYERS.");
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.state.matchStatus = "WAITING_FOR_PLAYERS";
    this.state.countdownSeconds = 0;
  }

  public startMatch() {
    console.log("⚔️ MATCH STARTED: Physical gameplay simulation active!");
    this.state.matchStatus = "PLAYING";
    this.state.countdownSeconds = 0;
    this.state.remainingTimeSeconds = GameRoom.MATCH_DURATION_SEC;
    this.simulationWorld.setGameplayActive(true);

    if (this.matchDurationTimer) {
      clearInterval(this.matchDurationTimer);
      this.matchDurationTimer = null;
    }

    this.matchDurationTimer = setInterval(() => {
      this.state.remainingTimeSeconds--;

      if (this.state.remainingTimeSeconds <= 0) {
        if (this.matchDurationTimer) {
          clearInterval(this.matchDurationTimer);
          this.matchDurationTimer = null;
        }
        this.endMatch("TIMEOUT");
      }
    }, 1000);
  }

  public endMatch(reason: string, winnerPlayerId?: string, winnerTeamIndex?: number) {
    console.log(`🏁 MATCH ENDED [Reason: ${reason}]. Winner: ${winnerPlayerId ?? "Draw"}`);
    this.state.matchStatus = "MATCH_END";
    this.simulationWorld.setGameplayActive(false);

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.matchDurationTimer) {
      clearInterval(this.matchDurationTimer);
      this.matchDurationTimer = null;
    }

    if (winnerPlayerId !== undefined) {
      this.state.winningPlayerId = winnerPlayerId;
    }
    if (winnerTeamIndex !== undefined) {
      this.state.winningTeamIndex = winnerTeamIndex;
    }
  }

  // ==================================================
  // ROOM DISPOSAL
  // ==================================================

  onDispose() {
    console.log("🧹 Disposing GameRoom resources...");
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.matchDurationTimer) {
      clearInterval(this.matchDurationTimer);
      this.matchDurationTimer = null;
    }
    this.simulationWorld?.dispose();
    this.lastAcceptedSequenceBySessionId.clear();
  }
}