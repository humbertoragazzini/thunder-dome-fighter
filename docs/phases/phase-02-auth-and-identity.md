# Phase 2 — User Authentication & Player Identity System

## Architectural Overview

Phase 2 establishes the persistence and security boundary for *Thunder Dome Fighter*. It implements **ADR-004** (Decoupled User vs. Player Identity) and **ADR-014/ADR-015** (Containerized PostgreSQL & Redis multi-core topology).

```
   [ Client Browser ]
           │
           ├── (HTTP POST /api/auth/register) ──► [ Fastify Auth API ] ──► [ PostgreSQL (Docker) ]
           ├── (HTTP POST /api/auth/login)    ──► [ Issues JWT ]       ──► [ Verifies Argon2 Hash ]
           │
           └── (WebSocket wss://... + JWT)   ──► [ Colyseus onAuth ]  ──► [ Verifies Token Signature ]
                                                                            │
                                                                            ▼
                                                                 [ GameRoom (Simulation) ]
```

---

## 1. Infrastructure: Docker Container Topology

All backend persistence and coordination services run inside lightweight, isolated Docker containers:

- **PostgreSQL 16 Alpine** (`thunder-postgres`):
  - Primary relational persistence store for `User`, `Player`, `Session`, and `PlayerStats`.
  - Exposed locally on port `5432` with a persistent named volume (`thunder_pg_data`).
  - Configured with a native `pg_isready` healthcheck.
- **Redis 7 Alpine** (`thunder-redis`):
  - In-memory key-value cache and cluster presence driver (`@colyseus/redis-presence`).
  - Exposed locally on port `6379` with a persistent named volume (`thunder_redis_data`).
  - Provides multi-process cross-core coordination.

---

## 2. Relational Schema Mapping

The database schema directly maps the domain models defined in [`shared/domain/Identity.ts`](../../shared/domain/Identity.ts):

| Domain Model | PostgreSQL Table | Key Invariants |
| :--- | :--- | :--- |
| `User` | `users` | Security credential. Holds unique `email` and Argon2 `passwordHash`. Never exposed to public gameplay queries. |
| `Player` | `players` | Public in-game persona. Unique `playerName`. Foreign key to `User` (1-to-1). Holds `avatarUrl`. |
| `Session` | `sessions` | Active JWT session record. Foreign keys to `User` and `Player`. Indexed for fast expiry validation. |
| `PlayerStats` | `player_stats` | Permanent lifetime records. Foreign key to `Player` (1-to-1). Updated strictly by authoritative match finalization. |

---

---

## 3. Implemented Files & Components

### Step 2.1: Persistence Infrastructure & Database Schema

#### 1. `docker-compose.yml`
- **Location:** [`docker-compose.yml`](../../docker-compose.yml)
- **Role:** Declares `thunder-postgres` (PostgreSQL 16 Alpine mapped to host `5433:5432`) and `thunder-redis` (Redis 7 Alpine mapped to host `6379:6379`) with healthchecks and named volumes.
- **Port Isolation:** Port `5433` avoids collisions with host services or existing developer containers on standard port `5432`.

#### 2. `prisma.config.ts` & `prisma/schema.prisma`
- **Location:** [`prisma.config.ts`](../../prisma.config.ts) & [`prisma/schema.prisma`](../../prisma/schema.prisma)
- **Role:** Implements Prisma 7 configuration decoupled from the schema file.
- **Tables Generated:**
  - `users` (credentials, email unique constraint, Argon2 hash)
  - `players` (persona, unique playerName, 1-to-1 foreign key to users)
  - `sessions` (active JWTs, indices on `token`, `user_id`, `expires_at`)
  - `player_stats` (lifetime competitive stats, 1-to-1 foreign key to players)

#### 3. `server/db/prisma.ts`
- **Location:** [`server/db/prisma.ts`](../../server/db/prisma.ts)
- **Role:** Singleton database client using `pg.Pool` connection pool wrapped in `@prisma/adapter-pg` driver.
- **Design Invariant:** Guarantees Fastify routes and Colyseus game room hooks share a single pooled connection manager.

### Step 2.2: Secure Password Hashing (Argon2id)

#### 4. `server/auth/PasswordHasher.ts`
- **Location:** [`server/auth/PasswordHasher.ts`](../../server/auth/PasswordHasher.ts)
- **Role:** Cryptographically secure password hashing, constant-time verification, and input bounds enforcement using `argon2`.
- **Parameters:** Argon2id with 64 MiB memory hardness (`memoryCost: 65536`), 3 iterations (`timeCost: 3`), and single-thread parallelism (`parallelism: 1`).
- **DoS Mitigation:** Enforces length constraints (8–128 characters) to prevent CPU-exhaustion Denial-of-Service attacks from oversized payloads.

### Step 2.3: Fastify HTTP Server Setup

#### 5. `server/api/app.ts`
- **Location:** [`server/api/app.ts`](../../server/api/app.ts)
- **Role:** Fastify Application Factory (`buildApp`) establishing REST middleware and plugin hierarchy.
- **CORS:** Configured for Vite frontend origins (`localhost:5173`, `127.0.0.1:5173`).
- **JWT:** Registered via `@fastify/jwt` using `JWT_SECRET` with configurable token lifetime defaulting to 24 hours (`JWT_EXPIRES_IN=24h`).
- **Error Handling:** Centralized handler formatting Ajv JSON Schema validation failures (400) and runtime exceptions into consistent JSON error envelopes.
- **Routes:** `GET /api/health` providing service status, ISO timestamp, and process uptime.

#### 6. `server/api/index.ts`
- **Location:** [`server/api/index.ts`](../../server/api/index.ts)
- **Role:** HTTP process entrypoint binding to `FASTIFY_HOST` and `FASTIFY_PORT` (3000) with graceful shutdown traps (`SIGINT`, `SIGTERM`).

### Step 2.4: Fastify Authentication Routes & Timing Attack Defense

#### 7. `server/api/routes/auth.ts`
- **Location:** [`server/api/routes/auth.ts`](../../server/api/routes/auth.ts)
- **Role:** REST routes for user registration, authentication, and session inspection.
- **Atomic Creation:** `/register` wraps `User`, `Player`, and `PlayerStats` in an atomic `prisma.$transaction`. If a player name is taken, the transaction rolls back with zero orphaned accounts.
- **Timing-Attack Defense (User Enumeration):** `/login` executes a pre-computed `DUMMY_ARGON2_HASH` when an email is not found. Both valid and invalid user lookups consume ~80ms of Argon2 processing time, preventing attackers from measuring response latency to deduce registered emails.
- **Session Tracking:** Records issued JWT tokens in PostgreSQL (`sessions` table) with exact 24-hour expiration for instant server-side revocation.
- **Profile Inspection:** `/me` verifies the JWT Bearer token, validates the session against the database, and dynamically computes derived ratios (`killDeathRatio`, `winRatePercentage`).

---

## Phase 2 Progress Tracker

- [x] **Step 2.1**: Initialize Docker environment (`docker-compose.yml`) and Prisma ORM with `schema.prisma`.
- [x] **Step 2.2**: Implement secure Argon2 password hashing utility.
- [x] **Step 2.3**: Set up Fastify HTTP server with CORS, JSON Schema validation, and error handlers.
- [x] **Step 2.4**: Implement Fastify auth routes (`/api/auth/register`, `/api/auth/login`) with `@fastify/jwt`.
- [ ] **Step 2.5**: Implement Colyseus `onAuth` WebSocket handshake token verification.
- [ ] **Step 2.6**: Implement client-side authentication store in Zustand with token persistence.

