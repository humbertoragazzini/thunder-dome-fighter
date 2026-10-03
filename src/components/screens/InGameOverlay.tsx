// ==================================================
// SCREEN: IN-GAME HUD & PAUSE OVERLAY
//
// WHAT IT DOES:
// Renders the heads-up display (HUD) over the 3D Babylon.js canvas during
// active combat, providing player vitals, arena room status, controls hints,
// and pause menu controls.
//
// HOW IT WORKS:
// - Overlays transparent, non-blocking UI layers (`pointer-events-none` on background,
//   `pointer-events-auto` on interactive controls).
// - Listens to `Escape` key to toggle `PauseMenuDialog`.
// - Displays authoritative physics tick rate and room connectivity.
//
// WHY IT EXISTS:
// Provides vital in-match context and clean exit options from the 3D viewport.
// ==================================================

import { useEffect, useState } from "react";
import { FaBars } from "react-icons/fa6";
import { GiGamepad, GiLightningShield } from "react-icons/gi";
import { useAppStore } from "../../store/useAppStore";
import { useAuthStore } from "../../store/useAuthStore";
import { Badge } from "../ui/atoms/Badge";
import { Button } from "../ui/atoms/Button";
import { PauseMenuDialog } from "../ui/organisms/PauseMenuDialog";

export function InGameOverlay() {
  const [isPauseOpen, setIsPauseOpen] = useState(false);

  const room = useAppStore((state) => state.room);
  const player = useAuthStore((state) => state.player);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPauseOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const roomName =
    (room as unknown as { metadata?: { serverName?: string } })?.metadata?.serverName ??
    (room?.name ? `Room ${room.name}` : "Thunder Dome Arena");
  const playerName = player?.playerName ?? "Fighter";

  return (
    <>
      <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-4 md:p-6 select-none">
        {/* Top Bar: Room Title, Player Tag & Pause Button */}
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
                <Badge variant="emerald" pulse>
                  Live
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

        {/* Bottom Bar: Controls Guide & Engine Badge */}
        <div className="flex items-end justify-between w-full">
          {/* Controls Hints */}
          <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-3.5 py-2 rounded-xl text-xs text-slate-300 shadow-lg">
            <GiGamepad className="text-amber-400 text-lg" />
            <span style={{ fontFamily: "var(--font-tech)" }}>
              Drive/Move: <strong className="text-amber-400">WASD</strong> or <strong className="text-amber-400">Arrow Keys</strong>
            </span>
          </div>

          {/* Physics Tick Badge */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-xl text-[11px] text-slate-400 font-mono shadow-lg">
            Authoritative Havok • 30 Hz Sync
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
