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
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import express from "express";
import { defineServer, defineRoom } from "colyseus";
import { H3Transport } from "@colyseus/h3-transport";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";
import { X509Certificate } from "node:crypto";
import { MatchmakingRoom } from "./matchmaking/MatchmakingRoom";

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

// Generate valid OpenSSL self-signed ECDSA P-256 certificate with SHA-256 fingerprint pinning
let certPem: string;
let keyPem: string;
let fingerprint: number[] | undefined;

if (process.env.WEBTRANSPORT_CERT_PATH && process.env.WEBTRANSPORT_KEY_PATH) {
  certPem = fs.readFileSync(process.env.WEBTRANSPORT_CERT_PATH, "utf8");
  keyPem = fs.readFileSync(process.env.WEBTRANSPORT_KEY_PATH, "utf8");
} else {
  const certDir = path.join(os.tmpdir(), "colyseus-h3-cert");
  fs.mkdirSync(certDir, { recursive: true });
  const certFile = path.join(certDir, `${host}-wt.pem`);
  const keyFile = path.join(certDir, `${host}-wt-key.pem`);

  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
      "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "10",
      "-subj", `/CN=${host}`,
      "-addext", `subjectAltName=DNS:localhost,IP:${host},IP:127.0.0.1,IP:::1`
    ], { stdio: "ignore" });
  } catch (err) {
    console.error("Failed to generate ECDSA certificate with OpenSSL:", err);
  }

  certPem = fs.readFileSync(certFile, "utf8");
  keyPem = fs.readFileSync(keyFile, "utf8");

  const x509 = new X509Certificate(certPem);
  fingerprint = x509.fingerprint256.split(":").map((h) => parseInt(h, 16));
}

const expressApp = express();

// Parse incoming JSON bodies for matchmaking options
expressApp.use(express.json());

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

