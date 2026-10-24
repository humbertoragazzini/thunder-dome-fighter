// ==================================================
// CLIENT MATCHMAKING & PARTY STORE (ZUSTAND)
//
// WHAT IT DOES:
// Manages the client-side state for pre-match presence:
// 1. WebSocket connection to the Colyseus MatchmakingRoom.
// 2. Active matchmaking queue search state, elapsed timer, and estimated wait.
// 3. Squad / Party state, member readiness, and 6-character invite code.
// 4. Receives and stores Colyseus seat reservations upon match allocation.
//
// HOW IT WORKS:
// - Lazily connects to ws://<host>:2567/matchmaking using active JWT token.
// - Listens for MATCHMAKING_STATUS:
//   - QUEUED: starts elapsed search timer, routes currentScreen to MATCHMAKING.
//   - MATCH_FOUND: stores seat reservation, routes currentScreen to MATCH_LOADING.
//   - IDLE: resets timer, returns to menu.
// - Listens for PARTY_UPDATED: synchronizes squad roster across all members.
//
// WHY IT EXISTS:
// Enforces Phase 15 requirements. Decouples matchmaking and party UI components
// from raw WebSocket communication.
// ==================================================

import { Client, type Room } from "@colyseus/sdk";
import { create } from "zustand";
import { getColyseusUrl } from "../config/network";
import { ClientMessageType } from "../../shared/contracts/network/ClientMessages.ts";
import {
  ServerMessageType,
  type MatchmakingStatusPayload,
  type PartyUpdatedPayload,
  type ServerErrorPayload,
} from "../../shared/contracts/network/ServerMessages.ts";
import type { Party } from "../../shared/domain/Party.ts";
import type { GameModeId } from "../../shared/domain/GameMode.ts";
import { useAuthStore } from "./useAuthStore";
import { useNavigationStore } from "./useNavigationStore";

export interface MatchmakingState {
  // Connection
  room: Room | null;
  isConnecting: boolean;
  isConnected: boolean;

  // Queue State
  isQueuing: boolean;
  queueMode: GameModeId | null;
  queueStartTime: number | null;
  elapsedSeconds: number;
  estimatedWaitSeconds: number;
  seatReservation: any | null;
  targetRoomId: string | null;

  // Party State
  party: Party | null;
  error: string | null;

  // Actions
  ensureConnected: () => Promise<Room>;
  disconnect: () => Promise<void>;
  createParty: () => Promise<void>;
  joinParty: (inviteCode: string) => Promise<void>;
  leaveParty: () => Promise<void>;
  toggleReady: () => Promise<void>;
  startQueue: (modeId: GameModeId) => Promise<void>;
  cancelQueue: () => Promise<void>;
  clearReservation: () => void;
  setError: (error: string | null) => void;
}

let timerInterval: ReturnType<typeof setInterval> | null = null;

function startElapsedTimer(set: any, get: any) {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const startTime = get().queueStartTime;
    if (startTime && get().isQueuing) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      set({ elapsedSeconds: elapsed });
    }
  }, 1000);
}

function stopElapsedTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export const useMatchmakingStore = create<MatchmakingState>((set, get) => ({
  room: null,
  isConnecting: false,
  isConnected: false,

  isQueuing: false,
  queueMode: null,
  queueStartTime: null,
  elapsedSeconds: 0,
  estimatedWaitSeconds: 10,
  seatReservation: null,
  targetRoomId: null,

  party: null,
  error: null,

  ensureConnected: async (): Promise<Room> => {
    const existingRoom = get().room;
    if (existingRoom && get().isConnected) {
      return existingRoom;
    }

    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error("Cannot connect to matchmaking: No active authentication token.");
    }

    set({ isConnecting: true, error: null });

    try {
      const colyseusUrl = getColyseusUrl();
      const client = new Client(colyseusUrl);
      const room = await client.joinOrCreate("matchmaking", { token });

      // Listen for party synchronization
      room.onMessage(
        ServerMessageType.PARTY_UPDATED,
        (payload: PartyUpdatedPayload) => {
          set({ party: payload.party });
        },
      );

      // Listen for matchmaking queue status transitions
      room.onMessage(
        ServerMessageType.MATCHMAKING_STATUS,
        (payload: MatchmakingStatusPayload) => {
          if (payload.status === "QUEUED") {
            const now = Date.now();
            set({
              isQueuing: true,
              queueMode: payload.gameModeId ?? get().queueMode,
              queueStartTime: now,
              elapsedSeconds: 0,
              estimatedWaitSeconds: payload.estimatedWaitSeconds ?? 10,
            });
            startElapsedTimer(set, get);

            if (useNavigationStore.getState().currentScreen !== "MATCHMAKING") {
              useNavigationStore.getState().navigateTo("MATCHMAKING");
            }
          } else if (payload.status === "MATCH_FOUND") {
            stopElapsedTimer();
            set({
              isQueuing: false,
              seatReservation: payload.reservation,
              targetRoomId: payload.roomId ?? null,
            });

            // Transition directly to match loading to consume reservation
            if (payload.gameModeId) {
              useNavigationStore.getState().setSelectedMatchMode(payload.gameModeId);
            }
            useNavigationStore.getState().navigateTo("MATCH_LOADING");
          } else if (payload.status === "IDLE") {
            stopElapsedTimer();
            set({
              isQueuing: false,
              queueMode: null,
              queueStartTime: null,
              elapsedSeconds: 0,
            });

            if (useNavigationStore.getState().currentScreen === "MATCHMAKING") {
              useNavigationStore.getState().goBack();
            }
          }
        },
      );

      // Listen for structured server errors
      room.onMessage(
        ServerMessageType.SERVER_ERROR,
        (payload: ServerErrorPayload) => {
          set({ error: payload.message });
          useNavigationStore.getState().openModal("ERROR", payload.message);
        },
      );

      room.onLeave(() => {
        stopElapsedTimer();
        set({
          room: null,
          isConnected: false,
          isConnecting: false,
          isQueuing: false,
          party: null,
        });
      });

      set({
        room,
        isConnected: true,
        isConnecting: false,
        error: null,
      });

      return room;
    } catch (err: unknown) {
      stopElapsedTimer();
      const message =
        err instanceof Error ? err.message : "Failed to connect to matchmaking server.";
      set({
        room: null,
        isConnected: false,
        isConnecting: false,
        error: message,
      });
      throw err;
    }
  },

  disconnect: async () => {
    stopElapsedTimer();
    const room = get().room;
    if (room) {
      await room.leave();
    }
    set({
      room: null,
      isConnected: false,
      isConnecting: false,
      isQueuing: false,
      party: null,
      seatReservation: null,
      targetRoomId: null,
    });
  },

  createParty: async () => {
    const room = await get().ensureConnected();
    room.send(ClientMessageType.PARTY_CREATE, {});
  },

  joinParty: async (inviteCode: string) => {
    const room = await get().ensureConnected();
    room.send(ClientMessageType.PARTY_JOIN, { inviteCode });
  },

  leaveParty: async () => {
    const room = await get().ensureConnected();
    room.send(ClientMessageType.PARTY_LEAVE, {});
    set({ party: null });
  },

  toggleReady: async () => {
    const room = await get().ensureConnected();
    const party = get().party;
    const playerId = useAuthStore.getState().player?.id;
    if (!party || !playerId) return;

    const currentMember = party.members[playerId];
    const newReady = !currentMember?.isReady;

    room.send(ClientMessageType.PARTY_SET_READY, { isReady: newReady });
  },

  startQueue: async (modeId: GameModeId) => {
    const room = await get().ensureConnected();
    useNavigationStore.getState().setSelectedMatchMode(modeId);
    room.send(ClientMessageType.MATCH_QUEUE, { gameModeId: modeId });
  },

  cancelQueue: async () => {
    stopElapsedTimer();
    const room = get().room;
    if (room) {
      room.send(ClientMessageType.MATCH_CANCEL_QUEUE, {});
    }
    set({
      isQueuing: false,
      queueMode: null,
      queueStartTime: null,
      elapsedSeconds: 0,
    });

    if (useNavigationStore.getState().currentScreen === "MATCHMAKING") {
      useNavigationStore.getState().goBack();
    }
  },

  clearReservation: () => {
    set({ seatReservation: null, targetRoomId: null });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));
