# ⚡ Thunder Dome Fighter

> A competitive 3D multiplayer arena fighting game built with **Babylon.js (v9+)**, **Havok Physics (30 Hz authoritative simulation)**, **Colyseus (v0.18+)**, **Fastify**, and **PostgreSQL (Prisma 7)**.

---

## 🏗️ Architecture & Port Topology

The game runs as a decoupled multi-process architecture:

| Service | Port / Protocol | Technology | Role |
| :--- | :--- | :--- | :--- |
| **Frontend UI Shell** | `http://localhost:5173` | React 19 + Tailwind v4 + Zustand | Atomic Design UI, Screen State Machine, Babylon 3D Viewport |
| **Auth & Identity API** | `http://localhost:3000` | Fastify 5 + Argon2id + JWT | Account registration, login, session tokens, dynamic stats |
| **Game Server** | `ws://localhost:2567` | Colyseus 0.18 + Havok | Authoritative 30 Hz physics loop, `onAuth` token gate, input queue |
| **PostgreSQL** | `localhost:5433` | Docker (PostgreSQL 16) | Persistent storage for users, players, sessions, and player stats |
| **Redis** | `localhost:6379` | Docker (Redis 7) | In-memory cache & cluster presence |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** (v20+ recommended)
- **Docker & Docker Compose** (running)

---

### 2. Install Dependencies
```bash
npm install
```

---

### 3. Configure Environment Variables
Ensure your `.env` file exists (or copy from `.env.example`):
```bash
cp .env.example .env
```

Key environment values in `.env`:
```env
# Database (Port 5433 avoids host 5432 conflicts)
DATABASE_URL="postgresql://thunder:dome_secret_pass@localhost:5433/thunder_dome?schema=public"

# Fastify Auth API
FASTIFY_PORT=3000
FASTIFY_HOST="0.0.0.0"
JWT_SECRET="dev_thunder_dome_jwt_secret_key_change_in_production_32chars"
JWT_EXPIRES_IN="24h"

# Frontend URLs
VITE_API_URL="http://localhost:3000"
VITE_COLYSEUS_URL="ws://localhost:2567"
```

---

### 4. Start Docker Containers & Run Database Migrations
Start the isolated PostgreSQL and Redis containers:
```bash
npm run db:up
# Or: docker compose up -d
```

Run Prisma migrations to initialize database tables (`users`, `players`, `sessions`, `player_stats`):
```bash
npm run db:migrate
```

---

### 5. Start the Development Processes

Run each process in a separate terminal:

#### Terminal 1 — Fastify Auth & Identity API (Port 3000)
```bash
npm run dev:api
```

#### Terminal 2 — Colyseus Authoritative Game Server (Port 2567)
```bash
npm run dev:game
```

#### Terminal 3 — Vite Frontend Shell (Port 5173)
```bash
npm run dev
```

---

## 🎮 How to Test the Game

1. **Open the App**: Navigate to [`http://localhost:5173`](http://localhost:5173) in your browser.
2. **Register a Fighter**:
   - Click the **"New Fighter"** tab.
   - Enter your email, public fighter handle (3–24 characters), and a password ($\ge$ 8 chars).
   - Click **"Claim Fighter License"**.
   - You will automatically be transitioned to the **Fighter Command Hub (Main Menu)**.
3. **Inspect Your Dossier**:
   - Click **"Profile"** or the **"Career Dossier"** card to view your live stats and career metrics fetched directly from PostgreSQL.
4. **Test Session Persistence**:
   - Refresh the browser (`F5`). Your active 24h JWT token stored in `localStorage` automatically auto-hydrates your profile without requiring you to log in again.
5. **Deploy into the 1v1 Arena**:
   - Click **"Enter Arena"** $\rightarrow$ Click **"1v1 Arena Duel"**.
   - Watch the animated **Match Loading Screen** verify your JWT token with Colyseus `onAuth`, boot the Havok physics engine, and launch the **3D Viewport**.
6. **Move & Fight**:
   - Use **`WASD`** or **Arrow Keys** to drive/move.
7. **Pause & Safe Exit**:
   - Press **`ESC`** (or click **Menu** in the top right).
   - Click **"Resume Fight"** or **"Leave Arena"** to cleanly disconnect and return safely to the Main Menu.

---

## 🛠️ Helpful Commands

```bash
# Typecheck client and server
npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.server.json --noEmit

# Run fast linter (oxlint)
npm run lint

# Build production bundle
npm run build

# Stop Docker containers
npm run db:down
```
