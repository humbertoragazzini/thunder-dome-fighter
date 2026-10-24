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
import { GiCrossedSwords, GiFist, GiPodiumWinner } from "react-icons/gi";
import { useAuthStore } from "../../../store/useAuthStore";
import { useMatchmakingStore } from "../../../store/useMatchmakingStore";
import { useNavigationStore } from "../../../store/useNavigationStore";
import { Badge } from "../atoms/Badge";
import { Button } from "../atoms/Button";
import { Heading } from "../atoms/Heading";
import { Input } from "../atoms/Input";
import { ModalBackdrop } from "../templates/ModalBackdrop";

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

  if (activeModal !== "PARTY") {
    return null;
  }

  const isLeader = party?.leaderPlayerId === authPlayer?.id;
  const membersList = party ? Object.values(party.members) : [];
  const currentMember = authPlayer?.id && party ? party.members[authPlayer.id] : null;
  const allMembersReady = membersList.length > 0 && membersList.every((m) => m.isReady);

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
    closeModal();
    await startQueue("1v1");
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
                  disabled={!allMembersReady}
                  leftIcon={<GiCrossedSwords />}
                  className="w-full shadow-lg"
                >
                  {allMembersReady
                    ? "Find Match (Quick Play 1v1)"
                    : "Waiting for Squad to Ready Up..."}
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
