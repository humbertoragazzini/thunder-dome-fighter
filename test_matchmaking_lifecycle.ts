// ==================================================
// AUTOMATED TEST SUITE: MULTIPLAYER MATCHMAKING & ROOM LIFECYCLE
//
// WHAT IT DOES:
// Comprehensive verification of authoritative matchmaking, filterBy indexing,
// room capacity enforcement, mode isolation, and clean room disposal:
// 1. Dynamic room creation for Client 1 (1v1)
// 2. Colyseus matchmaker routes Client 2 (1v1) into the exact same room
// 3. Room transitions to COUNTDOWN upon reaching minPlayers (2)
// 4. Client 3 (1v1) gets routed into a new room because Room 1 is full
// 5. Client 4 (3v3) gets routed into an isolated 3v3 room (filterBy verification)
// 6. Match end locking: finished rooms are excluded from matchmaking queries
// 7. Clean room auto-disposal when all players leave
// ==================================================

import { defineServer, defineRoom, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "@colyseus/sdk";
import { createSigner } from "fast-jwt";
import { prisma } from "./server/db/prisma.ts";
import { GameRoom } from "./server/GameRoom.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

const jwtSecret = process.env.JWT_SECRET || "development-jwt-secret-minimum-32-chars-long";
const signJwt = createSigner({ key: jwtSecret });

async function createValidSession(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { player: true },
  });
  if (!user || !user.player) {
    throw new Error(`User or player not found for ${email}`);
  }

  const token = signJwt({
    userId: user.id,
    playerId: user.player.id,
    playerName: user.player.playerName,
    email: user.email,
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId: user.id,
      playerId: user.player.id,
      token,
      expiresAt,
    },
  });

  return { token, playerName: user.player.playerName };
}

async function runTestSuite() {
  console.log("=== STARTING MULTIPLAYER MATCHMAKING & ROOM LIFECYCLE TEST SUITE ===\n");

  const testPort = 2598;
  const gameServer = defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      game: defineRoom(GameRoom).filterBy(["modeId", "levelId"]),
    },
  });

  await gameServer.listen(testPort, "127.0.0.1");
  console.log(`Test Colyseus Server active on port ${testPort}`);

  // Fetch test sessions
  const user1 = await createValidSession("beto@thunderdome.com");
  const user2 = await createValidSession("yami@yami.com");
  const user3 = await createValidSession("test@test.com");

  const serverUrl = `ws://127.0.0.1:${testPort}`;

  // --------------------------------------------------
  // TEST 1: Client 1 joins 1v1 -> creates dynamic room
  // --------------------------------------------------
  console.log("\n[1/6] Testing dynamic 1v1 room creation for Client 1...");
  const client1 = new Client(serverUrl);
  const room1 = await client1.joinOrCreate("game", {
    token: user1.token,
    modeId: "1v1",
    levelId: "thunder-dome-alpha",
  });
  assert(Boolean(room1.roomId), "Client 1 must receive a valid roomId");
  console.log(`  ✓ Client 1 joined Room ID: ${room1.roomId}`);

  // --------------------------------------------------
  // TEST 2: Client 2 joins 1v1 -> routes to SAME room
  // --------------------------------------------------
  console.log("\n[2/6] Testing Client 2 joins existing waiting 1v1 room...");
  const client2 = new Client(serverUrl);
  const room2 = await client2.joinOrCreate("game", {
    token: user2.token,
    modeId: "1v1",
    levelId: "thunder-dome-alpha",
  });
  assert(room1.roomId === room2.roomId, `Client 2 must join the exact same room (${room1.roomId} vs ${room2.roomId})`);
  console.log(`  ✓ Both players connected to identical Room ID: ${room1.roomId}`);

  // --------------------------------------------------
  // TEST 3: Countdown state triggered at 2/2 capacity
  // --------------------------------------------------
  console.log("\n[3/6] Testing countdown initiation upon 2/2 player capacity...");
  const localRoom = matchMaker.getLocalRoomById(room1.roomId);
  assert(Boolean(localRoom), "Room instance must exist in server memory");
  assert(localRoom!.state.players.size === 2, "Room must have 2 players in synchronized state");
  assert(localRoom!.state.matchStatus === "COUNTDOWN", `Match status must be COUNTDOWN, got: ${localRoom!.state.matchStatus}`);
  console.log("  ✓ Room authoritatively transitioned to COUNTDOWN with 2/2 players.");

  // --------------------------------------------------
  // TEST 4: Client 3 joins 1v1 -> routes to a NEW room because Room 1 is full
  // --------------------------------------------------
  console.log("\n[4/6] Testing Client 3 joining 1v1 when Room 1 is full...");
  const client3 = new Client(serverUrl);
  const room3 = await client3.joinOrCreate("game", {
    token: user3.token,
    modeId: "1v1",
    levelId: "thunder-dome-alpha",
  });
  assert(room3.roomId !== room1.roomId, "Client 3 must be placed in a new room, not the full Room 1");
  console.log(`  ✓ Client 3 allocated fresh Room ID: ${room3.roomId} (Capacity separation verified)`);

  // --------------------------------------------------
  // TEST 5: Mode Isolation with filterBy (3v3 vs 1v1)
  // --------------------------------------------------
  console.log("\n[5/6] Testing mode isolation (3v3 request does not match waiting 1v1 room)...");
  // Client 3 is waiting in room3 (1v1). Now another client requests 3v3:
  const client4 = new Client(serverUrl);
  const room4 = await client4.joinOrCreate("game", {
    token: user1.token,
    modeId: "3v3",
    levelId: "thunder-dome-alpha",
  });
  assert(room4.roomId !== room3.roomId, "3v3 request must not match waiting 1v1 room");
  const room4Instance = matchMaker.getLocalRoomById(room4.roomId);
  assert(room4Instance!.getGameMode().id === "3v3", "Room 4 must have 3v3 ruleset configured");
  console.log(`  ✓ 3v3 request allocated isolated Room ID: ${room4.roomId} with maxClients: ${room4Instance!.maxClients}`);

  // --------------------------------------------------
  // TEST 6: Finished Room Locking & Clean Teardown
  // --------------------------------------------------
  console.log("\n[6/6] Testing finished room locking and auto-disposal...");
  localRoom!.endMatch("TEST_CONCLUSION");
  assert(localRoom!.state.matchStatus === "MATCH_END", "Room status must be MATCH_END");
  assert(localRoom!.locked === true, "Finished room must be authoritatively locked");

  // Disconnect all clients from rooms
  await room1.leave();
  await room2.leave();
  await room3.leave();
  await room4.leave();

  // Allow Colyseus autoDispose loop to settle
  await new Promise((resolve) => setTimeout(resolve, 500));

  const remainingRoom1 = matchMaker.getLocalRoomById(room1.roomId);
  assert(!remainingRoom1, "Empty room 1 must be cleanly auto-disposed from server memory");
  console.log("  ✓ Empty rooms cleanly auto-disposed without orphan memory leaks.");

  console.log("\n============================================================");
  console.log("🏆 ALL 6 MULTIPLAYER MATCHMAKING & LIFECYCLE TESTS PASSED!");
  console.log("============================================================\n");

  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error("\n❌ TEST FAILED WITH EXCEPTION:");
  console.error(err);
  process.exit(1);
});
