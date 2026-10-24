// ==================================================
// MOLECULE: MATCH SCOREBOARD MODAL & TABLE
//
// WHAT IT DOES:
// Renders the real-time multiplayer scoreboard displaying all fighters'
// kills, deaths, assists, K/D ratio, damage dealt/received, and active equipment.
//
// HOW IT WORKS:
// - Sorts participants descending by score, then kills, then damage dealt.
// - Highlights the local player row in gold/cyan.
// - Supports live in-game overlay mode (hold [Tab] or mobile toggle)
//   as well as post-match final breakdown mode.
//
// WHY IT EXISTS:
// In compliance with Phase 13 requirements, gives players authoritative
// visibility into in-match rankings, combat performance, and final match outcomes.
// ==================================================

import { FaTrophy, FaSkull, FaCrosshairs, FaShieldHalved, FaXmark } from "react-icons/fa6";
import { GiPunch, GiBroadsword, GiWarhammer, GiPistolGun } from "react-icons/gi";
import { Badge } from "../atoms/Badge";
import { Button } from "../atoms/Button";

export interface ScoreboardParticipant {
  id: string;
  name: string;
  teamIndex: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageReceived: number;
  heldItemId?: string;
  isLocal: boolean;
  isWinner?: boolean;
}

export interface MatchScoreboardModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  gameModeName?: string;
  arenaName?: string;
  timeRemaining?: string;
  participants: ScoreboardParticipant[];
  isPostMatch?: boolean;
  onReturnToMenu?: () => void;
}

function getWeaponIcon(itemId?: string) {
  switch (itemId) {
    case "ENERGY_BLADE":
      return <GiBroadsword className="text-cyan-400" title="Energy Blade" />;
    case "THUNDER_HAMMER":
      return <GiWarhammer className="text-amber-400" title="Thunder Hammer" />;
    case "PLASMA_PISTOL":
      return <GiPistolGun className="text-rose-400" title="Plasma Pistol" />;
    default:
      return <GiPunch className="text-slate-400" title="Fists" />;
  }
}

export function MatchScoreboardModal({
  isOpen,
  onClose,
  title = "Match Scoreboard",
  gameModeName = "1v1 Duel",
  arenaName = "Thunder Dome Alpha",
  timeRemaining,
  participants,
  isPostMatch = false,
  onReturnToMenu,
}: MatchScoreboardModalProps) {
  if (!isOpen) return null;

  // Deterministically sort participants: score > kills > damageDealt
  const sorted = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.damageDealt - a.damageDealt;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in pointer-events-auto">
      <div className="w-full max-w-4xl bg-slate-900/95 border-2 border-slate-700/80 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-xl shadow-lg">
              <FaTrophy />
            </div>
            <div>
              <h2
                className="text-lg sm:text-xl font-black uppercase tracking-wider text-slate-100 flex items-center gap-2"
                style={{ fontFamily: "var(--font-game)" }}
              >
                {title}
                {isPostMatch && (
                  <Badge variant="amber" size="sm">
                    FINAL
                  </Badge>
                )}
              </h2>
              <p
                className="text-xs text-slate-400"
                style={{ fontFamily: "var(--font-tech)" }}
              >
                {gameModeName} • {arenaName} {timeRemaining ? `• Clock: ${timeRemaining}` : ""}
              </p>
            </div>
          </div>

          {!isPostMatch && onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
              aria-label="Close scoreboard"
            >
              <FaXmark className="text-lg" />
            </button>
          )}
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto overflow-y-auto p-4 sm:p-6">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr
                className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-widest"
                style={{ fontFamily: "var(--font-tech)" }}
              >
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Fighter</th>
                <th className="py-2.5 px-3 text-center">Score</th>
                <th className="py-2.5 px-3 text-center">K / D / A</th>
                <th className="py-2.5 px-3 text-center">K/D</th>
                <th className="py-2.5 px-3 text-right">DMG Dealt</th>
                <th className="py-2.5 px-3 text-right">DMG Taken</th>
                <th className="py-2.5 px-3 text-center">Weapon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sorted.map((p, index) => {
                const kdRatio =
                  p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);

                const rowBg = p.isLocal
                  ? "bg-cyan-950/40 hover:bg-cyan-950/60 border-l-4 border-l-cyan-400"
                  : p.isWinner
                    ? "bg-amber-950/30 hover:bg-amber-950/50 border-l-4 border-l-amber-400"
                    : "hover:bg-slate-800/40 border-l-4 border-l-transparent";

                return (
                  <tr key={p.id} className={`transition-colors ${rowBg}`}>
                    {/* Rank */}
                    <td className="py-3 px-3 font-bold text-slate-400">
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`}
                    </td>

                    {/* Fighter Name & Badge */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black tracking-wider ${
                            p.isLocal ? "text-cyan-300" : "text-slate-200"
                          }`}
                          style={{ fontFamily: "var(--font-game)" }}
                        >
                          {p.name}
                        </span>
                        {p.isLocal && (
                          <Badge variant="cyan" size="sm">
                            YOU
                          </Badge>
                        )}
                        {p.isWinner && (
                          <Badge variant="amber" size="sm">
                            WINNER
                          </Badge>
                        )}
                        {p.teamIndex >= 0 && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                              p.teamIndex === 0
                                ? "bg-cyan-900/40 text-cyan-400 border border-cyan-700/50"
                                : "bg-rose-900/40 text-rose-400 border border-rose-700/50"
                            }`}
                          >
                            {p.teamIndex === 0 ? "Team Alpha" : "Team Beta"}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Score */}
                    <td className="py-3 px-3 text-center">
                      <span className="font-black text-amber-400 text-base">
                        {p.score}
                      </span>
                    </td>

                    {/* K / D / A */}
                    <td className="py-3 px-3 text-center text-slate-300">
                      <span className="text-emerald-400 font-bold">{p.kills}</span> /{" "}
                      <span className="text-rose-400 font-bold">{p.deaths}</span> /{" "}
                      <span className="text-amber-400 font-bold">{p.assists}</span>
                    </td>

                    {/* K/D Ratio */}
                    <td className="py-3 px-3 text-center text-slate-300 font-bold">
                      {kdRatio}
                    </td>

                    {/* Damage Dealt */}
                    <td className="py-3 px-3 text-right text-emerald-400 font-semibold">
                      {p.damageDealt.toLocaleString()}
                    </td>

                    {/* Damage Received */}
                    <td className="py-3 px-3 text-right text-rose-400 font-semibold">
                      {p.damageReceived.toLocaleString()}
                    </td>

                    {/* Weapon */}
                    <td className="py-3 px-3 text-center text-lg">
                      <div className="flex items-center justify-center">
                        {getWeaponIcon(p.heldItemId)}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                    No fighters currently participating in this arena.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {isPostMatch && onReturnToMenu && (
          <div className="p-4 sm:p-6 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
            <Button
              variant="primary"
              size="lg"
              onClick={onReturnToMenu}
              className="w-full sm:w-auto shadow-lg"
            >
              Return to Main Menu
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
