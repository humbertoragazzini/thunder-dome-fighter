// ==================================================
// AUTOMATED TEST SUITE: PHASE 20 TOURNAMENT ENGINE
//
// WHAT IT DOES:
// Comprehensive end-to-end verification of Phase 20 Generic Competition
// & Tournament Core Architecture:
// 1. Bracket Seeding: Deterministic generation of 4-participant knockout tree (Semifinals -> Final).
// 2. PostgreSQL Persistence: Atomic creation, reading, and reconstitution via Prisma.
// 3. Stage & Round Progression: Advancing winners, feeder slot resolution, participant elimination.
// 4. Final Match & Champion Resolution: Crowning champion and resolving 1st, 2nd, 3rd/4th placements.
// 5. Authoritative GameRoom Integration: Colyseus match allocation with tournamentMatchId metadata.
// 6. Database Cleanup & Graceful Teardown.
// ==================================================

import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { prisma } from "./server/db/prisma.js";
import { GameRoom } from "./server/GameRoom.js";
import { TournamentCoordinatorService } from "./server/tournament/TournamentCoordinatorService.js";
import { TournamentRepository } from "./server/tournament/TournamentRepository.js";
import { generateKnockoutTournament } from "./shared/domain/tournament/BracketGenerator.js";
import type { CreateTournamentParams } from "./shared/domain/tournament/TournamentTypes.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runTestSuite() {
  console.log("=== STARTING PHASE 20 TOURNAMENT ENGINE TEST SUITE ===\n");

  const repository = new TournamentRepository(prisma);
  const coordinator = new TournamentCoordinatorService(repository);

  const testPort = 2598;
  const gameServer = defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      game: defineRoom(GameRoom),
    },
  });

  await gameServer.listen(testPort);
  console.log(`Test Colyseus Server active on port ${testPort}\n`);

  try {
    // --------------------------------------------------
    // Step 1: Pure Bracket Generation & Seeding
    // --------------------------------------------------
    console.log("[1/6] Testing pure bracket generation and 4-participant seeding fold...");

    const testParams: CreateTournamentParams = {
      name: "Thunder Dome Invitational",
      format: "KNOCKOUT",
      participantType: "INDIVIDUAL",
      gameModeId: "1v1",
      participants: [
        { name: "StrikerAlpha", seed: 1 },
        { name: "BrawlerBeta", seed: 2 },
        { name: "ShadowGamma", seed: 3 },
        { name: "CyberDelta", seed: 4 },
      ],
    };

    const pureTournament = generateKnockoutTournament(testParams);
    assert(pureTournament.participants.length === 4, "Must have 4 participants");
    assert(pureTournament.stages.length === 1, "Must have 1 stage");

    const stage = pureTournament.stages[0];
    assert(stage.rounds.length === 2, "Must have 2 rounds (Semifinals and Final)");

    const sfRound = stage.rounds[0];
    const finalRound = stage.rounds[1];
    assert(sfRound.name === "Semifinals", "Round 0 must be Semifinals");
    assert(finalRound.name === "Final", "Round 1 must be Final");
    assert(sfRound.matches.length === 2, "Semifinals must have 2 matches");
    assert(finalRound.matches.length === 1, "Final must have 1 match");

    const sf1 = sfRound.matches[0];
    const sf2 = sfRound.matches[1];
    const finalMatch = finalRound.matches[0];

    const p1 = pureTournament.participants.find((p) => p.seed === 1)!;
    const p2 = pureTournament.participants.find((p) => p.seed === 2)!;
    const p3 = pureTournament.participants.find((p) => p.seed === 3)!;
    const p4 = pureTournament.participants.find((p) => p.seed === 4)!;

    // SF1: Seed 1 vs Seed 4 -> feeds Final Slot A
    assert(sf1.participantAId === p1.id, "SF1 participant A must be Seed 1");
    assert(sf1.participantBId === p4.id, "SF1 participant B must be Seed 4");
    assert(sf1.nextMatchId === finalMatch.id, "SF1 must link to Final");
    assert(sf1.nextMatchSlot === "A", "SF1 must feed Final slot A");
    assert(sf1.status === "SCHEDULED", "SF1 must be SCHEDULED");

    // SF2: Seed 2 vs Seed 3 -> feeds Final Slot B
    assert(sf2.participantAId === p2.id, "SF2 participant A must be Seed 2");
    assert(sf2.participantBId === p3.id, "SF2 participant B must be Seed 3");
    assert(sf2.nextMatchId === finalMatch.id, "SF2 must link to Final");
    assert(sf2.nextMatchSlot === "B", "SF2 must feed Final slot B");
    assert(sf2.status === "SCHEDULED", "SF2 must be SCHEDULED");

    // Final: unpopulated slots, PENDING
    assert(finalMatch.participantAId === undefined, "Final slot A must initially be empty");
    assert(finalMatch.participantBId === undefined, "Final slot B must initially be empty");
    assert(finalMatch.status === "PENDING", "Final must initially be PENDING");
    assert(finalMatch.nextMatchId === undefined, "Final has no downstream match");

    console.log("  ✓ Seeding fold verified: SF1 (Seed 1 vs 4 -> Final A) & SF2 (Seed 2 vs 3 -> Final B).");

    // --------------------------------------------------
    // Step 2: Atomic PostgreSQL Persistence via Prisma
    // --------------------------------------------------
    console.log("\n[2/6] Testing atomic PostgreSQL persistence and reconstitution via Prisma...");
    const created = await coordinator.createTournament(testParams);

    assert(Boolean(created.id), "Tournament ID must be assigned");

    // Reconstitute from PostgreSQL
    const loaded = await repository.getTournamentById(created.id);
    assert(loaded !== null, "Must successfully query tournament from DB");
    assert(loaded.name === "Thunder Dome Invitational", "Tournament name must match");
    assert(loaded.participants.length === 4, "Must load all 4 participants");
    assert(loaded.stages.length === 1, "Must load stage");
    assert(loaded.stages[0].rounds.length === 2, "Must load 2 rounds");
    assert(loaded.stages[0].rounds[0].matches.length === 2, "Must load 2 semifinal matches");
    assert(loaded.stages[0].rounds[1].matches.length === 1, "Must load 1 final match");

    console.log(`  ✓ Persisted and reconstituted Tournament ${created.id} with complete relational tree.`);

    // --------------------------------------------------
    // Step 3: Match Progression & Feeder Slot Resolution
    // --------------------------------------------------
    console.log("\n[3/6] Testing Semifinal 1: Seed 1 defeats Seed 4 (7 - 3)...");

    const loadedSf1 = loaded.stages[0].rounds[0].matches[0];
    const sf1Result = await coordinator.simulateMatchOutcome(
      created.id,
      loadedSf1.id,
      loadedSf1.participantAId!,
      7,
      3,
    );

    assert(!sf1Result.isTournamentComplete, "Tournament must not be complete after SF1");
    const afterSf1 = sf1Result.tournament;
    const updatedSf1 = afterSf1.stages[0].rounds[0].matches[0];
    assert(updatedSf1.status === "COMPLETED", "SF1 must be COMPLETED");
    assert(updatedSf1.winnerId === loadedSf1.participantAId, "SF1 winner must be Seed 1");
    assert(updatedSf1.scoreA === 7 && updatedSf1.scoreB === 3, "SF1 scores must be 7-3");

    const eliminatedSeed4 = afterSf1.participants.find((p) => p.id === loadedSf1.participantBId)!;
    assert(eliminatedSeed4.isEliminated === true, "Seed 4 must be eliminated");

    const updatedFinalSlotA = afterSf1.stages[0].rounds[1].matches[0];
    assert(updatedFinalSlotA.participantAId === loadedSf1.participantAId, "Final Slot A must now be Seed 1");
    assert(updatedFinalSlotA.status === "PENDING", "Final must remain PENDING until Slot B is filled");

    console.log("  ✓ SF1 outcome processed: Seed 1 advanced to Final Slot A, Seed 4 eliminated.");

    // --------------------------------------------------
    // Step 4: Semifinal 2 & Final Match Promotion
    // --------------------------------------------------
    console.log("\n[4/6] Testing Semifinal 2: Seed 3 defeats Seed 2 (7 - 5)...");

    const loadedSf2 = afterSf1.stages[0].rounds[0].matches[1];
    // Seed 3 is participantB in loadedSf2
    const sf2Result = await coordinator.simulateMatchOutcome(
      created.id,
      loadedSf2.id,
      loadedSf2.participantBId!,
      5,
      7,
    );

    assert(!sf2Result.isTournamentComplete, "Tournament must not be complete after SF2");
    const afterSf2 = sf2Result.tournament;
    const updatedSf2 = afterSf2.stages[0].rounds[0].matches[1];
    assert(updatedSf2.status === "COMPLETED", "SF2 must be COMPLETED");
    assert(updatedSf2.winnerId === loadedSf2.participantBId, "SF2 winner must be Seed 3");

    const eliminatedSeed2 = afterSf2.participants.find((p) => p.id === loadedSf2.participantAId)!;
    assert(eliminatedSeed2.isEliminated === true, "Seed 2 must be eliminated");

    // Check round 0 and round 1 statuses
    assert(afterSf2.stages[0].rounds[0].status === "COMPLETED", "Round 0 (Semifinals) must now be COMPLETED");
    assert(afterSf2.stages[0].rounds[1].status === "IN_PROGRESS", "Round 1 (Final) must now be IN_PROGRESS");

    const readyFinal = afterSf2.stages[0].rounds[1].matches[0];
    assert(readyFinal.participantAId === loadedSf1.participantAId, "Final Slot A is Seed 1");
    assert(readyFinal.participantBId === loadedSf2.participantBId, "Final Slot B is Seed 3");
    assert(readyFinal.status === "SCHEDULED", "Final match must be promoted to SCHEDULED");

    console.log("  ✓ SF2 outcome processed: Seed 3 advanced to Final Slot B, Final promoted to SCHEDULED.");

    // --------------------------------------------------
    // Step 5: Grand Final & Championship Crowning
    // --------------------------------------------------
    console.log("\n[5/6] Testing Grand Final: Seed 1 defeats Seed 3 (7 - 6)...");

    const finalOutcome = await coordinator.simulateMatchOutcome(
      created.id,
      readyFinal.id,
      readyFinal.participantAId!, // Seed 1
      7,
      6,
    );

    assert(finalOutcome.isTournamentComplete === true, "Tournament must be complete after Final");
    const completedTournament = finalOutcome.tournament;

    assert(completedTournament.status === "COMPLETED", "Tournament status must be COMPLETED");
    assert(completedTournament.championId === readyFinal.participantAId, "Champion must be Seed 1");
    assert(completedTournament.championName === "StrikerAlpha", "Champion name must match");

    const champ = completedTournament.participants.find((p) => p.id === readyFinal.participantAId)!;
    const runnerUp = completedTournament.participants.find((p) => p.id === readyFinal.participantBId)!;
    const semi1 = completedTournament.participants.find((p) => p.seed === 2)!;
    const semi2 = completedTournament.participants.find((p) => p.seed === 4)!;

    assert(champ.finalPlacement === 1, "Champion placement must be 1");
    assert(runnerUp.finalPlacement === 2, "Runner-up placement must be 2");
    assert(semi1.finalPlacement === 3, "Semifinalist placement must be 3");
    assert(semi2.finalPlacement === 3, "Semifinalist placement must be 3");

    // Verify DB reflects completed championship
    const reloaded = await repository.getTournamentById(created.id);
    assert(reloaded !== null && reloaded.status === "COMPLETED", "DB tournament status must be COMPLETED");
    assert(reloaded.championId === champ.id, "DB championId must match");
    assert(reloaded.championName === "StrikerAlpha", "DB championName must match");

    console.log("  ✓ Champion crowned: StrikerAlpha (Placement 1), Runner-Up (Placement 2), Semifinalists (Placement 3).");

    // --------------------------------------------------
    // Step 6: Authoritative Colyseus GameRoom Integration
    // --------------------------------------------------
    console.log("\n[6/6] Testing GameRoom allocation with tournamentMatchId metadata...");

    const liveTournament = await coordinator.createTournament({
      name: "Live Championship",
      format: "KNOCKOUT",
      participantType: "INDIVIDUAL",
      gameModeId: "1v1",
      participants: [
        { name: "LiveFighter1", seed: 1 },
        { name: "LiveFighter2", seed: 2 },
      ],
    });

    const matchToSpawn = liveTournament.stages[0].rounds[0].matches[0];
    const spawnResult = await coordinator.spawnMatchGameRoom(liveTournament.id, matchToSpawn.id);

    assert(Boolean(spawnResult.gameRoomId), "Must allocate active GameRoom ID");
    assert(Boolean(spawnResult.room), "Must return room handle");

    const localRoom = spawnResult.room as any;
    assert(localRoom.tournamentId === liveTournament.id, "GameRoom must contain tournamentId");
    assert(localRoom.tournamentMatchId === matchToSpawn.id, "GameRoom must contain tournamentMatchId");

    console.log(`  ✓ GameRoom allocated: ${spawnResult.gameRoomId} linked to Tournament Match ${matchToSpawn.id}.`);

    // Clean up live GameRoom
    await localRoom.disconnect();

    // Clean up test tournament records from database
    await prisma.tournament.deleteMany({
      where: { id: { in: [created.id, liveTournament.id] } },
    });

    console.log("\n==================================================");
    console.log("🏆 ALL 6 TOURNAMENT ENGINE TESTS PASSED CLEANLY!");
    console.log("==================================================");
  } finally {
    await gameServer.gracefullyShutdown();
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
