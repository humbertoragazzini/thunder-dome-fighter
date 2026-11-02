// ==================================================
// TOURNAMENT LOBBY NETWORK STATE SCHEMA
//
// WHAT IT DOES:
// Defines binary-serialized Colyseus schemas for synchronized tournament lobby state:
// - TournamentLobbyParticipant: Player metadata, assigned seed & slot, readiness status,
//   elimination state, and final placement.
// - TournamentLobbyState: Tournament configuration (name, capacity 4/8/16, limits, private code),
//   lifecycle status (WAITING, STARTING, IN_PROGRESS, COMPLETED), active round name,
//   crowned champion, and synchronized participant roster.
//
// HOW IT WORKS:
// Uses @colyseus/schema delta compression to synchronize staging updates,
// bracket promotions, and podium finishes to all fighters and spectators.
//
// WHY IT EXISTS:
// Single source of truth for Phase 21 Tournament Lobbies, ensuring client UIs
// remain fully synchronized with authoritative tournament progression.
// ==================================================

import {
  schema,
  t,
  type SchemaType,
} from "@colyseus/schema";

export const TournamentLobbyParticipant = schema(
  {
    sessionId: t.string().default(""),
    playerId: t.string().default(""),
    playerName: t.string().default("Fighter"),
    avatarUrl: t.string().default(""),
    seed: t.number().default(0),
    slotIndex: t.number().default(-1), // -1 = spectator, 0..N-1 = tournament fighter slot
    isReady: t.boolean().default(false),
    isHost: t.boolean().default(false),
    isEliminated: t.boolean().default(false),
    finalPlacement: t.number().default(0),
    ping: t.number().default(0),
  },
  "TournamentLobbyParticipant",
);

export type TournamentLobbyParticipant = SchemaType<typeof TournamentLobbyParticipant>;

export const TournamentLobbyState = schema(
  {
    tournamentName: t.string().default("Cuadrangular Championship"),
    tournamentId: t.string().default(""),
    participantCapacity: t.number().default(4), // 4, 8, 16
    format: t.string().default("KNOCKOUT"),
    status: t.string().default("WAITING"), // WAITING | STARTING | IN_PROGRESS | COMPLETED
    hostSessionId: t.string().default(""),
    hostPlayerId: t.string().default(""),
    roomCode: t.string().default(""),
    isPrivate: t.boolean().default(false),
    scoreLimit: t.number().default(5),
    timeLimitSeconds: t.number().default(180),
    currentRoundName: t.string().default("Registration"),
    championName: t.string().default(""),
    championId: t.string().default(""),
    participants: t.map(TournamentLobbyParticipant),
  },
  "TournamentLobbyState",
);

export type TournamentLobbyState = SchemaType<typeof TournamentLobbyState>;
