// ==================================================
// SCREEN: PLAY MENU & COMBAT MODE SELECTOR
//
// WHAT IT DOES:
// Allows fighters to select specific arena combat rulesets and match topologies:
// 1v1 Duels, 3v3 Team Arena, 4v4 Brawl, and 20-Player Chaos FFA.
//
// HOW IT WORKS:
// - Directs combatants into the authoritative room pipeline (`MATCH_LOADING`).
// - Sets `selectedMatchMode` in `useNavigationStore`.
// - Features a deterministic "Back" button returning to `MAIN_MENU`.
//
// WHY IT EXISTS:
// Bridges player intent from the menu into active game session allocation.
// ==================================================

import { FaArrowLeft } from "react-icons/fa6";
import { GiBangingGavel, GiCarnivalMask, GiCrossedPistols, GiFist } from "react-icons/gi";
import { useMatchmakingStore } from "../../store/useMatchmakingStore";
import { type MatchMode, useNavigationStore } from "../../store/useNavigationStore";
import { Button } from "../ui/atoms/Button";
import { Heading } from "../ui/atoms/Heading";
import { MenuCard } from "../ui/molecules/MenuCard";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

export function PlayMenuScreen() {
  const goBack = useNavigationStore((state) => state.goBack);
  const startQueue = useMatchmakingStore((state) => state.startQueue);
  const party = useMatchmakingStore((state) => state.party);

  const squadSize = party ? Object.keys(party.members).length : 0;

  const handleSelectMode = async (mode: MatchMode) => {
    await startQueue(mode);
  };

  return (
    <ScreenLayout
      header={
        <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex items-center justify-between backdrop-blur-md select-none">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            leftIcon={<FaArrowLeft />}
          >
            Back to Hub
          </Button>

          <Heading level="h4" color="gold">
            Combat Mode Selection
          </Heading>

          <div className="w-20" />
        </div>
      }
    >
      <div className="w-full max-w-4xl flex flex-col gap-6 py-4">
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <Heading level="h2" color="fire">
              Deploy to the Arena
            </Heading>
            {squadSize > 1 && (
              <span className="text-xs px-2.5 py-1 rounded-md bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono font-bold">
                Squad Active ({squadSize} Fighters)
              </span>
            )}
          </div>
          <p
            className="text-xs md:text-sm text-slate-400 font-bold uppercase tracking-wider"
            style={{ fontFamily: "var(--font-tech)" }}
          >
            {squadSize > 1
              ? "Select an arena mode that supports your active squad capacity"
              : "Choose your battle configuration"}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MenuCard
            title="1v1 Arena Duel"
            description={
              squadSize > 1
                ? `1v1 duels require solo play. Your squad currently has ${squadSize} fighters.`
                : "High-stakes one-on-one duel. Pure authoritative physics, zero latency excuses, total dominance."
            }
            icon={<GiFist className="text-amber-400" />}
            badgeText={squadSize > 1 ? "SQUAD TOO LARGE" : "ACTIVE"}
            badgeVariant={squadSize > 1 ? "slate" : "emerald"}
            badgePulse={squadSize <= 1}
            accentColor="amber"
            disabled={squadSize > 1}
            onClick={squadSize <= 1 ? () => handleSelectMode("1v1") : undefined}
          />

          <MenuCard
            title="3v3 Team Arena"
            description={
              squadSize === 2
                ? "Trios tactical arena skirmish. Your squad of 2 will fight together on the same team and be backfilled with 1 solo teammate."
                : squadSize === 3
                  ? "Trios tactical arena skirmish. Full 3-player squad fighting for arena dominance."
                  : "Trios tactical arena skirmish. Coordinate offensive pushes, flank angles, and team combos."
            }
            icon={<GiBangingGavel className="text-cyan-400" />}
            badgeText={
              squadSize > 3
                ? "SQUAD > 3"
                : squadSize > 1
                  ? `SQUAD READY (${squadSize}/3)`
                  : "ACTIVE"
            }
            badgeVariant={squadSize > 3 ? "slate" : "emerald"}
            badgePulse={squadSize <= 3}
            accentColor="cyan"
            disabled={squadSize > 3}
            onClick={squadSize <= 3 ? () => handleSelectMode("3v3") : undefined}
          />

          <MenuCard
            title="4v4 Squad Brawl"
            description="Full-squad tactical warfare. Synergy, zoning, and high-impact ultimate clashes."
            icon={<GiCrossedPistols className="text-purple-400" />}
            badgeText="PHASE 17"
            badgeVariant="purple"
            accentColor="purple"
            disabled
          />

          <MenuCard
            title="20-Player Free-For-All"
            description={
              squadSize > 1
                ? "Free-for-all is individual combat only. Squads cannot queue for FFA."
                : "Maximum chaos stadium brawl. Up to 20 fighters in an open arena. Consecutive kills grant temporary physical streak bonuses!"
            }
            icon={<GiCarnivalMask className="text-amber-400" />}
            badgeText={squadSize > 1 ? "SOLO ONLY" : "ACTIVE"}
            badgeVariant={squadSize > 1 ? "slate" : "emerald"}
            badgePulse={squadSize <= 1}
            accentColor="fire"
            disabled={squadSize > 1}
            onClick={squadSize <= 1 ? () => handleSelectMode("ffa") : undefined}
          />
        </div>
      </div>
    </ScreenLayout>
  );
}
