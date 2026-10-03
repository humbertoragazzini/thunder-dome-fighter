// ==================================================
// AUTHENTICATION UTILITIES: JWT SESSION TOKEN VERIFIER
//
// WHAT IT DOES:
// Cryptographically verifies JWT session tokens and validates them
// against active PostgreSQL session records for Colyseus WebSocket handshakes.
//
// HOW IT WORKS:
// 1. Verifies the cryptographic HMAC signature using `fast-jwt`.
// 2. Queries PostgreSQL via Prisma to ensure the session exists and has
//    not expired or been revoked.
// 3. Returns the authenticated identity payload attached to `client.auth`.
//
// WHY IT EXISTS:
// Protects authoritative game rooms against unauthenticated connections,
// forged tokens, and revoked sessions before spawning physical entities.
// ==================================================

import "dotenv/config";
import { createVerifier } from "fast-jwt";
import { prisma } from "../db/prisma.ts";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is not defined in .env");
}

const verifyJwt = createVerifier({ key: jwtSecret });

export interface AuthenticatedUser {
  userId: string;
  playerId: string;
  playerName: string;
  email: string;
}

/**
 * Validates a JWT token and confirms the session is active in PostgreSQL.
 *
 * @param token The raw Bearer or WebSocket auth token string
 * @returns The authenticated player identity
 * @throws Error if token is invalid, expired, or revoked
 */
export async function verifySessionToken(token: string): Promise<AuthenticatedUser> {
  if (!token || typeof token !== "string") {
    throw new Error("Missing authentication token.");
  }

  // 1. Cryptographic signature and expiry verification
  let payload: AuthenticatedUser;
  try {
    payload = verifyJwt(token) as AuthenticatedUser;
  } catch {
    throw new Error("Invalid or expired authentication token.");
  }

  // 2. Database active session check (supports server-side revocation)
  const session = await prisma.session.findUnique({
    where: { token },
  });

  if (!session) {
    throw new Error("Session has been revoked or does not exist.");
  }

  if (session.expiresAt <= new Date()) {
    // Clean up expired session record
    await prisma.session.delete({ where: { token } }).catch(() => {});
    throw new Error("Session has expired. Please log in again.");
  }

  return {
    userId: payload.userId,
    playerId: payload.playerId,
    playerName: payload.playerName,
    email: payload.email,
  };
}
