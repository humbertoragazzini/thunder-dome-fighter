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
import { MatchPowerHUD } from "../ui/molecules/MatchPowerHUD";
import { WeaponHUD } from "../ui/molecules/WeaponHUD";
import { PauseMenuDialog } from "../ui/organisms/PauseMenuDialog";
import { GAME_ITEMS } from "../../../shared/domain/GameItem";

function formatTimer(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.floor(Math.max(0, seconds) % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

interface FighterHUDData {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  score: number;
  isDead: boolean;
  isInvulnerable: boolean;
  killStreak: number;
  speedModifier: number;
  forceModifier: number;
  jumpModifier: number;
  heldItemId: string;
  ammo: number;
  x: number;
  y: number;
  z: number;
}

function ScorePips({
  score,
  max = 3,
  color = "amber",
}: {
  score: number;
  max?: number;
  color?: "amber" | "rose" | "cyan";
}) {
  const pips = [];
  for (let i = 0; i < max; i++) {
    const isFilled = i < score;
    pips.push(
      <span
        key={i}
        className={`w-3 h-3 rounded-full border border-slate-700 transition-all ${
          isFilled
            ? color === "cyan"
              ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              : color === "rose"
                ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
            : "bg-slate-800/80"
        }`}
      />,
    );
  }
  return <div className="flex items-center gap-1.5">{pips}</div>;
}

export function InGameOverlay() {
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [matchStatus, setMatchStatus] = useState<string>("WAITING_FOR_PLAYERS");
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [remainingTimeSeconds, setRemainingTimeSeconds] = useState<number>(180);
  const [playerCount, setPlayerCount] = useState<number>(1);
  const [winningPlayerId, setWinningPlayerId] = useState<string>("");

  const [localFighter, setLocalFighter] = useState<FighterHUDData>({
    id: "",
    name: "Fighter",
    health: 100,
    maxHealth: 100,
    score: 0,
    isDead: false,
    isInvulnerable: false,
    killStreak: 0,
    speedModifier: 1.0,
    forceModifier: 1.0,
    jumpModifier: 1.0,
    heldItemId: "FISTS",
    ammo: 0,
    x: 0,
    y: 0,
    z: 0,
  });
  const [opponentFighter, setOpponentFighter] = useState<FighterHUDData | null>(null);
  const [nearbyWeapon, setNearbyWeapon] = useState<{ id: string; name: string; accentColor: string } | null>(null);
  const [healthToast, setHealthToast] = useState<{ amount: number; key: number } | null>(null);

  const room = useAppStore((state) => state.room);
  const setRoom = useAppStore((state) => state.setRoom);
  const player = useAuthStore((state) => state.player);
  const navigateTo = useNavigationStore((state) => state.navigateTo);

  // Auto-dismiss health recovery toast after 2 seconds
  useEffect(() => {
    if (!healthToast) return;
    const timer = setTimeout(() => setHealthToast(null), 2000);
    return () => clearTimeout(timer);
  }, [healthToast]);

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

        const mySessionId = room.sessionId;
        let foundLocal: FighterHUDData | null = null;
        let foundOpponent: FighterHUDData | null = null;

        const entries: [string, any][] =
          typeof state.players.entries === "function"
            ? Array.from(state.players.entries())
            : Object.entries(state.players);

        for (const [sessionId, pState] of entries) {
          const p = pState as any;
          const fighterData: FighterHUDData = {
            id: sessionId,
            name: sessionId === mySessionId ? (player?.playerName ?? "You") : "Opponent",
            health: typeof p.health === "number" ? p.health : 100,
            maxHealth: typeof p.maxHealth === "number" ? p.maxHealth : 100,
            score: typeof p.score === "number" ? p.score : 0,
            isDead: Boolean(p.isDead),
            isInvulnerable: Boolean(p.isInvulnerable),
            killStreak: typeof p.killStreak === "number" ? p.killStreak : 0,
            speedModifier: typeof p.speedModifier === "number" ? p.speedModifier : 1.0,
            forceModifier: typeof p.forceModifier === "number" ? p.forceModifier : 1.0,
            jumpModifier: typeof p.jumpModifier === "number" ? p.jumpModifier : 1.0,
            heldItemId: p.heldItemId ?? "FISTS",
            ammo: typeof p.ammo === "number" ? p.ammo : 0,
            x: typeof p.x === "number" ? p.x : 0,
            y: typeof p.y === "number" ? p.y : 0,
            z: typeof p.z === "number" ? p.z : 0,
          };

          if (sessionId === mySessionId) {
            foundLocal = fighterData;
          } else {
            foundOpponent = fighterData;
          }
        }

        if (foundLocal) {
          setLocalFighter(foundLocal);

          // Check proximity to available weapon pickup spawners (<2.0m)
          if (state.itemPickups) {
            let detectedWeapon: { id: string; name: string; accentColor: string } | null = null;
            const pickupEntries: [string, any][] =
              typeof state.itemPickups.entries === "function"
                ? Array.from(state.itemPickups.entries())
                : Object.entries(state.itemPickups);

            for (const [_, pickup] of pickupEntries) {
              if (pickup && pickup.isAvailable && pickup.category === "WEAPON") {
                const dx = foundLocal.x - pickup.x;
                const dz = foundLocal.z - pickup.z;
                const dy = Math.abs(foundLocal.y - pickup.y);
                if (dy <= 2.0 && dx * dx + dz * dz <= 2.0 * 2.0) {
                  const itemDef = GAME_ITEMS[pickup.itemId];
                  if (itemDef) {
                    detectedWeapon = {
                      id: itemDef.id,
                      name: itemDef.name,
                      accentColor: itemDef.accentColor,
                    };
                    break;
                  }
                }
              }
            }
            setNearbyWeapon(detectedWeapon);
          }
        }
        if (foundOpponent) setOpponentFighter(foundOpponent);
      }
    };

    // Health pickup feedback listener
    room.onMessage("item:collected", (message: {
      playerId: string;
      healthRestored: number;
    }) => {
      if (message.playerId === room.sessionId && message.healthRestored > 0) {
        setHealthToast({ amount: message.healthRestored, key: Date.now() });
      }
    });

    let isMounted = true;
    const handleStateChange = () => {
      if (isMounted) syncState();
    };

    syncState();
    room.onStateChange(handleStateChange);

    return () => {
      isMounted = false;
      if (typeof (room.onStateChange as any)?.remove === "function") {
        (room.onStateChange as any).remove(handleStateChange);
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

        {/* Top Dual Fighter Health Bars (Fighting Game HUD) */}
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-2 px-2 py-1">
          <div className="w-full flex items-center justify-between gap-4">
            {/* Left Fighter: Local Player */}
            <div className="flex-1 flex flex-col gap-1 items-start">
              <div className="flex items-center gap-2 w-full justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-black uppercase tracking-wider text-cyan-300 drop-shadow"
                    style={{ fontFamily: "var(--font-game)" }}
                  >
                    {localFighter.name}
                  </span>
                  {localFighter.isInvulnerable && (
                    <Badge variant="cyan" pulse>
                      <GiLightningShield className="mr-1 inline" /> SHIELD 2s
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">KOs</span>
                  <ScorePips score={localFighter.score} color="cyan" />
                </div>
              </div>
              {/* Health Bar Outer */}
              <div className="w-full h-5 bg-slate-900/90 border border-cyan-500/40 rounded-lg overflow-hidden relative shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <div
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-200 ease-out"
                  style={{ width: `${Math.max(0, Math.min(100, localFighter.health))}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-start pl-2 text-[11px] font-mono font-black text-white drop-shadow">
                  {localFighter.health} / {localFighter.maxHealth} HP
                </span>
              </div>
            </div>

            {/* Center VS Pip */}
            <div className="flex flex-col items-center justify-center px-1">
              <span
                className="text-xs font-black tracking-widest text-amber-400 bg-slate-900/90 border border-slate-700 px-2.5 py-1 rounded-md shadow-md"
                style={{ fontFamily: "var(--font-game)" }}
              >
                VS
              </span>
            </div>

            {/* Right Fighter: Opponent */}
            <div className="flex-1 flex flex-col gap-1 items-end">
              <div className="flex items-center gap-2 w-full justify-between">
                <div className="flex items-center gap-2">
                  <ScorePips score={opponentFighter?.score ?? 0} color="rose" />
                  <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">KOs</span>
                </div>
                <div className="flex items-center gap-2">
                  {opponentFighter?.isInvulnerable && (
                    <Badge variant="cyan" pulse>
                      <GiLightningShield className="mr-1 inline" /> SHIELD 2s
                    </Badge>
                  )}
                  <span
                    className="text-sm font-black uppercase tracking-wider text-rose-400 drop-shadow"
                    style={{ fontFamily: "var(--font-game)" }}
                  >
                    {opponentFighter ? opponentFighter.name : "Waiting for Opponent..."}
                  </span>
                </div>
              </div>
              {/* Health Bar Outer */}
              <div className="w-full h-5 bg-slate-900/90 border border-rose-500/40 rounded-lg overflow-hidden relative shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                <div
                  className="h-full bg-gradient-to-l from-rose-600 to-rose-400 transition-all duration-200 ease-out ml-auto"
                  style={{ width: `${Math.max(0, Math.min(100, opponentFighter?.health ?? 100))}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-mono font-black text-white drop-shadow">
                  {opponentFighter ? opponentFighter.health : 0} / {opponentFighter?.maxHealth ?? 100} HP
                </span>
              </div>
            </div>
          </div>

          {/* Active Kill Streak Modifiers (FFA Only) */}
          <MatchPowerHUD
            killStreak={localFighter.killStreak}
            speedModifier={localFighter.speedModifier}
            forceModifier={localFighter.forceModifier}
            jumpModifier={localFighter.jumpModifier}
          />
        </div>

        {/* Center Screen: State Machine Callouts */}
        <div className="flex flex-col items-center justify-center my-auto gap-4">
          {/* Health Recovery Toast Banner */}
          {healthToast && (
            <div className="pointer-events-auto bg-emerald-950/95 border-2 border-emerald-400 text-emerald-200 px-6 py-2.5 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.7)] animate-bounce flex items-center gap-2.5">
              <span className="text-xl">💚</span>
              <span className="text-base font-black uppercase tracking-wider text-emerald-300" style={{ fontFamily: "var(--font-game)" }}>
                +{healthToast.amount} HP RESTORED!
              </span>
            </div>
          )}

          {/* Active Kill Streak Overdrive Banner */}
          {localFighter.killStreak >= 2 && !localFighter.isDead && matchStatus === "PLAYING" && (
            <div className="pointer-events-auto bg-amber-950/90 border-2 border-amber-500 text-amber-200 px-6 py-2.5 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-pulse flex flex-col items-center">
              <span className="text-lg font-black uppercase tracking-wider flex items-center gap-2" style={{ fontFamily: "var(--font-game)" }}>
                🔥 KILL STREAK x{localFighter.killStreak}!
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                PHYSICAL OVERDRIVE ACTIVE
              </span>
            </div>
          )}
          {/* Floating Combat KO Callouts */}
          {localFighter.isDead && matchStatus === "PLAYING" && (
            <div className="pointer-events-auto bg-red-950/90 border-2 border-red-500 text-red-200 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse flex flex-col items-center">
              <span className="text-xl font-black uppercase tracking-wider" style={{ fontFamily: "var(--font-game)" }}>
                KNOCKED OUT!
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-red-300">
                Respawning in 3 seconds with shield...
              </span>
            </div>
          )}

          {opponentFighter?.isDead && matchStatus === "PLAYING" && !localFighter.isDead && (
            <div className="pointer-events-auto bg-emerald-950/90 border-2 border-emerald-500 text-emerald-200 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.6)] animate-bounce flex flex-col items-center">
              <span className="text-xl font-black uppercase tracking-wider" style={{ fontFamily: "var(--font-game)" }}>
                TARGET ELIMINATED!
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                +1 KO Awarded • First to 3 Wins
              </span>
            </div>
          )}

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
                    ? "Outstanding fight! You reached 3 KOs and claimed victory in the Thunder Dome."
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

        {/* Bottom Bar: Weapon Equipment HUD & Controls Guide */}
        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between w-full gap-3">
          {/* Controls Hints */}
          <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-xl text-xs text-slate-300 shadow-lg">
            <GiGamepad className="text-amber-400 text-lg flex-shrink-0" />
            <span style={{ fontFamily: "var(--font-tech)" }}>
              Move: <strong className="text-amber-400">W/S</strong> • Turn: <strong className="text-amber-400">A/D</strong> • Strafe: <strong className="text-amber-400">Q/E</strong> • Jump: <strong className="text-amber-400">SPACE</strong> • Attack: <strong className="text-amber-400">J/I</strong> (Click) • Kick: <strong className="text-amber-400">K</strong> • Push: <strong className="text-amber-400">L</strong> • Pickup: <strong className="text-emerald-400">E</strong> • Drop: <strong className="text-red-400">G</strong>
            </span>
          </div>

          {/* Equipped Weapon HUD */}
          <WeaponHUD
            heldItemId={localFighter.heldItemId ?? "FISTS"}
            ammo={localFighter.ammo ?? 0}
            nearbyWeapon={nearbyWeapon}
            onInteract={() => room?.send("player:interact")}
            onDropWeapon={() => room?.send("player:drop-weapon")}
          />
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
