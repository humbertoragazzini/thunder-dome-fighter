// ==================================================
// AUTOMATED TEST SUITE: PHASE 21 GRAND FINAL TRANSITION & STALE ROOM HANDOFF
//
// WHAT IT DOES:
// 1. Sets up 4 combatants in a Tournament Lobby.
// 2. Launches tournament -> 2 Semifinals spawned (SF1 & SF2).
// 3. P1 & P4 join SF1 GameRoom; P2 & P3 join SF2 GameRoom.
// 4. SF1 concludes: P1 wins; P1 leaves SF1 GameRoom (simulating return to Hub / waiting).
// 5. SF2 concludes: P2 wins; Grand Final is scheduled between P1 and P2.
// 6. Confirms MATCH_ASSIGNED dispatched for Grand Final to both finalists.
// 7. Tests REQUEST_MATCH_RESERVATION on-demand re-reservation from lobby.
// 8. Both P1 and P2 consume seat reservations and join Grand Final GameRoom.
// 9. Verifies BOTH players are actively in Grand Final GameRoom state (no player left stranded).
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
  const email = `finalist_${identifier}_${rand}@thunderdome.test`;
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
    playerId: user.player?.id,
    email: user.email,
    playerName: user.player?.playerName,
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

  return { user, token, playerName, playerId: user.player!.id };
}

