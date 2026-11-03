// ==================================================
// CLIENT SUBSYSTEM: TOURNAMENT LOBBY & BRACKET STORE
//
// WHAT IT DOES:
// Manages real-time state for Phase 21 Tournament Championships:
// - Fetches active public tournaments.
// - Connects to authoritative `TournamentLobbyRoom` via Dual-Transport.
// - Synchronizes tournament lobby state (roster, seeds, slots, readiness status).
// - Dispatches player actions (toggle ready, start tournament, update settings).
// - Coordinates match handoff when a match node is scheduled/assigned.
// - Tracks bracket updates and champion podium celebration.
//
// HOW IT WORKS:
// - Uses Colyseus client SDK and `connectWithDualTransport`.
// - Listens to `room.onStateChange` for reactive UI updates across all participants.
// - On `tournament:match-assigned`, stores seat reservations in `useMatchmakingStore`
//   and triggers seamless handoff to `MATCH_LOADING`.
// - On `tournament:champion-crowned`, displays the championship podium.
//
// WHY IT EXISTS:
// Single source of client truth for competitive tournament progression.
// ==================================================

import { create } from "zustand";
import type { Room } from "@colyseus/sdk";
import type {
  CreateTournamentLobbyOptions,
  TournamentLobbyListingItem,
  TournamentMatchAssignedPayload,
  TournamentChampionCrownedPayload,
  TournamentUpdateSettingsPayload,
  TournamentKickedPayload,
  TournamentBracketUpdatedPayload,
  TournamentSpectateGrantedPayload,
} from "../../shared/contracts/network/TournamentMessages";
import {
  TournamentClientMessage,
  TournamentServerMessage,
} from "../../shared/contracts/network/TournamentMessages";
import type {
  ITournamentStage,
  ITournamentParticipant,
} from "../../shared/domain/tournament/TournamentTypes";
import type { TournamentLobbyState } from "../../server/tournament/TournamentLobbyState";
import {
  connectWithDualTransport,
  setCachedCertificateFingerprint,
} from "../config/network";
import { useAppStore } from "./useAppStore";
import { useAuthStore } from "./useAuthStore";
import { useNavigationStore } from "./useNavigationStore";
import { useMatchmakingStore } from "./useMatchmakingStore";

interface TournamentStoreState {
  publicTournaments: TournamentLobbyListingItem[];
  activeRoom: Room<TournamentLobbyState> | null;
  lobbyState: TournamentLobbyState | null;
  lobbyRevision: number;
  assignedMatch: TournamentMatchAssignedPayload | null;
  championData: TournamentChampionCrownedPayload | null;
  bracketTree: { stages: ITournamentStage[]; participants: ITournamentParticipant[] } | null;
  isSpectatingMatch: boolean;
  spectatingMatchData: TournamentSpectateGrantedPayload | null;
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;

  // Actions
  fetchPublicTournaments: () => Promise<void>;
  createTournament: (options: CreateTournamentLobbyOptions) => Promise<void>;
  joinTournament: (roomId: string, roomCode?: string) => Promise<void>;
  joinByRoomCode: (roomCode: string) => Promise<void>;
  toggleReady: () => void;
  updateSettings: (settings: TournamentUpdateSettingsPayload) => void;
  kickParticipant: (targetSessionId: string) => void;
  startTournament: () => void;
  leaveTournament: () => void;
  spectateTournamentMatch: (matchId: string) => void;
  proceedToAssignedMatch: () => Promise<void>;
  requestMatchReservation: (matchId: string) => void;
  returnToTournamentHub: () => Promise<void>;
  dismissAssignedMatch: () => void;
  dismissChampion: () => void;
  clearError: () => void;
}

