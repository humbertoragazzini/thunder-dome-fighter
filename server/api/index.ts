// ==================================================
// FASTIFY SERVER ENTRYPOINT & PROCESS RUNNER
//
// WHAT IT DOES:
// Instantiates the Fastify application via `buildApp` and binds it
// to the configured network host and port.
//
// HOW IT WORKS:
// Reads `FASTIFY_PORT` (default: 3000) and `FASTIFY_HOST` (default: 0.0.0.0)
// from environment variables and starts listening for HTTP traffic. Handles
// graceful shutdown on SIGINT and SIGTERM.
//
// WHY IT EXISTS:
// Serves as the standalone entrypoint for the HTTP REST API process,
// decoupled from Colyseus WebSocket rooms for independent scalability.
// ==================================================

import "dotenv/config";
import { buildApp } from "./app.ts";

const PORT = Number(process.env.FASTIFY_PORT ?? 3000);
const HOST = process.env.FASTIFY_HOST ?? "0.0.0.0";

async function start() {
  const app = await buildApp({ logger: true });

  // Graceful shutdown handling
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down Fastify server...`);
      await app.close();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`🚀 Fastify Auth & Identity API listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
