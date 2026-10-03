// ==================================================
// ATOM: ARCADE BUTTON COMPONENT
//
// WHAT IT DOES:
// Renders an energetic, tactile, arcade-styled button with sound-ready
// interaction hooks, loading spinners, and playful visual depth.
//
// HOW IT WORKS:
// - Uses custom font (`font-game` / `font-arcade`) with bouncy 3D push-down effects (`active:translate-y-1`).
// - Applies variant color schemes: `primary` (neon amber), `danger` (crimson red),
//   `accent` (cyan), `secondary` (slate), and `ghost`.
// - Supports `isLoading` with an integrated spin animation and disabled states.
//
// WHY IT EXISTS:
// Serves as the fundamental click interaction primitive across all menus and dialogs.
// ==================================================

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "danger" | "accent" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 font-black border-2 border-amber-300 shadow-[0_4px_0_#92400e] hover:brightness-110 active:shadow-[0_0px_0_#92400e] active:translate-y-1",
  danger:
    "bg-gradient-to-b from-red-500 to-red-700 text-white font-black border-2 border-red-400 shadow-[0_4px_0_#7f1d1d] hover:brightness-110 active:shadow-[0_0px_0_#7f1d1d] active:translate-y-1",
  accent:
    "bg-gradient-to-b from-cyan-400 to-cyan-600 text-slate-950 font-black border-2 border-cyan-300 shadow-[0_4px_0_#0e7490] hover:brightness-110 active:shadow-[0_0px_0_#0e7490] active:translate-y-1",
  secondary:
    "bg-gradient-to-b from-slate-700 to-slate-800 text-slate-100 font-bold border-2 border-slate-600 shadow-[0_4px_0_#1e293b] hover:bg-slate-700 active:shadow-[0_0px_0_#1e293b] active:translate-y-1",
  ghost:
    "bg-transparent text-slate-300 font-bold border-2 border-transparent hover:border-slate-700 hover:bg-slate-800/50 active:translate-y-0.5",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "text-sm px-3 py-1.5 rounded-md gap-1.5 tracking-wide",
  md: "text-base px-5 py-2.5 rounded-lg gap-2 tracking-wider",
  lg: "text-xl px-7 py-3.5 rounded-xl gap-3 tracking-widest uppercase",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      style={{ fontFamily: "var(--font-game)" }}
      className={`inline-flex items-center justify-center select-none cursor-pointer transition-all duration-75 text-shadow-arcade ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${
        isDisabled ? "opacity-50 cursor-not-allowed pointer-events-none filter grayscale" : ""
      } ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
}