export const useTournamentStore = create<TournamentStoreState>((set, get) => ({
  publicTournaments: [],
  activeRoom: null,
  lobbyState: null,
  lobbyRevision: 0,
  assignedMatch: null,
  championData: null,
  bracketTree: null,
  isSpectatingMatch: false,
  spectatingMatchData: null,
  isLoading: false,
  isSearching: false,
  error: null,

  clearError: () => set({ error: null }),
  dismissAssignedMatch: () => set({ assignedMatch: null }),
  dismissChampion: () => set({ championData: null }),

  fetchPublicTournaments: async () => {
    set({ isSearching: true, error: null });
    try {
      const response = await fetch("/matchmake/tournaments");
      if (!response.ok) {
        throw new Error(`Failed to query tournaments: HTTP ${response.status}`);
      }
      const data = (await response.json()) as { tournaments?: TournamentLobbyListingItem[] };
      set({
        publicTournaments: Array.isArray(data?.tournaments) ? data.tournaments : [],
        isSearching: false,
      });
    } catch (err: any) {
      console.warn("[TournamentStore] fetchPublicTournaments error:", err);
      set({ error: err.message ?? "Failed to fetch tournaments", isSearching: false });
    }
  },

  createTournament: async (options: CreateTournamentLobbyOptions) => {
    const token = useAuthStore.getState().token;
    set({ isLoading: true, error: null });

    try {
      const room = await connectWithDualTransport<Room<TournamentLobbyState>>((client) => {
        if (token) {
          client.http.authToken = token;
        }
        return client.create("tournament_lobby", {
          ...options,
          token,
          _authToken: token,
        });
      });

      // Bind reactive state change listener
      room.onStateChange((state) => {
        set((prev) => ({
          lobbyState: state,
          lobbyRevision: prev.lobbyRevision + 1,
        }));
      });

      room.onLeave(() => {
        set({ activeRoom: null, lobbyState: null, lobbyRevision: 0, isLoading: false });
        if (useNavigationStore.getState().currentScreen === "TOURNAMENT_LOBBY") {
          useNavigationStore.getState().navigateTo("MAIN_MENU");
        }
      });

      // Listen for match assignment (player is scheduled to fight)
      room.onMessage(
        TournamentServerMessage.MATCH_ASSIGNED,
        (payload: TournamentMatchAssignedPayload) => {
          console.log("🏆 [TournamentStore] Match assigned:", payload);
          if (payload.fingerprint) {
            setCachedCertificateFingerprint(payload.fingerprint);
          }
          set({ assignedMatch: payload });

          const currentScreen = useNavigationStore.getState().currentScreen;
          const currentRoom = useAppStore.getState().room;

          // If currently in an active game room (e.g. scoreboard), do not abruptly kick them out.
          // The scoreboard / countdown will invoke proceedToAssignedMatch() cleanly.
          if (currentScreen === "IN_GAME" && currentRoom) {
            console.log("🏆 [TournamentStore] Match assigned while in combat/scoreboard. Ready to proceed upon match completion.");
            return;
          }

          get().proceedToAssignedMatch();
        },
      );

      // Listen for bracket updates
      room.onMessage(
        TournamentServerMessage.BRACKET_UPDATED,
        (payload: TournamentBracketUpdatedPayload) => {
          if (payload?.stages && payload?.participants) {
            set({ bracketTree: { stages: payload.stages, participants: payload.participants } });
          }
          set((prev) => ({ lobbyRevision: prev.lobbyRevision + 1 }));
        },
      );

      // Listen for spectate granted
      room.onMessage(
        TournamentServerMessage.SPECTATE_GRANTED,
        (payload: TournamentSpectateGrantedPayload) => {
          console.log("👁️ [TournamentStore] Spectate granted:", payload);
          if (payload.fingerprint) {
            setCachedCertificateFingerprint(payload.fingerprint);
          }
          set({ isSpectatingMatch: true, spectatingMatchData: payload });

          useMatchmakingStore.setState({
            seatReservation: payload.reservation,
            targetRoomId: payload.gameRoomId,
          });

          useNavigationStore.getState().setSelectedMatchMode("1v1");
          useNavigationStore.getState().navigateTo("MATCH_LOADING");
        },
      );

      // Listen for champion crowned
      room.onMessage(
        TournamentServerMessage.CHAMPION_CROWNED,
        (payload: TournamentChampionCrownedPayload) => {
          console.log("🏆 [TournamentStore] Champion crowned:", payload);
          set({ championData: payload });
        },
      );

      // Listen for kicks
      room.onMessage(
        TournamentServerMessage.PARTICIPANT_KICKED,
        (payload: TournamentKickedPayload) => {
          set({ error: payload.reason ?? "You were removed from the tournament" });
          get().leaveTournament();
        },
      );

      set({
        activeRoom: room,
        lobbyState: room.state,
        lobbyRevision: 1,
        isLoading: false,
      });

      useNavigationStore.getState().navigateTo("TOURNAMENT_LOBBY");
    } catch (err: any) {
      console.error("[TournamentStore] Failed to create tournament:", err);
      set({ error: err.message ?? "Failed to create tournament", isLoading: false });
    }
  },

  joinTournament: async (roomId: string, roomCode?: string) => {
    const token = useAuthStore.getState().token;
    set({ isLoading: true, error: null });

    try {
      const room = await connectWithDualTransport<Room<TournamentLobbyState>>((client) => {
        if (token) {
          client.http.authToken = token;
        }
        return client.joinById(roomId, {
          token,
          _authToken: token,
          roomCode,
        });
      });

      room.onStateChange((state) => {
        set((prev) => ({
          lobbyState: state,
          lobbyRevision: prev.lobbyRevision + 1,
        }));
      });

      room.onLeave(() => {
        set({ activeRoom: null, lobbyState: null, lobbyRevision: 0, isLoading: false });
        if (useNavigationStore.getState().currentScreen === "TOURNAMENT_LOBBY") {
          useNavigationStore.getState().navigateTo("MAIN_MENU");
        }
      });

      room.onMessage(
        TournamentServerMessage.MATCH_ASSIGNED,
        (payload: TournamentMatchAssignedPayload) => {
          console.log("🏆 [TournamentStore] Match assigned:", payload);
          if (payload.fingerprint) {
            setCachedCertificateFingerprint(payload.fingerprint);
          }
          set({ assignedMatch: payload });

          const currentScreen = useNavigationStore.getState().currentScreen;
          const currentRoom = useAppStore.getState().room;

          // If currently in an active game room (e.g. scoreboard), do not abruptly kick them out.
          // The scoreboard / countdown will invoke proceedToAssignedMatch() cleanly.
          if (currentScreen === "IN_GAME" && currentRoom) {
            console.log("🏆 [TournamentStore] Match assigned while in combat/scoreboard. Ready to proceed upon match completion.");
            return;
          }

          get().proceedToAssignedMatch();
        },
      );

      // Listen for bracket updates
      room.onMessage(
        TournamentServerMessage.BRACKET_UPDATED,
        (payload: TournamentBracketUpdatedPayload) => {
          if (payload?.stages && payload?.participants) {
            set({ bracketTree: { stages: payload.stages, participants: payload.participants } });
          }
          set((prev) => ({ lobbyRevision: prev.lobbyRevision + 1 }));
        },
      );

      // Listen for spectate granted
      room.onMessage(
        TournamentServerMessage.SPECTATE_GRANTED,
        (payload: TournamentSpectateGrantedPayload) => {
          console.log("👁️ [TournamentStore] Spectate granted:", payload);
          if (payload.fingerprint) {
            setCachedCertificateFingerprint(payload.fingerprint);
          }
          set({ isSpectatingMatch: true, spectatingMatchData: payload });

          useMatchmakingStore.setState({
            seatReservation: payload.reservation,
            targetRoomId: payload.gameRoomId,
          });

          useNavigationStore.getState().setSelectedMatchMode("1v1");
          useNavigationStore.getState().navigateTo("MATCH_LOADING");
        },
      );

      room.onMessage(
        TournamentServerMessage.CHAMPION_CROWNED,
        (payload: TournamentChampionCrownedPayload) => {
          console.log("🏆 [TournamentStore] Champion crowned:", payload);
          set({ championData: payload });
        },
      );

      room.onMessage(
        TournamentServerMessage.PARTICIPANT_KICKED,
        (payload: TournamentKickedPayload) => {
          set({ error: payload.reason ?? "You were removed from the tournament" });
          get().leaveTournament();
        },
      );

      set({
        activeRoom: room,
        lobbyState: room.state,
        lobbyRevision: 1,
        isLoading: false,
      });

      useNavigationStore.getState().navigateTo("TOURNAMENT_LOBBY");
    } catch (err: any) {
      console.error("[TournamentStore] Failed to join tournament:", err);
      set({ error: err.message ?? "Failed to join tournament", isLoading: false });
    }
  },

  joinByRoomCode: async (roomCode: string) => {
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) {
      set({ error: "Please enter a tournament code" });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch("/matchmake/tournaments/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: cleanCode }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Tournament with code '${cleanCode}' not found or already running`);
        }
        throw new Error(`Lookup failed: HTTP ${response.status}`);
      }

      const data = (await response.json()) as { roomId: string };
      if (!data.roomId) {
        throw new Error("Invalid response from tournament lookup");
      }

      await get().joinTournament(data.roomId, cleanCode);
    } catch (err: any) {
      console.warn("[TournamentStore] joinByRoomCode error:", err);
      set({ error: err.message ?? "Failed to find tournament", isLoading: false });
    }
  },

  toggleReady: () => {
    const activeRoom = get().activeRoom;
    if (activeRoom) {
      activeRoom.send(TournamentClientMessage.TOGGLE_READY);
    }
  },

  updateSettings: (settings: TournamentUpdateSettingsPayload) => {
    const activeRoom = get().activeRoom;
    if (activeRoom) {
      activeRoom.send(TournamentClientMessage.UPDATE_SETTINGS, settings);
    }
  },

  kickParticipant: (targetSessionId: string) => {
    const activeRoom = get().activeRoom;
    if (activeRoom) {
      activeRoom.send(TournamentClientMessage.KICK_PARTICIPANT, { targetSessionId });
    }
  },

  startTournament: () => {
    const activeRoom = get().activeRoom;
    if (activeRoom) {
      activeRoom.send(TournamentClientMessage.START_TOURNAMENT);
    }
  },

  spectateTournamentMatch: (matchId: string) => {
    const activeRoom = get().activeRoom;
    if (activeRoom) {
      activeRoom.send(TournamentClientMessage.REQUEST_SPECTATE, {
        tournamentId: get().lobbyState?.tournamentId ?? "",
        matchId,
      });
    }
  },

  proceedToAssignedMatch: async () => {
    const assignedMatch = get().assignedMatch;
    if (!assignedMatch) return;

    if (assignedMatch.fingerprint) {
      setCachedCertificateFingerprint(assignedMatch.fingerprint);
    }

    const oldGameRoom = useAppStore.getState().room;
    if (oldGameRoom) {
      try {
        await oldGameRoom.leave();
      } catch {
        // Ignored
      }
      useAppStore.getState().setRoom(null);
    }

    set({
      isSpectatingMatch: false,
      spectatingMatchData: null,
    });

    useMatchmakingStore.setState({
      seatReservation: assignedMatch.reservation,
      targetRoomId: assignedMatch.gameRoomId,
    });

    useNavigationStore.getState().setSelectedMatchMode("1v1");
    useNavigationStore.getState().navigateTo("MATCH_LOADING");
  },

  requestMatchReservation: (matchId: string) => {
    const activeRoom = get().activeRoom;
    if (activeRoom) {
      activeRoom.send(TournamentClientMessage.REQUEST_MATCH_RESERVATION, {
        tournamentId: get().lobbyState?.tournamentId ?? "",
        matchId,
      });
    }
  },

  returnToTournamentHub: async () => {
    const gameRoom = useAppStore.getState().room;
    if (gameRoom) {
      try {
        await gameRoom.leave();
      } catch {
        // Ignored
      }
      useAppStore.getState().setRoom(null);
    }
    set({
      isSpectatingMatch: false,
      spectatingMatchData: null,
    });
    useNavigationStore.getState().navigateTo("TOURNAMENT_LOBBY");
  },

  leaveTournament: async () => {
    const gameRoom = useAppStore.getState().room;
    if (gameRoom) {
      try {
        await gameRoom.leave();
      } catch {
        // Ignored
      }
      useAppStore.getState().setRoom(null);
    }
    const activeRoom = get().activeRoom;
    if (activeRoom) {
      try {
        activeRoom.leave();
      } catch {
        // Ignored
      }
    }
    set({
      activeRoom: null,
      lobbyState: null,
      lobbyRevision: 0,
      assignedMatch: null,
      championData: null,
      bracketTree: null,
      isSpectatingMatch: false,
      spectatingMatchData: null,
      isLoading: false,
    });
    useNavigationStore.getState().navigateTo("MAIN_MENU");
  },
}));
