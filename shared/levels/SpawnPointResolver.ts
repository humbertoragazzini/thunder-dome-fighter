// ==================================================
// ARENA SPAWN POINT RESOLVER
//
// WHAT IT DOES:
// Determines deterministic starting positions and horizontal look directions (yaw)
// for joining players based on level definition, team index, and slot index.
//
// HOW IT WORKS:
// - If teamIndex is specified (e.g. 0 for Alpha, 1 for Beta), filters candidate
//   spawn points by team affinity and selects via slot modulo.
// - If FFA / untracked, rotates sequentially across all available arena spawns.
// - Returns a safe fallback spawn at arena center if no spawn points are configured.
//
// WHY IT EXISTS:
// Decouples player placement rules from Colyseus networking rooms and physics
// simulators, enabling identical spawn resolution across 1v1, team modes, and tests.
// ==================================================

import type { LevelDefinition, SpawnPoint } from "../domain/Level";

/**
 * Resolves a designated spawn point for a player joining an arena.
 *
 * @param level Master level definition containing candidate spawn points
 * @param playerIndex Zero-based ordinal index of the player in the room
 * @param teamIndex Optional team assignment (0 = Alpha, 1 = Beta)
 */
export function resolveSpawnPoint(
  level: LevelDefinition,
  playerIndex: number,
  teamIndex?: number,
): SpawnPoint {
  const spawns = level.playerSpawns;

  if (!spawns || spawns.length === 0) {
    return {
      id: "default-fallback",
      position: { x: 0, y: 0.55, z: 0 },
      rotationYaw: 0,
      teamIndex,
    };
  }

  // 1. Team-affinity spawn resolution
  if (teamIndex !== undefined) {
    const teamSpawns = spawns.filter((s) => s.teamIndex === teamIndex);
    if (teamSpawns.length > 0) {
      const selectedIndex = Math.abs(playerIndex) % teamSpawns.length;
      return teamSpawns[selectedIndex];
    }
  }

  // 2. FFA / slot-based resolution (modulo across all arena spawns)
  const selectedIndex = Math.abs(playerIndex) % spawns.length;
  return spawns[selectedIndex];
}
