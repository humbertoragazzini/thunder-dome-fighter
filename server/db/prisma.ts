// ==================================================
// PRISMA CLIENT SINGLETON (PRISMA 7 + PG ADAPTER)
//
// WHAT IT DOES:
// Instantiates and exports a singleton PrismaClient instance
// configured with the PostgreSQL driver adapter.
//
// HOW IT WORKS:
// Reads DATABASE_URL from .env, establishes a connection pool via pg.Pool,
// and binds it to Prisma 7's PrismaPg adapter to share connection pools
// across Fastify HTTP routes and Colyseus game rooms.
//
// WHY IT EXISTS:
// In Node.js server architectures, instantiating multiple PrismaClient
// instances will exhaust the database connection pool. This singleton
// guarantees all server subsystems reuse a single, shared connection manager.
// ==================================================

import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not defined.");
}

// Reuse connection pool across incoming requests
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
