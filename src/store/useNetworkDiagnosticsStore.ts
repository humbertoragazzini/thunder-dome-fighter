// ==================================================
// CLIENT NETWORK DIAGNOSTICS & TELEMETRY STORE (ZUSTAND)
//
// WHAT IT DOES:
// Collects and calculates real-time diagnostics:
// 1. Live Round-Trip Time (Ping) via WebSocket NET_PING / NET_PONG heartbeat.
// 2. Client Render FPS & Frame Time via requestAnimationFrame delta sampling.
// 3. Authoritative Server Tick Rate (Hz) calculated from serverTick delta.
// 4. State Patch Arrival Rate and Network Jitter (variance in ms).
// 5. Physics prediction backlog (pending inputs in flight).
//
// HOW IT WORKS:
// - Samples ping every 1.5s using active Colyseus room (GameRoom or MatchmakingRoom).
// - Computes rolling averages and jitter across the last 10 samples.
// - Continuously measures RAF intervals to calculate render FPS.
// - Provides a manual measurePingNow() trigger for instant latency checks.
//
// WHY IT EXISTS:
// Empowers fighters to diagnose whether perceived lag is network-bound (high ping/jitter),
// GPU-bound (low FPS/frame drops), or physics reconciliation rollback desync.
// ==================================================

import { create } from "zustand";
import { useAppStore } from "./useAppStore";
import { useMatchmakingStore } from "./useMatchmakingStore";
import {
  ClientMessageType,
  type NetPingPayload,
} from "../../shared/contracts/network/ClientMessages";
import {
  ServerMessageType,
  type NetPongPayload,
} from "../../shared/contracts/network/ServerMessages";
import { getColyseusUrl, type ActiveTransportProtocol } from "../config/network";

export interface NetworkDiagnosticsState {
  // Transport & Protocol
  activeTransport: ActiveTransportProtocol;

  // Latency & Network
  ping: number | null;
  avgPing: number | null;
  minPing: number | null;
  maxPing: number | null;
  jitter: number | null;
  lastPingAt: number | null;
  isTesting: boolean;

  // Client Render Performance
  fps: number;
  avgFrameTimeMs: number;

  // Server Simulation Telemetry
  serverTick: number;
  serverTickRate: number; // Ticks per second (expected: 60 or 30)

  // Packet & Patch Dynamics
  packetRate: number; // Patches per second
  packetIntervalMs: number;

  // Physics Prediction & Reconciliation
  pendingInputsCount: number;
  reconciliationCount: number;

  // Actions
  setActiveTransport: (transport: ActiveTransportProtocol) => void;
  startSampling: () => void;
  stopSampling: () => void;
  measurePingNow: () => Promise<number | null>;
  recordServerTick: (tick: number) => void;
  recordStatePatch: () => void;
  recordReconciliationRollback: () => void;
  setPendingInputsCount: (count: number) => void;
}

const MAX_PING_HISTORY = 10;
const pingHistory: number[] = [];

let pingIntervalTimer: ReturnType<typeof setInterval> | null = null;
let rafId: number | null = null;

// FPS calculation helpers
let frameCount = 0;
let lastFpsUpdateTime = performance.now();
let lastFrameTime = performance.now();
const frameDeltas: number[] = [];

// Server tick rate calculation helpers
let tickCountThisSecond = 0;
let lastTickCalculationTime = performance.now();

// Packet rate calculation helpers
let patchCountThisSecond = 0;
let lastPatchCalculationTime = performance.now();
let lastPatchTimestamp = performance.now();

