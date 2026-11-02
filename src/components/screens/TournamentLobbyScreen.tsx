// ==================================================
// SCREEN: TOURNAMENT LOBBY & STAGING SCREEN
//
// WHAT IT DOES:
// Authoritative tournament staging hub (Phase 21 Steps 21.2 - 21.6):
// - Renders slot cards for registered combatants (4, 8, or 16 capacity).
// - Displays live readiness toggles, seed assignments, and host launch barrier.
// - Features interactive room code sharing with 1-click copy.
// - Renders dynamic tournament bracket overview (Semifinals -> Grand Final).
// - Displays Victory Podium ceremony when the Champion is crowned.
//
// HOW IT WORKS:
// - Subscribes to `useTournamentStore` and room state updates.
// - Emits `tournament:toggle-ready` and `tournament:start`.
// - Automatically routes to `MATCH_LOADING` when `tournament:match-assigned` arrives.
//
// WHY IT EXISTS:
// Dedicated competitive esports hub for tournaments and championships.
// ==================================================

import { useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaCopy,
  FaCrown,
  FaLock,
  FaTrophy,
  FaUser,
} from "react-icons/fa6";
import {
  GiBoxingGlove,
  GiCrossedSwords,
  GiFist,
  GiPodium,
  GiTrophyCup,
} from "react-icons/gi";
import { useTournamentStore } from "../../store/useTournamentStore";
import { Button } from "../ui/atoms/Button";
import { Heading } from "../ui/atoms/Heading";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

