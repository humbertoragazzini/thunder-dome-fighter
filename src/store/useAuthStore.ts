// ==================================================
// CLIENT AUTHENTICATION & PLAYER IDENTITY STORE (ZUSTAND)
//
// WHAT IT DOES:
// Manages reactive client authentication state, token persistence in
// localStorage, auto-session hydration, and profile data synchronization.
//
// HOW IT WORKS:
// - token & localStorage: Stores and retrieves the 24-hour JWT token from
//   browser localStorage (`thunder_dome_auth_token`).
// - register & login: Dispatches HTTP requests to the Fastify auth API,
//   saves the token on success, and triggers profile hydration.
// - checkAuth: Automatically executes on app boot to validate the stored
//   token via `GET /api/auth/me` and loads lifetime stats.
// - logout: Clears in-memory state and purges the token from localStorage.
//
// WHY IT EXISTS:
// Bridges the React UI to the Fastify backend and Colyseus game room.
// Stores the active JWT token required by Colyseus `onAuth` to admit
// players into multiplayer matches.
// ==================================================

import { create } from "zustand";
import type { PlayerStats } from "../../shared/domain/Identity.ts";

const TOKEN_STORAGE_KEY = "thunder_dome_auth_token";
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthPlayer {
  id: string;
  playerName: string;
  avatarUrl: string | null;
}

export interface AuthDerivedStats {
  killDeathRatio: number;
  winRatePercentage: number;
}

export interface RegisterCredentials {
  email: string;
  playerName: string;
  password: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthState {
  // State
  token: string | null;
  user: AuthUser | null;
  player: AuthPlayer | null;
  stats: PlayerStats | null;
  derivedStats: AuthDerivedStats | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  register: (credentials: RegisterCredentials) => Promise<boolean>;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  user: null,
  player: null,
  stats: null,
  derivedStats: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  register: async (credentials: RegisterCredentials): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        set({
          error: data.message || "Registration failed.",
          isLoading: false,
        });
        return false;
      }

      // Persist token in browser storage
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);

      set({
        token: data.token,
        user: data.user,
        player: data.player,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      // Hydrate player lifetime stats
      await get().checkAuth();
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to authentication server.";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  login: async (credentials: LoginCredentials): Promise<boolean> => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        set({
          error: data.message || "Invalid email or password.",
          isLoading: false,
        });
        return false;
      }

      // Persist token in browser storage
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);

      set({
        token: data.token,
        user: data.user,
        player: data.player,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      // Hydrate player lifetime stats
      await get().checkAuth();
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to authentication server.";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({
      token: null,
      user: null,
      player: null,
      stats: null,
      derivedStats: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  checkAuth: async (): Promise<void> => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);

    if (!token) {
      set({
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return;
    }

    set({ isLoading: true });

    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Token expired or revoked; purge invalid session
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        set({
          token: null,
          user: null,
          player: null,
          stats: null,
          derivedStats: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      const data = await response.json();

      set({
        token,
        player: data.player,
        stats: data.stats,
        derivedStats: data.derived,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch {
      // Network unreachable; retain stored token but indicate unauthenticated
      set({ isLoading: false });
    }
  },
}));
