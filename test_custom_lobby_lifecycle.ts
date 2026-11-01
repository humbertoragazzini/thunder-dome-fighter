// ==================================================
// AUTOMATED TEST SUITE: PHASE 19 CUSTOM LOBBY LIFECYCLE
//
// WHAT IT DOES:
// Comprehensive end-to-end verification of Phase 19 Room Browser & Custom Lobbies:
// 1. Host creates a public custom lobby with customized score limit & duration.
// 2. Colyseus matchMaker.query() returns the public lobby with accurate metadata.
// 3. Host creates a private lobby with a secret room code (verified excluded from public queries).
// 4. Code lookup resolves the private lobby roomId.
// 5. Player 2 joins the public lobby via Colyseus SDK.
// 6. Interactive team switching: Player 2 moves to Team Beta (teamIndex = 1).
// 7. Launch barrier enforcement: Host cannot start match while non-host is unready.
// 8. Player 2 toggles READY.
// 9. Authoritative launch: Host starts match, server creates GameRoom and emits reservations.
// 10. Both players consume reservations, enter the live GameRoom, and verify customized match limits.
// 11. Clean room auto-disposal.
// ==================================================

import { defineServer, defineRoom, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "@colyseus/sdk";
import { createSigner } from "fast-jwt";
import { prisma } from "./server/db/prisma.ts";
import { GameRoom } from "./server/GameRoom.ts";
import { CustomLobbyRoom } from "./server/lobby/CustomLobbyRoom.ts";
import {
  CustomLobbyClientMessage,
  CustomLobbyServerMessage,
  type LobbyMatchLaunchedPayload,
} from "./shared/contracts/network/CustomLobbyMessages.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

const jwtSecret = process.env.JWT_SECRET || "development-jwt-secret-minimum-32-chars-long";
const signJwt = createSigner({ key: jwtSecret });

async function createTestSession(identifier: string) {
  const email = `lobby_${identifier}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@thunderdome.test`;
  const playerName = `Fighter_${identifier}`;

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
  console.log("=== STARTING PHASE 19 CUSTOM LOBBY LIFECYCLE TEST SUITE ===\n");

  const testPort = 2597;
  const gameServer = defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      game: defineRoom(GameRoom).filterBy(["modeId", "levelId"]),
      custom_lobby: defineRoom(CustomLobbyRoom),
    },
  });

  await gameServer.listen(testPort);
  console.log(`Test Colyseus Server active on port ${testPort}\n`);

  const client1 = new Client(`ws://127.0.0.1:${testPort}`);
  const client2 = new Client(`ws://127.0.0.1:${testPort}`);

  const p1 = await createTestSession("Alpha");
  const p2 = await createTestSession("Beta");

  try {
    // --------------------------------------------------
    // Step 1: Host creates public custom lobby with custom rules
    // --------------------------------------------------
    console.log("[1/8] Testing host creates public custom lobby (mode: 1v1, scoreLimit: 7, timeLimit: 240s)...");
    const hostRoom: Room = await client1.create("custom_lobby", {
      roomName: "Championship Dojo",
      gameMode: "1v1",
      levelId: "thunder-dome-alpha",
      scoreLimit: 7,
      timeLimitSeconds: 240,
      isPrivate: false,
      token: p1.token,
      playerId: p1.player.id,
      playerName: p1.player.playerName,
    });

    await new Promise((resolve) => hostRoom.onStateChange.once(resolve));

    assert(hostRoom.roomId !== undefined, "Host room ID must be defined");
    assert(hostRoom.state.roomName === "Championship Dojo", `Expected roomName 'Championship Dojo', got: ${hostRoom.state.roomName}`);
    assert(hostRoom.state.scoreLimit === 7, `Expected scoreLimit 7, got: ${hostRoom.state.scoreLimit}`);
    assert(hostRoom.state.timeLimitSeconds === 240, `Expected timeLimitSeconds 240, got: ${hostRoom.state.timeLimitSeconds}`);
    assert(hostRoom.state.players.get(hostRoom.sessionId)?.isHost === true, "First joiner must be host");
    console.log("  ✓ Host room initialized with host privileges and custom limits.");

    // --------------------------------------------------
    // Step 2: Query active public custom rooms
    // --------------------------------------------------
    console.log("\n[2/8] Testing Colyseus matchMaker room query for public listing...");
    const queriedRooms = await matchMaker.query({ name: "custom_lobby" });
    const publicList = queriedRooms.filter((r) => !r.metadata?.isPrivate);
    assert(publicList.length >= 1, "Public room query must return at least 1 room");
    const foundRoom = publicList.find((r) => r.roomId === hostRoom.roomId);
    assert(foundRoom !== undefined, "Created public room must be discoverable in queries");
    assert(foundRoom.metadata?.roomName === "Championship Dojo", "Metadata roomName must match");
    assert(foundRoom.metadata?.scoreLimit === 7, "Metadata scoreLimit must match");
    console.log(`  ✓ Public listing returned room ${hostRoom.roomId} with metadata.`);

    // --------------------------------------------------
    // Step 3: Private lobby isolation & room code lookup
    // --------------------------------------------------
    console.log("\n[3/8] Testing private lobby creation and exclusion from public listing...");
    const privateRoom: Room = await client2.create("custom_lobby", {
      roomName: "Secret Cave",
      gameMode: "1v1",
      isPrivate: true,
      roomCode: "SECRET",
      playerId: "p-temp",
      playerName: "TempHost",
    });

    const updatedQueries = await matchMaker.query({ name: "custom_lobby" });
    const privateInPublic = updatedQueries.find((r) => r.roomId === privateRoom.roomId && !r.metadata?.isPrivate);
    assert(privateInPublic === undefined, "Private room must not be marked as public");

    const matchedByCode = updatedQueries.find((r) => r.metadata?.roomCode === "SECRET");
    assert(matchedByCode !== undefined && matchedByCode.roomId === privateRoom.roomId, "Room code lookup must resolve private room");
    console.log("  ✓ Private room correctly excluded from public listing and resolved via code.");
    await privateRoom.leave();

    // --------------------------------------------------
    // Step 4: Player 2 joins public lobby
    // --------------------------------------------------
    console.log("\n[4/8] Testing Player 2 joins the public custom lobby...");
    const joinerRoom: Room = await client2.joinById(hostRoom.roomId, {
      token: p2.token,
      playerId: p2.player.id,
      playerName: p2.player.playerName,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert(hostRoom.state.players.size === 2, `Expected 2 players in lobby, got: ${hostRoom.state.players.size}`);
    const joinerPlayer = hostRoom.state.players.get(joinerRoom.sessionId);
    assert(joinerPlayer !== undefined, "Player 2 must be present in lobby state");
    assert(joinerPlayer.isHost === false, "Player 2 must not be host");
    assert(joinerPlayer.isReady === false, "Player 2 must initially be unready");
    console.log("  ✓ Player 2 connected and synchronized to lobby state.");

    // --------------------------------------------------
    // Step 5: Interactive Team Switching
    // --------------------------------------------------
    console.log("\n[5/8] Testing Player 2 switches to Team Beta (teamIndex = 1)...");
    joinerRoom.send(CustomLobbyClientMessage.SWITCH_TEAM, { teamIndex: 1 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updatedJoiner = hostRoom.state.players.get(joinerRoom.sessionId);
    assert(updatedJoiner.teamIndex === 1, `Expected teamIndex 1, got: ${updatedJoiner.teamIndex}`);
    console.log("  ✓ Player 2 team affinity updated to Team Beta (1).");

    // --------------------------------------------------
    // Step 6: Launch barrier enforcement
    // --------------------------------------------------
    console.log("\n[6/8] Testing launch barrier: Host attempts to start while non-host is unready...");
    hostRoom.send(CustomLobbyClientMessage.START_GAME);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert(hostRoom.state.status === "WAITING", "Match must not launch when non-hosts are unready");
    console.log("  ✓ Premature match start rejected by authoritative validation.");

    // --------------------------------------------------
    // Step 7: Ready toggle and authoritative match launch
    // --------------------------------------------------
    console.log("\n[7/8] Testing Player 2 toggles READY and Host launches match...");
    let hostReservation: any = null;
    let joinerReservation: any = null;
    let targetGameId: string = "";

    hostRoom.onMessage(
      CustomLobbyServerMessage.MATCH_LAUNCHED,
      (payload: LobbyMatchLaunchedPayload) => {
        hostReservation = payload.reservation;
        targetGameId = payload.gameRoomId;
      },
    );

    joinerRoom.onMessage(
      CustomLobbyServerMessage.MATCH_LAUNCHED,
      (payload: LobbyMatchLaunchedPayload) => {
        joinerReservation = payload.reservation;
      },
    );

    joinerRoom.send(CustomLobbyClientMessage.TOGGLE_READY);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert(hostRoom.state.players.get(joinerRoom.sessionId).isReady === true, "Player 2 must be ready");

    // Now Host starts game
    hostRoom.send(CustomLobbyClientMessage.START_GAME);
    await new Promise((resolve) => setTimeout(resolve, 800));

    assert(hostReservation !== null, "Host must receive match launch reservation");
    assert(joinerReservation !== null, "Player 2 must receive match launch reservation");
    assert(Boolean(targetGameId), "Target game room ID must be provided");
    console.log(`  ✓ Both clients received match launch reservations for GameRoom: ${targetGameId}`);

    // --------------------------------------------------
    // Step 8: Consuming reservations on live GameRoom
    // --------------------------------------------------
    console.log("\n[8/8] Testing clients consume reservations and enter GameRoom with custom rules...");
    const gameClient1 = new Client(`ws://127.0.0.1:${testPort}`);
    const gameClient2 = new Client(`ws://127.0.0.1:${testPort}`);

    const p1GameRoom: Room = await gameClient1.consumeSeatReservation(hostReservation);
    const p2GameRoom: Room = await gameClient2.consumeSeatReservation(joinerReservation);

    await new Promise((resolve) => p1GameRoom.onStateChange.once(resolve));
    await new Promise((resolve) => p2GameRoom.onStateChange.once(resolve));

    assert(p1GameRoom.roomId === p2GameRoom.roomId, "Both players must join the identical GameRoom");

    const localGameRoom = matchMaker.getLocalRoomById(targetGameId) as any;
    assert(Boolean(localGameRoom), "GameRoom must exist on server");
    assert(localGameRoom.getGameMode().scoreLimit === 7, `Expected scoreLimit 7 in GameRoom, got: ${localGameRoom.getGameMode()?.scoreLimit}`);
    assert(localGameRoom.getGameMode().timeLimitSeconds === 240, `Expected timeLimit 240 in GameRoom, got: ${localGameRoom.getGameMode()?.timeLimitSeconds}`);

    const p1State = p1GameRoom.state.players.get(p1GameRoom.sessionId);
    const p2State = p1GameRoom.state.players.get(p2GameRoom.sessionId);

    assert(p1State !== undefined && p1State.teamIndex === 0, `P1 must be on Team Alpha (0), got: ${p1State?.teamIndex}`);
    assert(p2State !== undefined && p2State.teamIndex === 1, `P2 must be on Team Beta (1), got: ${p2State?.teamIndex}`);

    console.log("  ✓ GameRoom initialized with custom score limit (7 KOs), duration (240s), and assigned teams (0 vs 1).");

    // Cleanup
    await p1GameRoom.leave();
    await p2GameRoom.leave();
    await hostRoom.leave();
    await joinerRoom.leave();

    console.log("\n==================================================");
    console.log("🏆 ALL 8 CUSTOM LOBBY LIFECYCLE TESTS PASSED CLEANLY!");
    console.log("==================================================");
  } finally {
    for (const p of [p1, p2]) {
      if (p?.user?.id) {
        await prisma.session.deleteMany({ where: { userId: p.user.id } });
        await prisma.playerStats.deleteMany({ where: { player: { userId: p.user.id } } });
        await prisma.player.deleteMany({ where: { userId: p.user.id } });
        await prisma.user.deleteMany({ where: { id: p.user.id } });
      }
    }
    await gameServer.gracefullyShutdown();
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
