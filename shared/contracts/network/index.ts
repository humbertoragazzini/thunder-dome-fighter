// ==================================================
// NETWORK CONTRACTS: BARREL EXPORT
//
// WHAT IT DOES:
// Centralized barrel re-export for client and server network message contracts.
//
// HOW IT WORKS:
// Re-exports ClientMessages and ServerMessages mapped types from a single import.
//
// WHY IT EXISTS:
// Provides clean, unified import syntax (`shared/contracts/network`) across
// the codebase while preventing cyclic dependencies.
// ==================================================

export * from "./ClientMessages.ts";
export * from "./ServerMessages.ts";
