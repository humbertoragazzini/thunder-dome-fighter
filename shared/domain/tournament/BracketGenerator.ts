// ==================================================
// BRACKET GENERATOR & ADVANCEMENT ENGINE
//
// WHAT IT DOES:
// Pure deterministic algorithms for tournament bracket generation,
// seeding, node graph linking, and knockout winner progression.
//
// HOW IT WORKS:
// - Generates balanced single-elimination tournament trees (2, 4, 8, 16+ participants).
// - Links feeder matches directly to downstream slots (nextMatchId, nextMatchSlot).
// - Authoritatively advances match winners, eliminates defeated participants,
//   promotes next-round matches to SCHEDULED, and crowns the tournament Champion.
//
// WHY IT EXISTS:
// Completely decoupled from game physics and network transport, allowing 100%
// deterministic testing, simulation, and multi-tier tournament orchestration.
// ==================================================

import type {
  CreateTournamentParams,
  ITournament,
  ITournamentMatch,
  ITournamentParticipant,
  ITournamentRound,
  ITournamentStage,
  MatchOutcomeData,
} from "./TournamentTypes";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "gen-" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function getRoundName(roundIndex: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - 1 - roundIndex;
  switch (roundsFromEnd) {
    case 0:
      return "Final";
    case 1:
      return "Semifinals";
    case 2:
      return "Quarterfinals";
    case 3:
      return "Round of 16";
    default:
      return `Round ${roundIndex + 1}`;
  }
}

/**
 * Generates initial round pairings using standard tournament seeding fold.
 * For 4 players: (1 vs 4), (2 vs 3).
 * For 8 players: (1 vs 8), (4 vs 5), (2 vs 7), (3 vs 6).
 */
function generateSeededPairings(count: number): Array<[number, number]> {
  if (count === 2) {
    return [[1, 2]];
  }
  if (count === 4) {
    return [
      [1, 4],
      [2, 3],
    ];
  }
  if (count === 8) {
    return [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ];
  }

  // General algorithm for powers of 2
  let rounds = [1, 2];
  while (rounds.length < count) {
    const nextRounds: number[] = [];
    const sum = rounds.length * 2 + 1;
    for (const seed of rounds) {
      nextRounds.push(seed);
      nextRounds.push(sum - seed);
    }
    rounds = nextRounds;
  }

  const pairings: Array<[number, number]> = [];
  for (let i = 0; i < rounds.length; i += 2) {
    pairings.push([rounds[i], rounds[i + 1]]);
  }
  return pairings;
}

/**
 * Pure generator: constructs a complete knockout tournament tree.
 */
