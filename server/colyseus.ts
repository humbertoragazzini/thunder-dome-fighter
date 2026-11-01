// ==================================================
// AUTHORITATIVE MULTIPLAYER GAME SERVER (DUAL-TRANSPORT METHOD B)
//
// WHAT IT DOES:
// Boots the Colyseus authoritative server supporting two concurrent transports:
// 1. Primary: H3Transport (WebTransport / HTTP/3 over QUIC on UDP port 2567).
// 2. Fallback: WebSocketTransport (TCP on port 2568) for clients or networks
//    where WebTransport is unsupported or blocked by firewall policies.
//
// HOW IT WORKS:
// - Generates or resolves an ephemeral ECDSA P-256 certificate (validity <= 14 days)
//   when custom certificates are omitted (H3_SELF_SIGNED=1).
// - Registers rooms (`game` and `matchmaking`) in the unified Colyseus matchMaker.
// - Distributes the SHA-256 certificate fingerprint during room allocation so
//   Chromium browsers accept the UDP WebTransport session on raw LAN IP addresses.
// - Attaches a secondary HTTP server on port 2568 running WebSocketTransport for
//   fail-safe TCP fallback.
//
// WHY IT EXISTS:
// Eliminates TCP Head-of-Line blocking and latency spikes across local network
// devices by transmitting authoritative inputs and simulation deltas over UDP,
// while guaranteeing 100% device compatibility via automatic TCP fallback.
// ==================================================

import http from "node:http";
import express from "express";
import { defineServer, defineRoom, matchMaker } from "colyseus";
import { H3Transport } from "@colyseus/h3-transport";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";
import { MatchmakingRoom } from "./matchmaking/MatchmakingRoom";
import { CustomLobbyRoom } from "./lobby/CustomLobbyRoom";
import {
  getWebTransportCertificate,
  getWebTransportFingerprint,
} from "./transport/webTransportCert";

export { getWebTransportFingerprint };

const host = process.env.COLYSEUS_HOST ?? "0.0.0.0";

class FingerprintedH3Transport extends H3Transport {
  private customFingerprint?: number[];

  constructor(opts: any, customFingerprint?: number[]) {
    super(opts);
    this.customFingerprint = customFingerprint;
    if (customFingerprint) {
      this.fingerprint = customFingerprint;
    }
  }

  protected override registerMatchMakeRoutes(fp?: number[]) {
    super.registerMatchMakeRoutes(fp ?? this.customFingerprint);
  }
}

const { certPem, keyPem, fingerprint } = getWebTransportCertificate();

const expressApp = express();

// Parse incoming JSON bodies for matchmaking options
expressApp.use(express.json());

// Expose certificate fingerprint for client WebTransport handshake pinning
expressApp.get("/matchmake/fingerprint", (_req, res) => {
  res.json({ fingerprint });
});

// Expose custom lobbies discovery endpoint for the room browser (Step 19.1)
expressApp.get("/matchmake/custom-lobbies", async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: "custom_lobby" });
    const publicRooms = rooms
      .filter((r) => !r.metadata?.isPrivate && r.metadata?.status === "WAITING")
      .map((r) => ({
        roomId: r.roomId,
        roomName: r.metadata?.roomName ?? "Custom Match",
        hostName: r.metadata?.hostName ?? "Host",
        gameMode: r.metadata?.gameMode ?? "1v1",
        levelId: r.metadata?.levelId ?? "thunder-dome-alpha",
        scoreLimit: r.metadata?.scoreLimit ?? 5,
        timeLimitSeconds: r.metadata?.timeLimitSeconds ?? 180,
        currentPlayers: r.clients,
        maxPlayers: r.maxClients,
        status: r.metadata?.status ?? "WAITING",
        isPrivate: false,
      }));
    res.json({ lobbies: publicRooms });
  } catch (err) {
    console.error("[Colyseus] Failed to query custom lobbies:", err);
    res.status(500).json({ error: "Failed to query lobbies" });
  }
});

// Lookup private lobby by room code
expressApp.post("/matchmake/custom-lobbies/lookup", async (req, res) => {
  try {
    const { roomCode } = req.body ?? {};
    if (!roomCode || typeof roomCode !== "string") {
      return res.status(400).json({ error: "Room code required" });
    }
    const cleanCode = roomCode.trim().toUpperCase();
    const rooms = await matchMaker.query({ name: "custom_lobby" });
    const match = rooms.find(
      (r) =>
        r.metadata?.roomCode?.toUpperCase() === cleanCode &&
        r.metadata?.status === "WAITING",
    );
    if (!match) {
      return res.status(404).json({ error: "Lobby not found or match already launched" });
    }
    res.json({ roomId: match.roomId, metadata: match.metadata });
  } catch (err) {
    console.error("[Colyseus] Failed to lookup custom lobby:", err);
    res.status(500).json({ error: "Failed to lookup lobby" });
  }
});

// Permissive CORS middleware supporting credentials for cross-origin LAN testing
expressApp.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const h3Transport = new FingerprintedH3Transport(
  { app: expressApp, cert: certPem, key: keyPem },
  fingerprint,
);
const wsFallbackTransport = new WebSocketTransport({ noServer: true });

const gameServer = defineServer({
  transport: h3Transport,
  rooms: {
    game: defineRoom(GameRoom).filterBy(["modeId", "levelId"]),
    matchmaking: defineRoom(MatchmakingRoom),
    custom_lobby: defineRoom(CustomLobbyRoom),
  },
});

const h3Port = Number(process.env.PORT ?? process.env.COLYSEUS_PORT ?? 2567);
const wsFallbackPort = Number(process.env.COLYSEUS_WS_FALLBACK_PORT ?? 2568);

async function startServer() {
  // 1. Start primary WebTransport (UDP/QUIC :2567) + HTTPS matchmaker
  await gameServer.listen(h3Port, host);

  // 2. Attach WebSocket fallback to secondary plain HTTP server on port 2568
  const secondaryHttpServer = http.createServer(expressApp);
  wsFallbackTransport.attachToServer(secondaryHttpServer);
  secondaryHttpServer.listen(wsFallbackPort, host, () => {
    console.log(
      `🔌 Colyseus TCP Fallback listening on ws://${host}:${wsFallbackPort}`,
    );
  });

  console.log(
    `🚀 Colyseus Primary Server listening on UDP/QUIC (WebTransport) & HTTPS on ${host}:${h3Port}`,
  );
}

startServer();

