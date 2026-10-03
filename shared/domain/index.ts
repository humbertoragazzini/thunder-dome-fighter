// ==================================================
// GENERIC DOMAIN CONTRACTS: BARREL EXPORT
//
// WHAT IT DOES:
// Centralized barrel re-export for all core game domain models.
//
// HOW IT WORKS:
// Re-exports pure TypeScript types and interfaces from Identity,
// GameMode, Level, Match, and Party modules.
//
// WHY IT EXISTS:
// Provides a single clean import path (`shared/domain`) for server,
// client, and network layers while keeping individual domain modules modular.
// ==================================================

export * from "./Identity.ts";
export * from "./GameMode.ts";
export * from "./Level.ts";
export * from "./Match.ts";
export * from "./Party.ts";
