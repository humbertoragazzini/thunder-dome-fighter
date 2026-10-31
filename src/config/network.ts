// ==================================================
// CLIENT NETWORK ENDPOINT RESOLVER
//
// WHAT IT DOES:
// Dynamically resolves Fastify HTTP API and Colyseus WebSocket URLs for both
// local development and LAN multi-device testing (other PCs, mobile devices).
//
// HOW IT WORKS:
// - If VITE_API_URL or VITE_COLYSEUS_URL are explicitly configured to an external
//   domain/IP, that value takes precedence.
// - In a browser environment, if the host is accessed via a LAN IP (e.g. 192.168.x.x),
//   the resolver automatically targets the backend services at that same LAN host.
// - Defaults to localhost for local machine testing.
//
// WHY IT EXISTS:
// Eliminates connection failures where remote PCs on the same LAN load the frontend
// but attempt to query their own local loopback (localhost) for the backend.
// ==================================================

import { Client } from "@colyseus/sdk";

export type ActiveTransportProtocol = "UDP (WebTransport)" | "TCP (WebSocket)" | "Detecting...";

export function getApiUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${host}:3000`;
  }
  return envUrl ?? "http://localhost:3000";
}

/**
 * Resolves the primary WebTransport HTTP/3 (UDP) endpoint on port 2567.
 * WebTransport specification mandates the https:// scheme.
 */
export function getWebTransportUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_COLYSEUS_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/^wss?:/, "https:");
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    return `https://${host}:2567`;
  }
  return envUrl ? envUrl.replace(/^wss?:/, "https:") : "https://localhost:2567";
}

/**
 * Resolves the secondary WebSocket (TCP) fallback endpoint on port 2568.
 */
export function getWebSocketFallbackUrl(): string {
  const envFallback = (import.meta as any).env?.VITE_COLYSEUS_WS_FALLBACK_URL;
  if (envFallback) {
    return envFallback;
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${host}:2568`;
  }
  return "ws://localhost:2568";
}

export function getColyseusUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_COLYSEUS_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${host}:2568`;
  }
  return envUrl ?? "ws://localhost:2568";
}

/**
 * Custom fetch proxy for browser development:
 * Rewrites direct matchmaking discovery requests targeting :2567 or :2568
 * to Vite's local dev proxy (/matchmake), which ignores self-signed certificate
 * errors in Node and returns the SHA-256 certificate fingerprint to the browser.
 */
function devFetchProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let urlStr = typeof input === "string" ? input : input.toString();
  if (typeof window !== "undefined" && (urlStr.includes(":2567/matchmake") || urlStr.includes(":2568/matchmake"))) {
    urlStr = urlStr.replace(/^https?:\/\/[^/]+(?::\d+)?\/matchmake/, "/matchmake");
  }
  return fetch(urlStr, init);
}

/**
 * Dual-Transport Connection Helper (Method B).
 * 1. Attempts WebTransport (HTTP/3 over UDP port 2567) with a 2.5s connection race.
 * 2. If unsupported, rejected, or timed out, falls back cleanly to WebSocket (TCP port 2568).
 */
export async function connectWithDualTransport<T>(
  connectFn: (client: Client, protocol: "h3" | "ws") => Promise<T>,
  onTransportResolved?: (protocol: "UDP (WebTransport)" | "TCP (WebSocket)") => void,
): Promise<T> {
  const isWebTransportSupported = typeof window !== "undefined" && "WebTransport" in window;

  if (isWebTransportSupported) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("WebTransport handshake timeout (2500ms)")),
          2500,
        );
      });

      const wtUrl = getWebTransportUrl();
      const h3Client = new Client(wtUrl, { protocol: "h3", fetchFn: devFetchProxy });
      const result = await Promise.race([
        connectFn(h3Client, "h3"),
        timeoutPromise,
      ]);
      clearTimeout(timer);
      onTransportResolved?.("UDP (WebTransport)");
      return result;
    } catch (err) {
      clearTimeout(timer);
      console.warn(
        "[Network] WebTransport UDP connection failed or timed out. Falling back to WebSocket TCP on :2568...",
        err,
      );
    }
  }

  const wsUrl = getWebSocketFallbackUrl();
  const wsClient = new Client(wsUrl, { protocol: "ws", fetchFn: devFetchProxy });
  const result = await connectFn(wsClient, "ws");
  onTransportResolved?.("TCP (WebSocket)");
  return result;
}

