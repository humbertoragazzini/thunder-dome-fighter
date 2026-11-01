// ==================================================
// CLIENT SUBSYSTEM: CUSTOM GAME LOBBY ZUSTAND STORE
//
// WHAT IT DOES:
// Manages real-time state for Phase 19 Custom Game Lobbies:
// - Fetches and queries active public lobbies for `RoomBrowserScreen`.
// - Connects to authoritative `CustomLobbyRoom` via Dual-Transport.
// - Synchronizes lobby state (roster, team affinity, ready flags, settings).
// - Dispatches player actions (switch team, toggle ready, kick player, start game).
// - Coordinates match handoff when the host launches the game.
//
// HOW IT WORKS:
// - Uses Colyseus client SDK and `connectWithDualTransport` for connection resilience.
// - Listens to `room.onStateChange` for reactive UI updates across all participants.
// - On `lobby:match-launched`, stores seat reservations in `useMatchmakingStore` and
//   triggers navigation to `MATCH_LOADING`.
//
// WHY IT EXISTS:
// Single source of client truth for custom player-hosted matches.
// ==================================================

import { create } from "zustand";
import type { Room } from "@colyseus/sdk";
import type {
  CreateCustomLobbyOptions,
  CustomLobbyListingItem,
  LobbyMatchLaunchedPayload,
  LobbyPlayerKickedPayload,
  LobbyUpdateSettingsPayload,
} from "../../shared/contracts/network/CustomLobbyMessages";
import {
  CustomLobbyClientMessage,
  CustomLobbyServerMessage,
} from "../../shared/contracts/network/CustomLobbyMessages";
import type { CustomLobbyState } from "../../server/lobby/CustomLobbyState";
import {
  connectWithDualTransport,
  setCachedCertificateFingerprint,
} from "../config/network";
import { useAuthStore } from "./useAuthStore";
import { useNavigationStore } from "./useNavigationStore";
import { useMatchmakingStore } from "./useMatchmakingStore";

interface CustomLobbyStoreState {
  publicLobbies: CustomLobbyListingItem[];
  activeRoom: Room<CustomLobbyState> | null;
  lobbyState: CustomLobbyState | null;
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;

  // Actions
  fetchPublicLobbies: () => Promise<void>;
  createCustomRoom: (options: CreateCustomLobbyOptions) => Promise<void>;
  joinCustomRoom: (roomId: string, roomCode?: string) => Promise<void>;
  joinByRoomCode: (roomCode: string) => Promise<void>;
  switchTeam: (teamIndex: number) => void;
  toggleReady: () => void;
  updateSettings: (settings: LobbyUpdateSettingsPayload) => void;
  kickPlayer: (targetSessionId: string) => void;
  startGame: () => void;
  leaveLobby: () => void;
  clearError: () => void;
}

