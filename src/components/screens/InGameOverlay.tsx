// ==================================================
// SCREEN: IN-GAME HUD & PAUSE OVERLAY
//
// WHAT IT DOES:
// Renders the heads-up display (HUD) over the 3D Babylon.js canvas during
// active combat, providing player vitals, arena room status, synchronized
// match state machine banners (countdown, timer, victory/defeat), and pause controls.
//
// HOW IT WORKS:
// - Overlays transparent, non-blocking UI layers (pointer-events-none on background).
// - Subscribes to Colyseus room state changes (matchStatus, countdownSeconds, remainingTimeSeconds).
// - Displays animated countdown (3..2..1..FIGHT) and match clock (MM:SS).
// - Displays Victory/Defeat modal upon MATCH_END with a clean exit back to Main Menu.
// - Listens to Escape key to toggle PauseMenuDialog.
//
// WHY IT EXISTS:
// Provides authoritative visual feedback for all Phase 8 match lifecycle states.
// ==================================================

import { useEffect, useState } from "react";
import { FaBars, FaFlagCheckered, FaHourglassHalf, FaTrophy } from "react-icons/fa6";
import { GiGamepad, GiLightningShield } from "react-icons/gi";
import { useAppStore } from "../../store/useAppStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useNavigationStore } from "../../store/useNavigationStore";
import { Badge } from "../ui/atoms/Badge";
import { Button } from "../ui/atoms/Button";
import { PauseMenuDialog } from "../ui/organisms/PauseMenuDialog";

