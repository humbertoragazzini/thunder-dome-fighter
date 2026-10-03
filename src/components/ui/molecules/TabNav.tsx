// ==================================================
// MOLECULE: ARCADE TAB NAVIGATION COMPONENT
//
// WHAT IT DOES:
// Renders an energetic segmented control / tab switcher with active glow,
// tactile sound-ready buttons, and icons.
//
// HOW IT WORKS:
// - Manages or accepts an active tab identifier.
// - Highlights the active tab with an amber-gold gradient and push-down depth.
//
// WHY IT EXISTS:
// Used in the Auth screen (Sign In vs Register), profile tabs, and settings.
// ==================================================

import type { ReactNode } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

export interface TabNavProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onTabChange: (id: T) => void;
  className?: string;
}

export function TabNav<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}: TabNavProps<T>) {
  return (
    <div
      className={`flex items-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl select-none w-full ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            style={{ fontFamily: "var(--font-game)" }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm md:text-base font-bold tracking-wider transition-all duration-100 cursor-pointer ${
              isActive
                ? "bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 shadow-[0_2px_8px_rgba(245,158,11,0.35)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            {tab.icon && <span className="text-base">{tab.icon}</span>}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
