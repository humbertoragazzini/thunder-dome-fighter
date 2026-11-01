// ==================================================
// CUSTOM GAME LOBBY NETWORK STATE SCHEMA
//
// WHAT IT DOES:
// Defines the binary-serialized Colyseus schemas for synchronized custom lobby state:
// - CustomLobbyPlayer: Player metadata, assigned team, readiness status, and host flag.
// - CustomLobbyState: Room configuration (name, mode, arena, score/time limits, private code),
//   lifecycle status (WAITING, STARTING, LAUNCHED), and synchronized player roster.
//
// HOW IT WORKS:
// Uses @colyseus/schema delta compression to synchronize lobby updates (player joins,
// team swaps, ready toggles, host setting changes) to all staged participants with zero lag.
//
// WHY IT EXISTS:
// Single source of truth for Phase 19 Custom Game Lobbies, ensuring client UIs
// remain fully synchronized with authoritative host decisions and server validation.
// ==================================================

import {
  schema,
  t,
  type SchemaType,
} from "@colyseus/schema";

export const CustomLobbyPlayer = schema(
  {
    sessionId: t.string().default(""),
    playerId: t.string().default(""),
    playerName: t.string().default("Fighter"),
    avatarUrl: t.string().default(""),
    teamIndex: t.number().default(-1), // -1 = spectator, 0 = Team Alpha, 1 = Team Beta
    isReady: t.boolean().default(false),
    isHost: t.boolean().default(false),
    ping: t.number().default(0),
  },
  "CustomLobbyPlayer",
);

export type CustomLobbyPlayer = SchemaType<typeof CustomLobbyPlayer>;

export const CustomLobbyState = schema(
  {
    roomName: t.string().default("Custom Match"),
    hostSessionId: t.string().default(""),
    hostPlayerId: t.string().default(""),
    gameMode: t.string().default("1v1"),
    levelId: t.string().default("thunder-dome-alpha"),
    scoreLimit: t.number().default(5),
    timeLimitSeconds: t.number().default(180),
    isPrivate: t.boolean().default(false),
    roomCode: t.string().default(""),
    status: t.string().default("WAITING"), // WAITING | STARTING | LAUNCHED
    players: t.map(CustomLobbyPlayer),
  },
  "CustomLobbyState",
);

export type CustomLobbyState = SchemaType<typeof CustomLobbyState>;