export const useNetworkDiagnosticsStore = create<NetworkDiagnosticsState>((set, get) => ({
  activeTransport: "Detecting...",
  ping: null,
  avgPing: null,
  minPing: null,
  maxPing: null,
  jitter: null,
  lastPingAt: null,
  isTesting: false,

  fps: 60,
  avgFrameTimeMs: 16.6,

  serverTick: 0,
  serverTickRate: 60,

  packetRate: 60,
  packetIntervalMs: 16.6,

  pendingInputsCount: 0,
  reconciliationCount: 0,

  setActiveTransport: (activeTransport) => set({ activeTransport }),

  startSampling: () => {
    // --------------------------------------------------
    // 1. Start FPS measurement loop
    // --------------------------------------------------
    if (!rafId) {
      lastFpsUpdateTime = performance.now();
      lastFrameTime = performance.now();
      frameCount = 0;
      frameDeltas.length = 0;

      const onFrame = (now: number) => {
        frameCount++;
        const delta = now - lastFrameTime;
        lastFrameTime = now;
        frameDeltas.push(delta);
        if (frameDeltas.length > 60) frameDeltas.shift();

        // Update FPS every 500ms
        if (now - lastFpsUpdateTime >= 500) {
          const elapsedSec = (now - lastFpsUpdateTime) / 1000;
          const calculatedFps = Math.round(frameCount / elapsedSec);
          const avgDelta =
            frameDeltas.length > 0
              ? frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length
              : 16.6;

          set({
            fps: Math.min(240, Math.max(0, calculatedFps)),
            avgFrameTimeMs: Math.round(avgDelta * 10) / 10,
          });

          frameCount = 0;
          lastFpsUpdateTime = now;
        }

        rafId = requestAnimationFrame(onFrame);
      };

      rafId = requestAnimationFrame(onFrame);
    }

    // --------------------------------------------------
    // 2. Start Periodic Ping Sampler (Every 1.5s)
    // --------------------------------------------------
    if (!pingIntervalTimer) {
      // Immediate first ping
      void get().measurePingNow();

      pingIntervalTimer = setInterval(() => {
        void get().measurePingNow();
      }, 1500);
    }
  },

  stopSampling: () => {
    if (pingIntervalTimer) {
      clearInterval(pingIntervalTimer);
      pingIntervalTimer = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  },

  measurePingNow: async () => {
    const activeGameRoom = useAppStore.getState().room;
    const activeMatchmakingRoom = useMatchmakingStore.getState().room;
    const targetRoom = activeGameRoom ?? activeMatchmakingRoom;

    set({ isTesting: true });

    // Scenario A: Active Colyseus WebSocket Room
    if (targetRoom && typeof targetRoom.send === "function") {
      return new Promise<number | null>((resolve) => {
        const clientTime = performance.now();
        const pingPayload: NetPingPayload = { clientTime };

        const timeout = setTimeout(() => {
          set({ isTesting: false });
          resolve(get().ping);
        }, 3000);

        // One-time listener for NET_PONG
        const onPong = (message: NetPongPayload) => {
          clearTimeout(timeout);
          const now = performance.now();
          const rtt = Math.max(1, Math.round(now - (message.clientTime || clientTime)));

          pingHistory.push(rtt);
          if (pingHistory.length > MAX_PING_HISTORY) pingHistory.shift();

          const avg = Math.round(
            pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length,
          );
          const min = Math.min(...pingHistory);
          const max = Math.max(...pingHistory);

          // Jitter: average deviation between consecutive pings
          let jitterVal = 0;
          if (pingHistory.length >= 2) {
            let diffSum = 0;
            for (let i = 1; i < pingHistory.length; i++) {
              diffSum += Math.abs(pingHistory[i] - pingHistory[i - 1]);
            }
            jitterVal = Math.round(diffSum / (pingHistory.length - 1));
          }

          const transportProtocol = (targetRoom as any)?.transport?.protocol;
          const detectedTransport: ActiveTransportProtocol =
            transportProtocol === "h3"
              ? "UDP (WebTransport)"
              : transportProtocol === "ws"
                ? "TCP (WebSocket)"
                : get().activeTransport;

          set({
            ping: rtt,
            avgPing: avg,
            minPing: min,
            maxPing: max,
            jitter: jitterVal,
            lastPingAt: Date.now(),
            isTesting: false,
            serverTick: message.serverTick ?? get().serverTick,
            activeTransport: detectedTransport,
          });

          resolve(rtt);
        };

        if (typeof (targetRoom as any).onMessage === "function") {
          const removeListener = (targetRoom as any).onMessage(
            ServerMessageType.NET_PONG,
            (message: NetPongPayload) => {
              onPong(message);
              if (typeof removeListener === "function") {
                removeListener();
              }
            },
          );
        }

        try {
          targetRoom.send(ClientMessageType.NET_PING, pingPayload);
        } catch {
          clearTimeout(timeout);
          set({ isTesting: false });
          resolve(null);
        }
      });
    }

    // Scenario B: Fallback HTTP / WebSocket endpoint probe when rooms aren't yet active
    try {
      const colyseusUrl = getColyseusUrl();
      const start = performance.now();

      await new Promise<void>((resolve) => {
        try {
          const testWs = new WebSocket(colyseusUrl);
          const timer = setTimeout(() => {
            try {
              testWs.close();
            } catch {
              // ignore
            }
            resolve();
          }, 2000);

          testWs.onopen = () => {
            clearTimeout(timer);
            testWs.close();
            resolve();
          };
          testWs.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
        } catch {
          resolve();
        }
      });

      const rtt = Math.max(1, Math.round(performance.now() - start));
      pingHistory.push(rtt);
      if (pingHistory.length > MAX_PING_HISTORY) pingHistory.shift();

      const avg = Math.round(
        pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length,
      );

      set({
        ping: rtt,
        avgPing: avg,
        minPing: Math.min(...pingHistory),
        maxPing: Math.max(...pingHistory),
        jitter: 0,
        lastPingAt: Date.now(),
        isTesting: false,
      });

      return rtt;
    } catch {
      set({ isTesting: false });
      return null;
    }
  },

  recordServerTick: (tick: number) => {
    tickCountThisSecond++;
    const now = performance.now();
    if (now - lastTickCalculationTime >= 1000) {
      const elapsedSec = (now - lastTickCalculationTime) / 1000;
      const rate = Math.round(tickCountThisSecond / elapsedSec);
      set({
        serverTickRate: rate,
        serverTick: tick,
      });
      tickCountThisSecond = 0;
      lastTickCalculationTime = now;
    } else {
      set({ serverTick: tick });
    }
  },

  recordStatePatch: () => {
    patchCountThisSecond++;
    const now = performance.now();
    const interval = Math.round((now - lastPatchTimestamp) * 10) / 10;
    lastPatchTimestamp = now;

    if (now - lastPatchCalculationTime >= 1000) {
      const elapsedSec = (now - lastPatchCalculationTime) / 1000;
      const rate = Math.round(patchCountThisSecond / elapsedSec);
      set({
        packetRate: rate,
        packetIntervalMs: interval,
      });
      patchCountThisSecond = 0;
      lastPatchCalculationTime = now;
    } else {
      set({ packetIntervalMs: interval });
    }
  },

  recordReconciliationRollback: () => {
    set((state) => ({ reconciliationCount: state.reconciliationCount + 1 }));
  },

  setPendingInputsCount: (count: number) => {
    set({ pendingInputsCount: count });
  },
}));