function formatTimer(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.floor(Math.max(0, seconds) % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function InGameOverlay() {
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [matchStatus, setMatchStatus] = useState<string>("WAITING_FOR_PLAYERS");
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [remainingTimeSeconds, setRemainingTimeSeconds] = useState<number>(180);
  const [playerCount, setPlayerCount] = useState<number>(1);
  const [winningPlayerId, setWinningPlayerId] = useState<string>("");

  const room = useAppStore((state) => state.room);
  const setRoom = useAppStore((state) => state.setRoom);
  const player = useAuthStore((state) => state.player);
  const navigateTo = useNavigationStore((state) => state.navigateTo);

  // Synchronize state machine updates from Colyseus room state
  useEffect(() => {
    if (!room) return;

    const syncState = () => {
      const state = room.state as any;
      if (!state) return;
      if (state.matchStatus) setMatchStatus(state.matchStatus);
      if (typeof state.countdownSeconds === "number") setCountdownSeconds(state.countdownSeconds);
      if (typeof state.remainingTimeSeconds === "number") setRemainingTimeSeconds(state.remainingTimeSeconds);
      if (typeof state.winningPlayerId === "string") setWinningPlayerId(state.winningPlayerId);
      if (state.players) {
        const count = typeof state.players.size === "number" ? state.players.size : Object.keys(state.players).length;
        setPlayerCount(count);
      }
    };

    syncState();
    const unsubscribe = room.onStateChange(() => {
      syncState();
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [room]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPauseOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleReturnToMenu = async () => {
    if (room) {
      try {
        await room.leave();
      } catch {
        // Ignored
      }
      setRoom(null);
    }
    navigateTo("MAIN_MENU");
  };

  const roomName =
    (room as unknown as { metadata?: { serverName?: string } })?.metadata?.serverName ??
    (room?.name ? `Room ${room.name}` : "Thunder Dome Arena");
  const playerName = player?.playerName ?? "Fighter";
  const isWinner = Boolean(winningPlayerId && room?.sessionId && winningPlayerId === room.sessionId);

  return (
    <>
      <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-4 md:p-6 select-none">
        {/* Top Bar: Room Title, Match Clock & Pause Button */}
        <div className="flex items-center justify-between w-full">
          {/* Left: Room Status & Identity */}
          <div className="pointer-events-auto flex items-center gap-3 bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-xl shadow-lg">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-lg">
              <GiLightningShield />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-black uppercase tracking-wider text-slate-100"
                  style={{ fontFamily: "var(--font-game)" }}
                >
                  {roomName}
                </span>
                <Badge
                  variant={
                    matchStatus === "PLAYING"
                      ? "emerald"
                      : matchStatus === "COUNTDOWN"
                        ? "amber"
                        : "cyan"
                  }
                  pulse={matchStatus === "PLAYING" || matchStatus === "COUNTDOWN"}
                >
                  {matchStatus === "PLAYING"
                    ? "Live"
                    : matchStatus === "COUNTDOWN"
                      ? "Starting"
                      : "Warmup"}
                </Badge>
              </div>
              <span
                className="text-[11px] text-slate-400 font-bold uppercase tracking-wider"
                style={{ fontFamily: "var(--font-tech)" }}
              >
                Fighter: {playerName}
              </span>
            </div>
          </div>

          {/* Center: Match Clock (Synchronized) */}
          <div className="pointer-events-auto flex items-center gap-2.5 bg-slate-900/85 backdrop-blur-md border border-slate-700/80 px-5 py-2 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <FaHourglassHalf className={matchStatus === "PLAYING" ? "text-cyan-400 animate-spin" : "text-amber-400"} />
            <span
              className="text-xl md:text-2xl font-black tracking-widest text-slate-100 font-mono"
            >
              {matchStatus === "PLAYING"
                ? formatTimer(remainingTimeSeconds)
                : matchStatus === "COUNTDOWN"
                  ? `00:0${countdownSeconds}`
                  : "03:00"}
            </span>
          </div>

          {/* Right: Menu / Pause Trigger */}
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsPauseOpen(true)}
              leftIcon={<FaBars />}
              className="shadow-lg"
            >
              Menu <span className="hidden sm:inline text-xs text-slate-400 font-mono">[ESC]</span>
            </Button>
          </div>
        </div>

        {/* Center Screen: State Machine Callouts */}
        <div className="flex flex-col items-center justify-center my-auto">
          {/* 1. WAITING FOR PLAYERS BANNER */}
          {matchStatus === "WAITING_FOR_PLAYERS" && (
            <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border-2 border-amber-500/40 px-6 py-3.5 rounded-2xl flex items-center gap-3.5 shadow-[0_0_30px_rgba(245,158,11,0.2)] animate-pulse">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
              <span
                className="text-sm md:text-base font-black uppercase text-amber-300 tracking-wider"
                style={{ fontFamily: "var(--font-game)" }}
              >
                Waiting for Opponent ({playerCount}/2)... Controls locked
              </span>
            </div>
          )}

          {/* 2. DRAMATIC COUNTDOWN */}
          {matchStatus === "COUNTDOWN" && (
            <div className="flex flex-col items-center justify-center gap-2">
              <span
                className="text-8xl sm:text-9xl font-black text-amber-400 drop-shadow-[0_0_40px_rgba(251,191,36,0.7)] animate-bounce"
                style={{ fontFamily: "var(--font-game)" }}
              >
                {countdownSeconds > 0 ? countdownSeconds : "FIGHT!"}
              </span>
              <span
                className="text-sm font-black uppercase tracking-widest text-slate-300"
                style={{ fontFamily: "var(--font-tech)" }}
              >
                Prepare for combat
              </span>
            </div>
          )}

          {/* 3. MATCH END VICTORY / DEFEAT CARD */}
          {matchStatus === "MATCH_END" && (
            <div className="pointer-events-auto w-full max-w-md bg-slate-900/95 backdrop-blur-xl border-2 border-slate-700 rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center gap-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-fade-in">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-xl ${
                  isWinner
                    ? "bg-amber-500/20 text-amber-400 border-2 border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-bounce"
                    : "bg-red-500/20 text-red-400 border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)]"
                }`}
              >
                {isWinner ? <FaTrophy /> : <FaFlagCheckered />}
              </div>

              <div className="flex flex-col gap-1.5">
                <h2
                  className={`text-2xl sm:text-3xl font-black uppercase tracking-wider ${
                    isWinner ? "text-amber-400" : "text-slate-100"
                  }`}
                  style={{ fontFamily: "var(--font-game)" }}
                >
                  {isWinner ? "Victory!" : winningPlayerId ? "Defeat" : "Match Concluded"}
                </h2>
                <p
                  className="text-sm text-slate-300"
                  style={{ fontFamily: "var(--font-tech)" }}
                >
                  {isWinner
                    ? "Outstanding fight! You claimed victory in the Thunder Dome."
                    : winningPlayerId
                      ? "Good sparring session. Return to menu and prepare for the next bout."
                      : "The match has reached completion."}
                </p>
              </div>

              <Button
                variant="primary"
                size="lg"
                onClick={handleReturnToMenu}
                className="w-full shadow-lg"
              >
                Return to Main Menu
              </Button>
            </div>
          )}
        </div>

        {/* Bottom Bar: Controls Guide */}
        <div className="flex items-end justify-between w-full">
          {/* Controls Hints */}
          <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-3.5 py-2 rounded-xl text-xs text-slate-300 shadow-lg">
            <GiGamepad className="text-amber-400 text-lg" />
            <span style={{ fontFamily: "var(--font-tech)" }}>
              Move: <strong className="text-amber-400">W/S</strong> • Turn: <strong className="text-amber-400">A/D</strong> • Strafe: <strong className="text-amber-400">Q/E</strong> • Jump: <strong className="text-amber-400">SPACE</strong> • Sprint: <strong className="text-amber-400">SHIFT</strong> • Fight: <strong className="text-amber-400">J/K/L</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Pause Menu Dialog */}
      <PauseMenuDialog
        isOpen={isPauseOpen}
        onClose={() => setIsPauseOpen(false)}
      />
    </>
  );
}