export function generateKnockoutTournament(
  params: CreateTournamentParams,
  customTournamentId?: string,
): ITournament {
  const participantCount = params.participants.length;
  if (participantCount < 2) {
    throw new Error("Tournament requires at least 2 participants");
  }

  // Nearest power of two check
  const isPowerOfTwo = (participantCount & (participantCount - 1)) === 0;
  if (!isPowerOfTwo) {
    throw new Error(`Participant count (${participantCount}) must be a power of two (2, 4, 8, 16)`);
  }

  const tournamentId = customTournamentId ?? generateUUID();
  const now = new Date();

  // 1. Assign deterministic seeds and instantiate participants
  const participants: ITournamentParticipant[] = params.participants.map((p, index) => ({
    id: generateUUID(),
    tournamentId,
    participantType: params.participantType,
    seed: p.seed ?? index + 1,
    name: p.name,
    avatarUrl: p.avatarUrl,
    playerId: p.playerId,
    memberIds: p.memberIds,
    isEliminated: false,
  }));

  // Sort participants by seed ascending
  participants.sort((a, b) => a.seed - b.seed);
  const participantBySeed = new Map<number, ITournamentParticipant>();
  for (const p of participants) {
    participantBySeed.set(p.seed, p);
  }

  const totalRounds = Math.log2(participantCount);
  const rounds: ITournamentRound[] = [];

  // 2. Build rounds in reverse (Final backwards to Round 0) to establish downstream links
  const matchesByRoundIndex: ITournamentMatch[][] = [];
  for (let r = 0; r < totalRounds; r++) {
    matchesByRoundIndex[r] = [];
  }

  // Create matches from Final (r = totalRounds - 1) backwards to Round 0
  for (let r = totalRounds - 1; r >= 0; r--) {
    const matchCountInRound = Math.pow(2, totalRounds - 1 - r);
    const roundName = getRoundName(r, totalRounds);

    for (let m = 0; m < matchCountInRound; m++) {
      const matchId = generateUUID();
      const nextMatch = r < totalRounds - 1 ? matchesByRoundIndex[r + 1][Math.floor(m / 2)] : undefined;
      const nextMatchSlot: "A" | "B" | undefined = nextMatch ? (m % 2 === 0 ? "A" : "B") : undefined;

      const match: ITournamentMatch = {
        id: matchId,
        tournamentId,
        stageIndex: 0,
        roundIndex: r,
        matchIndex: m,
        roundName,
        scoreA: 0,
        scoreB: 0,
        status: r === 0 ? "SCHEDULED" : "PENDING",
        nextMatchId: nextMatch?.id,
        nextMatchSlot,
      };

      matchesByRoundIndex[r].push(match);
    }
  }

  // 3. Populate Round 0 with seeded participants
  const round0Pairings = generateSeededPairings(participantCount);
  for (let m = 0; m < matchesByRoundIndex[0].length; m++) {
    const [seedA, seedB] = round0Pairings[m];
    const match = matchesByRoundIndex[0][m];
    match.participantAId = participantBySeed.get(seedA)?.id;
    match.participantBId = participantBySeed.get(seedB)?.id;
    match.status = "SCHEDULED";
  }

  // 4. Assemble Round entities
  for (let r = 0; r < totalRounds; r++) {
    const roundMatches = matchesByRoundIndex[r];
    rounds.push({
      id: generateUUID(),
      stageIndex: 0,
      roundIndex: r,
      name: getRoundName(r, totalRounds),
      status: r === 0 ? "IN_PROGRESS" : "PENDING",
      matches: roundMatches,
    });
  }

  // 5. Assemble Stage & Tournament
  const stage: ITournamentStage = {
    id: generateUUID(),
    stageIndex: 0,
    stageType: "KNOCKOUT",
    status: "IN_PROGRESS",
    rounds,
  };

  return {
    id: tournamentId,
    name: params.name,
    format: params.format,
    status: "IN_PROGRESS",
    participantType: params.participantType,
    gameModeId: params.gameModeId,
    participants,
    stages: [stage],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Authoritatively advances a completed knockout match.
 * Mutates the tournament object and returns progression metadata.
 */
export function advanceKnockoutMatch(
  tournament: ITournament,
  matchId: string,
  outcome: MatchOutcomeData,
): {
  tournament: ITournament;
  completedMatch: ITournamentMatch;
  advancedMatch?: ITournamentMatch;
  isTournamentComplete: boolean;
} {
  let targetMatch: ITournamentMatch | undefined;
  let targetRound: ITournamentRound | undefined;

  for (const stage of tournament.stages) {
    for (const round of stage.rounds) {
      for (const m of round.matches) {
        if (m.id === matchId) {
          targetMatch = m;
          targetRound = round;
          break;
        }
      }
      if (targetMatch) break;
    }
    if (targetMatch) break;
  }

  if (!targetMatch || !targetRound) {
    throw new Error(`Match ${matchId} not found in tournament ${tournament.id}`);
  }

  if (targetMatch.status === "COMPLETED") {
    throw new Error(`Match ${matchId} is already completed`);
  }

  const { winnerId, scoreA, scoreB, referencedMatchId } = outcome;
  if (winnerId !== targetMatch.participantAId && winnerId !== targetMatch.participantBId) {
    throw new Error(`Winner ${winnerId} is not a participant in match ${matchId}`);
  }

  // Resolve loser
  const loserId = winnerId === targetMatch.participantAId ? targetMatch.participantBId : targetMatch.participantAId;

  // 1. Update Match record
  targetMatch.winnerId = winnerId;
  targetMatch.scoreA = scoreA;
  targetMatch.scoreB = scoreB;
  targetMatch.status = "COMPLETED";
  if (referencedMatchId) {
    targetMatch.referencedMatchId = referencedMatchId;
  }

  // 2. Mark loser as eliminated
  if (loserId) {
    const loser = tournament.participants.find((p) => p.id === loserId);
    if (loser) {
      loser.isEliminated = true;
    }
  }

  // 3. Forward winner to next match or crown champion
  let advancedMatch: ITournamentMatch | undefined;
  let isTournamentComplete = false;

  if (targetMatch.nextMatchId) {
    // Find downstream match
    for (const stage of tournament.stages) {
      for (const round of stage.rounds) {
        for (const m of round.matches) {
          if (m.id === targetMatch.nextMatchId) {
            advancedMatch = m;
            break;
          }
        }
        if (advancedMatch) break;
      }
      if (advancedMatch) break;
    }

    if (advancedMatch) {
      if (targetMatch.nextMatchSlot === "A") {
        advancedMatch.participantAId = winnerId;
      } else {
        advancedMatch.participantBId = winnerId;
      }

      // If both slots are populated, schedule the match
      if (advancedMatch.participantAId && advancedMatch.participantBId) {
        advancedMatch.status = "SCHEDULED";
      }
    }
  } else {
    // Grand Final completed: Crown Champion
    isTournamentComplete = true;
    tournament.championId = winnerId;
    const champion = tournament.participants.find((p) => p.id === winnerId);
    if (champion) {
      champion.finalPlacement = 1;
      tournament.championName = champion.name;
    }

    if (loserId) {
      const runnerUp = tournament.participants.find((p) => p.id === loserId);
      if (runnerUp) {
        runnerUp.finalPlacement = 2;
      }
    }

    tournament.status = "COMPLETED";
  }

  // 4. Check if current round has completed
  const allMatchesInRoundDone = targetRound.matches.every((m) => m.status === "COMPLETED");
  if (allMatchesInRoundDone) {
    targetRound.status = "COMPLETED";

    // Assign placement to losers of this round if not already assigned
    const totalRounds = tournament.stages[0]?.rounds.length ?? 1;
    const roundsFromEnd = totalRounds - 1 - targetRound.roundIndex;
    if (roundsFromEnd === 1) {
      // Semifinal losers take placement 3
      for (const m of targetRound.matches) {
        const lId = m.winnerId === m.participantAId ? m.participantBId : m.participantAId;
        const p = tournament.participants.find((part) => part.id === lId);
        if (p && !p.finalPlacement) {
          p.finalPlacement = 3;
        }
      }
    } else if (roundsFromEnd === 2) {
      // Quarterfinal losers take placement 5
      for (const m of targetRound.matches) {
        const lId = m.winnerId === m.participantAId ? m.participantBId : m.participantAId;
        const p = tournament.participants.find((part) => part.id === lId);
        if (p && !p.finalPlacement) {
          p.finalPlacement = 5;
        }
      }
    }

    // Activate next round if available
    const nextRoundIndex = targetRound.roundIndex + 1;
    const nextRound = tournament.stages[0]?.rounds.find((r) => r.roundIndex === nextRoundIndex);
    if (nextRound && nextRound.status === "PENDING") {
      nextRound.status = "IN_PROGRESS";
    }
  }

  tournament.updatedAt = new Date();

  return {
    tournament,
    completedMatch: targetMatch,
    advancedMatch,
    isTournamentComplete,
  };
}
