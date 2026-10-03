// ==================================================
// AUTHENTICATION & PLAYER IDENTITY REST ROUTES
//
// WHAT IT DOES:
// Implements the HTTP endpoints for user registration (/register),
// credential authentication (/login), and session verification (/me).
//
// HOW IT WORKS:
// - /register: Validates input, hashes password with Argon2id, executes
//   an atomic Prisma transaction creating User, Player, and PlayerStats,
//   and signs a 24-hour JWT recorded in the sessions table.
// - /login: Employs a constant-time dummy hash defense to prevent user
//   enumeration via response latency, verifies credentials, records the
//   session, and returns the JWT token with player metadata.
// - /me: Validates the JWT Bearer token and returns the player's full
//   profile and lifetime stats.
//
// WHY IT EXISTS:
// Enforces ADR-004 (Decoupled User vs. Player Identity) and provides
// the entry gateway for players before they enter Colyseus game rooms.
// ==================================================

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../db/prisma.ts";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  getDummyHash,
} from "../../auth/PasswordHasher.ts";

/**
 * Fastify JWT type augmentation for strong typing across request handlers.
 */
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      userId: string;
      playerId: string;
      playerName: string;
      email: string;
    };
    user: {
      userId: string;
      playerId: string;
      playerName: string;
      email: string;
    };
  }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // --------------------------------------------------
  // 1. POST /api/auth/register
  // --------------------------------------------------
  app.post<{
    Body: {
      email: string;
      playerName: string;
      password: string;
    };
  }>(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "playerName", "password"],
          properties: {
            email: { type: "string" },
            playerName: { type: "string", minLength: 3, maxLength: 20 },
            password: { type: "string", minLength: 8, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, playerName, password } = request.body;

      // Validate password policy
      const passwordCheck = validatePasswordStrength(password);
      if (!passwordCheck.valid) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: passwordCheck.reason,
        });
      }

      // Hash password using Argon2id
      const passwordHash = await hashPassword(password);
      const normalizedEmail = email.toLowerCase().trim();
      const sanitizedPlayerName = playerName.trim();

      try {
        // Atomic transaction: User + Player + PlayerStats
        const { user, player } = await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              email: normalizedEmail,
              passwordHash,
            },
          });

          const newPlayer = await tx.player.create({
            data: {
              userId: newUser.id,
              playerName: sanitizedPlayerName,
            },
          });

          await tx.playerStats.create({
            data: {
              playerId: newPlayer.id,
            },
          });

          return { user: newUser, player: newPlayer };
        });

        // Sign 24-hour JWT
        const token = app.jwt.sign({
          userId: user.id,
          playerId: player.id,
          playerName: player.playerName,
          email: user.email,
        });

        // Record active session in PostgreSQL
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await prisma.session.create({
          data: {
            userId: user.id,
            playerId: player.id,
            token,
            expiresAt,
          },
        });

        return reply.status(201).send({
          token,
          user: {
            id: user.id,
            email: user.email,
          },
          player: {
            id: player.id,
            playerName: player.playerName,
            avatarUrl: player.avatarUrl,
          },
        });
      } catch (err: unknown) {
        // Handle PostgreSQL unique constraint violations (Prisma error code P2002)
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          err.code === "P2002"
        ) {
          const target = (err as { meta?: { target?: string[] } }).meta?.target;
          if (target?.includes("email")) {
            return reply.status(409).send({
              statusCode: 409,
              error: "Conflict",
              message: "An account with this email address already exists.",
            });
          }
          if (target?.includes("player_name")) {
            return reply.status(409).send({
              statusCode: 409,
              error: "Conflict",
              message: "This player name is already taken. Please choose another.",
            });
          }
        }

        throw err;
      }
    },
  );

  // --------------------------------------------------
  // 2. POST /api/auth/login
  // --------------------------------------------------
  app.post<{
    Body: {
      email: string;
      password: string;
    };
  }>(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const normalizedEmail = email.toLowerCase().trim();

      // Look up User with linked Player
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { player: true },
      });

      // TIMING ATTACK DEFENSE:
      // If the user does not exist, verify against the pre-computed DUMMY_HASH
      // so the exact same ~80ms of Argon2 computation occurs, defeating user enumeration.
      const dummyHash = await getDummyHash();
      const hashToVerify = user ? user.passwordHash : dummyHash;
      const isPasswordValid = await verifyPassword(hashToVerify, password);

      if (!user || !user.player || !isPasswordValid) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid email or password.",
        });
      }

      // Sign 24-hour JWT
      const token = app.jwt.sign({
        userId: user.id,
        playerId: user.player.id,
        playerName: user.player.playerName,
        email: user.email,
      });

      // Record active session in PostgreSQL
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.session.create({
        data: {
          userId: user.id,
          playerId: user.player.id,
          token,
          expiresAt,
        },
      });

      return reply.status(200).send({
        token,
        user: {
          id: user.id,
          email: user.email,
        },
        player: {
          id: user.player.id,
          playerName: user.player.playerName,
          avatarUrl: user.player.avatarUrl,
        },
      });
    },
  );

  // --------------------------------------------------
  // 3. GET /api/auth/me (Authenticated Profile View)
  // --------------------------------------------------
  app.get(
    "/me",
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Missing or invalid session token.",
          });
        }
      },
    },
    async (request, reply) => {
      const { userId, playerId } = request.user;

      // Verify session is still active in database
      const activeSession = await prisma.session.findFirst({
        where: {
          userId,
          playerId,
          expiresAt: { gt: new Date() },
        },
      });

      if (!activeSession) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Session has expired or was revoked. Please log in again.",
        });
      }

      // Fetch Player and lifetime PlayerStats
      const playerWithStats = await prisma.player.findUnique({
        where: { id: playerId },
        include: { stats: true },
      });

      if (!playerWithStats || !playerWithStats.stats) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Player profile not found.",
        });
      }

      const { stats, ...playerData } = playerWithStats;

      // Calculate derived ratios dynamically (prevent data drift)
      const killDeathRatio =
        stats.deaths === 0
          ? stats.kills
          : Number((stats.kills / stats.deaths).toFixed(2));
      const winRatePercentage =
        stats.totalMatches === 0
          ? 0
          : Number(((stats.wins / stats.totalMatches) * 100).toFixed(1));

      return reply.status(200).send({
        player: {
          id: playerData.id,
          userId: playerData.userId,
          playerName: playerData.playerName,
          avatarUrl: playerData.avatarUrl,
          createdAt: playerData.createdAt,
        },
        stats: {
          playerId: stats.playerId,
          totalMatches: stats.totalMatches,
          wins: stats.wins,
          losses: stats.losses,
          kills: stats.kills,
          deaths: stats.deaths,
          assists: stats.assists,
          damageDealt: stats.damageDealt,
          damageReceived: stats.damageReceived,
          updatedAt: stats.updatedAt,
        },
        derived: {
          killDeathRatio,
          winRatePercentage,
        },
      });
    },
  );
};
