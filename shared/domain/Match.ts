// ==================================================
// GENERIC DOMAIN CONTRACTS: MATCH & STATE MACHINE
//
// Lifecycle states, participant records, and live match scoring.
//
// Invariant: ZERO dependencies on Colyseus, Babylon, or React.
// ==================================================

import type { EntityId } from "./Identity.ts";
import type { GameModeId } from "./GameMode.ts";

/**
 * Strict Match Lifecycle States.
 * Invariant: Physical simulation and damage can ONLY occur during PLAYING.
 */
export type MatchStatus =
  | "CREATED" // Room spawned, initializing Havok & level
  | "WAITING_FOR_PLAYERS" // Waiting for required player count to connect
  | "READY" // All players present and loaded
  | "COUNTDOWN" // 3..2..1 intro countdown; inputs locked
  | "PLAYING" // Active combat simulation
  | "ROUND_END" // Round completed, resetting positions
  | "MATCH_END" // Win condition achieved, showing victory screen
  | "FINALIZING" // Persisting results to database via Prisma
  | "CLOSED"; // Match complete, room disposing

/**
 * MatchParticipant: The link between a persistent Player and an active Match.
 * Tracks volatile performance metrics accumulated during this single match.
 */
export interface MatchParticipant {
  playerId: EntityId;
  playerName: string;
  avatarUrl: string | null;

  /** Team index (0 = Alpha, 1 = Beta, -1 = Solo/FFA) */
  teamIndex: number;

  /** Current live score in this match */
  score: number;

  /** Combat statistics for this specific match */
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageReceived: number;

  /** Connection health */
  isConnected: boolean;
  isReady: boolean;
}

/**
 * MatchTeam: Team aggregate score and status.
 */
export interface MatchTeam {
  teamIndex: number;
  name: string;
  colorHex: string;
  score: number;
  participantIds: EntityId[];
}

/**
 * Match: The complete domain model of a playable game instance.
 */
export interface Match {
  id: EntityId;
  gameModeId: GameModeId;
  levelId: string;
  status: MatchStatus;

  /** Unix timestamps (milliseconds) */
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;

  /** Match participant registry (keyed by playerId) */
  participants: Record<EntityId, MatchParticipant>;

  /** Teams (empty array for FFA) */
  teams: MatchTeam[];

  /** Designated winner (playerId or teamIndex) upon MATCH_END */
  winningTeamIndex: number | null;
  winningPlayerId: EntityId | null;
}

/**
 * Post-match summary emitted to Fastify and client results screen.
 */
export interface MatchSummaryView {
  matchId: EntityId;
  gameModeId: GameModeId;
  levelId: string;
  durationSeconds: number;
  winningTeamIndex: number | null;
  winningPlayerId: EntityId | null;
  participants: MatchParticipant[];
  teams: MatchTeam[];
}
