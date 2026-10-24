// ==================================================
// SCREEN: DEDICATED MATCHMAKING & QUEUE RADAR
//
// WHAT IT DOES:
// Displays an active arcade matchmaking search interface with live radar animations,
// digital elapsed time readout, estimated wait times, squad party status, and a cancel action.
//
// HOW IT WORKS:
// - Reads `isQueuing`, `queueMode`, `elapsedSeconds`, and `estimatedWaitSeconds`
//   from `useMatchmakingStore`.
// - Displays animated concentric radar rings with `react-icons`.
// - Formats elapsed time as MM:SS with monospace font.
// - Features a prominent "Cancel Matchmaking" button that dispatches MATCH_CANCEL_QUEUE.
//
// WHY IT EXISTS:
// Enforces Phase 15 requirement. Provides clear, responsive feedback while waiting
// for opponents, eliminating blank or frozen screens.
// ==================================================

import { FaXmark } from "react-icons/fa6";
import {
  GiCrossedSwords,
  GiFist,
  GiRadarSweep,
  GiShield,
  GiUsers,
} from "react-icons/gi";
import { GAME_MODES } from "../../../shared/domain/GameMode.ts";
import { useMatchmakingStore } from "../../store/useMatchmakingStore";
import { Badge } from "../ui/atoms/Badge";
import { Button } from "../ui/atoms/Button";
import { Heading } from "../ui/atoms/Heading";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

function formatSeconds(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function MatchmakingScreen() {
  const queueMode = useMatchmakingStore((state) => state.queueMode) ?? "1v1";
  const elapsedSeconds = useMatchmakingStore((state) => state.elapsedSeconds);
  const estimatedWaitSeconds = useMatchmakingStore(
    (state) => state.estimatedWaitSeconds,
  );
  const cancelQueue = useMatchmakingStore((state) => state.cancelQueue);
  const party = useMatchmakingStore((state) => state.party);

  const modeConfig = GAME_MODES[queueMode];
  const partyMembers = party ? Object.values(party.members) : [];

  return (
    <ScreenLayout
      header={
        <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex items-center justify-between backdrop-blur-md select-none">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            <Heading level="h4" color="gold">
              Thunder Dome Matchmaker
            </Heading>
          </div>

          <Badge variant="amber">
            SEARCHING
          </Badge>
        </div>
      }
      footer={
        <div className="w-full bg-slate-950/80 border-t border-slate-800/80 px-4 md:px-8 py-2.5 flex items-center justify-between text-xs text-slate-400 select-none">
          <span style={{ fontFamily: "var(--font-tech)" }}>
            Authoritative Matchmaking Cluster • Colyseus Seat Allocation
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            Phase 15 Dynamic Queue
          </span>
        </div>
      }
    >
      <div className="w-full max-w-2xl flex flex-col items-center justify-center gap-8 py-6 my-auto">
        {/* Radar Animation Hub */}
        <div className="relative w-52 h-52 flex items-center justify-center">
          {/* Outer Pulsing Rings */}
          <div className="absolute inset-0 rounded-full border-2 border-amber-500/20 animate-ping" />
          <div className="absolute inset-4 rounded-full border border-amber-500/30 animate-pulse" />
          <div className="absolute inset-8 rounded-full border border-amber-500/40" />

          {/* Radar Sweep Effect */}
          <div className="absolute inset-0 rounded-full border-2 border-amber-500/50 flex items-center justify-center overflow-hidden">
            <div className="w-full h-full bg-gradient-to-tr from-transparent via-amber-500/10 to-transparent animate-spin duration-1000" />
          </div>

          {/* Central Mode Emblem */}
          <div className="relative z-10 w-24 h-24 rounded-2xl bg-gradient-to-tr from-amber-600 via-rose-600 to-amber-400 p-0.5 shadow-2xl">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex flex-col items-center justify-center text-amber-400 shadow-inner">
              <GiRadarSweep className="text-4xl animate-pulse" />
            </div>
          </div>
        </div>

        {/* Status Headings & Selected Mode */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="purple">
              {modeConfig?.name ?? queueMode.toUpperCase()}
            </Badge>
            {party && (
              <Badge variant="cyan">
                SQUAD ({partyMembers.length})
              </Badge>
            )}
          </div>

          <Heading level="h2" color="gold" className="tracking-wide">
            Searching for Opponents
          </Heading>

          <p
            className="text-xs sm:text-sm text-slate-400 max-w-md"
            style={{ fontFamily: "var(--font-tech)" }}
          >
            Evaluating global simulation nodes and matching participant criteria...
          </p>
        </div>

        {/* Digital Timer & Wait Metric */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
            <span
              className="text-[10px] font-black uppercase tracking-wider text-slate-400"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              Time in Queue
            </span>
            <span className="text-2xl font-black font-mono text-amber-400 mt-0.5">
              {formatSeconds(elapsedSeconds)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
            <span
              className="text-[10px] font-black uppercase tracking-wider text-slate-400"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              Estimated Wait
            </span>
            <span className="text-2xl font-black font-mono text-emerald-400 mt-0.5">
              ~{estimatedWaitSeconds}s
            </span>
          </div>
        </div>

        {/* Squad Members Roster (if in Party) */}
        {party && partyMembers.length > 0 && (
          <div className="w-full max-w-md flex flex-col gap-2 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)" }}>
                <GiUsers className="text-cyan-400" />
                Squad Members
              </span>
              <span className="font-mono text-[11px] text-cyan-400">
                Code: {party.inviteCode}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {partyMembers.map((member) => (
                <div
                  key={member.playerId}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/80 border border-slate-800"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400 text-xs shrink-0">
                    <GiFist />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-200 truncate">
                      {member.playerName}
                    </span>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      Ready
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancel Action */}
        <Button
          variant="danger"
          size="lg"
          onClick={cancelQueue}
          leftIcon={<FaXmark />}
          className="w-full max-w-xs shadow-xl"
        >
          Cancel Matchmaking
        </Button>
      </div>
    </ScreenLayout>
  );
}
