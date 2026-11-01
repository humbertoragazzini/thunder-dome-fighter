// ==================================================
// ORGANISM: CREATE CUSTOM ROOM MODAL DIALOG
//
// WHAT IT DOES:
// Provides an arcade modal dialog allowing players to configure and host
// custom match lobbies (Phase 19 Step 19.2).
//
// HOW IT WORKS:
// - Host inputs custom room name, selects game mode (1v1, 3v3, 4v4, FFA),
//   arena map, score limit (KOs), and match duration.
// - Features a privacy toggle (Public in browser vs Private with room code).
// - Submits configuration to `useCustomLobbyStore.getState().createCustomRoom()`.
// - Automatically handles modal close and loading indicators.
//
// WHY IT EXISTS:
// Gives players complete creative freedom to set up custom duels, team scrims,
// or chaos free-for-all lobbies.
// ==================================================

import { useState } from "react";
import { FaLock, FaGlobe, FaXmark } from "react-icons/fa6";
import { GiBangingGavel, GiCarnivalMask, GiCrossedPistols, GiFist } from "react-icons/gi";
import type { GameModeId } from "../../../../shared/domain/GameMode";
import { useAuthStore } from "../../../store/useAuthStore";
import { useCustomLobbyStore } from "../../../store/useCustomLobbyStore";
import { Button } from "../atoms/Button";
import { Heading } from "../atoms/Heading";
import { Input } from "../atoms/Input";
import { ModalBackdrop } from "../templates/ModalBackdrop";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ModeSelectorItem {
  id: GameModeId;
  name: string;
  capacityText: string;
  defaultScore: number;
  icon: React.ReactNode;
}

const MODES: ModeSelectorItem[] = [
  {
    id: "1v1",
    name: "1v1 Duel",
    capacityText: "2 Players",
    defaultScore: 3,
    icon: <GiFist className="text-amber-400 text-xl" />,
  },
  {
    id: "3v3",
    name: "3v3 Arena",
    capacityText: "6 Players",
    defaultScore: 10,
    icon: <GiBangingGavel className="text-cyan-400 text-xl" />,
  },
  {
    id: "4v4",
    name: "4v4 Brawl",
    capacityText: "8 Players",
    defaultScore: 15,
    icon: <GiCrossedPistols className="text-purple-400 text-xl" />,
  },
  {
    id: "ffa",
    name: "FFA Chaos",
    capacityText: "Up to 20",
    defaultScore: 25,
    icon: <GiCarnivalMask className="text-rose-400 text-xl" />,
  },
];

export function CreateRoomModal({ isOpen, onClose }: CreateRoomModalProps) {
  const player = useAuthStore((state) => state.player);
  const createCustomRoom = useCustomLobbyStore((state) => state.createCustomRoom);
  const isLoading = useCustomLobbyStore((state) => state.isLoading);
  const error = useCustomLobbyStore((state) => state.error);

  const defaultRoomName = player?.playerName ? `${player.playerName}'s Arena` : "Custom Arena";
  const [roomName, setRoomName] = useState(defaultRoomName);
  const [selectedMode, setSelectedMode] = useState<GameModeId>("1v1");
  const [scoreLimit, setScoreLimit] = useState(3);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(3);
  const [isPrivate, setIsPrivate] = useState(false);

  if (!isOpen) return null;

  const handleModeChange = (mode: GameModeId) => {
    setSelectedMode(mode);
    const item = MODES.find((m) => m.id === mode);
    if (item) {
      setScoreLimit(item.defaultScore);
    }
  };

  const handleCreate = async () => {
    await createCustomRoom({
      roomName: roomName.trim() || defaultRoomName,
      gameMode: selectedMode,
      levelId: "thunder-dome-alpha",
      scoreLimit,
      timeLimitSeconds: timeLimitMinutes * 60,
      isPrivate,
    });
    if (!useCustomLobbyStore.getState().error) {
      onClose();
    }
  };

  return (
    <ModalBackdrop isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-xl bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex flex-col">
            <Heading level="h3" color="gold">
              Host Custom Arena
            </Heading>
            <span
              className="text-xs text-slate-400 font-bold uppercase tracking-wider"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              Configure game rules, privacy, and battle parameters
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <FaXmark className="text-lg" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Room Name */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
            Room Name
          </label>
          <Input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="e.g. Beto's Dojo"
            maxLength={32}
          />
        </div>

        {/* Game Mode Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
            Game Mode
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {MODES.map((mode) => {
              const isSelected = selectedMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleModeChange(mode.id)}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-500/10 text-white"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {mode.icon}
                  <span className="text-xs font-bold font-mono tracking-wide">
                    {mode.name}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {mode.capacityText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rule Adjusters: Score Limit & Duration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                Score Limit (KOs)
              </label>
              <span className="text-xs font-mono font-black text-amber-400">
                {scoreLimit} KOs
              </span>
            </div>
            <div className="flex items-center gap-2">
              {[3, 5, 10, 15, 25].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setScoreLimit(preset)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                    scoreLimit === preset
                      ? "bg-amber-500 text-black border-amber-400"
                      : "bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                Time Limit
              </label>
              <span className="text-xs font-mono font-black text-cyan-400">
                {timeLimitMinutes} Min
              </span>
            </div>
            <div className="flex items-center gap-2">
              {[3, 5, 10].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTimeLimitMinutes(preset)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                    timeLimitMinutes === preset
                      ? "bg-cyan-500 text-black border-cyan-400"
                      : "bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Privacy Toggle */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm ${
                isPrivate
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              {isPrivate ? <FaLock /> : <FaGlobe />}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold font-mono text-slate-200">
                {isPrivate ? "Private Match" : "Public Match"}
              </span>
              <span className="text-[11px] text-slate-400">
                {isPrivate
                  ? "Hidden from browser. Requires 6-character room code to join."
                  : "Visible to all fighters in the Room Browser."}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPrivate(!isPrivate)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
              isPrivate ? "bg-rose-500 justify-end" : "bg-slate-700 justify-start"
            }`}
          >
            <div className="bg-white w-4 h-4 rounded-full shadow-md" />
          </button>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" size="md" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleCreate}
            disabled={isLoading || !roomName.trim()}
          >
            {isLoading ? "Creating Lobby..." : "Create & Host Lobby"}
          </Button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
