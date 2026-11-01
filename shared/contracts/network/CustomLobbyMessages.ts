// ==================================================
// CUSTOM GAME LOBBY NETWORK CONTRACTS & PROTOCOLS
//
// WHAT IT DOES:
// Defines client-server message types, payload interfaces, and configuration
// options for Phase 19 Custom Game Lobbies and the Room Browser.
//
// HOW IT WORKS:
// - Specifies `CreateCustomLobbyOptions` used when creating and configuring a lobby.
// - Declares `CustomLobbyListingItem` summarizing active public rooms for the browser.
// - Defines client intent messages (switch team, toggle ready, update settings, kick, start).
// - Defines server notification payloads (match launched, player kicked).
//
// WHY IT EXISTS:
// Single source of truth for custom lobby network contracts shared across
// client state stores, UI screens, and authoritative Colyseus rooms.
// ==================================================

import type { GameModeId } from "../../domain/GameMode";

export interface CreateCustomLobbyOptions {
  roomName: string;
  gameMode: GameModeId;
  levelId: string;
  scoreLimit?: number;
  timeLimitSeconds?: number;
  isPrivate?: boolean;
  roomCode?: string;
}

export interface CustomLobbyListingItem {
  roomId: string;
  roomName: string;
  hostName: string;
  gameMode: GameModeId;
  levelId: string;
  scoreLimit: number;
  timeLimitSeconds: number;
  currentPlayers: number;
  maxPlayers: number;
  status: "WAITING" | "STARTING" | "LAUNCHED";
  isPrivate: boolean;
}

export const CustomLobbyClientMessage = {
  SWITCH_TEAM: "lobby:switch-team",
  TOGGLE_READY: "lobby:toggle-ready",
  UPDATE_SETTINGS: "lobby:update-settings",
  KICK_PLAYER: "lobby:kick-player",
  START_GAME: "lobby:start-game",
} as const;

export type CustomLobbyClientMessageType =
  (typeof CustomLobbyClientMessage)[keyof typeof CustomLobbyClientMessage];

export interface LobbySwitchTeamPayload {
  teamIndex: number; // 0 = Team Alpha, 1 = Team Beta, -1 = Spectator
}

export interface LobbyUpdateSettingsPayload {
  roomName?: string;
  gameMode?: GameModeId;
  levelId?: string;
  scoreLimit?: number;
  timeLimitSeconds?: number;
}

export interface LobbyKickPlayerPayload {
  targetSessionId: string;
}

export const CustomLobbyServerMessage = {
  MATCH_LAUNCHED: "lobby:match-launched",
  PLAYER_KICKED: "lobby:kicked",
} as const;

export type CustomLobbyServerMessageType =
  (typeof CustomLobbyServerMessage)[keyof typeof CustomLobbyServerMessage];

export interface LobbyMatchLaunchedPayload {
  gameRoomId: string;
  reservation: any;
  fingerprint?: number[];
}

export interface LobbyPlayerKickedPayload {
  reason: string;
}
