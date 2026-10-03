// ==================================================
// SCREEN: MATCH LOADING & HANDSHAKE TRANSITION
//
// WHAT IT DOES:
// Manages the transitional loading state while authorizing credentials with Colyseus,
// negotiating the room join, and initializing the Babylon.js/Havok physics scene.
//
// HOW IT WORKS:
// - Fetches JWT token from `useAuthStore` and initiates `client.join("game", { token })`.
// - Synchronizes the resulting room handle to `useAppStore.setRoom()`.
// - Monitors `isSceneReady`: once the 3D scene and Havok physics are initialized,
//   automatically transitions `useNavigationStore.navigateTo("IN_GAME")`.
// - If the handshake fails (e.g. 401 unauthenticated or connection refused),
//   triggers `openModal("ERROR")` and returns safely to the menu.
//
// WHY IT EXISTS:
// Prevents blank screens and race conditions between network connection and 3D engine boot.
// ==================================================

import { Client } from "@colyseus/sdk";
import { useEffect, useState } from "react";
import { GiLightningTrio } from "react-icons/gi";
import { useAppStore } from "../../store/useAppStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useNavigationStore } from "../../store/useNavigationStore";
import { Heading } from "../ui/atoms/Heading";
import { Spinner } from "../ui/atoms/Spinner";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

const TIPS = [
  "Tip: Inputs are authoritatively simulated at 30 Hz on the server.",
  "Tip: Rolling back mispredictions is smoothed by visual error-decay interpolation.",
  "Tip: Maintain high ground in the arena to control opponent sightlines.",
  "Tip: All competitive statistics update directly in PostgreSQL upon match end.",
];

export function MatchLoadingScreen() {
  const [loadingStep, setLoadingStep] = useState(
    "Authorizing player license with Colyseus..."
  );
  const [tipIndex, setTipIndex] = useState(0);

  const room = useAppStore((state) => state.room);
  const setRoom = useAppStore((state) => state.setRoom);
  const isSceneReady = useAppStore((state) => state.isSceneReady);

  const token = useAuthStore((state) => state.token);
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const openModal = useNavigationStore((state) => state.openModal);

  // Rotate tips periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Connect to Colyseus on mount if not already connected
  useEffect(() => {
    let isCancelled = false;

    async function joinArena() {
      if (room?.roomId) {
        setLoadingStep("Synchronizing Havok physics world...");
        return;
      }

      if (!token) {
        openModal("ERROR", "No active session token found. Please log in again.");
        return;
      }

      const colyseusUrl = import.meta.env.VITE_COLYSEUS_URL ?? "ws://localhost:2567";
      setLoadingStep(`Connecting to Thunder Dome at ${colyseusUrl}...`);

      try {
        const client = new Client(colyseusUrl);
        const joinedRoom = await client.join("game", { token });

        if (isCancelled) {
          await joinedRoom.leave();
          return;
        }

        setRoom(joinedRoom);
        setLoadingStep("Authoritative handshake accepted. Launching viewport...");
      } catch (err: unknown) {
        if (isCancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to connect to authoritative game room.";
        openModal("ERROR", msg);
      }
    }

    joinArena();

    return () => {
      isCancelled = true;
    };
  }, [token, room, setRoom, openModal]);

  // Transition to IN_GAME once room exists and 3D scene is ready
  useEffect(() => {
    if (room?.roomId && isSceneReady) {
      const timeout = setTimeout(() => {
        navigateTo("IN_GAME");
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [room, isSceneReady, navigateTo]);

  return (
    <ScreenLayout>
      <div className="w-full max-w-md flex flex-col items-center text-center gap-8 py-8 select-none">
        {/* Animated Arena Core Emblem */}
        <div className="relative flex items-center justify-center">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-500 to-red-600 p-0.5 shadow-[0_0_50px_rgba(245,158,11,0.5)] flex items-center justify-center animate-pulse">
            <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center text-amber-400 text-5xl">
              <GiLightningTrio />
            </div>
          </div>
          <div className="absolute -inset-4 rounded-full border border-amber-500/30 animate-spin" />
        </div>

        {/* Status Text & Spinner */}
        <div className="flex flex-col items-center gap-3">
          <Heading level="h2" color="gold">
            Loading Arena
          </Heading>
          <div className="flex items-center gap-3 text-slate-300 font-semibold text-sm">
            <Spinner size="sm" color="amber" />
            <span style={{ fontFamily: "var(--font-tech)" }}>{loadingStep}</span>
          </div>
        </div>

        {/* Tip Box */}
        <div className="w-full p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
          <p
            className="text-xs text-amber-300/80 font-medium italic transition-all duration-300"
            style={{ fontFamily: "var(--font-tech)" }}
          >
            {TIPS[tipIndex]}
          </p>
        </div>
      </div>
    </ScreenLayout>
  );
}
