// ==================================================
// DETERMINISTIC TEAM & SLOT ASSIGNMENT RESOLVER
//
// WHAT IT DOES:
// Determines team affinity (Team Alpha vs Team Beta vs FFA) and slot-in-team
// indices for players joining a game room based on declarative GameMode rules.
//
// HOW IT WORKS:
// - Evaluates GameMode.teamCount:
//   - If teamCount === 0 (e.g. FFA): assigns teamIndex = -1 and assigns an individual slot.
//   - If teamCount >= 2 (e.g. 1v1, 3v3, 4v4): counts active players per team.
//     If a requested team has available capacity (< teamSize), assigns it.
//     Otherwise, assigns the player to whichever team has fewer players (balancing).
// - Computes the ordinal slotInTeam for matching with designated team spawn points.
//
// WHY IT EXISTS:
// Decouples matchmaking and team balancing logic from Colyseus room networking (ADR-006).
// Ensures deterministic, testable team distribution across 1v1, team clash, and FFA.
// ==================================================

import type { GameMode } from "../domain/GameMode";

export interface TeamAssignmentResult {
  teamIndex: number;
  slotInTeam: number;
}

export interface PlayerTeamLike {
  teamIndex: number;
}

/**
 * Assigns a joining player to a team and calculates their slot index within that team.
 *
 * @param mode Active declarative GameMode
 * @param existingPlayers Collection or Map of players currently in the room
 * @param requestedTeam Optional requested team index from party or matchmaking
 */
export function assignPlayerTeam(
  mode: GameMode,
  existingPlayers: Iterable<PlayerTeamLike>,
  requestedTeam?: number,
): TeamAssignmentResult {
  // 1. Free-For-All mode (no teams)
  if (mode.teamCount === 0) {
    let count = 0;
    for (const _ of existingPlayers) {
      count++;
    }
    return {
      teamIndex: -1,
      slotInTeam: count,
    };
  }

  // 2. Count current players per team
  const teamMemberCounts: number[] = Array.from({ length: mode.teamCount }, () => 0);

  for (const player of existingPlayers) {
    if (player.teamIndex >= 0 && player.teamIndex < mode.teamCount) {
      teamMemberCounts[player.teamIndex]++;
    }
  }

  // 3. Honor valid requested team if it has capacity
  if (
    requestedTeam !== undefined &&
    requestedTeam >= 0 &&
    requestedTeam < mode.teamCount &&
    teamMemberCounts[requestedTeam] < mode.teamSize
  ) {
    return {
      teamIndex: requestedTeam,
      slotInTeam: teamMemberCounts[requestedTeam],
    };
  }

  // 4. Automatic Balancing: Find team with fewest members
  let selectedTeam = 0;
  let minCount = teamMemberCounts[0];

  for (let t = 1; t < mode.teamCount; t++) {
    if (teamMemberCounts[t] < minCount) {
      minCount = teamMemberCounts[t];
      selectedTeam = t;
    }
  }

  return {
    teamIndex: selectedTeam,
    slotInTeam: teamMemberCounts[selectedTeam],
  };
}
