// ==================================================
// ROOT APPLICATION SHELL & SCREEN ROUTER
//
// WHAT IT DOES:
// Serves as the top-level React root container, coordinating authentication
// auto-hydration, screen transitions, global modals, and 3D Babylon.js viewport mounting.
//
// HOW IT WORKS:
// - On mount, invokes `useAuthStore.getState().checkAuth()` to validate existing JWTs
//   stored in `localStorage` and loads player stats.
// - Once authenticated, automatically advances the screen state machine to `MAIN_MENU`.
// - Dynamically mounts the active screen (`AUTH`, `MAIN_MENU`, `PLAY_MENU`, `MATCH_LOADING`, `IN_GAME`).
// - Mounts `BabylonCanvas` strictly when joining or playing in an authoritative room.
// - Mounts global dialog overlays (`ProfileModal`, `ErrorDialog`).
//
// WHY IT EXISTS:
// Eliminates raw canvas overlays and provides a production-grade fighting game shell.
// ==================================================

import { useEffect } from "react";
import { BabylonCanvas } from "./components/BabylonCanvas";
import { AuthScreen } from "./components/screens/AuthScreen";
import { InGameOverlay } from "./components/screens/InGameOverlay";
import { MainMenuScreen } from "./components/screens/MainMenuScreen";
import { MatchLoadingScreen } from "./components/screens/MatchLoadingScreen";
import { PlayMenuScreen } from "./components/screens/PlayMenuScreen";
import { ErrorDialog } from "./components/ui/organisms/ErrorDialog";
import { ProfileModal } from "./components/ui/organisms/ProfileModal";
import { useAppStore } from "./store/useAppStore";
import { useAuthStore } from "./store/useAuthStore";
import { useNavigationStore } from "./store/useNavigationStore";

export default function App() {
  const currentScreen = useNavigationStore((state) => state.currentScreen);
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const room = useAppStore((state) => state.room);

  // Auto-hydrate session from localStorage on application boot
  useEffect(() => {
    async function hydrate() {
      await checkAuth();
      if (useAuthStore.getState().isAuthenticated) {
        navigateTo("MAIN_MENU");
      }
    }
    hydrate();
  }, [checkAuth, navigateTo]);

  // Sync auth changes: If logged out while in menus/game, send to AUTH
  useEffect(() => {
    if (!isAuthenticated && currentScreen !== "AUTH") {
      navigateTo("AUTH");
    }
  }, [isAuthenticated, currentScreen, navigateTo]);

  const shouldRenderCanvas =
    (currentScreen === "IN_GAME" || currentScreen === "MATCH_LOADING") &&
    Boolean(room?.roomId);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* 3D Babylon.js Canvas Layer */}
      {shouldRenderCanvas && (
        <div className="absolute inset-0 z-0">
          <BabylonCanvas />
        </div>
      )}

      {/* Screen Router Layer */}
      <div className="relative z-10 w-full h-full">
        {currentScreen === "AUTH" && <AuthScreen />}
        {currentScreen === "MAIN_MENU" && <MainMenuScreen />}
        {currentScreen === "PLAY_MENU" && <PlayMenuScreen />}
        {currentScreen === "MATCH_LOADING" && <MatchLoadingScreen />}
        {currentScreen === "IN_GAME" && <InGameOverlay />}
      </div>

      {/* Global Modals */}
      <ProfileModal />
      <ErrorDialog />
    </div>
  );
}
