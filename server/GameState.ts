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
    players: t.map(PlayerState),
  },
  "GameState",
);

export type GameState = SchemaType<typeof GameState>;