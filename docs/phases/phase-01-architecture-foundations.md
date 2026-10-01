# Phase 1 — Architecture Foundations & Shared Contracts

> **Phase**: 1  
> **Status**: In Progress  
> **Scope**: Pure TypeScript domain models, network contracts, and shared math routines.  
> **Invariants**: 100% engine-agnostic (zero imports from Babylon.js, Colyseus, React, or DOM).

---

## Overview

In Domain-Driven Design (DDD) and Clean Architecture, the **Domain Layer** represents the core business and gameplay rules of the entire system.

By placing pure TypeScript contracts inside `shared/domain/`:

1. **Fastify HTTP Server** uses them for REST routing, input validation, and JWT authentication payloads.
2. **Colyseus Game Server** uses them for room lifecycles, player state tracking, and authoritative simulation rules.
3. **Prisma ORM** models mirror these interfaces to ensure type safety in PostgreSQL.
4. **React Client** uses them in Zustand stores, UI HUDs, and scoreboards.

If a property or rule changes in one of these files, TypeScript immediately verifies and enforces the change across the entire stack.

---

## Files Created in this Phase

### 1. `shared/domain/Identity.ts`

- **Path**: [`shared/domain/Identity.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/domain/Identity.ts)
- **Primary Exports**: `User`, `Player`, `Session`, `PlayerStats`, `PlayerProfileView`, `EntityId`.

#### What It Does:

Defines the distinction between an account holder (`User`), an in-game persona (`Player`), a live authentication token (`Session`), and permanent lifetime combat records (`PlayerStats`).

#### How It Works:

- `EntityId`: A branded type representing a UUID v4 string.
- `User`: Contains security data (`email`, `createdAt`, `updatedAt`). Never holds character stats.
- `Player`: Contains public identity (`playerName`, `avatarUrl`) and holds a foreign key `userId`.
- `Session`: Connects a Fastify-issued JWT token to a `userId` and `playerId`.
- `PlayerStats`: Stores primary historical integers (`totalMatches`, `wins`, `losses`, `kills`, `deaths`, `damageDealt`).
- `PlayerProfileView`: A composite type that pairs the `Player` and `PlayerStats` with dynamically computed ratios (`killDeathRatio`, `winRatePercentage`).

#### Why It Exists (Architectural Rationale):

- **Decoupling Security from Persona**: A user may update their email, reset their password, or eventually have multiple character profiles without touching their match history or leaderboard rank.
- **Derived Ratios Invariant**: Storing `killDeathRatio` as a float column in PostgreSQL leads to rounding drift and synchronization bugs. We store primary factual numbers (`kills: 10`, `deaths: 5`) and compute `10 / 5 = 2.0` on read with safe division-by-zero protection.

---

### 2. `shared/domain/GameMode.ts`

- **Path**: [`shared/domain/GameMode.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/domain/GameMode.ts)
- **Primary Exports**: `GameMode`, `GameModeId`, `GAME_MODES`, presets (`GAME_MODE_1V1`, `GAME_MODE_3V3`, `GAME_MODE_4V4`, `GAME_MODE_FFA`).

#### What It Does:

Provides declarative rulebooks that dictate room capacity, team sizes, victory score thresholds, time limits, and respawn delays for matches.

#### How It Works:

- `GameModeId`: A strict TypeScript union (`"1v1" | "3v3" | "4v4" | "ffa"`).
- `GameMode`: A configuration object specifying rules:
  - `minPlayers` & `maxPlayers`: Connection capacity.
  - `teamCount`: `0` for FFA (everyone against everyone), `2` for team modes.
  - `teamSize`: `1` for 1v1/FFA; `3` for 3v3; `4` for 4v4.
  - `scoreLimit`: Number of kills required to trigger victory.
  - `respawnDelaySeconds`: Penalty timer before a dead player respawns.
- `GAME_MODES`: A dictionary mapping each `GameModeId` to its preset object.

