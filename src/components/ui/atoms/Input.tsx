// ==================================================
// ATOM: ARCADE INPUT COMPONENT
//
// WHAT IT DOES:
// Provides a styled, accessible text/password form input tailored
// for fighting game menus with focus glow rings and state borders.
//
// HOW IT WORKS:
// - Uses `var(--font-tech)` for sharp readability of credentials and player handles.
// - Supports error state styling with crimson borders and error messages.
// - Integrates left/right icon slots for password reveal or category icons.
//
// WHY IT EXISTS:
// Ensures consistent form inputs with keyboard accessibility and error states.
// ==================================================

import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | null;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Input({
  error,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}: InputProps) {
  return (
    <div className="relative w-full">
      {leftIcon && (
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          {leftIcon}
        </div>
      )}
      <input
        disabled={disabled}
        className={`w-full bg-slate-900/90 text-slate-100 placeholder-slate-500 rounded-lg px-3.5 py-2.5 text-base border-2 transition-all duration-150 outline-none ${
          leftIcon ? "pl-10" : ""
        } ${rightIcon ? "pr-10" : ""} ${
          error
            ? "border-red-500 focus:border-red-400 focus:ring-2 focus:ring-red-500/20"
            : "border-slate-700/80 hover:border-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
        } ${disabled ? "opacity-50 cursor-not-allowed bg-slate-950" : ""} ${className}`}
        style={{ fontFamily: "var(--font-tech)" }}
        {...props}
      />
      {rightIcon && (
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400">
          {rightIcon}
        </div>
      )}
    </div>
  );
}
