// ==================================================
// GENERIC DOMAIN CONTRACTS: IDENTITY & ACCOUNTS
//
// WHAT IT DOES:
// Declares the core identity domain types (User, Player, Session,
// PlayerStats, and PlayerProfileView) for authentication and profiles.
//
// HOW IT WORKS:
// Defines strict TypeScript interfaces shared across Fastify API, Prisma
// persistence, Colyseus onAuth handshake, and React Zustand stores without
// any runtime dependencies.
//
// WHY IT EXISTS:
// Enforces ADR-004 (Decoupled User vs. Player Identity). Decoupling
// security credentials from in-game player personas prevents credential
// leaks and allows future multi-persona or multi-character accounts.
// ==================================================

/**
 * Unique identifier brand (UUID v4 format string)
 */
export type EntityId = string;

/**
 * User: The security and authentication credential identity.
 * Represents the account holder (email, security status).
 * Completely decoupled from in-game character attributes.
 */
export interface User {
  id: EntityId;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Player: The persistent in-game persona and human identity.
 * Linked to a User account (1-to-1 initially; supports multiple personas later).
 * Holds public display information and cosmetic choices.
 */
export interface Player {
  id: EntityId;
  userId: EntityId;
  playerName: string;
  avatarUrl: string | null;
  createdAt: Date;
}

/**
 * Session: An active authenticated token instance.
 * Issued upon successful login via Fastify JWT.
 * Validated by Colyseus on room connection handshake (onAuth).
 */
export interface Session {
  id: EntityId;
  userId: EntityId;
  playerId: EntityId;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * PlayerStats: Permanent, lifetime statistics for competitive ranking.
 * Stored in PostgreSQL and updated ONLY upon validated match finalization.
 * Note: Ratios (K/D, WinRate) are derived dynamically to prevent data drift.
 */
export interface PlayerStats {
  playerId: EntityId;
  totalMatches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageReceived: number;
  updatedAt: Date;
}

/**
 * Public profile payload sent to the client UI.
 * Combines player identity with lifetime statistics and calculated ratios.
 */
export interface PlayerProfileView {
  player: Player;
  stats: PlayerStats;
  derived: {
    killDeathRatio: number;
    winRatePercentage: number;
  };
}

/**
 * Aggregated weapon mastery metrics (Phase 14).
 * Combines total uses, hits, kills, and damage dealt per weapon.
 */
export interface PlayerWeaponMastery {
  itemId: string;
  name: string;
  category: string;
  accentColor: string;
  matchesUsed: number;
  hits: number;
  kills: number;
  damageDealt: number;
  damagePerHit: number;
}

/**
 * Historical match performance summary for past bouts (Phase 14).
 */
export interface PlayerMatchHistoryEntry {
  matchId: EntityId;
  gameModeId: string;
  levelId: string;
  status: string;
  isWinner: boolean;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageReceived: number;
  durationSeconds: number;
  endedAt: Date;
}

/**
 * Comprehensive profile payload sent to the React ProfileScreen (Phase 14).
 * Combines player persona, lifetime combat records, multi-dimensional
 * derived ratios, weapon mastery cards, and chronological match logs.
 */
export interface FullPlayerProfileView extends PlayerProfileView {
  derived: {
    killDeathRatio: number;
    winRatePercentage: number;
    averageDamageDealt: number;
    averageDamageReceived: number;
    kdDifferential: number;
    combatScore: number;
  };
  weaponMastery: PlayerWeaponMastery[];
  recentMatches: PlayerMatchHistoryEntry[];
}