#### Why It Exists (Architectural Rationale):

- **No Room Code Duplication**: Beginners often build `Room1v1.ts`, `Room3v3.ts`, `RoomFFA.ts`. In our architecture, a single generic `GameRoom` handles all matches by reading the injected `GameMode` configuration.
- **Instant Balancing**: Changing 3v3 round duration or kill limits requires editing a single constant in this file rather than digging through game server physics loops.

---

### 3. `shared/domain/Level.ts`

- **Path**: [`shared/domain/Level.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/domain/Level.ts)
- **Primary Exports**: `Vector3D`, `BoundingBox3D`, `SpawnPoint`, `ItemSpawnPoint`, `LevelDefinition`, `LEVELS`, `LEVEL_THUNDER_DOME_ALPHA`.

#### What It Does:

Defines the spatial layout of an arena: world kill boundaries, player team spawn coordinates with initial look yaw, weapon spawn locations, and asset paths for server collision and client visuals.

#### How It Works:

- `Vector3D`: A pure TypeScript Cartesian coordinate object `{ x, y, z }` that does not depend on Babylon.js or any external 3D math library.
- `boundaries`: A bounding box (`min` and `max` vectors). The server checks if a player falls below `y < -5` to trigger a Ring-Out KO.
- `playerSpawns`: Designated coordinates with `rotationYaw` (in radians) and `teamIndex` (0 = Team Alpha on West side facing East; 1 = Team Beta on East side facing West).
- `itemSpawns`: Coordinates where weapons (swords, hammers, guns) respawn on timed cycles.
- Asset decoupling: Points to `serverPhysicsAsset` (low-poly collision hulls) and `clientVisualAsset` (high-poly rendered GLB).

#### Why It Exists (Architectural Rationale):

- **Separation of Collision vs. Visuals**: Servers do not have GPUs; running physics against 50,000 visual triangles destroys CPU performance. The server loads simplified collision hulls, while the client renders high-detail GLB meshes.
- **Arena Extensibility**: New arenas (e.g., `thunder-dome-lava`, `neon-rooftop`) can be added by declaring a new `LevelDefinition` without rewriting spawn or match logic.

---

### 4. `shared/domain/Match.ts`

- **Path**: [`shared/domain/Match.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/domain/Match.ts)
- **Primary Exports**: `MatchStatus`, `MatchParticipant`, `MatchTeam`, `Match`, `MatchSummaryView`.

#### What It Does:

Coordinates the active lifecycle of a playable game, live in-memory match stats, team scores, and the final results summary.

#### How It Works:

- `MatchStatus`: A strict 9-state finite state machine:
  `CREATED` → `WAITING_FOR_PLAYERS` → `READY` → `COUNTDOWN` → `PLAYING` → `ROUND_END` → `MATCH_END` → `FINALIZING` → `CLOSED`.
- `MatchParticipant`: The volatile link between a persistent `Player` and a live `Match`. Records match-only kills, deaths, assists, and damage.
- `MatchTeam`: Aggregates team score, colors (`colorHex`), and participant IDs for 3v3 and 4v4 modes.
- `Match`: Holds the global match state, start/end timestamps, and winning team/player.
- `MatchSummaryView`: The final payload generated at `MATCH_END` to present the results screen to players and trigger database persistence via Prisma.

#### Why It Exists (Architectural Rationale):

- **Deterministic State Gates**: Physics movement and attacks are strictly prohibited during `WAITING_FOR_PLAYERS` and `COUNTDOWN`. Simulation only activates when entering `PLAYING`.
- **Runtime Stats vs. Permanent Stats**: A player's in-match score is volatile and kept in server RAM. Only when the match ends does the server run an atomic `prisma.$transaction` to increment permanent lifetime stats.

---

### 5. `shared/domain/Party.ts`

