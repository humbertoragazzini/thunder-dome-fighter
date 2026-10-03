// ==================================================
// ORGANISM: PLAYER TOP BANNER COMPONENT
//
// WHAT IT DOES:
// Renders the global navigation header showing fighter identity,
// competitive performance stats (Wins, K/D, Win Rate), and profile actions.
//
// HOW IT WORKS:
// - Reads active `player`, `stats`, and `derivedStats` from `useAuthStore`.
// - Displays tactile stat badges with Game Icons (`GiTrophy`, `GiCrossedSwords`, `GiTargetPrize`).
// - Provides action buttons for opening the Fighter Profile modal, Settings, and Signing Out.
//
// WHY IT EXISTS:
// Serves as the primary persistent identity bar across menus.
// ==================================================

import { FaRightFromBracket, FaUser } from "react-icons/fa6";
import { GiCrossedSwords, GiTargetPrize, GiTrophy } from "react-icons/gi";
import { useAuthStore } from "../../../store/useAuthStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { Button } from "../atoms/Button";
import { Heading } from "../atoms/Heading";
import { StatBadge } from "../molecules/StatBadge";

export function PlayerBanner() {
  const player = useAuthStore((state) => state.player);
  const stats = useAuthStore((state) => state.stats);
  const derivedStats = useAuthStore((state) => state.derivedStats);
  const logout = useAuthStore((state) => state.logout);

  const openModal = useNavigationStore((state) => state.openModal);
  const resetToAuth = useNavigationStore((state) => state.resetToAuth);

  const handleLogout = () => {
    logout();
    resetToAuth();
  };

  const playerName = player?.playerName || "Unknown Fighter";
  const wins = stats?.wins ?? 0;
  const kd = (derivedStats?.killDeathRatio ?? 0).toFixed(2);
  const winRate = `${(derivedStats?.winRatePercentage ?? 0).toFixed(0)}%`;

  return (
    <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md shadow-lg select-none">
      {/* Left: Branding & Fighter Identity */}
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 p-0.5 shadow-md flex items-center justify-center">
          <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-amber-400 text-lg">
            <FaUser />
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <Heading level="h4" color="gold" className="tracking-wide">
              {playerName}
            </Heading>
            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Online
            </span>
          </div>
          <span
            className="text-[11px] text-slate-400 font-bold uppercase tracking-wider"
            style={{ fontFamily: "var(--font-tech)" }}
          >
            Fighter License Active
          </span>
        </div>
      </div>

      {/* Middle: Key Stats Readout */}
      <div className="hidden lg:flex items-center gap-3">
        <StatBadge
          icon={<GiTrophy />}
          label="Victories"
          value={wins}
          color="amber"
        />
        <StatBadge
          icon={<GiCrossedSwords />}
          label="K/D Ratio"
          value={kd}
          color="red"
        />
        <StatBadge
          icon={<GiTargetPrize />}
          label="Win Rate"
          value={winRate}
          color="emerald"
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openModal("PROFILE")}
          leftIcon={<GiTrophy className="text-amber-400" />}
        >
          Profile
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          leftIcon={<FaRightFromBracket />}
          className="text-slate-400 hover:text-red-400"
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
