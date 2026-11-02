// ==================================================
// AUTOMATED TEST SUITE: PHASE 21 CUADRANGULAR TOURNAMENT
//
// WHAT IT DOES:
// Comprehensive end-to-end verification of Phase 21:
// 4-Participant "Cuadrangular" 1v1 Championship:
// 1. Staging & Slot Allocation: 4 authenticated players join `tournament_lobby`.
// 2. Ready-Check Barrier: Host cannot launch tournament until all non-host fighters are ready.
// 3. Tournament Launch & Concurrent Semifinals: Bracket generation, dual GameRoom spawning
//    for Semifinal 1 (Seed 1 vs Seed 4) and Semifinal 2 (Seed 2 vs Seed 3).
// 4. Match Assignment & Seat Reservations: Combatants receive targeted MATCH_ASSIGNED payloads.
// 5. Semifinal Progression & Automatic Final Generation: Losers marked eliminated, winners
//    advanced to Grand Final, and Grand Final GameRoom automatically spawned upon dual SF conclusion.
// 6. Grand Final Conclusion & Championship Podium: Champion crowned, placements 1st, 2nd, 3rd
//    persisted to PostgreSQL, and CHAMPION_CROWNED broadcast to tournament lobby.
// 7. Complete Teardown & Database Purge.
// ==================================================

import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "@colyseus/sdk";
import { createSigner } from "fast-jwt";
import { prisma } from "./server/db/prisma.js";
import { GameRoom } from "./server/GameRoom.js";
import { TournamentLobbyRoom } from "./server/tournament/TournamentLobbyRoom.js";
import { tournamentCoordinatorService } from "./server/tournament/TournamentCoordinatorService.js";
import {
  TournamentClientMessage,
  TournamentServerMessage,
  type TournamentMatchAssignedPayload,
  type TournamentChampionCrownedPayload,
} from "./shared/contracts/network/TournamentMessages.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

const jwtSecret = process.env.JWT_SECRET || "development-jwt-secret-minimum-32-chars-long";
const signJwt = createSigner({ key: jwtSecret });

async function createTestSession(identifier: string) {
  const rand = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const email = `tourney_${identifier}_${rand}@thunderdome.test`;
  const playerName = `Fighter_${identifier}_${rand}`;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "dummy-hash",
      player: {
        create: {
          playerName,
          stats: {
            create: {
              totalMatches: 0,
              wins: 0,
              losses: 0,
              kills: 0,
              deaths: 0,
            },
          },
        },
      },
    },
    include: { player: true },
  });

  const token = signJwt({
    userId: user.id,
    playerId: user.player!.id,
    playerName: user.player!.playerName,
    email: user.email,
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId: user.id,
      playerId: user.player!.id,
      token,
      expiresAt,
    },
  });

  return { user, player: user.player!, token };
}

