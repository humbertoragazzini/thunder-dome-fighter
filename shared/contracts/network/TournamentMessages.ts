// ==================================================
// TOURNAMENT NETWORK CONTRACTS & PROTOCOLS
//
// WHAT IT DOES:
// Defines client-server message types, payload interfaces, and configuration
// options for Phase 21 Tournament Lobbies and Bracket Coordination.
//
// HOW IT WORKS:
// - Specifies `CreateTournamentLobbyOptions` used when hosting a tournament.
// - Declares `TournamentLobbyListingItem` summarizing active public tournaments.
// - Defines client intent messages (toggle ready, start tournament, kick participant).
// - Defines server notification payloads (match assigned, bracket updated, champion crowned).
//
// WHY IT EXISTS:
// Single source of truth for tournament network contracts shared across
// client stores, UI screens, and authoritative Colyseus rooms.
// ==================================================

import type {
  ITournamentStage,
  ITournamentParticipant,
} from "../../domain/tournament/TournamentTypes";

export interface CreateTournamentLobbyOptions {
  tournamentName: string;
  participantCapacity: number; // 4, 8, or 16
  scoreLimit?: number;
  timeLimitSeconds?: number;
  isPrivate?: boolean;
  roomCode?: string;
}

export interface TournamentLobbyListingItem {
  roomId: string;
  tournamentName: string;
  hostName: string;
  participantCapacity: number;
  currentParticipants: number;
  scoreLimit: number;
  timeLimitSeconds: number;
  status: "WAITING" | "STARTING" | "IN_PROGRESS" | "COMPLETED";
  isPrivate: boolean;
  currentRoundName?: string;
}

export const TournamentClientMessage = {
  TOGGLE_READY: "tournament:toggle-ready",
  START_TOURNAMENT: "tournament:start",
  UPDATE_SETTINGS: "tournament:update-settings",
  KICK_PARTICIPANT: "tournament:kick-participant",
  REQUEST_SPECTATE: "tournament:request-spectate",
} as const;

export type TournamentClientMessageType =
  (typeof TournamentClientMessage)[keyof typeof TournamentClientMessage];

export interface TournamentUpdateSettingsPayload {
  tournamentName?: string;
  scoreLimit?: number;
  timeLimitSeconds?: number;
}

export interface TournamentKickParticipantPayload {
  targetSessionId: string;
}

export interface TournamentRequestSpectatePayload {
  tournamentId: string;
  matchId: string;
}

export const TournamentServerMessage = {
  MATCH_ASSIGNED: "tournament:match-assigned",
  BRACKET_UPDATED: "tournament:bracket-updated",
  CHAMPION_CROWNED: "tournament:champion-crowned",
  PARTICIPANT_KICKED: "tournament:kicked",
  SPECTATE_GRANTED: "tournament:spectate-granted",
} as const;

export type TournamentServerMessageType =
  (typeof TournamentServerMessage)[keyof typeof TournamentServerMessage];

export interface TournamentMatchAssignedPayload {
  tournamentId: string;
  matchId: string;
  roundName: string;
  gameRoomId: string;
  reservation: any;
  opponentName: string;
  opponentAvatarUrl?: string;
  slot: "A" | "B";
  fingerprint?: number[];
}

export interface TournamentSpectateGrantedPayload {
  tournamentId: string;
  matchId: string;
  roundName: string;
  gameRoomId: string;
  reservation: any;
  participantAName: string;
  participantBName: string;
  fingerprint?: number[];
}

export interface TournamentBracketUpdatedPayload {
  tournamentId: string;
  lastCompletedMatchId?: string;
  stages?: ITournamentStage[];
  participants?: ITournamentParticipant[];
}

export interface TournamentPlacementItem {
  participantId: string;
  name: string;
  seed: number;
  placement: number;
}

export interface TournamentChampionCrownedPayload {
  tournamentId: string;
  championId: string;
  championName: string;
  championAvatarUrl?: string;
  placements: TournamentPlacementItem[];
}

export interface TournamentKickedPayload {
  reason: string;
}
