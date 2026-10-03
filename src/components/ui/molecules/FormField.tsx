// ==================================================
// MOLECULE: FORM FIELD COMPONENT
//
// WHAT IT DOES:
// Assembles a labeled input container complete with optional helper text,
// left/right icons, and animated validation error alerts.
//
// HOW IT WORKS:
// - Composes label typography, the `Input` atom, and an error message box.
// - Binds HTML `id` and `htmlFor` for form accessibility.
//
// WHY IT EXISTS:
// Ensures uniform form layout and validation messaging for auth and settings screens.
// ==================================================

import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "../atoms/Input";

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function FormField({
  id,
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = "",
  ...inputProps
}: FormFieldProps) {
  const inputId = id || `field-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      <label
        htmlFor={inputId}
        className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between select-none"
        style={{ fontFamily: "var(--font-tech)" }}
      >
        <span>{label}</span>
      </label>

      <Input
        id={inputId}
        error={error}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        {...inputProps}
      />

      {error ? (
        <span
          className="text-xs font-semibold text-red-400 mt-0.5 flex items-center gap-1"
          style={{ fontFamily: "var(--font-tech)" }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
          {error}
        </span>
      ) : helperText ? (
        <span className="text-xs text-slate-500 mt-0.5" style={{ fontFamily: "var(--font-tech)" }}>
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
