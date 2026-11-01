// ==================================================
// SERVER SUBSYSTEM: CUSTOM GAME LOBBY COLYSEUS ROOM
//
// WHAT IT DOES:
// Authoritative Colyseus room managing pre-match custom lobby staging,
// team selection, ready-state coordination, host rules customization,
// player moderation (kick), and authoritative game launch into GameRoom.
//
// HOW IT WORKS:
// - Manages `CustomLobbyState` with real-time synchronized player rosters.
// - Supports public and private lobbies (with 6-character access codes).
// - Enforces host privileges: only host can update match rules, kick players, or launch.
// - Validates launch prerequisites (all non-host players ready, team requirements satisfied).
// - On match launch, creates an authoritative `GameRoom` via `matchMaker.createRoom`,
//   generates individual seat reservations with assigned team indices and WebTransport fingerprints,
//   and broadcasts `lobby:match-launched` to all clients.
//
// WHY IT EXISTS:
// Implements Phase 19 (Steps 19.1 - 19.4). Bridges the gap between matchmaking
// and custom player-hosted tournaments, scrims, and community battles.
// ==================================================

import { Room, type Client, ServerError, matchMaker } from "colyseus";
import {
  CustomLobbyClientMessage,
  CustomLobbyServerMessage,
  type CreateCustomLobbyOptions,
  type LobbySwitchTeamPayload,
  type LobbyUpdateSettingsPayload,
  type LobbyKickPlayerPayload,
} from "../../shared/contracts/network/CustomLobbyMessages";
import { CustomLobbyState, CustomLobbyPlayer } from "./CustomLobbyState";
import { verifySessionToken, type AuthenticatedUser } from "../auth/TokenVerifier";
import { getWebTransportFingerprint } from "../transport/webTransportCert";
import { GAME_MODES, type GameModeId } from "../../shared/domain/GameMode";
import { LEVELS } from "../../shared/domain/Level";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class CustomLobbyRoom extends Room<{ state: CustomLobbyState }> {
  override state = new CustomLobbyState();
  private clientTokens = new Map<string, string>(); // sessionId -> token

  private getAuthUser(client: Client): AuthenticatedUser | undefined {
    const auth = client.auth as any;
    if (!auth) return undefined;
    if (auth.user && typeof auth.user.playerId === "string") {
      return auth.user as AuthenticatedUser;
    }
    if (typeof auth.playerId === "string") {
      return auth as AuthenticatedUser;
    }
    return undefined;
  }

  override onCreate(options: CreateCustomLobbyOptions = {} as CreateCustomLobbyOptions): void {
    const modeId: GameModeId =
      options.gameMode && options.gameMode in GAME_MODES ? options.gameMode : "1v1";
    const modeConfig = GAME_MODES[modeId];

    this.state.roomName = options.roomName ? options.roomName.trim().slice(0, 32) : "Custom Match";
    this.state.gameMode = modeId;
    this.state.levelId = options.levelId && options.levelId in LEVELS ? options.levelId : "thunder-dome-alpha";
    this.state.scoreLimit = options.scoreLimit && options.scoreLimit > 0 ? options.scoreLimit : modeConfig.scoreLimit;
    this.state.timeLimitSeconds =
      options.timeLimitSeconds && options.timeLimitSeconds > 0
        ? options.timeLimitSeconds
        : (modeConfig.timeLimitSeconds > 0 ? modeConfig.timeLimitSeconds : 180);
    this.state.isPrivate = Boolean(options.isPrivate);
    this.state.roomCode = options.roomCode ? options.roomCode.trim().toUpperCase() : generateRoomCode();
    this.state.status = "WAITING";

    this.maxClients = Math.max(modeConfig.maxPlayers + 4, 8); // Max players + 4 spectator slots
    this.autoDispose = true;

    this.setMetadata({
      roomName: this.state.roomName,
      hostName: "",
      gameMode: this.state.gameMode,
      levelId: this.state.levelId,
      scoreLimit: this.state.scoreLimit,
      timeLimitSeconds: this.state.timeLimitSeconds,
      isPrivate: this.state.isPrivate,
      roomCode: this.state.roomCode,
      currentPlayers: 0,
      maxPlayers: modeConfig.maxPlayers,
      status: "WAITING",
    });

    // --------------------------------------------------
    // MESSAGE HANDLERS
    // --------------------------------------------------

    this.onMessage(
      CustomLobbyClientMessage.SWITCH_TEAM,
      (client: Client, payload: LobbySwitchTeamPayload) => {
        const player = this.state.players.get(client.sessionId);
        if (!player || this.state.status !== "WAITING") return;

        const desiredTeam = payload?.teamIndex;
        if (desiredTeam !== 0 && desiredTeam !== 1 && desiredTeam !== -1) {
          return;
        }

        // FFA mode does not have team switching (everyone is on team 0)
        if (this.state.gameMode === "ffa") {
          player.teamIndex = 0;
          return;
        }

        // Validate team capacity
        const modeDef = GAME_MODES[this.state.gameMode as GameModeId] ?? GAME_MODES["1v1"];
        if (desiredTeam >= 0) {
          let teamCount = 0;
          for (const p of this.state.players.values()) {
            if (p.teamIndex === desiredTeam && p.sessionId !== client.sessionId) {
              teamCount++;
            }
          }
          if (teamCount >= modeDef.teamSize) {
            // Team is full
            return;
          }
        }

        player.teamIndex = desiredTeam;
        if (!player.isHost) {
          player.isReady = false;
        }
      },
    );

    this.onMessage(CustomLobbyClientMessage.TOGGLE_READY, (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.status !== "WAITING") return;

      // Host is always considered ready
      if (player.isHost) {
        player.isReady = true;
        return;
      }

      player.isReady = !player.isReady;
    });

    this.onMessage(
      CustomLobbyClientMessage.UPDATE_SETTINGS,
      (client: Client, payload: LobbyUpdateSettingsPayload) => {
        if (client.sessionId !== this.state.hostSessionId || this.state.status !== "WAITING") {
          return;
        }

        if (payload.roomName && typeof payload.roomName === "string") {
          this.state.roomName = payload.roomName.trim().slice(0, 32);
        }
        if (payload.gameMode && payload.gameMode in GAME_MODES) {
          this.state.gameMode = payload.gameMode;
          const newModeDef = GAME_MODES[payload.gameMode];
          this.maxClients = Math.max(newModeDef.maxPlayers + 4, 8);
        }
        if (payload.levelId && payload.levelId in LEVELS) {
          this.state.levelId = payload.levelId;
        }
        if (typeof payload.scoreLimit === "number" && payload.scoreLimit > 0) {
          this.state.scoreLimit = Math.min(Math.max(payload.scoreLimit, 1), 100);
        }
        if (typeof payload.timeLimitSeconds === "number" && payload.timeLimitSeconds > 0) {
          this.state.timeLimitSeconds = Math.min(Math.max(payload.timeLimitSeconds, 30), 1800);
        }

        // Reset non-host readiness upon settings alteration
        for (const p of this.state.players.values()) {
          if (!p.isHost) {
            p.isReady = false;
          }
        }

        const modeDef = GAME_MODES[this.state.gameMode as GameModeId] ?? GAME_MODES["1v1"];
        this.setMetadata({
          roomName: this.state.roomName,
          hostName: this.state.players.get(this.state.hostSessionId)?.playerName ?? "Host",
          gameMode: this.state.gameMode,
          levelId: this.state.levelId,
          scoreLimit: this.state.scoreLimit,
          timeLimitSeconds: this.state.timeLimitSeconds,
          isPrivate: this.state.isPrivate,
          roomCode: this.state.roomCode,
          currentPlayers: this.state.players.size,
          maxPlayers: modeDef.maxPlayers,
          status: "WAITING",
        });
      },
    );

    this.onMessage(
      CustomLobbyClientMessage.KICK_PLAYER,
      (client: Client, payload: LobbyKickPlayerPayload) => {
        if (client.sessionId !== this.state.hostSessionId || this.state.status !== "WAITING") {
          return;
        }

        const targetSessionId = payload?.targetSessionId;
        if (!targetSessionId || targetSessionId === client.sessionId) return;

        const targetClient = this.clients.find((c) => c.sessionId === targetSessionId);
        if (targetClient) {
          targetClient.send(CustomLobbyServerMessage.PLAYER_KICKED, {
            reason: "You were kicked by the lobby host.",
          });
          targetClient.leave(4001);
        }
      },
    );

    this.onMessage(CustomLobbyClientMessage.START_GAME, async (client: Client) => {
      if (client.sessionId !== this.state.hostSessionId || this.state.status !== "WAITING") {
        return;
      }

      const activeCombatants: CustomLobbyPlayer[] = [];
      for (const p of this.state.players.values()) {
        if (p.teamIndex >= 0) {
          activeCombatants.push(p);
        }
      }

      // 1. Minimum player requirement
      if (activeCombatants.length < 2) {
        return;
      }

      // 2. Readiness check: All non-host participants must be ready
      for (const p of activeCombatants) {
        if (!p.isHost && !p.isReady) {
          return;
        }
      }

      // 3. Team balance checks for team-based modes
      if (this.state.gameMode !== "ffa") {
        const team0 = activeCombatants.filter((p) => p.teamIndex === 0);
        const team1 = activeCombatants.filter((p) => p.teamIndex === 1);
        if (team0.length === 0 || team1.length === 0) {
          return;
        }
      }

      // Authoritative transition to STARTING
      this.state.status = "STARTING";
      this.setMetadata({ status: "STARTING" });

      try {
        const modeId = this.state.gameMode as GameModeId;
        const levelId = this.state.levelId;
        const scoreLimit = this.state.scoreLimit;
        const timeLimitSeconds = this.state.timeLimitSeconds;

        // Allocate authoritative GameRoom
        const gameRoom = await matchMaker.createRoom("game", {
          modeId,
          levelId,
          scoreLimit,
          timeLimitSeconds,
          serverName: this.state.roomName,
        });

        const fp = getWebTransportFingerprint();

        // Reserve seats for all active combatants
        for (const combatant of activeCombatants) {
          const token = this.clientTokens.get(combatant.sessionId) ?? "";
          const reservation = await matchMaker.reserveSeatFor(gameRoom, {
            token,
            playerId: combatant.playerId,
            playerName: combatant.playerName,
            avatarUrl: combatant.avatarUrl,
            modeId,
            teamIndex: combatant.teamIndex,
          });

          if (fp) {
            (reservation as any).fingerprint = fp;
          }

          const targetClient = this.clients.find((c) => c.sessionId === combatant.sessionId);
          if (targetClient) {
            targetClient.send(CustomLobbyServerMessage.MATCH_LAUNCHED, {
              gameRoomId: gameRoom.roomId,
              reservation,
              fingerprint: fp,
            });
          }
        }

        this.state.status = "LAUNCHED";
        this.setMetadata({ status: "LAUNCHED" });

        // Clean up lobby after graceful client departure
        setTimeout(() => {
          try {
            this.disconnect();
          } catch {
            // Ignore
          }
        }, 15000);
      } catch (err) {
        console.error("[CustomLobbyRoom] Failed to launch game room:", err);
        this.state.status = "WAITING";
        this.setMetadata({ status: "WAITING" });
      }
    });
  }

  override async onAuth(client: Client, options: any): Promise<AuthenticatedUser> {
    const token = options?.token ?? options?._authToken;
    let user: AuthenticatedUser | undefined;

    if (token) {
      try {
        user = await verifySessionToken(token);
        (client as any)._sessionToken = token;
      } catch {
        // Fall back to test credentials if available
      }
    }

    // Support fallback identity for tests or guest users
    if (!user) {
      if (options?.playerId && options?.playerName) {
        user = {
          userId: options.userId ?? `user-${options.playerId}`,
          playerId: options.playerId,
          playerName: options.playerName,
          email: `${options.playerId}@example.com`,
        };
      } else {
        throw new ServerError(401, "Authentication required to join custom lobby");
      }
    }

    // Verify room code for private rooms (except for the initial room creator)
    if (this.state.isPrivate && this.state.hostSessionId) {
      const submittedCode = options?.roomCode ? String(options.roomCode).trim().toUpperCase() : "";
      if (submittedCode !== this.state.roomCode) {
        throw new ServerError(403, "Invalid private room code");
      }
    }

    if (this.state.status !== "WAITING") {
      throw new ServerError(403, "Match is already in progress");
    }

    return user;
  }

  override onJoin(client: Client, options: any): void {
    const user = this.getAuthUser(client);
    if (!user) return;

    const token = (client as any)._sessionToken ?? options?.token ?? options?._authToken ?? "";
    this.clientTokens.set(client.sessionId, token);

    const player = new CustomLobbyPlayer();
    player.sessionId = client.sessionId;
    player.playerId = user.playerId;
    player.playerName = user.playerName;
    player.avatarUrl = options?.avatarUrl ?? "";

    // Designate first joiner as host
    const isFirstPlayer = !this.state.hostSessionId;
    if (isFirstPlayer) {
      this.state.hostSessionId = client.sessionId;
      this.state.hostPlayerId = user.playerId;
      player.isHost = true;
      player.isReady = true;
      player.teamIndex = 0;
    } else {
      player.isHost = false;
      player.isReady = false;

      // Auto-assign team with fewer players
      if (this.state.gameMode === "ffa") {
        player.teamIndex = 0;
      } else {
        let team0Count = 0;
        let team1Count = 0;
        for (const p of this.state.players.values()) {
          if (p.teamIndex === 0) team0Count++;
          if (p.teamIndex === 1) team1Count++;
        }
        player.teamIndex = team0Count <= team1Count ? 0 : 1;
      }
    }

    this.state.players.set(client.sessionId, player);

    const modeDef = GAME_MODES[this.state.gameMode as GameModeId] ?? GAME_MODES["1v1"];
    this.setMetadata({
      roomName: this.state.roomName,
      hostName: this.state.players.get(this.state.hostSessionId)?.playerName ?? player.playerName,
      gameMode: this.state.gameMode,
      levelId: this.state.levelId,
      scoreLimit: this.state.scoreLimit,
      timeLimitSeconds: this.state.timeLimitSeconds,
      isPrivate: this.state.isPrivate,
      roomCode: this.state.roomCode,
      currentPlayers: this.state.players.size,
      maxPlayers: modeDef.maxPlayers,
      status: this.state.status,
    });
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.clientTokens.delete(client.sessionId);

    // If host left, elect new host if players remain
    if (client.sessionId === this.state.hostSessionId) {
      let nextHost: CustomLobbyPlayer | undefined;
      for (const p of this.state.players.values()) {
        nextHost = p;
        break;
      }

      if (nextHost) {
        nextHost.isHost = true;
        nextHost.isReady = true;
        this.state.hostSessionId = nextHost.sessionId;
        this.state.hostPlayerId = nextHost.playerId;
      } else {
        this.state.hostSessionId = "";
        this.state.hostPlayerId = "";
      }
    }

    const modeDef = GAME_MODES[this.state.gameMode as GameModeId] ?? GAME_MODES["1v1"];
    this.setMetadata({
      roomName: this.state.roomName,
      hostName: this.state.players.get(this.state.hostSessionId)?.playerName ?? "Host",
      gameMode: this.state.gameMode,
      levelId: this.state.levelId,
      scoreLimit: this.state.scoreLimit,
      timeLimitSeconds: this.state.timeLimitSeconds,
      isPrivate: this.state.isPrivate,
      roomCode: this.state.roomCode,
      currentPlayers: this.state.players.size,
      maxPlayers: modeDef.maxPlayers,
      status: this.state.status,
    });
  }

  override onDispose(): void {
    this.clientTokens.clear();
  }
}
