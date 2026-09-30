// ==================================================
// NETWORK CONTRACTS: SERVER TO CLIENT MESSAGES
//
// Typed WebSocket messages dispatched from Colyseus to connected clients.
// Invariant: ZERO dependencies on engine, DOM, or React.
// ==================================================

import type { MatchStatus, MatchSummaryView } from "../../domain/Match.ts";
import type { Party } from "../../domain/Party.ts";

/**
 * Message channel identifiers for server-to-client traffic.
 */
export const ServerMessageType = {
  /** Match lifecycle state transition */
  MATCH_STATUS: "match-status",

  /** Synchronized 3..2..1 intro countdown */
  MATCH_COUNTDOWN: "match-countdown",

  /** Final match results and persistent stats summary */
  MATCH_SUMMARY: "match-summary",

  /** Matchmaking queue progress update */
  MATCHMAKING_STATUS: "matchmaking-status",

  /** Synchronized party state broadcast to all party members */
  PARTY_UPDATED: "party-updated",

  /** Structured error notification */
  SERVER_ERROR: "server-error",
} as const;

export type ServerMessageType =
  (typeof ServerMessageType)[keyof typeof ServerMessageType];

// ==================================================
// MESSAGE PAYLOADS
// ==================================================

export interface MatchStatusPayload {
  status: MatchStatus;
  timestamp: number;
}

export interface MatchCountdownPayload {
  /** Whole seconds remaining (3, 2, 1, 0) */
  secondsRemaining: number;
}

export interface MatchmakingStatusPayload {
  status: "QUEUED" | "MATCH_FOUND" | "CONNECTING" | "FAILED";
  estimatedWaitSeconds?: number;
}

export interface PartyUpdatedPayload {
  party: Party | null;
}

export interface ServerErrorPayload {
  code: string;
  message: string;
  fatal: boolean;
}

// ==================================================
// STRONGLY TYPED SERVER PAYLOAD MAPPING
//
// Maps each server message channel to its required payload schema.
// ==================================================

export interface ServerMessagePayloadMap {
  [ServerMessageType.MATCH_STATUS]: MatchStatusPayload;
  [ServerMessageType.MATCH_COUNTDOWN]: MatchCountdownPayload;
  [ServerMessageType.MATCH_SUMMARY]: MatchSummaryView;
  [ServerMessageType.MATCHMAKING_STATUS]: MatchmakingStatusPayload;
  [ServerMessageType.PARTY_UPDATED]: PartyUpdatedPayload;
  [ServerMessageType.SERVER_ERROR]: ServerErrorPayload;
}
