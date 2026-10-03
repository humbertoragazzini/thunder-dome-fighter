// ==================================================
// TEMPLATE: SCREEN LAYOUT COMPONENT
//
// WHAT IT DOES:
// Wraps application screens in a full-viewport responsive frame with
// ambient arena lighting effects and subtle radial combat textures.
//
// HOW IT WORKS:
// - Renders a full-viewport container with dark slate / obsidian background.
// - Injects subtle radial glow gradients (amber and cyan) to give an arena stadium feel.
// - Supports optional header, content, and footer slots.
//
// WHY IT EXISTS:
// Ensures visual continuity, responsive layout bounds, and atmospheric styling
// across all non-gameplay screens.
// ==================================================

import type { ReactNode } from "react";

export interface ScreenLayoutProps {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function ScreenLayout({
  header,
  children,
  footer,
  className = "",
}: ScreenLayoutProps) {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
      {/* Ambient Arena Lighting Effects */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-amber-500/10 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 right-10 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute top-1/3 -left-40 w-[400px] h-[400px] bg-red-600/10 rounded-full blur-[140px]" />

      {/* Top Header Slot */}
      {header && <header className="relative z-10 shrink-0">{header}</header>}

      {/* Main Content Area */}
      <main className={`relative z-10 flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 md:p-8 ${className}`}>
        {children}
      </main>

      {/* Footer Slot */}
      {footer && <footer className="relative z-10 shrink-0">{footer}</footer>}
    </div>
  );
}
