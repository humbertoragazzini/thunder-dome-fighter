// ==================================================
// PRISMA 7 CONFIGURATION FILE
//
// WHAT IT DOES:
// Defines the schema location and datasource connection settings for Prisma 7 CLI.
//
// HOW IT WORKS:
// Loads DATABASE_URL from .env using dotenv and registers it with the Prisma
// configuration helper (`defineConfig`).
//
// WHY IT EXISTS:
// In Prisma 7, connection URLs for migrations were decoupled from schema.prisma
// and relocated to this TypeScript configuration file.
// ==================================================

import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
