// ==================================================
// GAMEPLAY CONTRACTS: EVENTS BARREL EXPORT
//
// WHAT IT DOES:
// Centralized barrel re-export for all authoritative match events.
//
// HOW IT WORKS:
// Re-exports MatchEventType, MatchEvent, and all specific payload definitions.
//
// WHY IT EXISTS:
// Provides clean import syntax (`shared/contracts/events`) across server
// event broadcasters and client sound/particle/UI listeners.
// ==================================================

export * from "./MatchEvents.ts";
