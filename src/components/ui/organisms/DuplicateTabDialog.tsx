// ==================================================
// ORGANISM: DUPLICATE TAB BLOCKING OVERLAY
//
// WHAT IT DOES:
// Renders a fullscreen modal blocking interaction in secondary browser tabs,
// preventing duplicate match queuing, concurrent sessions, and GPU overuse.
//
// HOW IT WORKS:
// - Listens to `useSingleTabStore((state) => state.isDuplicateTab)`.
// - If duplicate, renders a high z-index backdrop overlay above all screens.
// - Provides a prominent "Use This Tab Instead" action that broadcasts
//   a takeover event to all other tabs via `claimActiveTab()`.
//
// WHY IT EXISTS:
// Enforces single-active-session client invariants across multiple browser
// windows without requiring intrusive full-account logouts.
// ==================================================

import { FaClone } from "react-icons/fa6";
import { useSingleTabStore } from "../../../store/useSingleTabStore";
import { Button } from "../atoms/Button";

export function DuplicateTabDialog() {
  const isDuplicateTab = useSingleTabStore((state) => state.isDuplicateTab);
  const claimActiveTab = useSingleTabStore((state) => state.claimActiveTab);

  if (!isDuplicateTab) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="duplicate-tab-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none animate-fade-in"
    >
      <div className="relative w-full max-w-md bg-slate-900/95 border-2 border-amber-500/50 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center gap-6 shadow-[0_0_50px_rgba(245,158,11,0.2)]">
        {/* Pulsing clone warning icon */}
        <div className="w-20 h-20 rounded-full bg-amber-950/80 border-2 border-amber-500/60 flex items-center justify-center text-amber-400 text-3xl shadow-[0_0_25px_rgba(245,158,11,0.35)] animate-pulse">
          <FaClone />
        </div>

        {/* Heading & description */}
        <div className="flex flex-col gap-2">
          <h3
            id="duplicate-tab-title"
            className="text-xl font-black uppercase text-amber-300 tracking-wider"
            style={{ fontFamily: "var(--font-game)" }}
          >
            Active In Another Tab
          </h3>
          <p
            className="text-sm text-slate-300 leading-relaxed"
            style={{ fontFamily: "var(--font-tech)" }}
          >
            Thunder Dome Fighter is currently running in another browser tab or window.
            To prevent match desynchronization and conserve GPU resources, this tab has been suspended.
          </p>
        </div>

        {/* Takeover CTA */}
        <Button
          variant="primary"
          size="lg"
          onClick={claimActiveTab}
          className="w-full shadow-[0_0_20px_rgba(6,182,212,0.4)]"
        >
          Use This Tab Instead
        </Button>
      </div>
    </div>
  );
}
