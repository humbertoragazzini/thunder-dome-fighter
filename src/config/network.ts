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

export function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
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

export function getColyseusUrl(): string {
  const envUrl = import.meta.env.VITE_COLYSEUS_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${host}:2567`;
  }
  return envUrl ?? "ws://localhost:2567";
}
