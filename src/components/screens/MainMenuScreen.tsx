// ==================================================
// SCREEN: MAIN MENU LOBBY HUB
//
// WHAT IT DOES:
// Acts as the central command hub for authenticated fighters, directing them
// to arena matchmaking, tournaments, custom lobbies, and career profiles.
//
// HOW IT WORKS:
// - Mounts `PlayerBanner` in the header slot showing lifetime stats and account controls.
// - Presents interactive `MenuCard` molecules for each game navigation vector.
// - Displays backend cluster health and authoritative server status in the footer.
//
// WHY IT EXISTS:
// Replaces bare developer canvas overlays with a full arcade main menu.
// ==================================================

import { FaUserGroup } from "react-icons/fa6";
import { GiBoxingGlove, GiCrown, GiLightningTrio, GiRadarDish, GiSwordsPower } from "react-icons/gi";
import { useMatchmakingStore } from "../../store/useMatchmakingStore";
import { useNavigationStore } from "../../store/useNavigationStore";
import { Button } from "../ui/atoms/Button";
import { Heading } from "../ui/atoms/Heading";
import { MenuCard } from "../ui/molecules/MenuCard";
import { PlayerBanner } from "../ui/organisms/PlayerBanner";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

export function MainMenuScreen() {
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const openModal = useNavigationStore((state) => state.openModal);
  const startQueue = useMatchmakingStore((state) => state.startQueue);
  const party = useMatchmakingStore((state) => state.party);
  const squadSize = party ? Object.keys(party.members).length : 0;
  const isSquadActive = squadSize > 1;

  return (
    <ScreenLayout
      header={<PlayerBanner />}
      footer={
        <div className="w-full bg-slate-950/80 border-t border-slate-800/80 px-4 md:px-8 py-2.5 flex items-center justify-between text-xs text-slate-400 select-none">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span style={{ fontFamily: "var(--font-tech)" }}>
              Authoritative Simulation Cluster Online
            </span>
          </div>
          <span
            className="hidden sm:inline text-slate-500 font-mono text-[11px]"
          >
            Fastify API (3000) • Colyseus Server (2567)
          </span>
        </div>
      }
    >
      <div className="w-full max-w-4xl flex flex-col gap-6 py-4">
        {/* Title & Prompt */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1">
          <Heading level="h2" color="gold">
            Fighter Command Hub
          </Heading>
          <p
            className="text-xs md:text-sm text-slate-400 font-bold uppercase tracking-wider"
            style={{ fontFamily: "var(--font-tech)" }}
          >
            Select combat mode to deploy into the arena
          </p>
        </div>

        {/* Quick Play & Squad Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-gradient-to-r from-amber-950/60 via-slate-900/90 to-cyan-950/60 border border-amber-500/30 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3.5 flex-1 min-w-0">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner shrink-0 ${
                isSquadActive
                  ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400"
                  : "bg-amber-500/20 border border-amber-500/30 text-amber-400"
              }`}
            >
              <GiLightningTrio />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-base font-black font-mono tracking-wide ${
                    isSquadActive ? "text-cyan-400" : "text-amber-400"
                  }`}
                >
                  {isSquadActive
                    ? "QUICK PLAY (3v3 SQUAD)"
                    : "QUICK PLAY (1v1 DUEL)"}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <span className="text-xs text-slate-400 truncate" style={{ fontFamily: "var(--font-tech)" }}>
                {isSquadActive
                  ? `Queue your squad of ${squadSize} fighters into 3v3 Team Arena`
                  : "Instant matchmaking into the authoritative Havok combat arena"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <Button
              variant="secondary"
              size="md"
              onClick={() => openModal("PARTY")}
              leftIcon={<FaUserGroup className="text-cyan-400" />}
              className="flex-1 sm:flex-initial"
            >
              Squad {party ? `(${squadSize})` : ""}
            </Button>

            <Button
              variant="primary"
              size="md"
              onClick={() => startQueue(isSquadActive ? "3v3" : "1v1")}
              leftIcon={<GiBoxingGlove />}
              className="flex-1 sm:flex-initial shadow-lg"
            >
              Quick Start
            </Button>
          </div>
        </div>

        {/* 2x2 Grid of Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MenuCard
            title="Enter Arena"
            description="Deploy into fast-paced authoritative combat. 1v1 Duels, 3v3 Arena, and 20-Player Free-for-all."
            icon={<GiBoxingGlove className="text-amber-400" />}
            badgeText="LIVE ARENA"
            badgeVariant="emerald"
            badgePulse
            accentColor="amber"
            onClick={() => navigateTo("PLAY_MENU")}
          />

          <MenuCard
            title="Cuadrangular Championship"
            description="4-Participant double elimination tournaments with dynamic brackets and podium ceremonies."
            icon={<GiCrown className="text-red-400" />}
            badgeText="PHASE 20"
            badgeVariant="red"
            accentColor="fire"
            disabled
          />

          <MenuCard
            title="Custom Lobbies"
            description="Create private fighting rooms, configure arena modifiers, and invite friend rivalries."
            icon={<GiRadarDish className="text-cyan-400" />}
            badgeText="PHASE 19"
            badgeVariant="cyan"
            accentColor="cyan"
            disabled
          />

          <MenuCard
            title="Career Dossier"
            description="Review lifetime stats, weapon mastery, combat performance ratios, and victory badges."
            icon={<GiSwordsPower className="text-purple-400" />}
            badgeText="READY"
            badgeVariant="purple"
            accentColor="purple"
            onClick={() => navigateTo("PROFILE")}
          />
        </div>
      </div>
    </ScreenLayout>
  );
}
