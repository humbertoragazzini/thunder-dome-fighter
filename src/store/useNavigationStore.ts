// ==================================================
// CLIENT APPLICATION SCREEN NAVIGATION STORE (ZUSTAND)
//
// WHAT IT DOES:
// Manages the global frontend screen state machine, navigation transitions,
// active modal dialogs, and authentication routing guards.
//
// HOW IT WORKS:
// - Maintains `currentScreen` from the strict `AppScreen` state machine:
//   AUTH -> MAIN_MENU -> PLAY_MENU -> MATCH_LOADING -> IN_GAME -> MATCH_RESULTS.
// - Tracks navigation history stack allowing deterministic `goBack()` actions.
// - Manages global modal states (Profile, Settings, Error Dialog) with contextual payloads.
// - Enforces authentication routing: unauthenticated users cannot navigate
//   to protected screens without active session tokens.
//
// WHY IT EXISTS:
// Replaces transitional single-canvas rendering with a structured, reactive
// screen router suitable for a competitive fighting game.
// ==================================================

import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";

export type AppScreen =
  | "AUTH"
  | "MAIN_MENU"
  | "PLAY_MENU"
  | "MATCHMAKING"
  | "MATCH_LOADING"
  | "IN_GAME"
  | "MATCH_RESULTS";

export type ModalType = "PROFILE" | "SETTINGS" | "ERROR" | null;

export type MatchMode = "1v1" | "3v3" | "4v4" | "ffa20";

interface NavigationState {
  currentScreen: AppScreen;
  previousScreen: AppScreen | null;
  history: AppScreen[];
  activeModal: ModalType;
  errorMessage: string | null;
  selectedMatchMode: MatchMode | null;

  // Actions
  navigateTo: (screen: AppScreen) => void;
  goBack: () => void;
  openModal: (modal: ModalType, errorMessage?: string) => void;
  closeModal: () => void;
  setSelectedMatchMode: (mode: MatchMode | null) => void;
  resetToAuth: () => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  currentScreen: "AUTH",
  previousScreen: null,
  history: ["AUTH"],
  activeModal: null,
  errorMessage: null,
  selectedMatchMode: null,

  navigateTo: (screen: AppScreen) => {
    const isAuthenticated = useAuthStore.getState().isAuthenticated;

    // Guard: Prevent entering menus or gameplay without being authenticated
    if (!isAuthenticated && screen !== "AUTH") {
      set({
        currentScreen: "AUTH",
        previousScreen: null,
        history: ["AUTH"],
      });
      return;
    }

    const { currentScreen, history } = get();
    if (currentScreen === screen) return;

    set({
      currentScreen: screen,
      previousScreen: currentScreen,
      history: [...history, screen],
    });
  },

  goBack: () => {
    const { history } = get();
    if (history.length <= 1) return;

    const newHistory = [...history];
    newHistory.pop(); // Remove current
    const previous = newHistory[newHistory.length - 1];

    set({
      currentScreen: previous,
      previousScreen: newHistory.length > 1 ? newHistory[newHistory.length - 2] : null,
      history: newHistory,
    });
  },

  openModal: (modal: ModalType, errorMessage?: string) => {
    set({
      activeModal: modal,
      errorMessage: errorMessage ?? null,
    });
  },

  closeModal: () => {
    set({
      activeModal: null,
      errorMessage: null,
    });
  },

  setSelectedMatchMode: (mode: MatchMode | null) => {
    set({ selectedMatchMode: mode });
  },

  resetToAuth: () => {
    set({
      currentScreen: "AUTH",
      previousScreen: null,
      history: ["AUTH"],
      activeModal: null,
      errorMessage: null,
      selectedMatchMode: null,
    });
  },
}));
