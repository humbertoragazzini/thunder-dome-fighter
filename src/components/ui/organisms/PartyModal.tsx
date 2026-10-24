// ==================================================
// ORGANISM: SQUAD & PARTY MODAL DIALOG
//
// WHAT IT DOES:
// Provides a dedicated pre-match squad management modal:
// 1. Party creation with shareable 6-character invite code and 1-click clipboard copy.
// 2. Joining an existing squad by typing/pasting an invite code.
// 3. Member roster inspection showing leader crown, player names, and readiness checkmarks.
// 4. Member readiness toggle ("Ready Up").
// 5. Leader-initiated matchmaking search for the entire group.
// 6. Leaving the squad.
//
// HOW IT WORKS:
// - Renders conditionally when `activeModal === "PARTY"`.
// - Interacts directly with `useMatchmakingStore` and `useAuthStore`.
// - Wrapped inside `ModalBackdrop` with smooth keyboard/backdrop dismissal.
//
// WHY IT EXISTS:
// Enforces Phase 15 and ADR-013 requirements. Enables seamless group assembly
// before queuing for multiplayer combat.
// ==================================================

import { useState } from "react";
import {
  FaCheck,
  FaCopy,
  FaCrown,
  FaDoorOpen,
  FaPlus,
  FaRightToBracket,
  FaUserGroup,
} from "react-icons/fa6";
import {
  GiBangingGavel,
  GiCarnivalMask,
  GiCrossedPistols,
  GiCrossedSwords,
  GiFist,
} from "react-icons/gi";
import type { GameModeId } from "../../../../shared/domain/GameMode.ts";
import { useAuthStore } from "../../../store/useAuthStore";
import { useMatchmakingStore } from "../../../store/useMatchmakingStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { Badge } from "../atoms/Badge";
import { Button } from "../atoms/Button";
import { Heading } from "../atoms/Heading";
import { Input } from "../atoms/Input";
import { ModalBackdrop } from "../templates/ModalBackdrop";

interface ModeOption {
  id: GameModeId;
  name: string;
  teamSize: number;
  subtitle: string;
  status: "active" | "phase17";
  icon: React.ReactNode;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: "3v3",
    name: "3v3 Team Arena",
    teamSize: 3,
    subtitle: "2 teams of 3 • 10 KOs",
    status: "active",
    icon: <GiBangingGavel className="text-cyan-400" />,
  },
  {
    id: "1v1",
    name: "1v1 Arena Duel",
    teamSize: 1,
    subtitle: "1 vs 1 duel • 3 KOs",
    status: "active",
    icon: <GiFist className="text-amber-400" />,
  },
  {
    id: "4v4",
    name: "4v4 Squad Brawl",
    teamSize: 4,
    subtitle: "2 teams of 4 • 15 KOs",
    status: "phase17",
    icon: <GiCrossedPistols className="text-purple-400" />,
  },
  {
    id: "ffa",
    name: "20-Player FFA",
    teamSize: 1,
    subtitle: "Free-for-all chaos",
    status: "active",
    icon: <GiCarnivalMask className="text-orange-400" />,
  },
];