export const useCustomLobbyStore = create<CustomLobbyStoreState>((set, get) => ({
  publicLobbies: [],
  activeRoom: null,
  lobbyState: null,
  isLoading: false,
  isSearching: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchPublicLobbies: async () => {
    set({ isSearching: true, error: null });
    try {
      const response = await fetch("/matchmake/custom-lobbies");
      if (!response.ok) {
        throw new Error(`Failed to query lobbies: HTTP ${response.status}`);
      }
      const data = (await response.json()) as { lobbies?: CustomLobbyListingItem[] };
      set({ publicLobbies: Array.isArray(data?.lobbies) ? data.lobbies : [], isSearching: false });
    } catch (err: any) {
      console.warn("[CustomLobbyStore] fetchPublicLobbies error:", err);
      set({ error: err.message ?? "Failed to fetch public lobbies", isSearching: false });
    }
  },

  createCustomRoom: async (options: CreateCustomLobbyOptions) => {
    const token = useAuthStore.getState().token;
    set({ isLoading: true, error: null });

    try {
      const room = await connectWithDualTransport<Room<CustomLobbyState>>((client) => {
        if (token) {
          client.http.authToken = token;
        }
        return client.create("custom_lobby", {
          ...options,
          token,
          _authToken: token,
        });
      });

      // Bind reactive state change listener
      room.onStateChange((state) => {
        set({ lobbyState: state });
      });

      // Listen for host launch event
      room.onMessage(
        CustomLobbyServerMessage.MATCH_LAUNCHED,
        (payload: LobbyMatchLaunchedPayload) => {
          if (payload.fingerprint) {
            setCachedCertificateFingerprint(payload.fingerprint);
          }
          useMatchmakingStore.setState({
            seatReservation: payload.reservation,
            targetRoomId: payload.gameRoomId,
          });

          const currentMode = (get().lobbyState?.gameMode as any) ?? options.gameMode;
          useNavigationStore.getState().setSelectedMatchMode(currentMode);
          useNavigationStore.getState().navigateTo("MATCH_LOADING");
        },
      );

      // Listen for kicked event
      room.onMessage(
        CustomLobbyServerMessage.PLAYER_KICKED,
        (payload: LobbyPlayerKickedPayload) => {
          get().leaveLobby();
          useNavigationStore.getState().openModal("ERROR", payload.reason);
        },
      );

      set({ activeRoom: room, lobbyState: room.state, isLoading: false });
      useNavigationStore.getState().navigateTo("CUSTOM_LOBBY");
    } catch (err: any) {
      console.error("[CustomLobbyStore] createCustomRoom error:", err);
      set({ error: err.message ?? "Failed to create custom lobby", isLoading: false });
    }
  },

  joinCustomRoom: async (roomId: string, roomCode?: string) => {
    const token = useAuthStore.getState().token;
    set({ isLoading: true, error: null });

    try {
      const room = await connectWithDualTransport<Room<CustomLobbyState>>((client) => {
        if (token) {
          client.http.authToken = token;
        }
        return client.joinById(roomId, {
          roomCode,
          token,
          _authToken: token,
        });
      });

      room.onStateChange((state) => {
        set({ lobbyState: state });
      });

      room.onMessage(
        CustomLobbyServerMessage.MATCH_LAUNCHED,
        (payload: LobbyMatchLaunchedPayload) => {
          if (payload.fingerprint) {
            setCachedCertificateFingerprint(payload.fingerprint);
          }
          useMatchmakingStore.setState({
            seatReservation: payload.reservation,
            targetRoomId: payload.gameRoomId,
          });

          const currentMode = (get().lobbyState?.gameMode as any) ?? "1v1";
          useNavigationStore.getState().setSelectedMatchMode(currentMode);
          useNavigationStore.getState().navigateTo("MATCH_LOADING");
        },
      );

      room.onMessage(
        CustomLobbyServerMessage.PLAYER_KICKED,
        (payload: LobbyPlayerKickedPayload) => {
          get().leaveLobby();
          useNavigationStore.getState().openModal("ERROR", payload.reason);
        },
      );

      set({ activeRoom: room, lobbyState: room.state, isLoading: false });
      useNavigationStore.getState().navigateTo("CUSTOM_LOBBY");
    } catch (err: any) {
      console.error("[CustomLobbyStore] joinCustomRoom error:", err);
      set({ error: err.message ?? "Failed to join custom lobby", isLoading: false });
    }
  },

  joinByRoomCode: async (roomCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const cleanCode = roomCode.trim().toUpperCase();
      const res = await fetch("/matchmake/custom-lobbies/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: cleanCode }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "Lobby not found with that room code");
      }

      const data = (await res.json()) as { roomId: string };
      await get().joinCustomRoom(data.roomId, cleanCode);
    } catch (err: any) {
      console.warn("[CustomLobbyStore] joinByRoomCode error:", err);
      set({ error: err.message ?? "Invalid room code", isLoading: false });
    }
  },

  switchTeam: (teamIndex: number) => {
    const room = get().activeRoom;
    if (room) {
      room.send(CustomLobbyClientMessage.SWITCH_TEAM, { teamIndex });
    }
  },

  toggleReady: () => {
    const room = get().activeRoom;
    if (room) {
      room.send(CustomLobbyClientMessage.TOGGLE_READY);
    }
  },

  updateSettings: (settings: LobbyUpdateSettingsPayload) => {
    const room = get().activeRoom;
    if (room) {
      room.send(CustomLobbyClientMessage.UPDATE_SETTINGS, settings);
    }
  },

  kickPlayer: (targetSessionId: string) => {
    const room = get().activeRoom;
    if (room) {
      room.send(CustomLobbyClientMessage.KICK_PLAYER, { targetSessionId });
    }
  },

  startGame: () => {
    const room = get().activeRoom;
    if (room) {
      room.send(CustomLobbyClientMessage.START_GAME);
    }
  },

  leaveLobby: () => {
    const room = get().activeRoom;
    if (room) {
      room.leave();
    }
    set({ activeRoom: null, lobbyState: null, isLoading: false, error: null });
    useNavigationStore.getState().navigateTo("ROOM_BROWSER");
  },
}));
