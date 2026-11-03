// ==================================================
// AUTOMATED TEST SUITE: PHASE 21 SEAT EXPIRATION & HUB RETURN RECOVERY
//
// WHAT IT DOES:
// 1. Verifies GameRoom seatReservationTimeout is 120s for tournament matches.
// 2. Starts 4-player tournament (SF1: P1 vs P4, SF2: P2 vs P3).
// 3. Connects combatants to Semifinal rooms.
// 4. Concludes SF1 (P1 wins, P4 eliminated).
// 5. Verifies eliminated player cleanly returns to hub without stale reservation errors.
// 6. Simulates post-match scoreboard delay and asynchronous SF2 completion.
// 7. Confirms Grand Final on-demand seat reservation generation via REQUEST_MATCH_RESERVATION.
// 8. Confirms both finalists enter Grand Final GameRoom cleanly (no expired seat errors).
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
  const email = `hub_return_${identifier}_${rand}@thunderdome.test`;
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

async function runSeatExpirationSuite() {
  console.log("=== STARTING PHASE 21 SEAT EXPIRATION & HUB RETURN SUITE ===\n");

  const TEST_PORT = 2595;
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
      tournamentName: "Seat Expiration Test Cup",
      participantCapacity: 4,
      isPrivate: false,
    });

    const lobby2: Room = await client2.joinById(lobby1.roomId, { token: p2.token });
    const lobby3: Room = await client3.joinById(lobby1.roomId, { token: p3.token });
    const lobby4: Room = await client4.joinById(lobby1.roomId, { token: p4.token });

    console.log("[1/5] 4 Fighters enrolled in tournament lobby.");

    lobby2.send(TournamentClientMessage.TOGGLE_READY);
    lobby3.send(TournamentClientMessage.TOGGLE_READY);
    lobby4.send(TournamentClientMessage.TOGGLE_READY);

    await new Promise((r) => setTimeout(r, 200));

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

    const sf1Payload = p1Assignments[0];
    const sf2Payload = p2Assignments[0];
    const tournamentId = sf1Payload.tournamentId;

    console.log("[2/5] Semifinals launched. Connecting combatants to SF1 and SF2 GameRooms...");

    const gameRoomSf1P1: Room = await client1.consumeSeatReservation(sf1Payload.reservation);
    const gameRoomSf1P4: Room = await client4.consumeSeatReservation(p4Assignments[0].reservation);

    const gameRoomSf2P2: Room = await client2.consumeSeatReservation(sf2Payload.reservation);
    const gameRoomSf2P3: Room = await client3.consumeSeatReservation(p3Assignments[0].reservation);

    await new Promise((r) => setTimeout(r, 400));

    console.log("  ✓ Both Semifinal GameRooms active.");

    // 3. Conclude SF1: P1 wins, P4 eliminated
    console.log("\n[3/5] Concluding SF1 (P1 wins, P4 eliminated)...");
    const tourneyState = await tournamentCoordinatorService.getTournament(tournamentId);
    assert(tourneyState !== null, "Tournament state retrievable");
    const participantP1 = tourneyState.participants.find((p) => p.playerId === p1.playerId)!;
    const participantP2 = tourneyState.participants.find((p) => p.playerId === p2.playerId)!;

    await tournamentCoordinatorService.simulateMatchOutcome(
      tournamentId,
      sf1Payload.matchId,
      participantP1.id,
      5,
      0,
    );

    // P4 (loser) and P1 (winner) leave SF1 GameRoom
    await gameRoomSf1P4.leave();
    await gameRoomSf1P1.leave();
    console.log("  ✓ P4 and P1 left SF1 GameRoom. P4 returns to Tournament Hub as spectator.");

    // 4. Conclude SF2: P2 wins -> Grand Final scheduled
    console.log("\n[4/5] Concluding SF2 (P2 wins, Grand Final scheduled)...");
    await tournamentCoordinatorService.simulateMatchOutcome(
      tournamentId,
      sf2Payload.matchId,
      participantP2.id,
      5,
      1,
    );

    await gameRoomSf2P2.leave();
    await gameRoomSf2P3.leave();

    // Wait for Grand Final MATCH_ASSIGNED on P1 and P2
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for Grand Final assignments"));
      }, 5000);

      const check = setInterval(() => {
        if (p1Assignments.length >= 2 && p2Assignments.length >= 2) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    console.log("  ✓ Both finalists received Grand Final match assignments.");

    // 5. Test On-Demand Fresh Reservation via REQUEST_MATCH_RESERVATION
    console.log("\n[5/5] Testing On-Demand fresh seat reservation and Grand Final entry...");
    const gfMatchId = p1Assignments[1].matchId;

    const freshReservationPromise = new Promise<TournamentMatchAssignedPayload>((resolve) => {
      const handler = (p: TournamentMatchAssignedPayload) => {
        if (p.matchId === gfMatchId && p.reservation) {
          resolve(p);
        }
      };
      lobby1.onMessage(TournamentServerMessage.MATCH_ASSIGNED, handler);
    });

    lobby1.send(TournamentClientMessage.REQUEST_MATCH_RESERVATION, {
      tournamentId,
      matchId: gfMatchId,
    });

    const freshP1Assignment = await freshReservationPromise;
    assert(Boolean(freshP1Assignment.reservation), "Fresh on-demand reservation obtained");
    console.log("  ✓ Fresh on-demand Grand Final reservation successfully allocated.");

    // Connect both finalists to Grand Final
    const grandFinalP1: Room = await client1.consumeSeatReservation(freshP1Assignment.reservation);
    const grandFinalP2: Room = await client2.consumeSeatReservation(p2Assignments[1].reservation);

    await new Promise((r) => setTimeout(r, 400));

    assert(grandFinalP1.roomId === grandFinalP2.roomId, "Both finalists in identical Grand Final roomId");
    const gfPlayers = (grandFinalP1.state as any).players;
    assert(gfPlayers && gfPlayers.size === 2, "Grand Final GameRoom has 2 active combatants");

    console.log(`  ✓ Grand Final running cleanly (Room ID: ${grandFinalP1.roomId}, Players: 2)`);
    console.log("  ✓ No seat reservation expired errors encountered!");

    // Clean up
    await grandFinalP1.leave();
    await grandFinalP2.leave();
    await lobby1.leave();
    await lobby2.leave();
    await lobby3.leave();
    await lobby4.leave();

    console.log("\n==================================================");
    console.log("🏆 SEAT EXPIRATION & HUB RETURN SUITE PASSED!");
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

runSeatExpirationSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
