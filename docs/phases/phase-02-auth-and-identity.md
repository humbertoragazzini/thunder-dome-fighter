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

## Phase 2 Progress Tracker

- [ ] **Step 2.1**: Initialize Docker environment (`docker-compose.yml`) and Prisma ORM with `schema.prisma`.
- [ ] **Step 2.2**: Implement secure Argon2 password hashing utility.
- [ ] **Step 2.3**: Set up Fastify HTTP server with CORS, JSON Schema validation, and error handlers.
- [ ] **Step 2.4**: Implement Fastify auth routes (`/api/auth/register`, `/api/auth/login`) with `@fastify/jwt`.
- [ ] **Step 2.5**: Implement Colyseus `onAuth` WebSocket handshake token verification.
- [ ] **Step 2.6**: Implement client-side authentication store in Zustand with token persistence.
