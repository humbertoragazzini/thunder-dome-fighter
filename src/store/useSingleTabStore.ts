// ==================================================
// CLIENT STORE: SINGLE ACTIVE TAB ENFORCER
//
// WHAT IT DOES:
// Coordinates cross-tab communication using BroadcastChannel to ensure
// that only one active instance of Thunder Dome Fighter executes at a time.
//
// HOW IT WORKS:
// - Generates a unique ephemeral tab ID on initialization.
// - Opens a BroadcastChannel ("tdf_active_tab_channel").
// - When a new tab claims active status, this tab transitions to `isDuplicateTab = true`.
// - Pauses background WebGL/network workloads and safely drops any active Colyseus room.
// - Provides a `claimActiveTab()` action allowing the user to reactivate this tab
//   and pause all other open tabs.
//
// WHY IT EXISTS:
// Prevents GPU exhaustion from multiple Babylon.js/Havok instances, eliminates
// duplicate matchmaking queues, and prevents concurrent game room participation.
// ==================================================

import { create } from "zustand";
import { useAppStore } from "./useAppStore";
import { useNavigationStore } from "./useNavigationStore";

interface TabMessage {
  type: "CLAIM_ACTIVE_TAB";
  tabId: string;
  timestamp: number;
}

interface SingleTabState {
  tabId: string;
  isDuplicateTab: boolean;
  channel: BroadcastChannel | null;

  // Actions
  initialize: () => void;
  claimActiveTab: () => void;
  cleanup: () => void;
}

function generateTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "tab-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export const useSingleTabStore = create<SingleTabState>((set, get) => ({
  tabId: "",
  isDuplicateTab: false,
  channel: null,

  initialize: () => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    // Prevent duplicate initializations on re-renders
    if (get().channel) {
      return;
    }

    const currentTabId = generateTabId();
    const channel = new BroadcastChannel("tdf_active_tab_channel");

    channel.onmessage = (event: MessageEvent<TabMessage>) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "CLAIM_ACTIVE_TAB" && data.tabId !== currentTabId) {
        // Another tab has claimed active gameplay control
        set({ isDuplicateTab: true });

        // Disconnect any active room in this inactive tab
        const room = useAppStore.getState().room;
        if (room) {
          try {
            room.leave();
          } catch {
            // Room cleanup error ignored
          }
          useAppStore.getState().setRoom(null);
        }

        // Return to main menu if in-game or loading match
        const screen = useNavigationStore.getState().currentScreen;
        if (screen === "IN_GAME" || screen === "MATCH_LOADING") {
          useNavigationStore.getState().navigateTo("MAIN_MENU");
        }
      }
    };

    // Broadcast that this tab is claiming active focus
    channel.postMessage({
      type: "CLAIM_ACTIVE_TAB",
      tabId: currentTabId,
      timestamp: Date.now(),
    });

    set({
      tabId: currentTabId,
      channel,
      isDuplicateTab: false,
    });
  },

  claimActiveTab: () => {
    const { channel, tabId } = get();
    if (!channel || !tabId) return;

    // Broadcast takeover to all other open tabs
    channel.postMessage({
      type: "CLAIM_ACTIVE_TAB",
      tabId,
      timestamp: Date.now(),
    });

    set({ isDuplicateTab: false });
  },

  cleanup: () => {
    const { channel } = get();
    if (channel) {
      channel.close();
      set({ channel: null });
    }
  },
}));