async function runGrandFinalTransitionSuite() {
  console.log("=== STARTING PHASE 21 GRAND FINAL TRANSITION TEST SUITE ===\n");

  const TEST_PORT = 2599;
  const transport = new WebSocketTransport();
  const server = defineServer({
    transport,
    rooms: {
      tournament_lobby: defineRoom(TournamentLobbyRoom),
      game: defineRoom(GameRoom).filterBy(["modeId", "levelId"]),
    },
  });

  await server.listen(TEST_PORT);
  console.log(`Test Colyseus Server active on port ${TEST_PORT}\n`);

  const createdUserIds: string[] = [];

  try {
    // 1. Create 4 test players
    const [p1, p2, p3, p4] = await Promise.all([
      createTestSession("P1_Seed1"),
      createTestSession("P2_Seed2"),
      createTestSession("P3_Seed3"),
      createTestSession("P4_Seed4"),
    ]);
    createdUserIds.push(p1.user.id, p2.user.id, p3.user.id, p4.user.id);

    const client1 = new Client(`ws://127.0.0.1:${TEST_PORT}`);
    const client2 = new Client(`ws://127.0.0.1:${TEST_PORT}`);
    const client3 = new Client(`ws://127.0.0.1:${TEST_PORT}`);
    const client4 = new Client(`ws://127.0.0.1:${TEST_PORT}`);

    // Host creates tournament lobby
    const lobby1: Room = await client1.create("tournament_lobby", {
      token: p1.token,
      tournamentName: "Championship Final Cup",
      participantCapacity: 4,
      isPrivate: false,
    });

    // P2, P3, P4 join lobby
    const lobby2: Room = await client2.joinById(lobby1.roomId, { token: p2.token });
    const lobby3: Room = await client3.joinById(lobby1.roomId, { token: p3.token });
    const lobby4: Room = await client4.joinById(lobby1.roomId, { token: p4.token });

    console.log("[1/6] 4 Fighters enrolled in tournament lobby.");

    // Ready up
    lobby2.send(TournamentClientMessage.TOGGLE_READY);
    lobby3.send(TournamentClientMessage.TOGGLE_READY);
    lobby4.send(TournamentClientMessage.TOGGLE_READY);

    await new Promise((r) => setTimeout(r, 200));

    // Listen for match assignments
    const p1Assignments: TournamentMatchAssignedPayload[] = [];
    const p2Assignments: TournamentMatchAssignedPayload[] = [];
    const p3Assignments: TournamentMatchAssignedPayload[] = [];
    const p4Assignments: TournamentMatchAssignedPayload[] = [];

    lobby1.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (p: TournamentMatchAssignedPayload) => {
      p1Assignments.push(p);
    });
    lobby2.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (p: TournamentMatchAssignedPayload) => {
      p2Assignments.push(p);
    });
    lobby3.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (p: TournamentMatchAssignedPayload) => {
      p3Assignments.push(p);
    });
    lobby4.onMessage(TournamentServerMessage.MATCH_ASSIGNED, (p: TournamentMatchAssignedPayload) => {
      p4Assignments.push(p);
    });

    // Start tournament
    lobby1.send(TournamentClientMessage.START_TOURNAMENT);

    // Wait for Semifinal assignments
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (
          p1Assignments.length >= 1 &&
          p2Assignments.length >= 1 &&
          p3Assignments.length >= 1 &&
          p4Assignments.length >= 1
        ) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    console.log("[2/6] Semifinals launched. Connecting combatants to SF1 and SF2 GameRooms...");

    const sf1Payload = p1Assignments[0];
    const sf2Payload = p2Assignments[0];
    const tournamentId = sf1Payload.tournamentId;

    assert(sf1Payload.roundName.includes("Semifinal") || sf1Payload.roundName.includes("Round"), "SF1 round name valid");
    assert(sf2Payload.roundName.includes("Semifinal") || sf2Payload.roundName.includes("Round"), "SF2 round name valid");

    // P1 and P4 join SF1
    const p4Payload = p4Assignments[0];
    const gameRoomSf1P1: Room = await client1.consumeSeatReservation(sf1Payload.reservation);
    const gameRoomSf1P4: Room = await client4.consumeSeatReservation(p4Payload.reservation);

    await new Promise((r) => setTimeout(r, 300));

    const sf1Players = (gameRoomSf1P1.state as any).players;
    assert(sf1Players && sf1Players.size === 2, "SF1 GameRoom has both combatants");
    console.log("  ✓ SF1 GameRoom active with P1 and P4.");

    // P2 and P3 join SF2
    const p3Payload = p3Assignments[0];
    const gameRoomSf2P2: Room = await client2.consumeSeatReservation(sf2Payload.reservation);
    const gameRoomSf2P3: Room = await client3.consumeSeatReservation(p3Payload.reservation);

    await new Promise((r) => setTimeout(r, 300));

    const sf2Players = (gameRoomSf2P2.state as any).players;
    assert(sf2Players && sf2Players.size === 2, "SF2 GameRoom has both combatants");
    console.log("  ✓ SF2 GameRoom active with P2 and P3.");

    // 4. Semifinal 1 concludes: P1 wins
    console.log("\n[3/6] Concluding SF1 (P1 wins)...");
    const tourneyState = await tournamentCoordinatorService.getTournament(tournamentId);
    assert(tourneyState !== null, "Tournament state should be retrievable");
    const participantP1 = tourneyState.participants.find((p) => p.playerId === p1.playerId);
    const participantP2 = tourneyState.participants.find((p) => p.playerId === p2.playerId);
    assert(participantP1 !== undefined, "P1 participant exists");
    assert(participantP2 !== undefined, "P2 participant exists");

    await tournamentCoordinatorService.simulateMatchOutcome(
      tournamentId,
      sf1Payload.matchId,
      participantP1.id,
      5,
      1,
    );

    // P1 leaves SF1 GameRoom (returning to Hub or scoreboard handoff)
    await gameRoomSf1P1.leave();
    await gameRoomSf1P4.leave();
    console.log("  ✓ P1 and P4 left SF1 GameRoom. P1 is waiting in Tournament Hub.");

    // Brief delay to simulate P1 waiting while SF2 is still in progress
    await new Promise((r) => setTimeout(r, 500));
    assert(p1Assignments.length === 1, "P1 has not received Grand Final match yet (SF2 still playing)");

    // 5. Semifinal 2 concludes: P2 wins
    console.log("\n[4/6] Concluding SF2 (P2 wins)...");
    await tournamentCoordinatorService.simulateMatchOutcome(
      tournamentId,
      sf2Payload.matchId,
      participantP2.id,
      5,
      2,
    );

    // Wait for Grand Final MATCH_ASSIGNED on both P1 and P2
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for Grand Final MATCH_ASSIGNED events"));
      }, 5000);

      const check = setInterval(() => {
        if (p1Assignments.length >= 2 && p2Assignments.length >= 2) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    const gfPayloadP1 = p1Assignments[1];
    const gfPayloadP2 = p2Assignments[1];

    console.log("  ✓ Both finalists received Grand Final MATCH_ASSIGNED!");
    assert(gfPayloadP1.matchId === gfPayloadP2.matchId, "Both finalists assigned to SAME Grand Final match");
    assert(gfPayloadP1.roundName.includes("Final"), "Round name indicates Final");
    assert(Boolean(gfPayloadP1.reservation), "P1 has valid Grand Final reservation");
    assert(Boolean(gfPayloadP2.reservation), "P2 has valid Grand Final reservation");

    // 6. Test on-demand reservation: REQUEST_MATCH_RESERVATION from lobby
    console.log("\n[5/6] Testing on-demand REQUEST_MATCH_RESERVATION from lobby...");
    const onDemandPromise = new Promise<TournamentMatchAssignedPayload>((resolve) => {
      const handler = (p: TournamentMatchAssignedPayload) => {
        if (p.matchId === gfPayloadP1.matchId && p !== gfPayloadP1) {
          resolve(p);
        }
      };
      lobby1.onMessage(TournamentServerMessage.MATCH_ASSIGNED, handler);
    });

    lobby1.send(TournamentClientMessage.REQUEST_MATCH_RESERVATION, {
      tournamentId,
      matchId: gfPayloadP1.matchId,
    });

    const refreshedReservation = await onDemandPromise;
    assert(Boolean(refreshedReservation.reservation), "On-demand reservation succeeded");
    console.log("  ✓ On-demand seat reservation generated and dispatched successfully.");

    // 7. Both finalists leave SF2/prior rooms and enter Grand Final
    console.log("\n[6/6] Connecting both finalists into Grand Final GameRoom...");
    await gameRoomSf2P2.leave();
    await gameRoomSf2P3.leave();

    // Finalists consume their Grand Final seat reservations
    const grandFinalP1: Room = await client1.consumeSeatReservation(refreshedReservation.reservation);
    const grandFinalP2: Room = await client2.consumeSeatReservation(gfPayloadP2.reservation);

    await new Promise((r) => setTimeout(r, 500));

    // VERIFICATION:
    assert(grandFinalP1.roomId === grandFinalP2.roomId, "Both finalists connected to identical Grand Final roomId");
    const gfPlayers = (grandFinalP1.state as any).players;
    assert(gfPlayers !== undefined, "Grand Final state has players map");
    assert(gfPlayers.size === 2, `Grand Final GameRoom must have 2 players, got ${gfPlayers.size}`);

    const hasP1 = gfPlayers.has(grandFinalP1.sessionId) || Array.from(gfPlayers.values()).some((p: any) => p.playerId === grandFinalP1.sessionId);
    const hasP2 = gfPlayers.has(grandFinalP2.sessionId) || Array.from(gfPlayers.values()).some((p: any) => p.playerId === grandFinalP2.sessionId);

    assert(hasP1, "P1 is active in Grand Final GameRoom");
    assert(hasP2, "P2 is active in Grand Final GameRoom");

    console.log(`  ✓ Grand Final active with Room ID: ${grandFinalP1.roomId}`);
    console.log(`  ✓ Both finalists (${p1.playerName} & ${p2.playerName}) successfully joined!`);
    console.log("  ✓ Neither player is left waiting or stranded!");

    // Clean up rooms
    await grandFinalP1.leave();
    await grandFinalP2.leave();
    await lobby1.leave();
    await lobby2.leave();
    await lobby3.leave();
    await lobby4.leave();

    console.log("\n==================================================");
    console.log("🏆 GRAND FINAL TRANSITION SUITE PASSED CLEANLY!");
    console.log("==================================================");
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await server.transport.shutdown();
  }
}

runGrandFinalTransitionSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
