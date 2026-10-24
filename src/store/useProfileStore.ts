// ==================================================
// CLIENT PLAYER PROFILE & CAREER DOSSIER STORE (ZUSTAND)
//
// WHAT IT DOES:
// Manages reactive frontend state for full player profiles, lifetime combat
// records, weapon mastery stats, and recent match history logs.
//
// HOW IT WORKS:
// - Fetches FullPlayerProfileView from `GET /api/player/profile` using active JWT.
// - Caches profile data in memory to avoid redundant network queries.
// - Syncs updated lifetime stats back into `useAuthStore` so top bar banners
//   stay synchronized.
//
// WHY IT EXISTS:
// In compliance with Phase 14, provides dedicated state management for
// ProfileScreen and ProfileModal.
// ==================================================

import { create } from "zustand";
import type { FullPlayerProfileView } from "../../shared/domain/Identity.ts";
import { getApiUrl } from "../config/network";
import { useAuthStore } from "./useAuthStore";

const API_URL = getApiUrl();

export interface ProfileState {
  profileData: FullPlayerProfileView | null;
  isLoading: boolean;
  error: string | null;

  fetchProfile: (forceRefresh?: boolean) => Promise<void>;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profileData: null,
  isLoading: false,
  error: null,

  fetchProfile: async (forceRefresh = false) => {
    const { profileData, isLoading } = get();
    if (!forceRefresh && profileData && !isLoading) {
      return;
    }

    const token = useAuthStore.getState().token;
    if (!token) {
      set({ error: "No active session token available", isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/player/profile`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.message ?? `HTTP error ${response.status}`);
      }

      const data: FullPlayerProfileView = await response.json();

      set({
        profileData: data,
        isLoading: false,
        error: null,
      });

      // Synchronize with auth store so banners stay updated
      useAuthStore.setState({
        stats: data.stats,
        derivedStats: {
          killDeathRatio: data.derived.killDeathRatio,
          winRatePercentage: data.derived.winRatePercentage,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load player profile";
      set({
        error: message,
        isLoading: false,
      });
    }
  },

  clearProfile: () => {
    set({
      profileData: null,
      isLoading: false,
      error: null,
    });
  },
}));
