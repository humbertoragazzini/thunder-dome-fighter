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
import { useNavigationStore } from "../../store/useNavigationStore";
import { Button } from "../ui/atoms/Button";
import { Heading } from "../ui/atoms/Heading";
import { MenuCard } from "../ui/molecules/MenuCard";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

export function PlayMenuScreen() {
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const goBack = useNavigationStore((state) => state.goBack);
  const setSelectedMatchMode = useNavigationStore((state) => state.setSelectedMatchMode);

  const handleSelectMode = (mode: "1v1") => {
    setSelectedMatchMode(mode);
    navigateTo("MATCH_LOADING");
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
          <Heading level="h2" color="fire">
            Deploy to the Arena
          </Heading>
          <p
            className="text-xs md:text-sm text-slate-400 font-bold uppercase tracking-wider"
            style={{ fontFamily: "var(--font-tech)" }}
          >
            Choose your battle configuration
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MenuCard
            title="1v1 Arena Duel"
            description="High-stakes one-on-one duel. Pure authoritative physics, zero latency excuses, total dominance."
            icon={<GiFist className="text-amber-400" />}
            badgeText="ACTIVE"
            badgeVariant="emerald"
            badgePulse
            accentColor="amber"
            onClick={() => handleSelectMode("1v1")}
          />

          <MenuCard
            title="3v3 Team Arena"
            description="Trios tactical arena skirmish. Coordinate offensive pushes, flank angles, and team combos."
            icon={<GiBangingGavel className="text-cyan-400" />}
            badgeText="PHASE 16"
            badgeVariant="cyan"
            accentColor="cyan"
            disabled
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
            description="Maximum chaos stadium brawl. Up to 20 fighters in an open arena. Last fighter standing wins."
            icon={<GiCarnivalMask className="text-red-400" />}
            badgeText="PHASE 18"
            badgeVariant="red"
            accentColor="fire"
            disabled
          />
        </div>
      </div>
    </ScreenLayout>
  );
}
