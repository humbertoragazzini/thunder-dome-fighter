// ==================================================
// GENERIC DOMAIN CONTRACTS: PARTIES & GROUP MATCHMAKING
//
// Social grouping for friends to assemble and enter
// matchmaking queues as an indivisible atomic team unit.
//
// Invariant: ZERO dependencies on Colyseus, Fastify, or React.
// ==================================================

import type { EntityId } from "./Identity.ts";
import type { GameModeId } from "./GameMode.ts";

/**
 * PartyMember: A player actively assembled inside a pre-match party.
 */
export interface PartyMember {
  playerId: EntityId;
  playerName: string;
  avatarUrl: string | null;

  /** Whether this player has marked themselves ready in the party lobby */
  isReady: boolean;

  /** Unix timestamp (milliseconds) when the player joined the party */
  joinedAt: number;
}

/**
 * Party: An ephemeral group of players formed before matchmaking.
 * The Party Leader controls game mode selection and initiates queue search.
 */
export interface Party {
  id: EntityId;

  /** The player with authority to invite, kick, and start matchmaking */
  leaderPlayerId: EntityId;

  /** 6-character human-readable invite code (e.g., "THNDR9") */
  inviteCode: string;

  /** Maximum party capacity (default: 4 players) */
  maxMembers: number;

  /** Active members in the party (keyed by playerId) */
  members: Record<EntityId, PartyMember>;

  /** Unix timestamp (milliseconds) when party was created */
  createdAt: number;
}

/**
 * MatchmakingTicket: An indivisible request submitted to the matchmaker.
 * Invariant: All playerIds in a single ticket MUST be placed on the SAME team.
 */
export interface MatchmakingTicket {
  ticketId: string;

  /** Target game mode requested */
  gameModeId: GameModeId;

  /** Optional party reference (null if queued as a solo player) */
  partyId: EntityId | null;

  /** All players included in this atomic group */
  playerIds: EntityId[];

  /** Timestamp when ticket entered the matchmaking pool */
  queuedAt: number;
}
