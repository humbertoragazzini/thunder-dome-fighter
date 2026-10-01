// ==================================================
// GAMEPLAY CONTRACTS: MATCH & COMBAT EVENTS
//
// Typed event definitions emitted by the authoritative server
// to trigger sound effects, particles, kill feeds, and HUD updates.
//
// Invariant: ZERO dependencies on Babylon.js, Colyseus, or DOM.
// ==================================================

import type { EntityId } from "../../domain/Identity.ts";
import type { Vector3D } from "../../domain/Level.ts";

/**
 * Enumeration of all discrete gameplay occurrences.
 */
export const MatchEventType = {
  /** Player connected and spawned into the arena */
  PLAYER_JOINED: "player-joined",

  /** Player disconnected or left match */
  PLAYER_LEFT: "player-left",

  /** Match countdown finished; physical combat is now active */
  MATCH_STARTED: "match-started",

  /** Authoritative hit registered between attacker hitbox and victim hurtbox */
  DAMAGE_APPLIED: "damage-applied",

  /** Player health depleted to zero or player knocked out of arena bounds */
  PLAYER_KILLED: "player-killed",

  /** Player respawned at an arena spawn point after death penalty timer */
  PLAYER_RESPAWNED: "player-respawned",

  /** Player earned a temporary in-match upgrade (speed/force boost after kill) */
  MODIFIER_CHANGED: "modifier-changed",

  /** Weapon or powerup spawned into the arena */
  ITEM_SPAWNED: "item-spawned",

  /** Player picked up a weapon or item from the ground */
  ITEM_PICKED_UP: "item-picked-up",

  /** Match ended by score limit or time limit */
  MATCH_ENDED: "match-ended",
} as const;

export type MatchEventType =
  (typeof MatchEventType)[keyof typeof MatchEventType];

// ==================================================
// EVENT PAYLOAD SCHEMAS
// ==================================================

export interface PlayerJoinedEvent {
  playerId: EntityId;
  playerName: string;
  teamIndex: number;
  spawnPosition: Vector3D;
}

export interface PlayerLeftEvent {
  playerId: EntityId;
  reason: "DISCONNECTED" | "FORFEIT" | "KICKED";
}

export interface MatchStartedEvent {
  matchId: EntityId;
  startedAt: number;
}

export interface DamageAppliedEvent {
  attackerPlayerId: EntityId;
  victimPlayerId: EntityId;
  weaponId: string;
  damage: number;
  remainingHealth: number;
  hitPoint: Vector3D;
  knockbackForce: Vector3D;
  isCritical: boolean;
}

export interface PlayerKilledEvent {
  killerPlayerId: EntityId;
  victimPlayerId: EntityId;
  weaponId: string;
  killerKillStreak: number;
  isRingOut: boolean;
}

export interface PlayerRespawnedEvent {
  playerId: EntityId;
  spawnPosition: Vector3D;
}

export interface ModifierChangedEvent {
  playerId: EntityId;
  currentKillStreak: number;
  speedMultiplier: number;
  forceMultiplier: number;
  jumpMultiplier: number;
}

export interface ItemSpawnedEvent {
  spawnId: string;
  itemId: string;
  position: Vector3D;
}

export interface ItemPickedUpEvent {
  playerId: EntityId;
  spawnId: string;
  itemId: string;
}

export interface MatchEndedEvent {
  matchId: EntityId;
  winningTeamIndex: number | null;
  winningPlayerId: EntityId | null;
  reason: "SCORE_LIMIT_REACHED" | "TIME_EXPIRED" | "OPPONENT_FORFEIT";
}

// ==================================================
// EVENT PAYLOAD MAPPING
// ==================================================

export interface MatchEventPayloadMap {
  [MatchEventType.PLAYER_JOINED]: PlayerJoinedEvent;
  [MatchEventType.PLAYER_LEFT]: PlayerLeftEvent;
  [MatchEventType.MATCH_STARTED]: MatchStartedEvent;
  [MatchEventType.DAMAGE_APPLIED]: DamageAppliedEvent;
  [MatchEventType.PLAYER_KILLED]: PlayerKilledEvent;
  [MatchEventType.PLAYER_RESPAWNED]: PlayerRespawnedEvent;
  [MatchEventType.MODIFIER_CHANGED]: ModifierChangedEvent;
  [MatchEventType.ITEM_SPAWNED]: ItemSpawnedEvent;
  [MatchEventType.ITEM_PICKED_UP]: ItemPickedUpEvent;
  [MatchEventType.MATCH_ENDED]: MatchEndedEvent;
}

/**
 * Universal Event Envelope: Wraps any gameplay event with metadata
 * tying it to the exact authoritative server physics tick.
 */
export interface MatchEventEnvelope<T extends MatchEventType = MatchEventType> {
  id: string;
  type: T;
  serverTick: number;
  timestamp: number;
  payload: MatchEventPayloadMap[T];
}
