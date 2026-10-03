// ==================================================
// ORGANISM: FIGHTER PROFILE MODAL COMPONENT
//
// WHAT IT DOES:
// Displays a detailed combat dossier of the authenticated fighter,
// showing lifetime stats, performance ratios, and account metadata.
//
// HOW IT WORKS:
// - Renders inside `ModalBackdrop` listening to `activeModal === "PROFILE"`.
// - Pulls user account, player persona, and stat metrics from `useAuthStore`.
// - Formats metrics in an arcade stat grid.
//
// WHY IT EXISTS:
// Allows players to inspect their career progression and combat record.
// ==================================================

import { FaHandFist, FaSkull, FaUserNinja } from "react-icons/fa6";
import { GiCrossedSwords, GiPodiumWinner, GiRibbonMedal, GiShield, GiTargetPrize, GiTrophy } from "react-icons/gi";
import { useAuthStore } from "../../../store/useAuthStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { Heading } from "../atoms/Heading";
import { StatBadge } from "../molecules/StatBadge";
import { ModalBackdrop } from "../templates/ModalBackdrop";

export function ProfileModal() {
  const activeModal = useNavigationStore((state) => state.activeModal);
  const closeModal = useNavigationStore((state) => state.closeModal);

  const user = useAuthStore((state) => state.user);
  const player = useAuthStore((state) => state.player);
  const stats = useAuthStore((state) => state.stats);
  const derivedStats = useAuthStore((state) => state.derivedStats);

  const isOpen = activeModal === "PROFILE";

  const totalMatches = stats?.totalMatches ?? 0;
  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const kills = stats?.kills ?? 0;
  const deaths = stats?.deaths ?? 0;
  const assists = stats?.assists ?? 0;
  const kd = (derivedStats?.killDeathRatio ?? 0).toFixed(2);
  const winRate = `${(derivedStats?.winRatePercentage ?? 0).toFixed(1)}%`;

  return (
    <ModalBackdrop
      isOpen={isOpen}
      onClose={closeModal}
      title="Fighter Combat Dossier"
      icon={<FaUserNinja />}
      maxWidth="lg"
    >
      <div className="flex flex-col gap-6">
        {/* Fighter ID Card Header */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-red-500 to-amber-300 p-0.5 shadow-lg flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-amber-400 text-3xl">
              <GiPodiumWinner />
            </div>
          </div>

          <div className="flex flex-col min-w-0">
            <Heading level="h3" color="gold">
              {player?.playerName ?? "Unknown Combatant"}
            </Heading>
            <span
              className="text-xs text-slate-400 truncate"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              Registered: {user?.email ?? "Offline"}
            </span>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Tier: Rookie Contender
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                Season 1
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div>
          <h4
            className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3"
            style={{ fontFamily: "var(--font-game)" }}
          >
            Lifetime Combat Records
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatBadge
              icon={<GiRibbonMedal />}
              label="Matches Played"
              value={totalMatches}
              color="slate"
            />
            <StatBadge
              icon={<GiTrophy />}
              label="Matches Won"
              value={wins}
              color="amber"
            />
            <StatBadge
              icon={<GiShield />}
              label="Matches Lost"
              value={losses}
              color="slate"
            />
            <StatBadge
              icon={<GiCrossedSwords />}
              label="Total Kills"
              value={kills}
              color="red"
            />
            <StatBadge
              icon={<FaSkull />}
              label="Total Deaths"
              value={deaths}
              color="slate"
            />
            <StatBadge
              icon={<FaHandFist />}
              label="Assists"
              value={assists}
              color="cyan"
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
              className="col-span-2 sm:col-span-3"
            />
          </div>
        </div>

        <p
          className="text-center text-xs text-slate-500 italic"
          style={{ fontFamily: "var(--font-tech)" }}
        >
          Competitive stats are authoritative and update upon match finalization.
        </p>
      </div>
    </ModalBackdrop>
  );
}
