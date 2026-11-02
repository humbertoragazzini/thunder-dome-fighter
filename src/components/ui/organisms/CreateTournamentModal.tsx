// ==================================================
// ORGANISM: CREATE TOURNAMENT CHAMPIONSHIP MODAL
//
// WHAT IT DOES:
// Provides an arcade modal dialog allowing fighters to host a single-elimination
// tournament championship (Phase 21 Steps 21.1 & 21.2).
//
// HOW IT WORKS:
// - Host inputs tournament title, chooses participant capacity:
//   - 4 Fighters (Cuadrangular: Semifinals -> Final)
//   - 8 Fighters (Octagonal: Quarterfinals -> Semifinals -> Final)
//   - 16 Fighters (Sweet 16: Round of 16 -> Quarters -> Semis -> Final)
// - Configures score limits (3, 5, 7 KOs) and match durations (3m, 4m, 5m).
// - Features privacy toggle (Public vs Private code) and direct Code Joiner.
// - Submits configuration to `useTournamentStore.getState().createTournament()`.
//
// WHY IT EXISTS:
// Gateway to initiating official 1v1 bracket tournaments.
// ==================================================

import { useState } from "react";
import { FaCrown, FaGlobe, FaLock, FaXmark } from "react-icons/fa6";
import { GiTrophyCup, GiCrossedSwords, GiFist } from "react-icons/gi";
import { useAuthStore } from "../../../store/useAuthStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { useTournamentStore } from "../../../store/useTournamentStore";
import { Button } from "../atoms/Button";
import { Heading } from "../atoms/Heading";
import { Input } from "../atoms/Input";
import { ModalBackdrop } from "../templates/ModalBackdrop";

interface CreateTournamentModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface CapacityOption {
  capacity: number;
  label: string;
  sublabel: string;
  roundsText: string;
  icon: React.ReactNode;
}

const CAPACITIES: CapacityOption[] = [
  {
    capacity: 4,
    label: "Cuadrangular",
    sublabel: "4 Fighters",
    roundsText: "2 Semifinals • 1 Grand Final",
    icon: <GiTrophyCup className="text-amber-400 text-xl" />,
  },
  {
    capacity: 8,
    label: "Octagonal",
    sublabel: "8 Fighters",
    roundsText: "4 Quarters • 2 Semis • 1 Final",
    icon: <GiCrossedSwords className="text-cyan-400 text-xl" />,
  },
  {
    capacity: 16,
    label: "Major 16",
    sublabel: "16 Fighters",
    roundsText: "Round of 16 • Quarters • Semis • Final",
    icon: <FaCrown className="text-purple-400 text-xl" />,
  },
];

