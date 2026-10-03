// ==================================================
// AUTHENTICATION UTILITIES: ARGON2 PASSWORD HASHER
//
// WHAT IT DOES:
// Provides cryptographically secure password hashing, verification,
// and password policy validation routines using the Argon2id algorithm.
//
// HOW IT WORKS:
// - hashPassword: Generates a cryptographically random salt and hashes
//   plaintext passwords using memory-hard Argon2id parameters.
// - verifyPassword: Performs constant-time cryptographic verification
//   between stored Argon2 hashes and candidate plaintext input.
// - validatePasswordStrength: Enforces length bounds (8–128 characters)
//   to prevent trivial passwords and CPU-exhaustion DoS attacks.
//
// WHY IT EXISTS:
// Plaintext passwords must NEVER be persisted in PostgreSQL. In addition,
// constant-time verification against a pre-computed dummy hash eliminates
// side-channel timing attacks that attackers use for user enumeration.
// ==================================================

import argon2 from "argon2";

/**
 * Standard password policy constraints.
 */
export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128, // Prevents CPU-exhaustion Denial-of-Service attacks
} as const;

/**
 * Pre-computed, genuine Argon2id hash computed once at server startup.
 * Used during login failures when an email is not found, ensuring that
 * missing users take the exact same ~80ms to verify as real users.
 */
const DUMMY_HASH_PROMISE: Promise<string> = argon2.hash(
  "dummy-password-for-timing-attack-defense",
  {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  },
);

/**
 * Retrieves the pre-computed dummy Argon2id hash for timing defense.
 */
export async function getDummyHash(): Promise<string> {
  return DUMMY_HASH_PROMISE;
}

/**
 * Validates basic password constraints before attempting expensive hashing.
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  reason?: string;
} {
  if (typeof password !== "string" || password.length === 0) {
    return { valid: false, reason: "Password cannot be empty." };
  }

  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    return {
      valid: false,
      reason: `Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters long.`,
    };
  }

  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    return {
      valid: false,
      reason: `Password cannot exceed ${PASSWORD_POLICY.MAX_LENGTH} characters.`,
    };
  }

  return { valid: true };
}

/**
 * Hashes a plaintext password using Argon2id.
 *
 * @param plaintext The user's plaintext password
 * @returns The encoded Argon2 string containing salt, algorithm version, and hash
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const check = validatePasswordStrength(plaintext);
  if (!check.valid) {
    throw new Error(check.reason ?? "Invalid password.");
  }

  return argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB of memory hardness
    timeCost: 3, // 3 computational iterations
    parallelism: 1, // 1 thread per hash
  });
}

/**
 * Verifies a candidate plaintext password against an existing Argon2 hash.
 * Executes in constant time to prevent side-channel timing attacks.
 *
 * @param storedHash The Argon2 hash retrieved from PostgreSQL
 * @param candidatePlaintext The candidate plaintext password supplied during login
 * @returns boolean indicating whether the password matches
 */
export async function verifyPassword(
  storedHash: string,
  candidatePlaintext: string,
): Promise<boolean> {
  if (!storedHash || !candidatePlaintext) {
    return false;
  }

  try {
    return await argon2.verify(storedHash, candidatePlaintext);
  } catch {
    // If the hash is malformed or corrupted, fail closed safely
    return false;
  }
}