export function TournamentLobbyScreen() {
  const activeRoom = useTournamentStore((state) => state.activeRoom);
  const lobbyState = useTournamentStore((state) => state.lobbyState);
  useTournamentStore((state) => state.lobbyRevision);
  const toggleReady = useTournamentStore((state) => state.toggleReady);
  const startTournament = useTournamentStore((state) => state.startTournament);
  const leaveTournament = useTournamentStore((state) => state.leaveTournament);
  const championData = useTournamentStore((state) => state.championData);
  const dismissChampion = useTournamentStore((state) => state.dismissChampion);

  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = async () => {
    if (!lobbyState?.roomCode) return;
    try {
      await navigator.clipboard.writeText(lobbyState.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignored
    }
  };

  const participants = lobbyState?.participants
    ? Array.from(lobbyState.participants.values())
    : [];

  const localParticipant = activeRoom
    ? participants.find((p) => p.sessionId === activeRoom.sessionId)
    : undefined;

  const isHost = Boolean(localParticipant?.isHost);
  const capacity = lobbyState?.participantCapacity ?? 4;
  const isPrivate = Boolean(lobbyState?.isPrivate);

  // Group participants by slotIndex (0 .. capacity - 1)
  const slotMap = new Map<number, (typeof participants)[0]>();
  for (const p of participants) {
    if (p.slotIndex >= 0 && p.slotIndex < capacity) {
      slotMap.set(p.slotIndex, p);
    }
  }

  const occupiedCount = slotMap.size;
  const isFull = occupiedCount === capacity;
  const allReady =
    isFull &&
    Array.from(slotMap.values()).every((p) => p.isHost || p.isReady);

  const canLaunch = isHost && isFull && allReady && lobbyState?.status === "WAITING";

  return (
    <ScreenLayout
      header={
        <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex items-center justify-between backdrop-blur-md select-none">
          <Button
            variant="ghost"
            size="sm"
            onClick={leaveTournament}
            leftIcon={<FaArrowLeft />}
          >
            Leave Championship
          </Button>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <GiTrophyCup className="text-lg" />
            </div>
            <div className="flex flex-col">
              <Heading level="h4" color="gold">
                {lobbyState?.tournamentName ?? "Tournament Championship"}
              </Heading>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <span>{capacity} Fighters Knockout</span>
                <span>•</span>
                <span className="text-amber-400 font-bold">
                  {lobbyState?.status === "WAITING"
                    ? "Staging Roster"
                    : lobbyState?.status === "IN_PROGRESS"
                      ? `Round: ${lobbyState.currentRoundName}`
                      : "Finished"}
                </span>
              </div>
            </div>
          </div>

          {/* Room Code Badge */}
          {isPrivate && lobbyState?.roomCode ? (
            <button
              onClick={handleCopyCode}
              title="Click to copy private tournament code"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer shadow-inner group"
            >
              <FaLock className="text-[10px] text-amber-400" />
              <span>{lobbyState.roomCode}</span>
              {copiedCode ? (
                <FaCheck className="text-emerald-400 text-xs" />
              ) : (
                <FaCopy className="text-slate-500 group-hover:text-amber-300 text-xs" />
              )}
            </button>
          ) : (
            <div className="w-20" />
          )}
        </div>
      }
    >
      <div className="w-full max-w-5xl flex flex-col gap-6 py-4">
        {/* Championship Status & Launch Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-gradient-to-r from-amber-950/60 via-slate-900/90 to-cyan-950/60 border border-amber-500/30 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-2xl shrink-0 shadow-inner">
              <GiPodium />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-black font-mono tracking-wide text-amber-400">
                  {lobbyState?.status === "WAITING"
                    ? `FIGHTERS ENROLLED: ${occupiedCount}/${capacity}`
                    : lobbyState?.status === "IN_PROGRESS"
                      ? `ROUND ACTIVE: ${lobbyState.currentRoundName}`
                      : "CHAMPIONSHIP CONCLUDED"}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    allReady ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
              </div>
              <span className="text-xs text-slate-400 font-mono truncate">
                {lobbyState?.status === "WAITING"
                  ? allReady
                    ? "All fighters are verified and ready for battle!"
                    : `Waiting for ${capacity - occupiedCount} more fighter(s) and readiness confirmations`
                  : "Matches are actively simulating on authoritative physics nodes"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Non-host Ready Toggle */}
            {!isHost && lobbyState?.status === "WAITING" && (
              <Button
                variant={localParticipant?.isReady ? "secondary" : "primary"}
                size="md"
                onClick={toggleReady}
                leftIcon={<FaCheck />}
                className="flex-1 sm:flex-initial"
              >
                {localParticipant?.isReady ? "Ready (Click to cancel)" : "Confirm Ready"}
              </Button>
            )}

            {/* Host Start Button */}
            {isHost && lobbyState?.status === "WAITING" && (
              <Button
                variant="primary"
                size="md"
                onClick={startTournament}
                disabled={!canLaunch}
                leftIcon={<GiBoxingGlove />}
                className={`flex-1 sm:flex-initial shadow-lg ${
                  canLaunch
                    ? "shadow-amber-500/30 animate-pulse bg-gradient-to-r from-amber-500 to-amber-600 border-amber-400 text-slate-950 font-black"
                    : ""
                }`}
              >
                {!isFull
                  ? `Need ${capacity - occupiedCount} More Fighter(s)`
                  : !allReady
                    ? "Waiting for Ready Checks"
                    : "Start Championship!"}
              </Button>
            )}
          </div>
        </div>

        {/* Combatant Slot Grid */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider">
              Championship Seeds & Roster
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Rules: {lobbyState?.scoreLimit ?? 5} KOs • {Math.floor((lobbyState?.timeLimitSeconds ?? 180) / 60)}m Timer
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: capacity }).map((_, slotIndex) => {
              const p = slotMap.get(slotIndex);
              const isLocal = p?.sessionId === activeRoom?.sessionId;

              return (
                <div
                  key={slotIndex}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 relative overflow-hidden ${
                    p
                      ? p.isEliminated
                        ? "bg-slate-950/40 border-rose-950/60 opacity-60"
                        : isLocal
                          ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(251,191,36,0.15)]"
                          : "bg-slate-900/80 border-slate-800/80 hover:border-slate-700"
                      : "bg-slate-950/40 border-dashed border-slate-800/80"
                  }`}
                >
                  {/* Top Bar: Seed & Status */}
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-amber-400">
                      SEED #{slotIndex + 1}
                    </span>

                    {p ? (
                      p.isEliminated ? (
                        <span className="px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-500/40 text-[10px] font-mono font-bold text-rose-300">
                          ELIMINATED
                        </span>
                      ) : p.isHost ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[10px] font-mono font-bold text-amber-300 flex items-center gap-1">
                          <FaCrown className="text-[10px]" /> HOST
                        </span>
                      ) : p.isReady ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-mono font-bold text-emerald-300 flex items-center gap-1">
                          <FaCheck className="text-[10px]" /> READY
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-[10px] font-mono text-slate-400">
                          STAGING
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">
                        OPEN SLOT
                      </span>
                    )}
                  </div>

                  {/* Fighter Details */}
                  {p ? (
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold border shrink-0 ${
                          isLocal
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                            : "bg-slate-800/80 border-slate-700 text-slate-300"
                        }`}
                      >
                        {p.avatarUrl ? (
                          <img
                            src={p.avatarUrl}
                            alt={p.playerName}
                            className="w-full h-full rounded-xl object-cover"
                          />
                        ) : (
                          <FaUser className="text-sm" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm text-slate-100 truncate font-mono">
                          {p.playerName}
                          {isLocal && (
                            <span className="text-amber-400 font-normal ml-1">
                              (You)
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Slot {slotIndex + 1}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2 flex items-center justify-center text-slate-600 font-mono text-xs italic">
                      Awaiting Fighter...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Bracket Overview Card */}
        <div className="flex flex-col gap-3 p-5 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <GiCrossedSwords className="text-amber-400 text-lg" />
              <span className="font-bold font-mono text-sm text-slate-200 uppercase tracking-wide">
                Tournament Bracket Overview
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              World Cup Knockout Single Elimination
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {/* Semifinal 1 */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-400">
                <span>SEMIFINAL 1</span>
                <span className="text-[10px] text-slate-400">Feeds Final Slot A</span>
              </div>
              <div className="flex flex-col gap-1.5 font-mono text-xs">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/60 flex items-center justify-between text-slate-200">
                  <span>{slotMap.get(0)?.playerName ?? "Seed #1 (Slot 1)"}</span>
                  <span className="text-[10px] text-amber-400">Seed 1</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/60 flex items-center justify-between text-slate-200">
                  <span>{slotMap.get(capacity - 1)?.playerName ?? `Seed #${capacity} (Slot ${capacity})`}</span>
                  <span className="text-[10px] text-slate-400">Seed {capacity}</span>
                </div>
              </div>
            </div>

            {/* Semifinal 2 */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-cyan-400">
                <span>SEMIFINAL 2</span>
                <span className="text-[10px] text-slate-400">Feeds Final Slot B</span>
              </div>
              <div className="flex flex-col gap-1.5 font-mono text-xs">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/60 flex items-center justify-between text-slate-200">
                  <span>{slotMap.get(1)?.playerName ?? "Seed #2 (Slot 2)"}</span>
                  <span className="text-[10px] text-cyan-400">Seed 2</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/60 flex items-center justify-between text-slate-200">
                  <span>{slotMap.get(capacity - 2)?.playerName ?? `Seed #${capacity - 1} (Slot ${capacity - 1})`}</span>
                  <span className="text-[10px] text-slate-400">Seed {capacity - 1}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Victory Podium Dialog / Modal */}
        {championData && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-full max-w-lg bg-gradient-to-b from-amber-950/90 via-slate-900 to-slate-950 border-2 border-amber-500/60 rounded-3xl p-6 shadow-[0_0_50px_rgba(251,191,36,0.35)] flex flex-col items-center text-center gap-5">
              <div className="w-20 h-20 rounded-3xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 text-4xl shadow-2xl animate-bounce">
                <FaTrophy />
              </div>

              <div>
                <Heading level="h2" color="gold">
                  CHAMPION CROWNED!
                </Heading>
                <p className="text-xl font-black font-mono text-amber-300 mt-1">
                  {championData.championName}
                </p>
                <span className="text-xs text-slate-400 font-mono uppercase tracking-widest">
                  Thunder Dome Tournament Winner
                </span>
              </div>

              {/* Placements Table */}
              <div className="w-full flex flex-col gap-2 p-3 rounded-2xl bg-slate-950/80 border border-amber-500/20 font-mono text-xs">
                {championData.placements.map((pl) => (
                  <div
                    key={pl.participantId}
                    className={`flex items-center justify-between p-2 rounded-xl ${
                      pl.placement === 1
                        ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold"
                        : pl.placement === 2
                          ? "bg-slate-800/50 text-slate-200"
                          : "text-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold">
                        {pl.placement === 1
                          ? "🥇 1st Place"
                          : pl.placement === 2
                            ? "🥈 2nd Place"
                            : "🥉 Semifinalist"}
                      </span>
                      <span>{pl.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Seed {pl.seed}</span>
                  </div>
                ))}
              </div>

              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  dismissChampion();
                  leaveTournament();
                }}
                leftIcon={<GiFist />}
                className="w-full shadow-lg shadow-amber-500/30"
              >
                Return to Command Hub
              </Button>
            </div>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}
