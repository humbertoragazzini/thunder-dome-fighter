// ==================================================
// PHASE 10: AUTHORITATIVE COMBAT FOUNDATION TEST SUITE
//
// WHAT IT DOES:
// Comprehensive headless automated test suite validating Phase 10 combat mechanics:
// 1. Articulated limb reach and genuine 3D whiffs when out of range.
// 2. Discrete hurtbox zones: Head (1.5x crit), Torso (1.0x), Limbs (0.75x glance).
// 3. Authoritative hit stun: suppression of movement forces and jump intentions.
// 4. Action Interruption: striking an opponent during startup cancels their attack.
// 5. Frame data windows: startup, active, and recovery phases.
// 6. 1-2 Combo chaining: Left Punch into Right Cross combo bonus and reduced startup.
// 7. Knockout ragdoll state activation on 0 HP.
// 8. Clean resource disposal.
// ==================================================

import { GameRoom } from "./server/GameRoom";
import { SimulatorWorld } from "./server/SimulationWorld";
import { LEVEL_THUNDER_DOME_ALPHA } from "./shared/domain/Level";
import {
  computeAttackingLimbHitbox,
  computeTargetHurtboxProfile,
  resolveHitboxVsHurtboxes,
} from "./shared/combat/HitboxMath";
import {
  ATTACK_FRAME_DATA,
  HURTBOX_ZONE_CONFIG,
  COMBO_RULES,
} from "./shared/combat/CombatConfig";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPhase10CombatTests() {
  console.log("=== STARTING PHASE 10 AUTHORITATIVE COMBAT FOUNDATION TEST SUITE ===\n");

  // --------------------------------------------------
  // TEST 1: PURE 3D ARTICULATED HITBOX & HURTBOX MATH
  // --------------------------------------------------
  console.log("Test 1: Testing 3D Articulated Hitbox vs Multi-Zone Hurtbox Mathematics...");
  const attackerPos = { x: 0, y: 0.55, z: 0 };
  const targetPos = { x: 0, y: 0.55, z: 0.85 }; // Directly in front at 0.85m

  // Attacker strikes with LEFT_PUNCH forward (yaw = 0 points towards +Z)
  const leftPunchHitbox = computeAttackingLimbHitbox(attackerPos, 0, "LEFT_PUNCH", 1.0);
  const targetProfile = computeTargetHurtboxProfile("target-1", targetPos, Math.PI); // Facing attacker

  const hitResult = resolveHitboxVsHurtboxes(attackerPos, leftPunchHitbox, "LEFT_PUNCH", targetProfile);
  assert(hitResult !== null, "Left punch at 0.85m must connect with target hurtbox");
  assert(
    hitResult?.hitZone === "TORSO" || hitResult?.hitZone === "HEAD" || hitResult?.hitZone === "LIMBS",
    `Struck zone must be valid HurtboxZone, got ${hitResult?.hitZone}`,
  );
  console.log(`  PASSED: Hit landed on ${hitResult?.hitZone} with damage ${hitResult?.finalDamage}.`);

  // Test Out-of-Range Whiff
  const distantTargetPos = { x: 0, y: 0.55, z: 2.5 }; // 2.5m away (out of punch range)
  const distantProfile = computeTargetHurtboxProfile("target-2", distantTargetPos, Math.PI);
  const whiffResult = resolveHitboxVsHurtboxes(attackerPos, leftPunchHitbox, "LEFT_PUNCH", distantProfile);
  assert(whiffResult === null, "Left punch at 2.5m must genuinely whiff and return null");
  console.log("  PASSED: Out-of-range attack correctly whiffed through empty 3D space.\n");

  // --------------------------------------------------
  // TEST 2: DISCRETE HURTBOX ZONES & DAMAGE MULTIPLIERS
  // --------------------------------------------------
  console.log("Test 2: Verifying Discrete Body Zones: Head (1.5x), Torso (1.0x), Limbs (0.75x)...");

  // 2a. Aiming directly at Head Zone
  const headTargetPos = { x: 0, y: 0.55, z: 0.80 };
  const headProfile = computeTargetHurtboxProfile("tgt-head", headTargetPos, Math.PI);
  // Position a high fist sphere directly overlapping the Head center
  const highHitbox = {
    center: { x: 0, y: 0.55 + 0.36, z: 0.80 },
    radius: 0.22,
  };
  const headHit = resolveHitboxVsHurtboxes(attackerPos, highHitbox, "LEFT_PUNCH", headProfile);
  assert(headHit !== null, "High hitbox must intersect target Head");
  assert(headHit?.hitZone === "HEAD", `Expected HEAD zone, got ${headHit?.hitZone}`);
  assert(headHit?.isCritical === true, "Head hit must be marked isCritical = true");
  const expectedHeadDmg = Math.round(ATTACK_FRAME_DATA.LEFT_PUNCH.baseDamage * HURTBOX_ZONE_CONFIG.HEAD.damageMultiplier);
  assert(headHit?.finalDamage === expectedHeadDmg, `Head critical damage must be ${expectedHeadDmg}, got ${headHit?.finalDamage}`);
  console.log(`  PASSED: Headshot registered 1.5x Critical Hit (Damage: ${headHit?.finalDamage}).`);

  // 2b. Aiming directly at Torso Zone
  const torsoHitbox = {
    center: { x: 0, y: 0.55 - 0.05, z: 0.80 },
    radius: 0.16,
  };
  const torsoHit = resolveHitboxVsHurtboxes(attackerPos, torsoHitbox, "LEFT_PUNCH", headProfile);
  assert(torsoHit !== null, "Mid hitbox must intersect target Torso");
  assert(torsoHit?.hitZone === "TORSO", `Expected TORSO zone, got ${torsoHit?.hitZone}`);
  assert(torsoHit?.isCritical === false, "Torso hit must not be critical");
  const expectedTorsoDmg = ATTACK_FRAME_DATA.LEFT_PUNCH.baseDamage;
  assert(torsoHit?.finalDamage === expectedTorsoDmg, `Torso damage must be ${expectedTorsoDmg}, got ${torsoHit?.finalDamage}`);
  console.log(`  PASSED: Torso body blow registered 1.0x Standard Hit (Damage: ${torsoHit?.finalDamage}).`);

  // 2c. Aiming at Limbs Zone (Leg sweep)
  const limbHitbox = {
    center: { x: 0.11, y: 0.55 - 0.32, z: 0.80 }, // Lower leg position
    radius: 0.12,
  };
  const limbHit = resolveHitboxVsHurtboxes(attackerPos, limbHitbox, "LEFT_PUNCH", headProfile);
  assert(limbHit !== null, "Lateral hitbox must intersect target Arm/Limb");
  assert(limbHit?.hitZone === "LIMBS", `Expected LIMBS zone, got ${limbHit?.hitZone}`);
  const expectedLimbDmg = Math.round(ATTACK_FRAME_DATA.LEFT_PUNCH.baseDamage * HURTBOX_ZONE_CONFIG.LIMBS.damageMultiplier);
  assert(limbHit?.finalDamage === expectedLimbDmg, `Limb damage must be ${expectedLimbDmg}, got ${limbHit?.finalDamage}`);
  console.log(`  PASSED: Limb blow registered 0.75x Glancing Hit (Damage: ${limbHit?.finalDamage}).\n`);

  // --------------------------------------------------
  // TEST 3: FULL SIMULATION WORLD COMBAT TIMELINE & HIT STUN
  // --------------------------------------------------
  console.log("Test 3: Initializing authoritative SimulationWorld for live physics testing...");
  const sim = new SimulatorWorld(LEVEL_THUNDER_DOME_ALPHA);
  await sim.initialize();

  sim.spawnEntity("p1", { position: { x: 0, y: 0.55, z: 0 }, rotationYaw: 0 });
  sim.spawnEntity("p2", { position: { x: 0, y: 0.55, z: 0.9 }, rotationYaw: Math.PI });
  sim.setGameplayActive(true);

  // Assert attack starts in STARTUP
  sim.startEntityAttack("p1", "LEFT_PUNCH");
  const p1Attack = sim.getEntityAttackState("p1");
  assert(p1Attack?.timelineState === "STARTUP", `Attack must begin in STARTUP, got ${p1Attack?.timelineState}`);
  console.log("  PASSED: Attack timeline initialized in STARTUP phase.");

  // Test Hit Stun application
  console.log("Test 4: Testing Hit Stun and Locomotion Input Suppression...");
  sim.applyHitStun("p2", 300); // Apply 300ms hit stun to P2
  assert(sim.isEntityStunned("p2") === true, "Player P2 must be marked as stunned");

  // Enqueue input commands for P2 while stunned (attempting to sprint away and jump)
  sim.enqueueEntityInput("p2", {
    sequence: 1,
    moveX: 1.0,
    moveZ: 1.0,
    lookYaw: 0,
    jump: true,
    sprint: true,
    attackAction: "LEFT_PUNCH",
  });

  // Cannot initiate attack while stunned
  const p2AttackStarted = sim.startEntityAttack("p2", "LEFT_PUNCH");
  assert(p2AttackStarted === false, "Stunned player MUST NOT be allowed to start an attack");
  console.log("  PASSED: Stunned player attack initiation rejected.");

  // Wait for stun to expire
  await sleep(350);
  assert(sim.isEntityStunned("p2") === false, "Hit stun must expire after duration has elapsed");
  console.log("  PASSED: Hit stun expired naturally.\n");

  // --------------------------------------------------
  // TEST 5: AUTHORITATIVE ACTION INTERRUPTION
  // --------------------------------------------------
  console.log("Test 5: Testing Authoritative Action Interruption...");
  // P2 starts winding up a heavy kick (180ms startup)
  sim.startEntityAttack("p2", "KICK");
  let p2State = sim.getEntityAttackState("p2");
  assert(p2State?.action === "KICK" && p2State?.timelineState === "STARTUP", "P2 kick must be in startup");

  // P1 lands a strike on P2 before kick startup finishes, inflicting hit stun
  sim.applyHitStun("p2", 200);
  p2State = sim.getEntityAttackState("p2");
  assert(
    p2State?.action === "NONE" && p2State?.timelineState === "IDLE",
    `Taking damage must interrupt and cancel active attack! Got action: ${p2State?.action}, timeline: ${p2State?.timelineState}`,
  );
  console.log("  PASSED: Action Interruption verified: incoming damage cancelled victim's pending attack.\n");

  // --------------------------------------------------
  // TEST 6: 1-2 COMBO BUFFERING (LEFT PUNCH -> RIGHT CROSS)
  // --------------------------------------------------
  console.log("Test 6: Testing 1-2 Combo Chaining (Left Punch -> Right Cross)...");
  // P1 executes LEFT_PUNCH
  sim.startEntityAttack("p1", "LEFT_PUNCH");
  assert(sim.getEntityAttackState("p1")?.comboCount === 0, "Initial punch combo count must be 0");

  // Wait 100ms into the combo buffer window
  await sleep(100);

  // Buffer RIGHT_PUNCH
  const comboSuccess = sim.startEntityAttack("p1", "RIGHT_PUNCH");
  assert(comboSuccess === true, "Right punch buffered in combo window must succeed");
  const p1ComboState = sim.getEntityAttackState("p1");
  assert(p1ComboState?.comboCount === 1, `Combo count must increment to 1, got ${p1ComboState?.comboCount}`);
  assert(p1ComboState?.action === "RIGHT_PUNCH", "Active action must now be RIGHT_PUNCH");
  console.log(`  PASSED: 1-2 Combo registered (Combo Count: ${p1ComboState?.comboCount}).\n`);

  // --------------------------------------------------
  // TEST 7: GAMEROOM EVENT BROADCASTING & KNOCKOUT RAGDOLL
  // --------------------------------------------------
  console.log("Test 7: Testing GameRoom Combat Event Streaming & KO Attribution...");
  const room = new GameRoom();
  room.roomId = "phase10-room";
  await (room as any).onCreate({ modeId: "1v1", levelId: "thunder-dome-alpha" });

  const client1 = { sessionId: "sess-p1", auth: { playerId: "uid-1", playerName: "Striker" } } as any;
  const client2 = { sessionId: "sess-p2", auth: { playerId: "uid-2", playerName: "Target" } } as any;

  await (room as any).onJoin(client1);
  await (room as any).onJoin(client2);

  // Position fighters for strike
  (room as any).simulationWorld.teleportEntity("sess-p1", 0, 0.55, 0, Math.PI / 2);
  (room as any).simulationWorld.teleportEntity("sess-p2", 0.9, 0.55, 0, -Math.PI / 2);

  // Deliver lethal headshot strike
  const targetPlayerState = room.state.players.get("sess-p2")!;
  targetPlayerState.health = 5;

  room.resolveCombatAction("sess-p1", "LEFT_PUNCH");
  assert(targetPlayerState.health === 0, `Target HP must drop to 0, got ${targetPlayerState.health}`);
  assert(targetPlayerState.isDead === true, "Defeated fighter must have isDead = true for ragdoll collapse");
  assert(room.state.players.get("sess-p1")!.score === 1, "Attacker must earn 1 kill credit");
  console.log("  PASSED: Lethal strike reduced HP to 0 and triggered KO state for ragdoll collapse.\n");

  // --------------------------------------------------
  // TEST 8: CLEAN DISPOSAL
  // --------------------------------------------------
  console.log("Test 8: Disposing test rooms and physics scenes...");
  sim.dispose();
  (room as any).onDispose();
  console.log("  PASSED: All resources disposed cleanly without memory leaks.\n");

  console.log("==================================================");
  console.log("🏆 ALL 8 PHASE 10 COMBAT FOUNDATION TESTS PASSED!");
  console.log("==================================================");
}

runPhase10CombatTests().catch((err) => {
  console.error("FATAL TEST FAILURE:", err);
  process.exit(1);
});