export function CreateTournamentModal(props: CreateTournamentModalProps = {}) {
  const activeModal = useNavigationStore((state) => state.activeModal);
  const closeModalNav = useNavigationStore((state) => state.closeModal);

  const isOpen = props.isOpen !== undefined ? props.isOpen : activeModal === "CREATE_TOURNAMENT";
  const onClose = props.onClose ?? closeModalNav;

  const player = useAuthStore((state) => state.player);
  const createTournament = useTournamentStore((state) => state.createTournament);
  const joinByRoomCode = useTournamentStore((state) => state.joinByRoomCode);
  const isLoading = useTournamentStore((state) => state.isLoading);
  const error = useTournamentStore((state) => state.error);
  const clearError = useTournamentStore((state) => state.clearError);

  const [activeTab, setActiveTab] = useState<"CREATE" | "JOIN">("CREATE");
  const defaultTitle = player?.playerName ? `${player.playerName}'s Championship` : "Thunder Dome Invitational";
  const [tournamentName, setTournamentName] = useState(defaultTitle);
  const [capacity, setCapacity] = useState(4);
  const [scoreLimit, setScoreLimit] = useState(5);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(3);
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");

  if (!isOpen) return null;

  const handleClose = () => {
    clearError();
    onClose();
  };

  const handleCreate = async () => {
    await createTournament({
      tournamentName: tournamentName.trim() || defaultTitle,
      participantCapacity: capacity,
      scoreLimit,
      timeLimitSeconds: timeLimitMinutes * 60,
      isPrivate,
    });
    if (!useTournamentStore.getState().error) {
      onClose();
    }
  };

  const handleJoinWithCode = async () => {
    if (!joinCodeInput.trim()) return;
    await joinByRoomCode(joinCodeInput.trim().toUpperCase());
    if (!useTournamentStore.getState().error) {
      onClose();
    }
  };

  return (
    <ModalBackdrop isOpen={isOpen} onClose={handleClose}>
      <div
        className="w-full max-w-xl bg-slate-900/95 border border-amber-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col gap-6 text-slate-100 animate-in fade-in zoom-in-95 duration-200 select-none max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <GiTrophyCup className="text-2xl" />
            </div>
            <div>
              <Heading level="h3" color="gold">
                Tournament Championship Hub
              </Heading>
              <p className="text-xs text-slate-400 font-mono">
                Single-Elimination Knockout • Pure Authoritative Combat
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1"
          >
            <FaXmark className="text-lg" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-950/80 border border-slate-800/80 font-mono text-xs">
          <button
            onClick={() => {
              clearError();
              setActiveTab("CREATE");
            }}
            className={`py-2 px-4 rounded-xl font-bold transition-all ${
              activeTab === "CREATE"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Create Tournament
          </button>
          <button
            onClick={() => {
              clearError();
              setActiveTab("JOIN");
            }}
            className={`py-2 px-4 rounded-xl font-bold transition-all ${
              activeTab === "JOIN"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Join with Code
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        {activeTab === "CREATE" ? (
          <div className="flex flex-col gap-5">
            {/* Tournament Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Tournament Title
              </label>
              <Input
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                maxLength={32}
                placeholder="Thunder Dome Invitational"
                className="w-full font-mono text-sm"
              />
            </div>

            {/* Capacity Sizing Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center justify-between">
                <span>Tournament Capacity</span>
                <span className="text-amber-400 font-normal">
                  {capacity === 4 ? "Phase 21 Cuadrangular" : `${capacity} Combatants`}
                </span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {CAPACITIES.map((c) => {
                  const isSelected = capacity === c.capacity;
                  return (
                    <button
                      key={c.capacity}
                      type="button"
                      onClick={() => setCapacity(c.capacity)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-all ${
                        isSelected
                          ? "bg-amber-500/20 border-amber-500/60 shadow-[0_0_15px_rgba(251,191,36,0.25)]"
                          : "bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="p-1.5 rounded-xl bg-slate-900 border border-slate-700/60">
                        {c.icon}
                      </div>
                      <span className="font-bold text-xs text-slate-200 font-mono">
                        {c.label}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {c.sublabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                {CAPACITIES.find((c) => c.capacity === capacity)?.roundsText}
              </p>
            </div>

            {/* Rules: Score Limit & Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  KO Score Limit
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[3, 5, 7].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setScoreLimit(score)}
                      className={`py-2 rounded-xl text-xs font-bold font-mono border transition-all ${
                        scoreLimit === score
                          ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {score} KOs
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Match Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[3, 4, 5].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setTimeLimitMinutes(mins)}
                      className={`py-2 rounded-xl text-xs font-bold font-mono border transition-all ${
                        timeLimitMinutes === mins
                          ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Privacy Setting */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Access & Visibility
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all ${
                    !isPrivate
                      ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FaGlobe className="text-base shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-xs font-mono">Public Tournament</span>
                    <span className="text-[10px] text-slate-400 truncate">Visible in browser</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all ${
                    isPrivate
                      ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FaLock className="text-base shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-xs font-mono">Private Bracket</span>
                    <span className="text-[10px] text-slate-400 truncate">Requires 6-char code</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" size="md" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleCreate}
                disabled={isLoading}
                leftIcon={<GiFist />}
                className="shadow-lg shadow-amber-500/20"
              >
                {isLoading ? "Creating Tournament..." : "Create & Enter Lobby"}
              </Button>
            </div>
          </div>
        ) : (
          /* Join with Code Tab */
          <div className="flex flex-col gap-5 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Enter 6-Character Tournament Code
              </label>
              <Input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="e.g. TRN89X"
                className="w-full font-mono text-center text-2xl tracking-[0.3em] font-black py-4 uppercase bg-slate-950/90 border-slate-700"
                autoFocus
              />
              <p className="text-xs text-slate-400 font-mono text-center">
                Ask the tournament organizer for the private access code.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4">
              <Button variant="ghost" size="md" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleJoinWithCode}
                disabled={isLoading || joinCodeInput.trim().length < 6}
                leftIcon={<GiTrophyCup />}
                className="shadow-lg"
              >
                {isLoading ? "Joining..." : "Join Championship"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
