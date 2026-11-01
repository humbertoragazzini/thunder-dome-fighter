// ==================================================
// SERVER TRANSPORT: WEBTRANSPORT ECDSA CERTIFICATE GENERATOR
//
// WHAT IT DOES:
// Generates or loads an OpenSSL ECDSA P-256 self-signed certificate with
// a validity period of 10 days, computes its SHA-256 fingerprint array,
// and provides clean exports for Colyseus H3Transport and Matchmaking.
//
// HOW IT WORKS:
// - Generates a prime256v1 key and X.509 certificate with SAN extensions
//   for localhost, 127.0.0.1, and ::1.
// - Parses the certificate with Node's crypto.X509Certificate.
// - Exports getWebTransportCertificate() and getWebTransportFingerprint().
//
// WHY IT EXISTS:
// Chromium WebTransport strictly requires an ECDSA certificate with a max validity
// of 14 days and explicit serverCertificateHashes pinning when self-signed.
// Isolated into its own module to prevent circular dependencies between colyseus.ts
// and MatchmakingQueueManager.ts.
// ==================================================

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";

const host = process.env.COLYSEUS_HOST ?? "0.0.0.0";

let certPem: string = "";
let keyPem: string = "";
let fingerprint: number[] | undefined;

if (process.env.WEBTRANSPORT_CERT_PATH && process.env.WEBTRANSPORT_KEY_PATH) {
  certPem = fs.readFileSync(process.env.WEBTRANSPORT_CERT_PATH, "utf8");
  keyPem = fs.readFileSync(process.env.WEBTRANSPORT_KEY_PATH, "utf8");
  const x509 = new X509Certificate(certPem);
  fingerprint = x509.fingerprint256.split(":").map((h) => parseInt(h, 16));
} else {
  const certDir = path.join(os.tmpdir(), "colyseus-h3-cert");
  fs.mkdirSync(certDir, { recursive: true });
  const certFile = path.join(certDir, `${host}-wt.pem`);
  const keyFile = path.join(certDir, `${host}-wt-key.pem`);

  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-keyout",
        keyFile,
        "-out",
        certFile,
        "-days",
        "10",
        "-subj",
        `/CN=${host}`,
        "-addext",
        `subjectAltName=DNS:localhost,IP:${host},IP:127.0.0.1,IP:::1`,
      ],
      { stdio: "ignore" },
    );
  } catch (err) {
    console.error("Failed to generate ECDSA certificate with OpenSSL:", err);
  }

  certPem = fs.readFileSync(certFile, "utf8");
  keyPem = fs.readFileSync(keyFile, "utf8");

  const x509 = new X509Certificate(certPem);
  fingerprint = x509.fingerprint256.split(":").map((h) => parseInt(h, 16));
}

export function getWebTransportCertificate(): {
  certPem: string;
  keyPem: string;
  fingerprint: number[] | undefined;
} {
  return { certPem, keyPem, fingerprint };
}

export function getWebTransportFingerprint(): number[] | undefined {
  return fingerprint;
}
