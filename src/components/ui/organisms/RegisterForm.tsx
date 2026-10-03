// ==================================================
// ORGANISM: REGISTER FORM COMPONENT
//
// WHAT IT DOES:
// Manages registration for new combatants, validating email, public player handle,
// and password constraints.
//
// HOW IT WORKS:
// - Validates player name length (3-24 characters) and password length (8-128 characters).
// - Dispatches `useAuthStore.register({ email, playerName, password })`.
// - On success, triggers `useNavigationStore.navigateTo("MAIN_MENU")`.
// - Displays backend duplicate errors (e.g., player handle already claimed).
//
// WHY IT EXISTS:
// Ensures clean onboarding of new players with validation and feedback.
// ==================================================

import { useState, type FormEvent } from "react";
import { FaEnvelope, FaLock, FaUserNinja } from "react-icons/fa6";
import { GiFist } from "react-icons/gi";
import { useAuthStore } from "../../../store/useAuthStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { Button } from "../atoms/Button";
import { FormField } from "../molecules/FormField";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const storeError = useAuthStore((state) => state.error);
  const navigateTo = useNavigationStore((state) => state.navigateTo);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const cleanEmail = email.trim();
    const cleanName = playerName.trim();

    if (!cleanEmail) {
      setLocalError("Email address is required.");
      return;
    }

    if (cleanName.length < 3 || cleanName.length > 24) {
      setLocalError("Fighter name must be between 3 and 24 characters.");
      return;
    }

    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters long.");
      return;
    }

    try {
      await register({
        email: cleanEmail,
        playerName: cleanName,
        password,
      });
      // Transition to Main Menu on registration success
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
        placeholder="champion@thunderdome.gg"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        leftIcon={<FaEnvelope />}
        required
        autoComplete="email"
      />

      <FormField
        label="Fighter Handle (Public Tag)"
        type="text"
        placeholder="ThunderStriker99"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        leftIcon={<FaUserNinja />}
        helperText="3 to 24 characters. Displayed in matches & leaderboards."
        required
        autoComplete="username"
      />

      <FormField
        label="Password"
        type="password"
        placeholder="Minimum 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        leftIcon={<FaLock />}
        required
        autoComplete="new-password"
      />

      <div className="pt-2">
        <Button
          type="submit"
          variant="danger"
          size="lg"
          isLoading={isLoading}
          leftIcon={<GiFist className="text-2xl" />}
          className="w-full"
        >
          {isLoading ? "Creating Fighter..." : "Claim Fighter License"}
        </Button>
      </div>
    </form>
  );
}
