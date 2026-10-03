// ==================================================
// PRISMA CLIENT SINGLETON (PRISMA 7 + PG ADAPTER)
//
// Shared database client instance across Fastify API
// and Colyseus game rooms.
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
