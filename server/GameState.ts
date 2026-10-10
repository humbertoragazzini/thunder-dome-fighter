// ==================================================
// AUTHORITATIVE NETWORK STATE SCHEMAS
//
// WHAT IT DOES:
// Defines the binary-serialized Colyseus schemas for synchronized match state:
// - PlayerState: Real-time physics transforms, velocity, sequence ack, and team affinity.
// - GameState: Server simulation tick, active game mode ID, level ID, and player map.
//
// HOW IT WORKS:
// Uses @colyseus/schema delta-compression. Fields are packed into compact binary
// messages and broadcast to connected peers at 60 Hz.
//
// WHY IT EXISTS:
// Enforces ADR-006 and ADR-010. Provides strongly typed, high-performance network
// synchronization across all game modes (1v1, 3v3, 4v4, FFA).
// ==================================================

import {
  schema,
  t,
  type SchemaType,
} from "@colyseus/schema";


// ==================================================
// PLAYER NETWORK STATE
// ==================================================

export const PlayerState = schema(
  {
    playerId: t.string().default(""),

    // Team affinity: -1 for FFA, 0 for Team Alpha, 1 for Team Beta
    teamIndex: t.number().default(-1),

    x: t.number().default(0),
    y: t.number().default(0),
    z: t.number().default(0),
    rx: t.number().default(0),
    ry: t.number().default(0),
    rz: t.number().default(0),
    rw: t.number().default(0),

    vx: t.number().default(0),
    vy: t.number().default(0),
    vz: t.number().default(0),
    avx: t.number().default(0),
    avy: t.number().default(0),
    avz: t.number().default(0),

    lastProcessedInputSequence: t.number().default(0),
  },
  "PlayerState",
);

export type PlayerState = SchemaType<typeof PlayerState>;


// ==================================================
// GAME NETWORK STATE
// ==================================================

export const GameState = schema(
  {
    serverTick: t.number().default(0),
    modeId: t.string().default("1v1"),
    levelId: t.string().default("thunder-dome-alpha"),
    players: t.map(PlayerState),
  },
  "GameState",
);

export type GameState = SchemaType<typeof GameState>;