export function PartyModal() {
  const activeModal = useNavigationStore((state) => state.activeModal);
  const closeModal = useNavigationStore((state) => state.closeModal);

  const authPlayer = useAuthStore((state) => state.player);
  const party = useMatchmakingStore((state) => state.party);
  const createParty = useMatchmakingStore((state) => state.createParty);
  const joinParty = useMatchmakingStore((state) => state.joinParty);
  const leaveParty = useMatchmakingStore((state) => state.leaveParty);
  const toggleReady = useMatchmakingStore((state) => state.toggleReady);
  const startQueue = useMatchmakingStore((state) => state.startQueue);

  const [inputCode, setInputCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameModeId>("3v3");

  if (activeModal !== "PARTY") {
    return null;
  }

  const isLeader = party?.leaderPlayerId === authPlayer?.id;
  const membersList = party ? Object.values(party.members) : [];
  const currentMember = authPlayer?.id && party ? party.members[authPlayer.id] : null;
  const allMembersReady = membersList.length > 0 && membersList.every((m) => m.isReady);

  const squadSize = membersList.length;
  // If squad has > 1 member and selectedMode is 1v1 or ffa, fallback to 3v3
  const effectiveMode: GameModeId =
    squadSize > 1 && (selectedMode === "1v1" || selectedMode === "ffa")
      ? "3v3"
      : selectedMode;

  const currentOption = MODE_OPTIONS.find((m) => m.id === effectiveMode);
  const isModeValid = Boolean(
    currentOption &&
      currentOption.status === "active" &&
      squadSize <= currentOption.teamSize &&
      !(effectiveMode === "ffa" && squadSize > 1),
  );

  const handleCopyCode = async () => {
    if (!party) return;
    try {
      await navigator.clipboard.writeText(party.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleJoin = async () => {
    if (!inputCode.trim()) return;
    setErrorMsg(null);
    try {
      await joinParty(inputCode.trim());
      setInputCode("");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to join squad.");
    }
  };

  const handleCreate = async () => {
    setErrorMsg(null);
    try {
      await createParty();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create squad.");
    }
  };

  const handleStartQueue = async () => {
    if (!isModeValid) return;
    closeModal();
    await startQueue(effectiveMode);
  };

  return (
    <ModalBackdrop isOpen onClose={closeModal}>
      <div className="w-full max-w-lg flex flex-col gap-6 p-6 sm:p-8 rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-lg">
              <FaUserGroup />
            </div>
            <div>
              <Heading level="h3" color="gold">
                Fighter Squad
              </Heading>
              <p className="text-xs text-slate-400" style={{ fontFamily: "var(--font-tech)" }}>
                Assemble allies and queue together
              </p>
            </div>
          </div>

          {party && (
            <Badge variant="cyan">
              {membersList.length} / {party.maxMembers}
            </Badge>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* State A: Not In Party */}
        {!party && (
          <div className="flex flex-col gap-6 py-2">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)" }}>
                Start a New Squad
              </span>
              <Button
                variant="primary"
                size="md"
                onClick={handleCreate}
                leftIcon={<FaPlus />}
                className="w-full"
              >
                Create Squad
              </Button>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-slate-800" />
              <span className="absolute px-3 bg-slate-900 text-xs font-mono text-slate-500">
                OR
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)" }}>
                Join Friend's Squad
              </span>
              <div className="flex items-center gap-2">
                <Input
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="ENTER 6-DIGIT CODE"
                  maxLength={6}
                  className="font-mono text-center tracking-widest text-base uppercase"
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleJoin}
                  disabled={inputCode.trim().length !== 6}
                  leftIcon={<FaRightToBracket />}
                >
                  Join
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* State B: In Party */}
        {party && (
          <div className="flex flex-col gap-5">
            {/* Shareable Invite Code Box */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400" style={{ fontFamily: "var(--font-tech)" }}>
                  Invite Code
                </span>
                <span className="font-mono text-2xl font-black text-cyan-400 tracking-wider">
                  {party.inviteCode}
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyCode}
                leftIcon={copied ? <FaCheck className="text-emerald-400" /> : <FaCopy />}
              >
                {copied ? "Copied!" : "Copy Code"}
              </Button>
            </div>

            {/* Members Roster */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400" style={{ fontFamily: "var(--font-tech)" }}>
                Squad Roster ({membersList.length}/{party.maxMembers})
              </span>

              <div className="flex flex-col gap-2">
                {membersList.map((member) => {
                  const memberIsLeader = member.playerId === party.leaderPlayerId;
                  const isCurrent = member.playerId === authPlayer?.id;

                  return (
                    <div
                      key={member.playerId}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isCurrent
                          ? "bg-slate-850/80 border-cyan-500/40 shadow-md"
                          : "bg-slate-950/60 border-slate-800/80"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 text-sm shrink-0">
                          {memberIsLeader ? <FaCrown className="text-amber-400" /> : <GiFist />}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-200 truncate">
                              {member.playerName}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] text-cyan-400 font-mono">
                                (You)
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {memberIsLeader ? "Squad Leader" : "Fighter"}
                          </span>
                        </div>
                      </div>

                      <Badge variant={member.isReady ? "emerald" : "slate"}>
                        {member.isReady ? "READY" : "NOT READY"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Game Mode Selection */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-bold text-slate-300 uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-tech)" }}
                >
                  Target Match Mode
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {isLeader ? "Leader Selection" : "Selected by Leader"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => {
                  const isSelected = effectiveMode === opt.id;
                  const isSquadTooLarge = squadSize > opt.teamSize;
                  const isPhase17 = opt.status === "phase17";
                  const isFfaSquad = opt.id === "ffa" && squadSize > 1;
                  const isDisabled = !isLeader || isPhase17 || isSquadTooLarge || isFfaSquad;

                  let badgeLabel = "";
                  let badgeVariant: "slate" | "cyan" | "purple" = "slate";

                  if (isPhase17) {
                    badgeLabel = "PHASE 17";
                    badgeVariant = "purple";
                  } else if (isSquadTooLarge) {
                    badgeLabel = `MAX ${opt.teamSize}`;
                    badgeVariant = "slate";
                  } else if (isFfaSquad) {
                    badgeLabel = "SOLO ONLY";
                    badgeVariant = "slate";
                  } else if (opt.id === "3v3" && squadSize > 1) {
                    badgeLabel = `${squadSize}/3 SQUAD`;
                    badgeVariant = "cyan";
                  }

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => setSelectedMode(opt.id)}
                      className={`flex flex-col p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.2)] text-white"
                          : isDisabled
                            ? "bg-slate-950/40 border-slate-800/50 text-slate-500 cursor-not-allowed opacity-60"
                            : "bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full mb-1">
                        <span className="text-xs font-bold truncate flex items-center gap-1.5">
                          {opt.icon}
                          {opt.name}
                        </span>
                        {badgeLabel && (
                          <Badge variant={badgeVariant} className="text-[9px] px-1.5 py-0">
                            {badgeLabel}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {opt.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Informative squad backfill hint for 3v3 */}
              {effectiveMode === "3v3" && squadSize === 2 && (
                <div className="p-2 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-[11px] text-cyan-300/90 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                  <span>
                    Squad of 2 will fight together on Team Alpha/Beta and be backfilled with 1 solo teammate.
                  </span>
                </div>
              )}
              {effectiveMode === "3v3" && squadSize === 3 && (
                <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-emerald-300/90 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>
                    Full 3-player squad! You will be placed together on the same team against the opposing squad.
                  </span>
                </div>
              )}
            </div>

            {/* Squad Actions */}
            <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800/80">
              {/* Ready Up Button (if not leader) */}
              {!isLeader && currentMember && (
                <Button
                  variant={currentMember.isReady ? "secondary" : "primary"}
                  size="md"
                  onClick={toggleReady}
                  leftIcon={<FaCheck />}
                  className="w-full"
                >
                  {currentMember.isReady ? "Mark Not Ready" : "Ready Up"}
                </Button>
              )}

              {/* Find Match Button (Leader only) */}
              {isLeader && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleStartQueue}
                  disabled={!allMembersReady || !isModeValid}
                  leftIcon={<GiCrossedSwords />}
                  className="w-full shadow-lg"
                >
                  {!allMembersReady
                    ? "Waiting for Squad to Ready Up..."
                    : !isModeValid
                      ? "Selected Mode Unavailable for Squad"
                      : `Find Match (${currentOption?.name || "Queue"})`}
                </Button>
              )}

              {/* Leave Squad */}
              <Button
                variant="ghost"
                size="sm"
                onClick={leaveParty}
                leftIcon={<FaDoorOpen />}
                className="w-full text-slate-400 hover:text-rose-400"
              >
                Leave Squad
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