- **Path**: [`shared/domain/Party.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/domain/Party.ts)
- **Primary Exports**: `Party`, `PartyMember`, `MatchmakingTicket`.

#### What It Does:
Enables friends to assemble in a pre-match social group and enter matchmaking queues together as an indivisible atomic team unit.

#### How It Works:
- `Party`: Holds a unique `id`, `leaderPlayerId`, an alphanumeric `inviteCode` (e.g. `"THNDR9"`), and member records.
- `PartyMember`: Tracks participant readiness (`isReady`) and join timestamp.
- `MatchmakingTicket`: The queue payload dispatched to the matchmaker containing `gameModeId`, `partyId`, and the array of all member `playerIds`.

#### Why It Exists (Architectural Rationale):
- **Atomic Party Cohesion Invariant**: In multiplayer team games, queuing with friends must never result in friends being split across opposing teams. By wrapping group members in an indivisible `MatchmakingTicket`, the server's bin-packing algorithm always places them on the same team.

---

### 6. `shared/domain/index.ts`

- **Path**: [`shared/domain/index.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/domain/index.ts)
- **Primary Exports**: Barrel re-export of all domain entities.

#### What It Does:
Provides a clean, centralized entry point for all domain models.

#### How It Works:
Re-exports `Identity.ts`, `GameMode.ts`, `Level.ts`, `Match.ts`, and `Party.ts`.

#### Why It Exists (Architectural Rationale):
- **Clean Architecture & Module Hygiene**: Consumers import cleanly via `import { User, Match, GameMode } from "../../shared/domain"` without coupling to internal file locations.

---

### 7. `shared/contracts/network/ClientMessages.ts`

- **Path**: [`shared/contracts/network/ClientMessages.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/contracts/network/ClientMessages.ts)
- **Primary Exports**: `ClientMessageType`, `ClientMessagePayloadMap`, `RoomReadyPayload`, `PartyJoinPayload`, `MatchQueuePayload`, `InteractPayload`.

#### What It Does:
Declares the strict catalog of WebSocket message names and expected payload structures sent from clients to the Colyseus server.

#### How It Works:
- `ClientMessageType`: Object dictionary with `as const` providing string literal types (`"player-input"`, `"room-ready"`, `"party-join"`, etc.).
- `ClientMessagePayloadMap`: TypeScript mapped interface associating each message string to its exact payload interface.

#### Why It Exists (Architectural Rationale):
- **Elimination of Magic Strings**: Prevents silent bugs caused by channel typos (e.g. `"player_input"` vs `"player-input"`).
- **Compile-Time Wire Protocol Enforcement**: Clients cannot dispatch malformed payloads; TypeScript validates message parameters at compile time.

---

### 8. `shared/contracts/network/ServerMessages.ts`

- **Path**: [`shared/contracts/network/ServerMessages.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/contracts/network/ServerMessages.ts)
- **Primary Exports**: `ServerMessageType`, `ServerMessagePayloadMap`, `MatchStatusPayload`, `MatchCountdownPayload`, `MatchmakingStatusPayload`, `PartyUpdatedPayload`, `ServerErrorPayload`.

#### What It Does:
Declares the strict catalog of WebSocket messages dispatched from Colyseus to clients (state changes, countdowns, match results, party updates, errors).

#### How It Works:
- Maps server channels to payloads, ensuring `MATCH_SUMMARY` carries a valid `MatchSummaryView` and `SERVER_ERROR` carries structured `{ code, message, fatal }` error objects.

#### Why It Exists (Architectural Rationale):
- **Authoritative Flow**: The client never guesses match countdowns or victory triggers; it passively reacts to typed server broadcasts.
- **Structured Error Handling**: Centralizes error contracts so UI error modals display actionable messages rather than raw stack traces.

---

### 9. `shared/contracts/network/index.ts`

