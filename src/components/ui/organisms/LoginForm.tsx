// ==================================================
// ORGANISM: LOGIN FORM COMPONENT
//
// WHAT IT DOES:
// Manages the user credentials form for authenticating returning fighters.
//
// HOW IT WORKS:
// - Binds email and password states with inline validation.
// - Dispatches `useAuthStore.login({ email, password })`.
// - On success, triggers `useNavigationStore.navigateTo("MAIN_MENU")`.
// - Surfaces backend error envelopes (e.g. 401 invalid credentials) in a styled error banner.
//
// WHY IT EXISTS:
// Encapsulates authentication input logic into an isolated, reusable organism.
// ==================================================

import { useState, type FormEvent } from "react";
import { FaEnvelope, FaLock } from "react-icons/fa6";
import { GiPunchBlast } from "react-icons/gi";
import { useAuthStore } from "../../../store/useAuthStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { Button } from "../atoms/Button";
import { FormField } from "../molecules/FormField";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const storeError = useAuthStore((state) => state.error);
  const navigateTo = useNavigationStore((state) => state.navigateTo);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError("Email address is required.");
      return;
    }

    if (!password) {
      setLocalError("Password is required.");
      return;
    }

    try {
      await login({ email: email.trim(), password });
      // Transition to Main Menu on successful login
      navigateTo("MAIN_MENU");
    } catch {
      // Store already captures error message
    }
  };

  const displayError = localError || storeError;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      {displayError && (
        <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-red-200 text-xs flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-ping" />
          <span className="font-semibold">{displayError}</span>
        </div>
      )}

      <FormField
        label="Email Address"
        type="email"
        placeholder="fighter@thunderdome.gg"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        leftIcon={<FaEnvelope />}
        required
        autoComplete="email"
      />

      <FormField
        label="Password"
        type="password"
        placeholder="••••••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        leftIcon={<FaLock />}
        required
        autoComplete="current-password"
      />

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          leftIcon={<GiPunchBlast className="text-2xl" />}
          className="w-full"
        >
          {isLoading ? "Authenticating..." : "Enter the Dome"}
        </Button>
      </div>
    </form>
  );
}
