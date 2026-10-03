// ==================================================
// TEMPLATE: MODAL BACKDROP COMPONENT
//
// WHAT IT DOES:
// Provides an accessible, animated modal dialog shell with backdrop blur,
// click-outside dismissal, and Escape keyboard shortcut listener.
//
// HOW IT WORKS:
// - Mounts an absolute overlay above the viewport with `backdrop-blur-md`.
// - Captures the `Escape` key event to trigger `onClose()`.
// - Prevents scroll propagation to underlying layers.
//
// WHY IT EXISTS:
// Houses popups such as the Fighter Profile, Error Modal, and Pause Menu.
// ==================================================

import { useEffect, type ReactNode } from "react";
import { FaXmark } from "react-icons/fa6";

export interface ModalBackdropProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function ModalBackdrop({
  isOpen,
  onClose,
  title,
  icon,
  children,
  maxWidth = "md",
  className = "",
}: ModalBackdropProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      {/* Click outside to close container */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Box */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 w-full ${maxWidthMap[maxWidth]} bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-700/80 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh] ${className}`}
      >
        {/* Header Bar */}
        {(title || icon) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60 select-none">
            <div className="flex items-center gap-3">
              {icon && <span className="text-2xl text-amber-400">{icon}</span>}
              {title && (
                <h3
                  className="text-xl font-black uppercase tracking-wider text-slate-100"
                  style={{ fontFamily: "var(--font-game)" }}
                >
                  {title}
                </h3>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <FaXmark className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
