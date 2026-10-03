// ==================================================
// FASTIFY HTTP APPLICATION FACTORY
//
// WHAT IT DOES:
// Creates, configures, and exports the Fastify HTTP application instance
// equipped with CORS, JWT authentication, centralized error handling,
// and health check endpoints.
//
// HOW IT WORKS:
// Uses the Application Factory pattern (`buildApp`). Registers `@fastify/cors`
// to allow frontend cross-origin requests, `@fastify/jwt` for cryptographically
// signed session tokens, and an Ajv-aware error handler that formats
// validation and runtime errors into clean JSON payloads.
//
// WHY IT EXISTS:
// Acts as the REST API gateway for account authentication and player profiles.
// The factory pattern decouples application configuration from TCP network
// binding, allowing instant in-memory integration testing via `app.inject()`.
// ==================================================

import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";

export interface AppOptions {
  logger?: boolean;
}

/**
 * Builds and configures the Fastify application instance.
 */
export async function buildApp(
  options: AppOptions = { logger: true },
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger,
  });

  // --------------------------------------------------
  // 1. CORS Configuration
  // --------------------------------------------------
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      /localhost:\d+$/,
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // --------------------------------------------------
  // 2. JWT Plugin Registration
  // --------------------------------------------------
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is not defined in .env");
  }

  await app.register(jwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN ?? "24h", // Default: 24 hours
    },
  });

  // --------------------------------------------------
  // 3. Centralized Error Handler
  // --------------------------------------------------
  app.setErrorHandler((error, request, reply) => {
    // Catch JSON schema validation failures (Ajv)
    if (error.validation) {
      reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: error.message,
      });
      return;
    }

    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error(error);
    }

    reply.status(statusCode).send({
      statusCode,
      error: error.name || "Internal Server Error",
      message: statusCode >= 500 ? "Internal Server Error" : error.message,
    });
  });

  // --------------------------------------------------
  // 4. Base Health Check Route
  // --------------------------------------------------
  app.get("/api/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  });

  return app;
}
