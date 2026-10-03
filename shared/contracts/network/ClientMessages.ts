// ==================================================
// NETWORK CONTRACTS: CLIENT TO SERVER MESSAGES
//
// WHAT IT DOES:
// Defines typed message constants (ClientMessageType) and mapped payload
// interfaces (ClientMessagePayloadMap) for client-to-server WebSocket events.
//
// HOW IT WORKS:
// Pairs each message type string (e.g. "player-input") with its exact payload
// schema, enabling compile-time type checking on client `room.send()` calls.
//
// WHY IT EXISTS:
// Eliminates magic strings in WebSocket communication. Enforces strict client
// intention boundaries (clients send inputs, not authoritative game outcomes).
// ==================================================

import type { GameModeId } from "../../domain/GameMode.ts";

/**
 * Message channel identifiers for client-to-server traffic.
 * Using a const object provides string literal types with autocomplete.
 */
export const ClientMessageType = {
  /** Sequenced user physical input command */
  PLAYER_INPUT: "player-input",

  /** Toggle player ready state inside a match room or custom lobby */
  ROOM_READY: "room-ready",

  /** Create an ephemeral party */
  PARTY_CREATE: "party-create",

  /** Join a party using a 6-character invite code */
  PARTY_JOIN: "party-join",

  /** Leave current party */
  PARTY_LEAVE: "party-leave",

  /** Enter the matchmaking queue (sent by solo player or party leader) */
  MATCH_QUEUE: "match-queue",

  /** Cancel active queue search */
  MATCH_CANCEL_QUEUE: "match-cancel-queue",

  /** Interact with arena environment (e.g. pick up a weapon) */
  INTERACT: "interact",
} as const;

export type ClientMessageType =
  (typeof ClientMessageType)[keyof typeof ClientMessageType];

// ==================================================
// MESSAGE PAYLOADS
// ==================================================

export interface RoomReadyPayload {
  isReady: boolean;
}

export interface PartyJoinPayload {
  inviteCode: string;
}

export interface MatchQueuePayload {
  gameModeId: GameModeId;
}

export interface InteractPayload {
  targetItemId?: string;
}

// ==================================================
// STRONGLY TYPED CLIENT PAYLOAD MAPPING
//
// Maps each message type string to its required payload schema.
// ==================================================

export interface ClientMessagePayloadMap {
  [ClientMessageType.PLAYER_INPUT]: unknown; // Typed strictly in Step 1.4 when we build CharacterInputCommand
  [ClientMessageType.ROOM_READY]: RoomReadyPayload;
  [ClientMessageType.PARTY_CREATE]: Record<string, never>; // Empty payload {}
  [ClientMessageType.PARTY_JOIN]: PartyJoinPayload;
  [ClientMessageType.PARTY_LEAVE]: Record<string, never>;
  [ClientMessageType.MATCH_QUEUE]: MatchQueuePayload;
  [ClientMessageType.MATCH_CANCEL_QUEUE]: Record<string, never>;
  [ClientMessageType.INTERACT]: InteractPayload;
}
