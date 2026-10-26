// ==================================================
// ARENA SPAWN POINT RESOLVER
//
// WHAT IT DOES:
// Determines deterministic starting positions and horizontal look directions (yaw)
// for joining players based on level definition, team index, and slot index.
//
// HOW IT WORKS:
// - If teamIndex is specified (e.g. 0 for Alpha, 1 for Beta), filters candidate
//   spawn points by team affinity.
// - If activeOpponentPositions is provided, evaluates candidate spawn points and
//   selects the one that maximizes the distance to the closest living opponent
//   (Maximin anti-spawn-camping algorithm).
// - Falls back to sequential slot modulo if no opponent positions are provided.
// - Returns a safe fallback spawn at arena center if no spawn points are configured.
//
// WHY IT EXISTS:
// Decouples player placement rules from Colyseus networking rooms and physics
// simulators, enabling identical spawn resolution across 1v1, team modes, and FFA.
// ==================================================

import type { LevelDefinition, SpawnPoint } from "../domain/Level";

/**
 * Resolves a designated spawn point for a player joining or respawning in an arena.
 *
 * @param level Master level definition containing candidate spawn points
 * @param playerIndex Zero-based ordinal index of the player in the room
 * @param teamIndex Optional team assignment (0 = Alpha, 1 = Beta)
 * @param activeOpponentPositions Optional positions of living opponents for anti-spawn-camping
 */
export function resolveSpawnPoint(
  level: LevelDefinition,
  playerIndex: number,
  teamIndex?: number,
  activeOpponentPositions?: Array<{ x: number; y: number; z: number }>,
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

  // 1. Filter candidate spawns by team affinity if specified
  const candidateSpawns =
    teamIndex !== undefined
      ? spawns.filter((s) => s.teamIndex === teamIndex)
      : spawns;

  const validCandidates = candidateSpawns.length > 0 ? candidateSpawns : spawns;

  // 2. Dynamic anti-spawn-camping selection (Maximin distance)
  // When active opponent positions are provided, select the spawn point that maximizes
  // the distance to the closest active opponent.
  if (activeOpponentPositions && activeOpponentPositions.length > 0) {
    let bestSpawn = validCandidates[0];
    let maxMinDistanceSq = -1;

    for (const candidate of validCandidates) {
      let minDistanceSqToOpponent = Infinity;

      for (const opponent of activeOpponentPositions) {
        const dx = candidate.position.x - opponent.x;
        const dz = candidate.position.z - opponent.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDistanceSqToOpponent) {
          minDistanceSqToOpponent = distSq;
        }
      }

      if (minDistanceSqToOpponent > maxMinDistanceSq) {
        maxMinDistanceSq = minDistanceSqToOpponent;
        bestSpawn = candidate;
      }
    }

    return bestSpawn;
  }

  // 3. Fallback slot-based modulo resolution
  const selectedIndex = Math.abs(playerIndex) % validCandidates.length;
  return validCandidates[selectedIndex];
}
