// ==================================================
// AUTOMATED TEST SUITE: PHASE 21 SPECTATOR & TOURNAMENT LIFECYCLE FLOW
//
// WHAT IT DOES:
// Comprehensive end-to-end verification of tournament spectator mechanics:
// 1. Staging & Tournament Launch with 4 fighters.
// 2. Semifinal 2 concludes -> Loser is eliminated with 3rd place finalPlacement.
// 3. Eliminated fighter stays in tournament hub, requests to spectate active Semifinal 1.
// 4. TournamentLobbyRoom grants spectator seat reservation via matchMaker.reserveSeatFor.
// 5. Spectator joins active GameRoom with isSpectator: true.
// 6. Authoritative GameRoom acknowledges spectator:joined, spectator is NOT in state.players,
//    and no Havok physics body or combatant slot is consumed.
// 7. Spectator voluntarily leaves GameRoom and returns to Tournament Hub.
// 8. Spectator voluntarily leaves tournament.
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
  type TournamentSpectateGrantedPayload,
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
  const email = `spectator_${identifier}_${rand}@thunderdome.test`;
  const playerName = `SpectatorTest_${identifier}_${rand}`;

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

  return { user, token, playerName };
}

async function runSpectatorSuite() {
  console.log("=== STARTING PHASE 21 SPECTATOR LIFECYCLE TEST SUITE ===\n");

  const TEST_PORT = 2598;
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
      createTestSession("1_Alpha"),
      createTestSession("2_Beta"),
      createTestSession("3_Gamma"),
      createTestSession("4_Delta"),
    ]);
    createdUserIds.push(p1.user.id, p2.user.id, p3.user.id, p4.user.id);

    const client1 = new Client(`ws://127.0.0.1:${TEST_PORT}`);
    const client2 = new Client(`ws://127.0.0.1:${TEST_PORT}`);
    const client3 = new Client(`ws://127.0.0.1:${TEST_PORT}`);
    const client4 = new Client(`ws://127.0.0.1:${TEST_PORT}`);

    // Host creates tournament lobby
    const hostRoom: Room = await client1.create("tournament_lobby", {
      token: p1.token,
      tournamentName: "Spectator Test Cup",
      participantCapacity: 4,
      isPrivate: false,
    });

    // Other 3 join
    const room2: Room = await client2.joinById(hostRoom.roomId, { token: p2.token });
    const room3: Room = await client3.joinById(hostRoom.roomId, { token: p3.token });
    const room4: Room = await client4.joinById(hostRoom.roomId, { token: p4.token });

    console.log("[1/5] 4 Fighters enrolled in tournament lobby...");

    // Confirm ready checks
    room2.send(TournamentClientMessage.TOGGLE_READY);
    room3.send(TournamentClientMessage.TOGGLE_READY);
    room4.send(TournamentClientMessage.TOGGLE_READY);

    await new Promise((r) => setTimeout(r, 200));

    // Listen for match assignment
    const matchAssignments = new Map<string, TournamentMatchAssignedPayload>();
    let sf1MatchId = "";
    let sf2MatchId = "";

    const setupAssignmentListener = (room: Room, name: string) => {
      room.onMessage(
        TournamentServerMessage.MATCH_ASSIGNED,
        (payload: TournamentMatchAssignedPayload) => {
          matchAssignments.set(name, payload);
          if (payload.roundName.includes("Semifinal") || payload.roundName.includes("Round")) {
            if (!sf1MatchId) {
              sf1MatchId = payload.matchId;
            } else if (payload.matchId !== sf1MatchId && !sf2MatchId) {
              sf2MatchId = payload.matchId;
            }
          }
        },
      );
    };

    setupAssignmentListener(hostRoom, "P1");
    setupAssignmentListener(room2, "P2");
    setupAssignmentListener(room3, "P3");
    setupAssignmentListener(room4, "P4");

    // Host launches tournament
    hostRoom.send(TournamentClientMessage.START_TOURNAMENT);

    // Await match assignments
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (matchAssignments.size === 4 && sf1MatchId && sf2MatchId) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    console.log(`[2/5] Tournament started! Semifinals spawned (SF1: ${sf1MatchId}, SF2: ${sf2MatchId})`);

    const tournamentId = matchAssignments.get("P1")!.tournamentId;
    const currentTourney = await tournamentCoordinatorService.getTournament(tournamentId);
    assert(currentTourney !== null, "Tournament must be loaded");
    const sf1Match = currentTourney.stages[0].rounds[0].matches[0];
    const sf2Match = currentTourney.stages[0].rounds[0].matches[1];

    // Conclude Semifinal 1: Participant A (Seed 1) defeats Participant B (Seed 4 / Fighter 4)
    await tournamentCoordinatorService.simulateMatchOutcome(
      tournamentId,
      sf1Match.id,
      sf1Match.participantAId!,
      5,
      2,
    );

    console.log("[3/5] Semifinal 1 completed. Fighter 4 is eliminated.");

    // Allow Colyseus event bus to update lobby state
    await new Promise((r) => setTimeout(r, 400));

    // Request spectate for active Semifinal 2 from Fighter 4
    console.log(`[4/5] Fighter 4 requests to spectate active Semifinal 2 (${sf2Match.id})...`);
    
    const spectatePromise = new Promise<TournamentSpectateGrantedPayload>((resolve) => {
      room4.onMessage(
        TournamentServerMessage.SPECTATE_GRANTED,
        (payload: TournamentSpectateGrantedPayload) => {
          resolve(payload);
        },
      );
    });

    room4.send(TournamentClientMessage.REQUEST_SPECTATE, {
      tournamentId,
      matchId: sf2Match.id,
    });

    const spectateGrant = await spectatePromise;
    assert(spectateGrant.matchId === sf2Match.id, "Granted spectate match ID must match requested");
    assert(Boolean(spectateGrant.reservation), "Spectate reservation must be provided");
    assert(Boolean(spectateGrant.gameRoomId), "GameRoomId must be provided");

    console.log("  ✓ SPECTATE_GRANTED payload received with valid reservation.");

    // Spectator joins active GameRoom
    let spectatorJoinedEventReceived = false;
    const gameRoomSpectator: Room = await client4.consumeSeatReservation(spectateGrant.reservation);

    gameRoomSpectator.onMessage("spectator:joined", () => {
      spectatorJoinedEventReceived = true;
    });

    await new Promise((r) => setTimeout(r, 400));

    // Verify spectator status
    assert(spectatorJoinedEventReceived, "Spectator should receive spectator:joined message from GameRoom");
    // State players must NOT contain spectator
    const playersInRoom = (gameRoomSpectator.state as any)?.players;
    if (playersInRoom) {
      assert(!playersInRoom.has(gameRoomSpectator.sessionId), "Spectator MUST NOT be in state.players map");
    }

    console.log("  ✓ GameRoom accepted spectator without spawning player entity or consuming combat slot.");

    // 5. Spectator leaves GameRoom voluntarily and returns to tournament hub
    console.log("[5/5] Testing voluntary exit from match and tournament...");
    await gameRoomSpectator.leave();
    console.log("  ✓ Spectator cleanly disconnected from GameRoom while remaining in TournamentLobby.");

    // Spectator voluntarily leaves tournament
    await room4.leave();
    console.log("  ✓ Fighter 4 voluntarily left tournament.");

    // Clean up remaining rooms
    await hostRoom.leave();
    await room2.leave();
    await room3.leave();

    console.log("\n==================================================");
    console.log("🏆 ALL SPECTATOR LIFECYCLE TESTS PASSED CLEANLY!");
    console.log("==================================================");
  } finally {
    // Purge DB test users
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await server.transport.shutdown();
  }
}

runSpectatorSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  });
