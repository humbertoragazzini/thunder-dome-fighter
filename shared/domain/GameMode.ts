// ==================================================
// GENERIC DOMAIN CONTRACTS: GAME MODES
//
// WHAT IT DOES:
// Defines the GameMode interface and the GAME_MODES registry providing
// declarative rulebooks for match formats (1v1, 3v3, 4v4, FFA).
//
// HOW IT WORKS:
// Supplies immutable configuration parameters (min/max players, team count,
// score to win, match duration, respawn delays, friendly fire) injected
// into Colyseus rooms upon creation.
//
// WHY IT EXISTS:
// Enforces ADR-006 (Generic Domain Models). Enables the game server to support
// varied match rules and formats dynamically without subclassing or duplicating
// room server code.
// ==================================================

/**
 * Standard supported game mode identifiers.
 */
export type GameModeId = "1v1" | "3v3" | "4v4" | "ffa";

/**
 * GameMode: Declarative rulebook for a Match.
 * Injected into GameRoom on creation; avoids duplicating room classes.
 */
export interface GameMode {
  id: GameModeId;
  name: string;
  description: string;

  /** Minimum players required before countdown can begin */
  minPlayers: number;

  /** Maximum capacity of the room */
  maxPlayers: number;

  /** Number of competing teams (0 or 1 indicates individual/free-for-all) */
  teamCount: number;

  /** Target participants per team (1 for 1v1 and FFA; 3 for 3v3; 4 for 4v4) */
  teamSize: number;

  /** Score (kills) required by an individual or team to trigger victory */
  scoreLimit: number;

  /** Match time limit in seconds (0 = unlimited, ends only by score) */
  timeLimitSeconds: number;

  /** Delay in seconds before a defeated player respawns at an arena spawn point */
  respawnDelaySeconds: number;

  /** Whether friendly players can damage each other */
  friendlyFire: boolean;
}

// ==================================================
// STANDARD GAME MODE PRESETS
// ==================================================

export const GAME_MODE_1V1: GameMode = {
  id: "1v1",
  name: "Duel 1v1",
  description: "Two players enter, one survives. Fast-paced individual combat.",
  minPlayers: 2,
  maxPlayers: 2,
  teamCount: 2,
  teamSize: 1,
  scoreLimit: 3,
  timeLimitSeconds: 180, // 3 minutes
  respawnDelaySeconds: 3,
  friendlyFire: false,
};

export const GAME_MODE_3V3: GameMode = {
  id: "3v3",
  name: "Team Clash 3v3",
  description: "Two teams of three fight for arena dominance.",
  minPlayers: 6,
  maxPlayers: 6,
  teamCount: 2,
  teamSize: 3,
  scoreLimit: 10,
  timeLimitSeconds: 300, // 5 minutes
  respawnDelaySeconds: 4,
  friendlyFire: false,
};

export const GAME_MODE_4V4: GameMode = {
  id: "4v4",
  name: "Squad Battle 4v4",
  description: "Tactical 4-player team skirmish with assist tracking.",
  minPlayers: 8,
  maxPlayers: 8,
  teamCount: 2,
  teamSize: 4,
  scoreLimit: 15,
  timeLimitSeconds: 360, // 6 minutes
  respawnDelaySeconds: 5,
  friendlyFire: false,
};

export const GAME_MODE_FFA: GameMode = {
  id: "ffa",
  name: "Free For All",
  description: "Chaotic individual arena combat supporting up to 20 players.",
  minPlayers: 2,
  maxPlayers: 20,
  teamCount: 0, // No teams
  teamSize: 1,
  scoreLimit: 25,
  timeLimitSeconds: 600, // 10 minutes
  respawnDelaySeconds: 3,
  friendlyFire: true,
};

/**
 * Registry mapping GameModeId to preset definition
 */
export const GAME_MODES: Record<GameModeId, GameMode> = {
  "1v1": GAME_MODE_1V1,
  "3v3": GAME_MODE_3V3,
  "4v4": GAME_MODE_4V4,
  ffa: GAME_MODE_FFA,
};
