# 001 - Vehicle to Player Refactoring

**Date**: 2026-09-27  
**Scope**: Codebase-wide renaming of `vehicle` concepts to `player`.

## Motivation
This project template originated from a multiplayer vehicle prototype (cars/trucks). The vision for this game is **Thunder Dome Fighter**, a 3D multiplayer arena combat / fighter game. Retaining vehicle terminology (`vehicle`, `TestVehicleConfig`, `VehiclePhysicsMath`) caused cognitive dissonance and clashed with future humanoid/fighter systems (capsule colliders, character controllers, attacks, hitboxes).

## Completed Changes

### 1. Directory & File Restructuring
- Renamed directory `shared/vehicle/` -> `shared/player/`.
- Renamed `shared/vehicle/TestVehicleConfig.ts` -> `shared/player/PlayerConfig.ts`.
- Renamed `shared/vehicle/VehiclePhysicsMath.ts` -> `shared/player/PlayerPhysicsMath.ts`.
- Renamed backwards-compatibility re-export `shared/TestVehicleConfig.ts` -> `shared/PlayerConfig.ts`.

### 2. Shared Code Updates
- `shared/player/PlayerConfig.ts`:
  - Updated section headers from `VEHICLE, PHYSICS & NETWORKING` to `PLAYER, PHYSICS & NETWORKING`.
  - Updated tuning constants headers from `VEHICLE GEOMETRY & TUNING` and `VEHICLE FORCES` to `PLAYER GEOMETRY & TUNING` and `PLAYER FORCES`.
- `shared/player/PlayerPhysicsMath.ts`:
  - Updated import path from `./TestVehicleConfig` to `./PlayerConfig`.
  - Updated function docstrings and comments from `vehicle` to `player`.
- `shared/networking/InterpolationMath.ts`:
  - Updated import path from `../vehicle/TestVehicleConfig` to `../player/PlayerConfig`.
- `shared/networking/ReconciliationMath.ts`:
  - Updated import path from `../vehicle/TestVehicleConfig` to `../player/PlayerConfig`.

### 3. Authoritative Server Updates
- `server/GameRoom.ts`:
  - Updated import path to `../shared/player/PlayerConfig`.
- `server/SimulationWorld.ts`:
  - Updated imports to `../shared/player/PlayerConfig` and `../shared/player/PlayerPhysicsMath`.
  - Replaced legacy comments (`Vehicle tuning damping...`, `PLAYER INPUT & VEHICLE CONTROLS`) with player-centric equivalents.

### 4. Client Updates
- `src/components/BabylonCanvas.tsx`:
  - Updated imports to `../../shared/player/PlayerConfig`.
- `src/components/LocalPlayerPrediction.ts`:
  - Updated imports to `../../shared/player/PlayerConfig` and `../../shared/player/PlayerPhysicsMath`.
  - Updated prediction comments referring to physics math delegation.
- `src/components/RemotePlayerInterpolation.ts`:
  - Updated imports to `../../shared/player/PlayerConfig`.

### 5. Repository Hygiene
- Added root `.gitignore` to prevent committing `node_modules/`, `dist/`, and transient build files.
- Verified TypeScript compilation (`npx tsc -b`), oxlint, and Vite production build (`npm run build`).

## Future Changes Roadmap

Future agents and developers working on `thunder-dome-fighter` should focus on:
1. **Character Controller & Movement Model**:
   - Transition input model (`throttle`, `steering`, `brake`) to fighter movement: 8-way directional movement (WASD / analog stick), aim/look rotation toward cursor or opponent, jump, and dash/dodge.
   - Replace box body geometry with capsule or cylinder character colliders suitable for fighting physics.
2. **Combat Mechanics & State Machine**:
   - Attack actions (light attack, heavy attack, special move, block, parry).
   - Hitbox and hurtbox synchronization via authoritative server.
   - Knockback impulses, hit stun, and stagger states in physics simulation.
3. **Babylon.js 3D Visuals & Animations**:
   - Load character mesh assets (GLTF/GLB) with animation groups (idle, run, punch, kick, hit-react, knockout).
   - Sync animation state with client prediction timeline and remote interpolation.
4. **Arena Environment**:
   - Replace flat floor with a Thunder Dome arena (ring boundaries, collision walls, hazards, elevation).