- **Path**: [`shared/contracts/network/index.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/contracts/network/index.ts)
- **Primary Exports**: Barrel export of `ClientMessages.ts` and `ServerMessages.ts`.

---

### 10. `shared/contracts/events/MatchEvents.ts`

- **Path**: [`shared/contracts/events/MatchEvents.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/contracts/events/MatchEvents.ts)
- **Primary Exports**: `MatchEventType`, `MatchEventPayloadMap`, `MatchEventEnvelope`, individual event payloads (`PlayerJoinedEvent`, `DamageAppliedEvent`, `PlayerKilledEvent`, `ModifierChangedEvent`, `MatchEndedEvent`).

#### What It Does:
Defines discrete domain occurrences emitted by the authoritative server during a match to trigger audio, particles, damage numbers, kill feeds, and temporary kill upgrades.

#### How It Works:
- `MatchEventType`: Enumeration of all discrete combat and lifecycle occurrences (`DAMAGE_APPLIED`, `PLAYER_KILLED`, `MODIFIER_CHANGED`, etc.).
- `DamageAppliedEvent`: Carries `hitPoint` and `knockbackForce` so the client spawns hit sparks and screenshake along the physical impact vector.
- `PlayerKilledEvent`: Carries `killerKillStreak` and `isRingOut: boolean` for dynamic kill feed badges.
- `ModifierChangedEvent`: Broadcasts active kill-streak attribute boosts (`speedMultiplier`, `forceMultiplier`) to update the player's HUD.
- `MatchEventEnvelope`: Wraps every event with an authoritative `serverTick` and Unix `timestamp`.

#### Why It Exists (Architectural Rationale):
- **State vs. Events Distinction**: State tells you *what is currently true* (synchronized at 30 Hz in Colyseus schema); Events tell you *what just happened* at a specific instant in time.
- **Physics Timeline Alignment**: Including `serverTick` in the envelope allows the client to align visual hit sparks and audio impacts to the exact physical frame the attack occurred.

---

### 11. `shared/contracts/events/index.ts`

- **Path**: [`shared/contracts/events/index.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/contracts/events/index.ts)
- **Primary Exports**: Barrel export of `MatchEvents.ts`.

---

### 12. `shared/player/PlayerConfig.ts` (Refactored)

- **Path**: [`shared/player/PlayerConfig.ts`](file:///home/betovicio/Projects/thunder-dome-fighter/shared/player/PlayerConfig.ts)
- **Primary Exports**: `CHARACTER_CAPSULE`, `CHARACTER_FORCES`, `CharacterActionInput`, `CharacterInputCommand`, `AttackActionType`, plus backwards-compatibility aliases (`PlayerInput`, `PlayerInputCommand`, `PLAYER_BOX_SIZE`).

#### What It Does:
Transitions the physics and input contracts from vehicular mechanics (`throttle`, `steering`, `brake`) to humanoid character actions (`moveX`, `moveZ`, `lookYaw`, `jump`, `sprint`, `attackAction`).

#### How It Works:
- `CHARACTER_CAPSULE`: Declares standard human upright dimensions (radius `0.4m`, height `1.8m`).
- `CHARACTER_FORCES`: Establishes base run velocity (`6.0 m/s`), sprint boost (`1.35x`), jump impulse (`6.5 m/s`), and ground-check distances.
- `CharacterActionInput`: Encapsulates 8-way directional movement inputs, look angle, jump, sprint, and attack action triggers.
- `CharacterInputCommand`: Extends action input with a strictly monotonic `sequence` integer for authoritative client prediction and server jitter buffering.
- Legacy Compatibility: Retains `@deprecated` vehicle interfaces so existing server simulations and client prediction loops continue to build cleanly without breaking changes.

#### Why It Exists (Architectural Rationale):
- **Strangler Fig Pattern**: In large refactors, introducing target contracts with backward-compatible aliases allows incremental upgrades across subsystems (Phase 1 domain/math $\rightarrow$ Phase 4 Havok physics) without ever breaking the build.




