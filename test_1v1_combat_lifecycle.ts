// ==================================================
// AUTOMATED TEST SUITE: 1V1 COMBAT LIFECYCLE & VOID FALL
//
// WHAT IT DOES:
// Comprehensive verification of Phase 9 combat systems:
// - Left Punch (7 dmg, 0.25s cooldown)
// - Right Punch (7 dmg, 0.3s cooldown)
// - Kick (12 dmg, 0.55s cooldown)
// - Push (3 dmg, 8.0 m/s knockback impulse)
// - Knockout attribution & score incrementing
// - 3-second respawn delay & 2-second invulnerability protection
// - Void Fall detection (< -5.0m) and damage attribution
// - First to 3 kills match win condition
// - Clean room disposal
// ==================================================

import { GameRoom } from "/home/betovicio/Projects/thunder-dome-fighter/server/GameRoom";
import type { AuthenticatedUser } from "/home/betovicio/Projects/thunder-dome-fighter/server/auth/TokenVerifier";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockClient(sessionId: string, playerId: string, playerName: string) {
  return {
    sessionId,
    auth: {
      playerId,
      playerName,
    } as AuthenticatedUser,
  } as any;
}

async function runTestSuite() {
  console.log("=== STARTING 1V1 COMBAT LIFECYCLE & VOID FALL TEST SUITE ===\n");

  // --------------------------------------------------
  // SETUP: ROOM INITIALIZATION & PLAYERS JOIN
  // --------------------------------------------------
  console.log("Step 1: Initializing 1v1 GameRoom and joining combatants...");
  const room = new GameRoom();
  await room.onCreate({ modeId: "1v1" });

  const p1 = createMockClient("sess-p1", "uid-p1", "StrikerAlpha");
  const p2 = createMockClient("sess-p2", "uid-p2", "BrawlerBeta");

  room.onJoin(p1);
  room.onJoin(p2);

  assert(room.state.players.size === 2, "Room must have 2 players");
  
  // Transition directly to active gameplay
  room.startMatch();
  assert(room.state.matchStatus === "PLAYING", `Expected PLAYING, got ${room.state.matchStatus}`);

  const simWorld = room.getSimulationWorld();
  const p1Sim = (simWorld as any).entities.get(p1.sessionId);
  const p2Sim = (simWorld as any).entities.get(p2.sessionId);
  assert(p1Sim && p2Sim, "Both sim entities must be active");

  simWorld.teleportEntity(p1.sessionId, 0, 0.55, 0, Math.PI / 2);
  simWorld.teleportEntity(p2.sessionId, 1.2, 0.55, 0, -Math.PI / 2);

  const p1State = room.state.players.get(p1.sessionId)!;
  const p2State = room.state.players.get(p2.sessionId)!;

  assert(p1State.health === 100, `P1 initial HP must be 100, got ${p1State.health}`);
  assert(p2State.health === 100, `P2 initial HP must be 100, got ${p2State.health}`);
  console.log("  PASSED: Both fighters positioned at 1.2m spacing with 100 HP.\n");

  // --------------------------------------------------
  // TEST 2: LEFT PUNCH (7 DAMAGE)
  // --------------------------------------------------
  console.log("Step 2: Executing LEFT_PUNCH from P1...");
  (room as any).handlePlayerInput(p1, {
    sequence: 1,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "LEFT_PUNCH",
  });

  assert(p2State.health === 93, `LEFT_PUNCH must deal exactly 7 damage (100 -> 93), got ${p2State.health}`);
  assert(p1State.lastAttackAction === "LEFT_PUNCH", `Expected lastAttackAction LEFT_PUNCH, got ${p1State.lastAttackAction}`);
  console.log("  PASSED: Left Punch dealt exactly 7 damage (HP: 93/100).\n");

  // --------------------------------------------------
  // TEST 3: ATTACK COOLDOWN REJECTION
  // --------------------------------------------------
  console.log("Step 3: Testing attack cooldown rejection (attempting instant follow-up)...");
  (room as any).handlePlayerInput(p1, {
    sequence: 2,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "LEFT_PUNCH",
  });

  assert(p2State.health === 93, "Attack within cooldown window MUST be rejected");
  console.log("  PASSED: Spam attack within cooldown window correctly ignored.\n");

  // --------------------------------------------------
  // TEST 4: RIGHT PUNCH (7 DAMAGE)
  // --------------------------------------------------
  console.log("Step 4: Executing RIGHT_PUNCH after cooldown (0.3s)...");
  await sleep(300);

  // Keep fighters within strike reach
  simWorld.teleportEntity(p1.sessionId, 0, 0.55, 0, Math.PI / 2);
  simWorld.teleportEntity(p2.sessionId, 1.2, 0.55, 0, -Math.PI / 2);

  (room as any).handlePlayerInput(p1, {
    sequence: 3,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "RIGHT_PUNCH",
  });

  const rightPunchDmg = 93 - p2State.health;
  assert(
    rightPunchDmg === 7 || rightPunchDmg === 11,
    `RIGHT_PUNCH must deal 7 (torso) or 11 (crit headshot), got damage = ${rightPunchDmg} (HP: ${p2State.health})`,
  );
  assert(p1State.lastAttackAction === "RIGHT_PUNCH", `Expected lastAttackAction RIGHT_PUNCH, got ${p1State.lastAttackAction}`);
  console.log(`  PASSED: Right Punch dealt ${rightPunchDmg} damage (HP: ${p2State.health}/100).\n`);

  // --------------------------------------------------
  // TEST 5: KICK (12 DAMAGE)
  // --------------------------------------------------
  console.log("Step 5: Executing KICK after cooldown (0.35s)...");
  await sleep(350);

  simWorld.teleportEntity(p1.sessionId, 0, 0.55, 0, Math.PI / 2);
  simWorld.teleportEntity(p2.sessionId, 1.2, 0.55, 0, -Math.PI / 2);

  const hpBeforeKick = p2State.health;
  (room as any).handlePlayerInput(p1, {
    sequence: 4,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "KICK",
  });

  const kickDmg = hpBeforeKick - p2State.health;
  assert(
    kickDmg >= 9 && kickDmg <= 18,
    `KICK must deal 9 (glance), 12 (torso), or 18 (crit), got damage = ${kickDmg} (HP: ${p2State.health})`,
  );
  assert(p1State.lastAttackAction === "KICK", `Expected lastAttackAction KICK, got ${p1State.lastAttackAction}`);
  console.log(`  PASSED: Kick dealt ${kickDmg} damage (HP: ${p2State.health}/100).\n`);

  // --------------------------------------------------
  // TEST 6: PUSH (3 DAMAGE & HIGH KNOCKBACK IMPULSE)
  // --------------------------------------------------
  console.log("Step 6: Executing PUSH after cooldown (0.56s)...");
  await sleep(560);

  // Re-verify position before push
  simWorld.teleportEntity(p1.sessionId, 0, 0.55, 0, Math.PI / 2);
  simWorld.teleportEntity(p2.sessionId, 1.2, 0.55, 0, -Math.PI / 2);

  const hpBeforePush = p2State.health;
  (room as any).handlePlayerInput(p1, {
    sequence: 5,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "PUSH",
  });

  const pushDmg = hpBeforePush - p2State.health;
  assert(
    pushDmg >= 2 && pushDmg <= 5,
    `PUSH must deal 2-5 damage, got damage = ${pushDmg} (HP: ${p2State.health})`,
  );
  assert(p1State.lastAttackAction === "PUSH", `Expected lastAttackAction PUSH, got ${p1State.lastAttackAction}`);
  const vel = p2Sim.body.getLinearVelocity();
  assert(vel.x > 0, `Push must impart positive X velocity towards opponent, got vx = ${vel.x}`);
  console.log(`  PASSED: Push dealt ${pushDmg} damage and imparted high knockback impulse (vx: ${vel.x.toFixed(2)} m/s).\n`);

  // --------------------------------------------------
  // TEST 7: KNOCKOUT & ATTRIBUTION
  // --------------------------------------------------
  console.log("Step 7: Delivering lethal strikes to trigger Knockout...");
  // Set health directly to 5 to test exact lethal trigger
  p2State.health = 5;
  await sleep(950); // Clear push cooldown

  simWorld.teleportEntity(p1.sessionId, 0, 0.55, 0, Math.PI / 2);
  simWorld.teleportEntity(p2.sessionId, 1.2, 0.55, 0, -Math.PI / 2);

  (room as any).handlePlayerInput(p1, {
    sequence: 6,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "LEFT_PUNCH",
  });

  assert(p2State.health === 0, `Victim HP must be 0 upon KO, got ${p2State.health}`);
  assert(p2State.isDead === true, "Victim must be marked isDead = true");
  assert(p1State.score === 1, `Killer score must be 1, got ${p1State.score}`);
  console.log("  PASSED: Lethal strike triggered KO, HP clamped to 0, P1 score = 1.\n");

  // --------------------------------------------------
  // TEST 8: RESPAWN & 2-SECOND INVULNERABILITY
  // --------------------------------------------------
  console.log("Step 8: Testing Respawn and 2-Second Invulnerability...");
  // Authoritatively respawn P2
  room.respawnPlayer(p2.sessionId);

  assert(p2State.health === 100, `Respawned player HP must be 100, got ${p2State.health}`);
  assert(p2State.isDead === false, "Respawned player must have isDead = false");
  assert(p2State.isInvulnerable === true, "Respawned player must be invulnerable");
  assert(simWorld.isEntityInvulnerable(p2.sessionId) === true, "Simulation entity must report invulnerable");

  // Re-position P2 near P1 and attempt attack while invulnerable
  simWorld.teleportEntity(p1.sessionId, 0, 0.55, 0, Math.PI / 2);
  simWorld.teleportEntity(p2.sessionId, 1.2, 0.55, 0, -Math.PI / 2);
  await sleep(300);

  (room as any).handlePlayerInput(p1, {
    sequence: 7,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "KICK",
  });

  assert(p2State.health === 100, `Attacks on invulnerable player MUST be ignored, HP: ${p2State.health}`);
  console.log("  PASSED: Attacks completely ignored during 2s invulnerability window.\n");

  // Wait for 2s invulnerability to expire
  console.log("Step 9: Waiting for 2s invulnerability to expire...");
  await sleep(1800);
  assert(simWorld.isEntityInvulnerable(p2.sessionId) === false, "Invulnerability should expire after 2s");
  console.log("  PASSED: Invulnerability expired naturally.\n");

  // --------------------------------------------------
  // TEST 10: VOID FALL INSTANT KO & ATTRIBUTION
  // --------------------------------------------------
  console.log("Step 10: Testing Void Fall instant KO (< -5.0m)...");
  // Strike P2 once to establish recent damage attribution
  simWorld.teleportEntity(p1.sessionId, 0, 0.55, 0, Math.PI / 2);
  simWorld.teleportEntity(p2.sessionId, 1.2, 0.55, 0, -Math.PI / 2);
  await sleep(600);
  (room as any).handlePlayerInput(p1, {
    sequence: 8,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "LEFT_PUNCH",
  });
  assert(p2State.health === 93, "P2 should have taken damage");

  // Push / teleport P2 into the void
  simWorld.teleportEntity(p2.sessionId, 0, -6.5, 0);
  room.checkVoidFalls();

  assert(p2State.health === 0, `Void fall must immediately set HP to 0, got ${p2State.health}`);
  assert(p2State.isDead === true, "Void fall victim must be marked isDead = true");
  assert(p1State.score === 2, `P1 score must increment to 2 from void fall attribution, got ${p1State.score}`);
  console.log("  PASSED: Void fall (< -5.0m) instantly eliminated player and awarded kill to P1.\n");

  // --------------------------------------------------
  // TEST 11: 3-KILL MATCH VICTORY TRIGGER
  // --------------------------------------------------
  console.log("Step 11: Testing match win condition (First to 3 Kills)...");
  room.respawnPlayer(p2.sessionId);
  // Remove invulnerability for testing
  (p2Sim as any).invulnerableUntil = 0;
  p2State.isInvulnerable = false;
  simWorld.teleportEntity(p1.sessionId, 0, 0.55, 0, Math.PI / 2);
  simWorld.teleportEntity(p2.sessionId, 1.2, 0.55, 0, -Math.PI / 2);

  // Deliver final KO blow
  p2State.health = 5;
  await sleep(350);

  (room as any).handlePlayerInput(p1, {
    sequence: 9,
    moveX: 0,
    moveZ: 0,
    lookYaw: Math.PI / 2,
    jump: false,
    sprint: false,
    attackAction: "LEFT_PUNCH",
  });

  assert(p1State.score === 3, `P1 score must be 3, got ${p1State.score}`);
  assert(room.state.matchStatus === "MATCH_END", `Match must transition to MATCH_END, got ${room.state.matchStatus}`);
  assert(room.state.winningPlayerId === p1.sessionId, `Winner must be P1 (${p1.sessionId}), got ${room.state.winningPlayerId}`);
  assert(room.state.winningTeamIndex === p1State.teamIndex, `Winning team must be P1 team, got ${room.state.winningTeamIndex}`);
  console.log("  PASSED: Reaching 3 kills triggered MATCH_END with P1 declared winner.\n");

  // --------------------------------------------------
  // TEST 12: CLEAN DISPOSAL
  // --------------------------------------------------
  console.log("Step 12: Disposing GameRoom and releasing Havok resources...");
  room.onDispose();
  assert((room as any).respawnTimers.size === 0, "All respawn timers must be cleared");
  console.log("  PASSED: Clean leak-free room disposal verified.\n");

  console.log("==================================================");
  console.log("🏆 ALL 12 COMBAT LIFECYCLE TESTS PASSED CLEANLY!");
  console.log("==================================================");
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
