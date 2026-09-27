# Thunder Dome Fighter - Project History & Context

This folder documents the architectural evolution, completed refactors, and planned roadmap for **Thunder Dome Fighter**.

## Context for Antigravity AI Agents

When opening this project on any machine with Antigravity:
1. **Always read this folder first** to understand past architectural decisions, project conventions, and invariants before modifying code.
2. **Current Project Concept**: A multiplayer 3D arena combat game (**Thunder Dome Fighter**) featuring authoritative server simulation, client prediction, reconciliation, and remote interpolation.
3. **Engine & Tech Stack**:
   - **Client**: Babylon.js 9+, Havok Physics, React 19, Tailwind CSS 4, Zustand 5, Vite 8
   - **Server**: Colyseus 0.18+, Headless Babylon.js NullEngine + Havok WASM
   - **Shared**: Pure TypeScript math, configuration, and networking routines without engine/DOM dependencies (`shared/`)

## Log of Changes

- [001-vehicle-to-player-refactor.md](./001-vehicle-to-player-refactor.md): Transitioned template codebase from vehicular terminology (`vehicle`) to character/player terminology (`player`).

## Contribution Rule for Agents

Whenever implementing a major refactor or new gameplay milestone:
- Add a new incremental markdown log in `history/` (e.g., `002-character-controller-movement.md`).
- Keep notes on invariants, shared contracts, and future roadmap items up to date.