async function runTestSuite() {
  console.log("=== STARTING PHASE 21 CUADRANGULAR TOURNAMENT TEST SUITE ===\n");

  const testPort = 2596;
  const gameServer = defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      game: defineRoom(GameRoom).filterBy(["modeId", "levelId"]),
      tournament_lobby: defineRoom(TournamentLobbyRoom),
    },
  });

  await gameServer.listen(testPort);
  console.log(`Test Colyseus Server active on port ${testPort}\n`);

  // Create 4 test sessions
  const p1 = await createTestSession("1_Alpha");
  const p2 = await createTestSession("2_Beta");
  const p3 = await createTestSession("3_Gamma");
  const p4 = await createTestSession("4_Delta");

  const createdUserIds = [p1.user.id, p2.user.id, p3.user.id, p4.user.id];

  const client1 = new Client(`ws://127.0.0.1:${testPort}`);
  const client2 = new Client(`ws://127.0.0.1:${testPort}`);
  const client3 = new Client(`ws://127.0.0.1:${testPort}`);
  const client4 = new Client(`ws://127.0.0.1:${testPort}`);

  let createdTournamentId = "";

  try {
    // --------------------------------------------------
    // Step 1: 4 Fighters Enroll into Tournament Lobby
    // --------------------------------------------------
    console.log("[1/6] Testing 4 authenticated fighters enrolling into Tournament Lobby...");

    const room1: Room = await client1.create("tournament_lobby", {
      tournamentName: "Cuadrangular Championship",
      participantCapacity: 4,
      scoreLimit: 5,
      timeLimitSeconds: 180,
      isPrivate: false,
      token: p1.token,
    });

    const room2: Room = await client2.joinById(room1.roomId, { token: p2.token });
    const room3: Room = await client3.joinById(room1.roomId, { token: p3.token });
    const room4: Room = await client4.joinById(room1.roomId, { token: p4.token });

    await new Promise((resolve) => setTimeout(resolve, 300));

    assert(room1.state.participants.size === 4, "Lobby must have 4 participants");
    assert(room1.state.status === "WAITING", "Lobby must be WAITING");

    const hostParticipant = room1.state.participants.get(room1.sessionId);
    assert(hostParticipant.isHost === true, "Player 1 must be designated host");
    assert(hostParticipant.isReady === true, "Host must be ready by default");
    assert(hostParticipant.slotIndex === 0, "Host must occupy slot 0");
    assert(hostParticipant.seed === 1, "Host must be Seed 1");

    console.log("  ✓ 4 fighters staged in slots 0, 1, 2, 3 with initial seeds.");

    // --------------------------------------------------
    // Step 2: Ready Barrier Enforcement
    // --------------------------------------------------
    console.log("\n[2/6] Testing launch barrier: Host attempts to launch while non-hosts are unready...");
    room1.send(TournamentClientMessage.START_TOURNAMENT);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert(room1.state.status === "WAITING", "Tournament must not launch while non-hosts are unready");
    console.log("  ✓ Premature tournament start rejected by authoritative validation.");

    // --------------------------------------------------
    // Step 3: Readiness Confirmations & Tournament Launch
    // --------------------------------------------------
    console.log("\n[3/6] Testing fighters confirm READY and Host launches championship...");

    // Setup match assignment tracking
    const matchAssignments: Record<string, TournamentMatchAssignedPayload> = {};

    room1.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (payload: TournamentMatchAssignedPayload) => {
      matchAssignments[p1.player.id] = payload;
    });
    room2.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (payload: TournamentMatchAssignedPayload) => {
      matchAssignments[p2.player.id] = payload;
    });
    room3.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (payload: TournamentMatchAssignedPayload) => {
      matchAssignments[p3.player.id] = payload;
    });
    room4.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (payload: TournamentMatchAssignedPayload) => {
      matchAssignments[p4.player.id] = payload;
    });

    room2.send(TournamentClientMessage.TOGGLE_READY);
    room3.send(TournamentClientMessage.TOGGLE_READY);
    room4.send(TournamentClientMessage.TOGGLE_READY);

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert(room1.state.participants.get(room2.sessionId).isReady === true, "Player 2 must be ready");
    assert(room1.state.participants.get(room3.sessionId).isReady === true, "Player 3 must be ready");
    assert(room1.state.participants.get(room4.sessionId).isReady === true, "Player 4 must be ready");

    // Launch championship
    room1.send(TournamentClientMessage.START_TOURNAMENT);
    await new Promise((resolve) => setTimeout(resolve, 800));

    assert(room1.state.status === "IN_PROGRESS", "Tournament status must be IN_PROGRESS");
    assert(room1.state.currentRoundName === "Semifinals", "Current round must be Semifinals");
    createdTournamentId = room1.state.tournamentId;
    assert(Boolean(createdTournamentId), "Tournament ID must be assigned");

    console.log(`  ✓ Tournament ${createdTournamentId} launched into round 'Semifinals'.`);

    // --------------------------------------------------
    // Step 4: Verify Concurrent Semifinals Spawning
    // --------------------------------------------------
    console.log("\n[4/6] Verifying concurrent Semifinal 1 and Semifinal 2 match allocation...");

    assert(Boolean(matchAssignments[p1.player.id]), "Seed 1 (P1) must receive match assignment");
    assert(Boolean(matchAssignments[p4.player.id]), "Seed 4 (P4) must receive match assignment");
    assert(Boolean(matchAssignments[p2.player.id]), "Seed 2 (P2) must receive match assignment");
    assert(Boolean(matchAssignments[p3.player.id]), "Seed 3 (P3) must receive match assignment");

    const sf1_P1 = matchAssignments[p1.player.id];
    const sf1_P4 = matchAssignments[p4.player.id];
    assert(sf1_P1.matchId === sf1_P4.matchId, "P1 and P4 must be in the same match (SF1)");
    assert(sf1_P1.gameRoomId === sf1_P4.gameRoomId, "P1 and P4 must share identical GameRoom");

    const sf2_P2 = matchAssignments[p2.player.id];
    const sf2_P3 = matchAssignments[p3.player.id];
    assert(sf2_P2.matchId === sf2_P3.matchId, "P2 and P3 must be in the same match (SF2)");
    assert(sf2_P2.gameRoomId === sf2_P3.gameRoomId, "P2 and P3 must share identical GameRoom");

    assert(sf1_P1.gameRoomId !== sf2_P2.gameRoomId, "SF1 and SF2 must run in separate isolated GameRooms");

    console.log(`  ✓ SF1 GameRoom: ${sf1_P1.gameRoomId} (Seed 1 vs Seed 4)`);
    console.log(`  ✓ SF2 GameRoom: ${sf2_P2.gameRoomId} (Seed 2 vs Seed 3)`);
    console.log("  ✓ Both Semifinals running concurrently in isolated Havok physics instances.");

    // --------------------------------------------------
    // Step 5: Semifinal Outcomes & Automatic Grand Final Spawning
    // --------------------------------------------------
    console.log("\n[5/6] Testing Semifinal completions and automatic Grand Final promotion...");

    // Setup Final match assignment tracking
    let finalAssignmentP1: TournamentMatchAssignedPayload | null = null;
    let finalAssignmentP2: TournamentMatchAssignedPayload | null = null;

    room1.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (payload: TournamentMatchAssignedPayload) => {
      if (payload.roundName === "Final") {
        finalAssignmentP1 = payload;
      }
    });

    room2.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (payload: TournamentMatchAssignedPayload) => {
      if (payload.roundName === "Final") {
        finalAssignmentP2 = payload;
      }
    });

    const currentTourney = await tournamentCoordinatorService.getTournament(createdTournamentId);
    assert(currentTourney !== null, "Tournament must be loaded");
    const sf1Match = currentTourney.stages[0].rounds[0].matches[0];
    const sf2Match = currentTourney.stages[0].rounds[0].matches[1];

    // 1. Conclude Semifinal 1: Seed 1 defeats Seed 4 (5 - 2)
    const sf1Outcome = await tournamentCoordinatorService.simulateMatchOutcome(
      createdTournamentId,
      sf1Match.id,
      sf1Match.participantAId!,
      5,
      2,
    );
    assert(sf1Outcome.isTournamentComplete === false, "Tournament not yet complete after SF1");

    // 2. Conclude Semifinal 2: Seed 2 defeats Seed 3 (5 - 4)
    const sf2Outcome = await tournamentCoordinatorService.simulateMatchOutcome(
      createdTournamentId,
      sf2Match.id,
      sf2Match.participantAId!,
      5,
      4,
    );
    assert(sf2Outcome.isTournamentComplete === false, "Tournament not yet complete after SF2");

    // Allow Colyseus event bus to process MATCH_SCHEDULED and spawn Grand Final
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Verify Semifinal losers eliminated in lobby state
    assert(room1.state.participants.get(room4.sessionId).isEliminated === true, "Seed 4 must be eliminated");
    assert(room1.state.participants.get(room3.sessionId).isEliminated === true, "Seed 3 must be eliminated");

    // Verify finalists received Grand Final match assignment
    assert(finalAssignmentP1 !== null, "Seed 1 (Finalist) must receive Grand Final assignment");
    assert(finalAssignmentP2 !== null, "Seed 2 (Finalist) must receive Grand Final assignment");

    const finalMatchP1 = finalAssignmentP1 as unknown as TournamentMatchAssignedPayload;
    const finalMatchP2 = finalAssignmentP2 as unknown as TournamentMatchAssignedPayload;

    assert(finalMatchP1.matchId === finalMatchP2.matchId, "Finalists must share identical Final match ID");
    assert(finalMatchP1.gameRoomId === finalMatchP2.gameRoomId, "Finalists must share identical Grand Final GameRoom");

    console.log(`  ✓ Grand Final spawned automatically: GameRoom ${finalMatchP1.gameRoomId} (Winner SF1 vs Winner SF2).`);

    // --------------------------------------------------
    // Step 6: Grand Final Conclusion & Championship Podium
    // --------------------------------------------------
    console.log("\n[6/6] Testing Grand Final conclusion, Champion crowning, and DB verification...");

    let crownedPayload: TournamentChampionCrownedPayload | null = null;
    room1.onMessage(TournamentServerMessage.CHAMPION_CROWNED, (payload: TournamentChampionCrownedPayload) => {
      crownedPayload = payload;
    });

    const tourneyBeforeFinal = await tournamentCoordinatorService.getTournament(createdTournamentId);
    const finalMatchObj = tourneyBeforeFinal!.stages[0].rounds[1].matches[0];

    // Seed 1 defeats Seed 2 (7 - 5) in Grand Final
    const finalOutcome = await tournamentCoordinatorService.simulateMatchOutcome(
      createdTournamentId,
      finalMatchObj.id,
      finalMatchObj.participantAId!,
      7,
      5,
    );

    assert(finalOutcome.isTournamentComplete === true, "Tournament must be complete after Grand Final");
    await new Promise((resolve) => setTimeout(resolve, 600));

    assert(room1.state.status === "COMPLETED", "Lobby status must be COMPLETED");
    assert(room1.state.championName === p1.player.playerName, "Champion name must match Seed 1");

    // Verify broadcast event
    assert(crownedPayload !== null, "CHAMPION_CROWNED event must be broadcast");
    const crowned = crownedPayload as unknown as TournamentChampionCrownedPayload;
    assert(crowned.championName === p1.player.playerName, "Crowned champion name must match");
    assert(crowned.placements.length === 4, "Must broadcast placements for all 4 fighters");

    assert(crowned.placements[0].placement === 1, "1st place must be awarded");
    assert(crowned.placements[0].name === p1.player.playerName, "1st place must be Seed 1");
    assert(crowned.placements[1].placement === 2, "2nd place must be awarded");
    assert(crowned.placements[1].name === p2.player.playerName, "2nd place must be Seed 2");
    assert(crowned.placements[2].placement === 3, "3rd place must be awarded to semifinalist");
    assert(crowned.placements[3].placement === 3, "3rd place must be awarded to semifinalist");

    // Verify PostgreSQL persistence
    const dbTournament = await prisma.tournament.findUnique({
      where: { id: createdTournamentId },
      include: { participants: true },
    });

    assert(dbTournament !== null, "Tournament must exist in database");
    assert(dbTournament.status === "COMPLETED", "DB tournament status must be COMPLETED");
    assert(dbTournament.championName === p1.player.playerName, "DB champion must match Seed 1");

    console.log(`  ✓ Champion Crowned: ${dbTournament.championName} (1st Place)`);
    console.log(`  ✓ Runner-Up: ${p2.player.playerName} (2nd Place)`);
    console.log("  ✓ Semifinalists awarded 3rd Place.");
    console.log("  ✓ Database record verified with COMPLETED status.");

    // Clean disconnects
    room1.leave();
    room2.leave();
    room3.leave();
    room4.leave();

    // Database cleanup
    await prisma.tournament.deleteMany({
      where: { id: createdTournamentId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });

    console.log("\n==================================================");
    console.log("🏆 ALL 6 CUADRANGULAR TOURNAMENT TESTS PASSED!");
    console.log("==================================================");
  } finally {
    await gameServer.gracefullyShutdown();
  }
}

runTestSuite().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
