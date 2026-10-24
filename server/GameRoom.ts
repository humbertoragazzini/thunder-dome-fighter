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

import crypto from "node:crypto";
import { type Client, Room, ServerError } from "colyseus";
import { GameState, ItemPickupState, PlayerState } from "./GameState";
import { SimulatorWorld } from "./SimulationWorld";
import {
  type PlayerInputCommand,
  type CharacterInputCommand,
  type AttackActionType,
  PHYSICS_DT_MS,
  PHYSICS_DT_SECONDS,
  COMBAT_CONFIG,
} from "../shared/player/PlayerConfig";
import { verifySessionToken, type AuthenticatedUser } from "./auth/TokenVerifier.ts";
import { resolveSpawnPoint } from "../shared/levels/SpawnPointResolver";
import { GAME_MODES, type GameMode, type GameModeId } from "../shared/domain/GameMode";
import { LEVELS, type LevelDefinition } from "../shared/domain/Level";
import { assignPlayerTeam } from "../shared/match/TeamAssignment";
import {
  computeKillStreakModifiers,
  DEFAULT_MATCH_PLAYER_MODIFIERS,
} from "../shared/domain/MatchPlayerState";
import { GAME_ITEMS } from "../shared/domain/GameItem";
import { calculateDamageScaledKnockback } from "../shared/player/PlayerPhysicsMath";
import { MatchStatsTracker } from "./match/MatchStatsTracker.js";
import { MatchFinalizer } from "./match/MatchFinalizer.js";

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
      [
        "NONE",
        "LEFT_PUNCH",
        "RIGHT_PUNCH",
        "LIGHT_PUNCH",
        "HEAVY_PUNCH",
        "KICK",
        "PUSH",
        "BLOCK",
      ].includes(data.attackAction)
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

  // Match state machine & respawn timers
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private matchDurationTimer: ReturnType<typeof setInterval> | null = null;
  private respawnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  public static readonly COUNTDOWN_DURATION_SEC = 3;
  public static readonly MATCH_DURATION_SEC = 180;

  // ==================================================
  // SERVER PHYSICS WORLD & GAME RULES
  // ==================================================

  private simulationWorld!: SimulatorWorld;
  private gameMode!: GameMode;
  private level!: LevelDefinition;

  // Authoritative Match Statistics & Persistence (Phase 13)
  public matchId: string = crypto.randomUUID();
  public matchStatsTracker: MatchStatsTracker = new MatchStatsTracker();
  public matchStartTime: Date = new Date();
  public isFinalized: boolean = false;

  getGameMode(): GameMode {
    return this.gameMode;
  }

  getLevel(): LevelDefinition {
    return this.level;
  }

  getSimulationWorld(): SimulatorWorld {
    return this.simulationWorld;
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
        currentPlayer.isInvulnerable = this.simulationWorld.isEntityInvulnerable(playerId);
        currentPlayer.isStunned = this.simulationWorld.isEntityStunned(playerId);
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
    this.autoDispose = true;
    this.patchRate = PHYSICS_DT_MS;

    this.state.modeId = this.gameMode.id;
    this.state.levelId = this.level.id;
    this.state.matchStatus = "WAITING_FOR_PLAYERS";
    this.state.countdownSeconds = 0;
    const timeLimit = this.gameMode?.timeLimitSeconds ?? GameRoom.MATCH_DURATION_SEC;
    this.state.remainingTimeSeconds = timeLimit > 0 ? timeLimit : GameRoom.MATCH_DURATION_SEC;
    this.state.winningTeamIndex = -1;
    this.state.winningPlayerId = "";

    if ((this as any)._listing) {
      this.setMetadata({
        serverName: options.serverName ?? "Thunder Dome Arena",
        serverSlot: options.serverSlot ?? 1,
        modeId: this.gameMode.id,
        levelId: this.level.id,
      });
    }

    this.simulationWorld = new SimulatorWorld(this.level);

    // Initialize authoritative arena item & weapon spawners (Phase 12)
    if (this.gameMode.enableItemSpawns && this.level.itemSpawns) {
      for (const spawner of this.level.itemSpawns) {
        const pickup = new ItemPickupState();
        pickup.spawnId = spawner.id;
        pickup.itemId =
          spawner.defaultItemId ??
          (spawner.allowedCategories.includes("WEAPON")
            ? "ENERGY_BLADE"
            : "HEALTH_PACK_SMALL");
        pickup.category =
          spawner.allowedCategories.includes("POWERUP") &&
          !spawner.allowedCategories.includes("WEAPON")
            ? "POWERUP"
            : (spawner.allowedCategories[0] ?? "WEAPON");
        pickup.isAvailable = true;
        pickup.respawnRemainingSeconds = 0;
        pickup.x = spawner.position.x;
        pickup.y = spawner.position.y;
        pickup.z = spawner.position.z;
        this.state.itemPickups.set(spawner.id, pickup);
      }
    }

    await this.simulationWorld.initialize(() => {
      this.syncSimulationState();
      if (this.state.matchStatus === "PLAYING") {
        this.checkVoidFalls();
        this.checkItemPickups();
        this.updateItemRespawnTimers(PHYSICS_DT_SECONDS);
      }
    });

    // Register input network message
    this.onMessage("player-input", (client, message) => {
      this.handlePlayerInput(client, message);
    });

    // Register item interaction & weapon drop network messages (Phase 12)
    this.onMessage("player:interact", (client) => {
      this.handlePlayerInteract(client.sessionId);
    });

    this.onMessage("player:drop-weapon", (client) => {
      this.handlePlayerDropWeapon(client.sessionId);
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

    const playerState = this.state.players.get(client.sessionId);
    if (!playerState || playerState.isDead) {
      return;
    }

    const lastAcceptedSeq = this.lastAcceptedSequenceBySessionId.get(client.sessionId) ?? 0;
    const sanitizedInput = validateAndClampPlayerInputCommand(message, lastAcceptedSeq);

    if (!sanitizedInput) {
      return;
    }

    // Update monotonic accepted sequence for this session
    this.lastAcceptedSequenceBySessionId.set(client.sessionId, sanitizedInput.sequence);

    // Authoritative combat action resolution
    if ("attackAction" in sanitizedInput && sanitizedInput.attackAction !== "NONE") {
      this.resolveCombatAction(client.sessionId, sanitizedInput.attackAction);
    }

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
    playerState.health = 100;
    playerState.maxHealth = 100;
    playerState.score = 0;
    playerState.killStreak = 0;
    playerState.speedModifier = 1.0;
    playerState.forceModifier = 1.0;
    playerState.jumpModifier = 1.0;
    playerState.lastAttackAction = "NONE";
    playerState.heldItemId = "FISTS";
    playerState.ammo = 0;
    playerState.kills = 0;
    playerState.deaths = 0;
    playerState.assists = 0;
    playerState.damageDealt = 0;
    playerState.damageReceived = 0;
    playerState.isDead = false;
    playerState.isInvulnerable = false;
    playerState.x = spawnPoint.position.x;
    playerState.y = spawnPoint.position.y;
    playerState.z = spawnPoint.position.z;

    // Register participant in MatchStatsTracker (Phase 13)
    const persistentPlayerId = auth?.playerId || client.sessionId;
    this.matchStatsTracker.registerParticipant(
      client.sessionId,
      persistentPlayerId,
      teamAssignment.teamIndex,
    );

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

    // Cancel pending respawn timer if any
    const pendingTimer = this.respawnTimers.get(client.sessionId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.respawnTimers.delete(client.sessionId);
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
    this.matchStartTime = new Date();
    this.state.matchStatus = "PLAYING";
    this.state.countdownSeconds = 0;
    const timeLimit = this.gameMode?.timeLimitSeconds ?? GameRoom.MATCH_DURATION_SEC;
    this.state.remainingTimeSeconds = timeLimit > 0 ? timeLimit : GameRoom.MATCH_DURATION_SEC;
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
    if (this.isFinalized) {
      return;
    }
    this.isFinalized = true;

    console.log(`🏁 MATCH ENDED [Reason: ${reason}]. Winner: ${winnerPlayerId ?? "Draw"}`);
    this.state.matchStatus = "MATCH_END";
    this.simulationWorld.setGameplayActive(false);

    // Authoritatively lock room so matchmaker immediately excludes it from new player queries
    if ((this as any)._listing) {
      try {
        this.lock().catch(() => {});
      } catch {
        // Driver not initialized in headless unit tests
      }
    }

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.matchDurationTimer) {
      clearInterval(this.matchDurationTimer);
      this.matchDurationTimer = null;
    }

    const isTeamMode = this.gameMode.teamCount >= 2 && this.gameMode.teamSize > 1;
    if (winnerTeamIndex === undefined && isTeamMode) {
      if (this.state.team0Score > this.state.team1Score) {
        winnerTeamIndex = 0;
      } else if (this.state.team1Score > this.state.team0Score) {
        winnerTeamIndex = 1;
      } else {
        winnerTeamIndex = -1;
      }
    }

    if (winnerPlayerId !== undefined) {
      this.state.winningPlayerId = winnerPlayerId;
    }
    if (winnerTeamIndex !== undefined) {
      this.state.winningTeamIndex = winnerTeamIndex;
    }

    // Sync final scores to match tracker
    for (const [sId, pState] of this.state.players.entries()) {
      this.matchStatsTracker.setScore(sId, pState.score);
    }

    // Resolve winning player's persistent ID if winnerPlayerId is a sessionId
    let persistentWinnerId = winnerPlayerId;
    if (winnerPlayerId && this.clients) {
      const winnerClient = this.clients.find((c) => c.sessionId === winnerPlayerId);
      const winnerAuth = winnerClient?.auth as AuthenticatedUser | undefined;
      if (winnerAuth?.playerId) {
        persistentWinnerId = winnerAuth.playerId;
      }
    }

    const endedAt = new Date();
    const summary = this.matchStatsTracker.exportMatchSummary(
      this.matchId,
      this.gameMode.id,
      this.level.id,
      this.matchStartTime,
      endedAt,
      persistentWinnerId,
      winnerTeamIndex,
      this.roomId,
    );

    // Broadcast discrete match summary event with full scorecard
    try {
      this.broadcast("match:summary", summary);
    } catch {
      // In headless test environments with mock clients, broadcast transport may not be attached
    }

    // Persist to PostgreSQL idempotently (ADR-012)
    MatchFinalizer.finalizeMatch(summary)
      .then((res) => {
        console.log(`💾 Match ${summary.matchId} finalized: ${res.status} (alreadyFinalized: ${res.alreadyFinalized})`);
      })
      .catch((err) => {
        console.error(`❌ Match finalization error for ${summary.matchId}:`, err);
      });
  }

  // ==================================================
  // AUTHORITATIVE COMBAT RESOLUTION & LIFECYCLE (PHASE 9)
  // ==================================================

  public resolveCombatAction(attackerSessionId: string, action: AttackActionType): void {
    if (action === "NONE" || action === "BLOCK") {
      return;
    }

    // Check attack cooldown
    if (this.simulationWorld.isAttackOnCooldown(attackerSessionId)) {
      return;
    }

    const attackerState = this.state.players.get(attackerSessionId);
    const heldItemId = attackerState?.heldItemId ?? "FISTS";
    const heldWeapon = GAME_ITEMS[heldItemId];

    // Determine combat move definition (equipped weapon overrides standard unarmed punch)
    let moveDef: {
      damage: number;
      range: number;
      coneAngleRad: number;
      knockbackImpulse: number;
      cooldownSeconds: number;
    } | null = null;

    if (
      heldWeapon &&
      heldItemId !== "FISTS" &&
      (action === "LEFT_PUNCH" ||
        action === "RIGHT_PUNCH" ||
        action === "LIGHT_PUNCH" ||
        action === "HEAVY_PUNCH")
    ) {
      // Weapon attack
      moveDef = {
        damage: heldWeapon.damage,
        range: heldWeapon.range,
        coneAngleRad: heldWeapon.coneAngleRad,
        knockbackImpulse: heldWeapon.knockbackImpulse,
        cooldownSeconds: heldWeapon.cooldownSeconds,
      };

      // Handle ranged weapon ammo
      if (heldWeapon.weaponType === "RANGED" && attackerState) {
        if (attackerState.ammo > 0) {
          attackerState.ammo--;
          if (attackerState.ammo <= 0) {
            console.log(`🔫 Player ${attackerSessionId} depleted ammo for ${heldWeapon.name}, reverting to FISTS`);
            attackerState.heldItemId = "FISTS";
          }
        } else {
          attackerState.heldItemId = "FISTS";
          return;
        }
      }
    } else {
      // Unarmed / default combat moves
      moveDef =
        action === "LEFT_PUNCH"
          ? COMBAT_CONFIG.LEFT_PUNCH
          : action === "RIGHT_PUNCH"
            ? COMBAT_CONFIG.RIGHT_PUNCH
            : action === "KICK"
              ? COMBAT_CONFIG.KICK
              : action === "PUSH"
                ? COMBAT_CONFIG.PUSH
                : action === "LIGHT_PUNCH"
                  ? COMBAT_CONFIG.LIGHT_PUNCH
                  : action === "HEAVY_PUNCH"
                    ? COMBAT_CONFIG.HEAVY_PUNCH
                    : null;
    }

    if (!moveDef) return;

    // Start attack timeline in SimulationWorld (validates stun and combos)
    const attackStarted = this.simulationWorld.startEntityAttack(attackerSessionId, action);
    if (!attackStarted) return;

    // Apply cooldown to attacker
    this.simulationWorld.setAttackCooldown(attackerSessionId, moveDef.cooldownSeconds);

    const attackState = this.simulationWorld.getEntityAttackState(attackerSessionId);
    if (attackerState) {
      attackerState.lastAttackAction = action;
      attackerState.comboCount = attackState?.comboCount ?? 0;
    }

    const isFriendly = (targetSessionId: string): boolean => {
      if (this.gameMode.friendlyFire) return false;
      const victim = this.state.players.get(targetSessionId);
      return Boolean(
        attackerState &&
        victim &&
        attackerState.teamIndex >= 0 &&
        attackerState.teamIndex === victim.teamIndex,
      );
    };

    // Perform spatial query check with friendly-fire filter
    const hit = this.simulationWorld.checkMeleeHit(
      attackerSessionId,
      moveDef.range,
      moveDef.coneAngleRad,
      (targetId) => !isFriendly(targetId),
    );

    if (!hit) {
      return;
    }

    const victimSessionId = hit.targetSessionId;
    const victimState = this.state.players.get(victimSessionId);
    if (!victimState || victimState.isDead || isFriendly(victimSessionId)) {
      return;
    }

    // Check if victim is currently in invulnerability window (e.g. post-respawn)
    if (this.simulationWorld.isEntityInvulnerable(victimSessionId)) {
      console.log(`🛡️ Hit ignored: Player ${victimSessionId} is invulnerable.`);
      return;
    }

    // Record damage attribution for kill credit (including future void falls)
    this.simulationWorld.setEntityDamageAttribution(victimSessionId, attackerSessionId);

    // Hit Zone Details
    const hitZone = hit.hitZone ?? "TORSO";
    const isCritical = hit.isCritical ?? (hitZone === "HEAD");
    const finalDamage =
      heldItemId !== "FISTS"
        ? Math.round(moveDef.damage * (isCritical ? 1.5 : hitZone === "LIMBS" ? 0.75 : 1.0))
        : (hit.finalDamage ?? moveDef.damage);

    // Dynamic Damage-Scaled Knockback Impulse (Phase 12 User Requirement: "more damage = more repelling")
    const dynamicKnockback = calculateDamageScaledKnockback(
      moveDef.knockbackImpulse,
      finalDamage,
      1.0, // attacker forceModifier is multiplied inside applyKnockbackImpulse
    );

    // Impart physical knockback impulse in Havok
    this.simulationWorld.applyKnockbackImpulse(
      attackerSessionId,
      victimSessionId,
      dynamicKnockback,
      hit.knockbackDirection,
    );

    // Apply hit stun to victim
    const stunDurationMs =
      hitZone === "HEAD" ? 300 : hitZone === "TORSO" ? 220 : 150;
    this.simulationWorld.applyHitStun(victimSessionId, stunDurationMs);
    victimState.isStunned = true;

    // Apply damage authoritatively
    victimState.health = Math.max(0, victimState.health - finalDamage);

    // Update live combat metrics in PlayerState and MatchStatsTracker (Phase 13)
    this.matchStatsTracker.recordDamage(
      attackerSessionId,
      victimSessionId,
      heldItemId,
      finalDamage,
    );
    if (attackerState) {
      attackerState.damageDealt += finalDamage;
    }
    victimState.damageReceived += finalDamage;

    console.log(
      `💥 Hit landed! Attacker ${attackerSessionId} used ${action} (weapon: ${heldItemId}) on ${victimSessionId} [Zone: ${hitZone}, Crit: ${isCritical}]. Damage: ${finalDamage}, Repel: ${dynamicKnockback.toFixed(2)}, Target HP: ${victimState.health}`,
    );

    // Broadcast discrete combat hit event
    try {
      this.broadcast("combat:damage-applied", {
        attackerPlayerId: attackerSessionId,
        victimPlayerId: victimSessionId,
        weaponId: heldItemId !== "FISTS" ? heldItemId : action,
        attackAction: action,
        hitZone,
        comboCount: attackState?.comboCount ?? 0,
        damage: finalDamage,
        remainingHealth: victimState.health,
        hitPoint: hit.contactPoint ?? {
          x: victimState.x,
          y: victimState.y + 0.1,
          z: victimState.z,
        },
        knockbackForce: hit.knockbackDirection
          ? {
              x: hit.knockbackDirection.x * dynamicKnockback,
              y: hit.knockbackDirection.y * dynamicKnockback,
              z: hit.knockbackDirection.z * dynamicKnockback,
            }
          : { x: 0, y: 0.5, z: 0 },
        isCritical,
      });
    } catch {
      // In headless test environments with mock clients, broadcast transport may not be attached
    }

    // Check knockout
    if (victimState.health <= 0) {
      this.eliminatePlayer(victimSessionId, "COMBAT_DAMAGE", attackerSessionId);
    }
  }

  public checkVoidFalls(): void {
    const fallenPlayerIds = this.simulationWorld.checkVoidFalls();
    for (const victimSessionId of fallenPlayerIds) {
      const victimState = this.state.players.get(victimSessionId);
      if (victimState && !victimState.isDead) {
        console.log(`💀 Player ${victimSessionId} fell below arena boundaries into the void!`);
        this.eliminatePlayer(victimSessionId, "VOID_FALL");
      }
    }
  }

  // ==================================================
  // ITEM & WEAPON PICKUP LOGIC (PHASE 12)
  // ==================================================

  public checkItemPickups(): void {
    if (!this.gameMode.enableItemSpawns) return;

    for (const playerState of this.state.players.values()) {
      if (playerState.isDead) continue;

      for (const pickup of this.state.itemPickups.values()) {
        if (!pickup.isAvailable) continue;

        const item = GAME_ITEMS[pickup.itemId];
        if (!item) continue;

        // Walk-over auto-collection proximity check (<1.5m horizontal, <2.0m vertical)
        const dx = playerState.x - pickup.x;
        const dz = playerState.z - pickup.z;
        const dy = Math.abs(playerState.y - pickup.y);
        const distSq = dx * dx + dz * dz;

        if (distSq <= 1.5 * 1.5 && dy <= 2.0) {
          // Health Packs: walk-over collection only if player is below maxHealth
          if (pickup.category === "POWERUP" || item.category === "POWERUP") {
            if (playerState.health < playerState.maxHealth) {
              const healAmount = item.healthRestore ?? (item.id === "HEALTH_PACK_LARGE" ? 50 : 25);
              const oldHealth = playerState.health;
              playerState.health = Math.min(playerState.maxHealth, playerState.health + healAmount);
              const actualHealed = playerState.health - oldHealth;

              const spawnerDef = this.level.itemSpawns?.find((s) => s.id === pickup.spawnId);
              pickup.isAvailable = false;
              pickup.respawnRemainingSeconds = spawnerDef?.respawnSeconds ?? 15;

              console.log(
                `💚 Player ${playerState.playerId} collected ${item.name} (+${actualHealed} HP). Health: ${oldHealth} -> ${playerState.health}`,
              );

              try {
                this.broadcast("item:collected", {
                  playerId: playerState.playerId,
                  spawnId: pickup.spawnId,
                  itemId: pickup.itemId,
                  healthRestored: actualHealed,
                  remainingHealth: playerState.health,
                });
              } catch {
                // Mock client fallback
              }
            }
          }
        }
      }
    }
  }

  public updateItemRespawnTimers(deltaSeconds: number): void {
    if (!this.gameMode.enableItemSpawns) return;

    for (const pickup of this.state.itemPickups.values()) {
      if (!pickup.isAvailable) {
        pickup.respawnRemainingSeconds -= deltaSeconds;
        if (pickup.respawnRemainingSeconds <= 0) {
          pickup.isAvailable = true;
          pickup.respawnRemainingSeconds = 0;
          console.log(`✨ Item respawned at node ${pickup.spawnId}: ${pickup.itemId}`);
          try {
            this.broadcast("item:respawned", {
              spawnId: pickup.spawnId,
              itemId: pickup.itemId,
            });
          } catch {
            // Mock client fallback
          }
        }
      }
    }
  }

  public handlePlayerInteract(sessionId: string): void {
    if (this.state.matchStatus !== "PLAYING" || !this.gameMode.enableItemSpawns) return;

    const playerState = this.state.players.get(sessionId);
    if (!playerState || playerState.isDead) return;

    // Search for nearest available weapon pickup within interaction radius (<2.0m)
    let closestPickup: ItemPickupState | null = null;
    let closestDistSq = 2.0 * 2.0;

    for (const pickup of this.state.itemPickups.values()) {
      if (!pickup.isAvailable) continue;
      if (pickup.category !== "WEAPON") continue;

      const dx = playerState.x - pickup.x;
      const dz = playerState.z - pickup.z;
      const dy = Math.abs(playerState.y - pickup.y);
      if (dy > 2.0) continue;

      const distSq = dx * dx + dz * dz;
      if (distSq <= closestDistSq) {
        closestDistSq = distSq;
        closestPickup = pickup;
      }
    }

    if (!closestPickup) return;

    const item = GAME_ITEMS[closestPickup.itemId];
    if (!item) return;

    // Equip weapon
    playerState.heldItemId = item.id;
    playerState.ammo = item.ammoCapacity;

    const spawnerDef = this.level.itemSpawns?.find((s) => s.id === closestPickup?.spawnId);
    closestPickup.isAvailable = false;
    closestPickup.respawnRemainingSeconds = spawnerDef?.respawnSeconds ?? 20;

    console.log(
      `🗡️ Player ${sessionId} equipped ${item.name} (${item.id}) with ${playerState.ammo} ammo`,
    );

    try {
      this.broadcast("player:item-equipped", {
        playerId: sessionId,
        itemId: item.id,
        ammo: playerState.ammo,
        spawnId: closestPickup.spawnId,
      });
    } catch {
      // Mock client fallback
    }
  }

  public handlePlayerDropWeapon(sessionId: string): void {
    if (this.state.matchStatus !== "PLAYING") return;

    const playerState = this.state.players.get(sessionId);
    if (!playerState || playerState.isDead) return;

    if (playerState.heldItemId !== "FISTS") {
      const droppedItemId = playerState.heldItemId;
      playerState.heldItemId = "FISTS";
      playerState.ammo = 0;
      console.log(`🫳 Player ${sessionId} dropped weapon: ${droppedItemId}`);
      try {
        this.broadcast("player:item-equipped", {
          playerId: sessionId,
          itemId: "FISTS",
          ammo: 0,
        });
      } catch {
        // Mock client fallback
      }
    }
  }

  public eliminatePlayer(
    victimSessionId: string,
    cause: "COMBAT_DAMAGE" | "VOID_FALL",
    directAttackerId?: string,
  ): void {
    const victimState = this.state.players.get(victimSessionId);
    if (!victimState || victimState.isDead) return;

    victimState.isDead = true;
    victimState.health = 0;
    victimState.heldItemId = "FISTS";
    victimState.ammo = 0;

    // Reset victim's kill streak and physical modifiers to baseline 1.0x (Phase 11)
    victimState.killStreak = 0;
    victimState.speedModifier = 1.0;
    victimState.forceModifier = 1.0;
    victimState.jumpModifier = 1.0;
    this.simulationWorld.setEntityModifiers(victimSessionId, DEFAULT_MATCH_PLAYER_MODIFIERS);

    // Determine killer
    let killerSessionId = directAttackerId;
    if (!killerSessionId) {
      const attribution = this.simulationWorld.getEntityLastAttacker(victimSessionId);
      if (
        attribution.attackerSessionId &&
        attribution.timestamp &&
        performance.now() - attribution.timestamp <=
          COMBAT_CONFIG.VOID_FALL_ATTRIBUTION_WINDOW_SECONDS * 1000
      ) {
        killerSessionId = attribution.attackerSessionId;
      }
    }

    // Authoritatively track kill and death (Phase 13)
    const killerWeapon = killerSessionId
      ? (this.state.players.get(killerSessionId)?.heldItemId ?? "FISTS")
      : "ENVIRONMENT";
    const awardedAssists = this.matchStatsTracker.recordKill(
      killerSessionId ?? null,
      victimSessionId,
      killerWeapon,
    );
    victimState.deaths++;

    for (const assisterSessionId of awardedAssists) {
      const assisterState = this.state.players.get(assisterSessionId);
      if (assisterState) {
        assisterState.assists++;
      }
    }

    if (killerSessionId && killerSessionId !== victimSessionId) {
      const killerState = this.state.players.get(killerSessionId);
      if (killerState) {
        killerState.score++;
        killerState.kills++;
        killerState.killStreak++;

        // Track Team Score (Phase 16)
        if (killerState.teamIndex === 0) {
          this.state.team0Score++;
        } else if (killerState.teamIndex === 1) {
          this.state.team1Score++;
        }

        // Mode-Gated Kill Streak Modifiers (Phase 11): Active only in FFA, strictly disabled in 1v1 / team
        const isModifierEnabled = Boolean(this.gameMode?.enableKillStreakModifiers);
        const modifiers = computeKillStreakModifiers(killerState.killStreak, isModifierEnabled);

        killerState.speedModifier = modifiers.speedModifier;
        killerState.forceModifier = modifiers.forceModifier;
        killerState.jumpModifier = modifiers.jumpModifier;
        this.simulationWorld.setEntityModifiers(killerSessionId, modifiers);

        console.log(
          `🏆 Kill awarded to ${killerSessionId} (cause: ${cause})! Score: ${killerState.score}/${this.gameMode?.scoreLimit ?? COMBAT_CONFIG.MATCH_WIN_KILLS}, Streak: ${killerState.killStreak} [Team0: ${this.state.team0Score}, Team1: ${this.state.team1Score}]`,
        );

        if (isModifierEnabled && killerState.killStreak >= 1) {
          try {
            this.broadcast("match:kill-streak", {
              playerId: killerSessionId,
              killStreak: killerState.killStreak,
              speedModifier: modifiers.speedModifier,
              forceModifier: modifiers.forceModifier,
              jumpModifier: modifiers.jumpModifier,
            });
          } catch {
            // In headless test environments with mock clients, broadcast transport may not be attached
          }
        }

        // Check match victory condition based on gameMode.scoreLimit
        const scoreLimit = this.gameMode?.scoreLimit ?? COMBAT_CONFIG.MATCH_WIN_KILLS;
        const isTeamMode = this.gameMode.teamCount >= 2 && this.gameMode.teamSize > 1;

        if (isTeamMode) {
          if (this.state.team0Score >= scoreLimit) {
            this.endMatch("SCORE_LIMIT", killerSessionId, 0);
            return;
          }
          if (this.state.team1Score >= scoreLimit) {
            this.endMatch("SCORE_LIMIT", killerSessionId, 1);
            return;
          }
        } else {
          if (killerState.score >= scoreLimit) {
            this.endMatch("SCORE_LIMIT", killerSessionId, killerState.teamIndex);
            return;
          }
        }
      }
    }

    // Schedule respawn after 3 seconds
    const timer = setTimeout(() => {
      this.respawnTimers.delete(victimSessionId);
      if (this.state.matchStatus !== "PLAYING") return;
      this.respawnPlayer(victimSessionId);
    }, COMBAT_CONFIG.RESPAWN_DELAY_SECONDS * 1000);

    this.respawnTimers.set(victimSessionId, timer);
  }

  public respawnPlayer(sessionId: string): void {
    const pendingTimer = this.respawnTimers.get(sessionId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.respawnTimers.delete(sessionId);
    }

    const playerState = this.state.players.get(sessionId);
    if (!playerState) return;

    const spawnPoint = resolveSpawnPoint(
      this.level,
      0,
      playerState.teamIndex >= 0 ? playerState.teamIndex : undefined,
    );

    this.simulationWorld.respawnEntity(sessionId, spawnPoint);

    playerState.health = 100;
    playerState.isDead = false;
    playerState.isInvulnerable = true;
    playerState.heldItemId = "FISTS";
    playerState.ammo = 0;
    playerState.killStreak = 0;
    playerState.speedModifier = 1.0;
    playerState.forceModifier = 1.0;
    playerState.jumpModifier = 1.0;
    playerState.x = spawnPoint.position.x;
    playerState.y = spawnPoint.position.y;
    playerState.z = spawnPoint.position.z;

    const halfYaw = spawnPoint.rotationYaw / 2;
    playerState.rx = 0;
    playerState.ry = Math.sin(halfYaw);
    playerState.rz = 0;
    playerState.rw = Math.cos(halfYaw);
    playerState.vx = 0;
    playerState.vy = 0;
    playerState.vz = 0;

    console.log(`✨ Player ${sessionId} respawned with 2-second invulnerability.`);
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
    for (const timer of this.respawnTimers.values()) {
      clearTimeout(timer);
    }
    this.respawnTimers.clear();
    this.simulationWorld?.dispose();
    this.lastAcceptedSequenceBySessionId.clear();

    // If room is disposed while actively PLAYING without clean endMatch, mark CANCELLED (Phase 13)
    if (this.state.matchStatus === "PLAYING" && !this.isFinalized) {
      MatchFinalizer.cancelMatch(
        this.matchId,
        this.gameMode?.id ?? "1v1",
        this.level?.id ?? "thunder-dome-alpha",
        this.roomId,
      ).catch((err) => {
        console.error("Error cancelling abandoned match on dispose:", err);
      });
    }
  }
}