// ==================================================
// SCREEN: CUSTOM GAME LOBBY PRE-MATCH STAGING
//
// WHAT IT DOES:
// Real-time custom match staging area (Phase 19 Steps 19.3 & 19.4):
// - Interactive team switcher (Team Alpha vs Team Beta vs Spectator).
// - Real-time participant roster showing host crowns, avatars, and ready indicators.
// - Non-host readiness toggle ("I'M READY" / "NOT READY").
// - Host controls: player kick moderation and authoritative match launch.
// - Enforces launch invariants: start button unlocks only when all non-hosts
//   are ready and minimum team requirements are satisfied.
//
// HOW IT WORKS:
// - Subscribes to real-time `CustomLobbyState` changes via Colyseus delta compression.
// - Emits client intent messages (`lobby:switch-team`, `lobby:toggle-ready`,
//   `lobby:kick-player`, `lobby:start-game`).
// - On `lobby:match-launched`, smoothly transitions to `MATCH_LOADING`.
//
// WHY IT EXISTS:
// Dedicated staging arena enabling organized community tournaments, team scrims,
// and private friend battles.
// ==================================================

import { useEffect, useState } from "react";
import {
  FaCheck,
  FaCopy,
  FaCrown,
  FaDoorOpen,
  FaLock,
  FaUserSlash,
} from "react-icons/fa6";
import {
  GiBangingGavel,
  GiCarnivalMask,
  GiCrossedPistols,
  GiFist,
  GiSwordsPower,
} from "react-icons/gi";
import type { GameModeId } from "../../../shared/domain/GameMode";
import { GAME_MODES } from "../../../shared/domain/GameMode";
import { useCustomLobbyStore } from "../../store/useCustomLobbyStore";
import { Badge } from "../ui/atoms/Badge";
import { Button } from "../ui/atoms/Button";
import { Heading } from "../ui/atoms/Heading";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

export function CustomLobbyScreen() {
  const activeRoom = useCustomLobbyStore((state) => state.activeRoom);
  const lobbyState = useCustomLobbyStore((state) => state.lobbyState);
  useCustomLobbyStore((state) => state.lobbyRevision);
  const switchTeam = useCustomLobbyStore((state) => state.switchTeam);
  const toggleReady = useCustomLobbyStore((state) => state.toggleReady);
  const kickPlayer = useCustomLobbyStore((state) => state.kickPlayer);
  const startGame = useCustomLobbyStore((state) => state.startGame);
  const leaveLobby = useCustomLobbyStore((state) => state.leaveLobby);

  const [copied, setCopied] = useState(false);
  const [, setLocalVersion] = useState(0);

  // Directly bind onStateChange listener on activeRoom to guarantee immediate React re-renders on every Colyseus state patch
  useEffect(() => {
    if (!activeRoom) return;

    const handleStateChange = () => {
      setLocalVersion((v) => v + 1);
    };

    activeRoom.onStateChange(handleStateChange);
    return () => {
      if (typeof (activeRoom.onStateChange as any)?.remove === "function") {
        (activeRoom.onStateChange as any).remove(handleStateChange);
      }
    };
  }, [activeRoom]);

  if (!activeRoom || !lobbyState) {
    return (
      <ScreenLayout>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
          <span className="text-sm font-mono text-slate-300">
            Synchronizing custom lobby state...
          </span>
        </div>
      </ScreenLayout>
    );
  }

  const mySessionId = activeRoom.sessionId;
  const myPlayer = lobbyState.players?.get
    ? lobbyState.players.get(mySessionId)
    : (lobbyState.players as any)?.[mySessionId];
  const isHost = myPlayer?.isHost === true;

  const modeId = (lobbyState.gameMode as GameModeId) ?? "1v1";
  const modeDef = GAME_MODES[modeId] ?? GAME_MODES["1v1"];
  const isFFA = modeId === "ffa";

  // Aggregate players by team
  const playersList: any[] = [];
  if (lobbyState.players) {
    if (typeof (lobbyState.players as any).forEach === "function") {
      (lobbyState.players as any).forEach((p: any) => playersList.push(p));
    } else {
      for (const key of Object.keys(lobbyState.players)) {
        playersList.push((lobbyState.players as any)[key]);
      }
    }
  }

  const team0Players = playersList.filter((p) => p.teamIndex === 0);
  const team1Players = playersList.filter((p) => p.teamIndex === 1);
  const spectatorPlayers = playersList.filter((p) => p.teamIndex === -1);
  const activeCombatants = playersList.filter((p) => p.teamIndex >= 0);

  // Launch validation (Step 19.4)
  const nonHostCombatants = activeCombatants.filter((p) => !p.isHost);
  const allNonHostsReady =
    nonHostCombatants.length > 0 && nonHostCombatants.every((p) => p.isReady);
  const hasMinPlayers = activeCombatants.length >= 2;
  const isTeamBalanced = isFFA || (team0Players.length > 0 && team1Players.length > 0);

  const canLaunch = isHost && hasMinPlayers && allNonHostsReady && isTeamBalanced;

  const handleCopyCode = async () => {
    if (lobbyState.roomCode) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(lobbyState.roomCode);
        }
      } catch (err) {
        console.warn("[CustomLobbyScreen] Clipboard error:", err);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getModeIcon = () => {
    switch (modeId) {
      case "1v1":
        return <GiFist className="text-amber-400" />;
      case "3v3":
        return <GiBangingGavel className="text-cyan-400" />;
      case "4v4":
        return <GiCrossedPistols className="text-purple-400" />;
      case "ffa":
        return <GiCarnivalMask className="text-rose-400" />;
      default:
        return <GiSwordsPower className="text-amber-400" />;
    }
  };

  return (
    <ScreenLayout
      header={
        <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex items-center justify-between backdrop-blur-md select-none">
          <Button
            variant="ghost"
            size="sm"
            onClick={leaveLobby}
            leftIcon={<FaDoorOpen />}
          >
            Leave Lobby
          </Button>

          <div className="flex items-center gap-3">
            <span className="text-xl">{getModeIcon()}</span>
            <Heading level="h4" color="gold">
              {lobbyState.roomName}
            </Heading>
            <Badge
              variant={
                modeId === "1v1"
                  ? "amber"
                  : modeId === "3v3"
                    ? "cyan"
                    : modeId === "4v4"
                      ? "purple"
                      : "red"
              }
            >
              {modeId.toUpperCase()}
            </Badge>
          </div>

          {/* Room Code Pill */}
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-amber-500/60 text-xs font-mono font-bold transition-colors cursor-pointer group"
            title="Click to copy room code"
          >
            <span className="text-slate-400 group-hover:text-slate-200">
              {lobbyState.isPrivate ? <FaLock className="inline mr-1 text-rose-400" /> : null}
              CODE:
            </span>
            <span className="text-amber-400 tracking-wider">
              {lobbyState.roomCode}
            </span>
            <FaCopy className="text-slate-500 group-hover:text-amber-400 text-xs" />
            {copied && <span className="text-[10px] text-emerald-400 font-sans">Copied!</span>}
          </button>
        </div>
      }
    >
      <div className="w-full max-w-5xl flex flex-col gap-6 py-4">
        {/* Arena Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md font-mono text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-slate-500">Arena:</span>
            <strong className="text-amber-400">Thunder Dome Alpha</strong>
          </div>
          <div className="flex items-center gap-4 text-slate-300">
            <div>
              <span className="text-slate-500">Score Limit: </span>
              <strong className="text-cyan-400">{lobbyState.scoreLimit} KOs</strong>
            </div>
            <div>
              <span className="text-slate-500">Duration: </span>
              <strong className="text-cyan-400">
                {Math.round(lobbyState.timeLimitSeconds / 60)} Minutes
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Capacity: </span>
              <strong className="text-emerald-400">
                {activeCombatants.length}/{modeDef.maxPlayers}
              </strong>
            </div>
          </div>
        </div>

        {/* Staging Layout: Team Split or Unified FFA */}
        {!isFFA ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Team Alpha (Cyan) */}
            <div className="flex flex-col gap-3 p-5 rounded-3xl bg-slate-900/60 border border-cyan-500/30 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-md shadow-cyan-400/50" />
                  <span className="font-mono font-black text-cyan-300 tracking-wide text-sm">
                    TEAM ALPHA
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    ({team0Players.length}/{modeDef.teamSize})
                  </span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => switchTeam(0)}
                  disabled={myPlayer?.teamIndex === 0 || team0Players.length >= modeDef.teamSize}
                >
                  {myPlayer?.teamIndex === 0 ? "Your Team" : "Join Alpha"}
                </Button>
              </div>

              {/* Roster Cards */}
              <div className="flex flex-col gap-2 min-h-[160px]">
                {team0Players.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-slate-500 italic">
                    Slot open • Click Join Alpha
                  </div>
                ) : (
                  team0Players.map((player) => (
                    <PlayerCard
                      key={player.sessionId}
                      player={player}
                      isSelf={player.sessionId === mySessionId}
                      isHostUser={isHost}
                      onKick={() => kickPlayer(player.sessionId)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Team Beta (Amber) */}
            <div className="flex flex-col gap-3 p-5 rounded-3xl bg-slate-900/60 border border-amber-500/30 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400 shadow-md shadow-amber-400/50" />
                  <span className="font-mono font-black text-amber-300 tracking-wide text-sm">
                    TEAM BETA
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    ({team1Players.length}/{modeDef.teamSize})
                  </span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => switchTeam(1)}
                  disabled={myPlayer?.teamIndex === 1 || team1Players.length >= modeDef.teamSize}
                >
                  {myPlayer?.teamIndex === 1 ? "Your Team" : "Join Beta"}
                </Button>
              </div>

              {/* Roster Cards */}
              <div className="flex flex-col gap-2 min-h-[160px]">
                {team1Players.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-slate-500 italic">
                    Slot open • Click Join Beta
                  </div>
                ) : (
                  team1Players.map((player) => (
                    <PlayerCard
                      key={player.sessionId}
                      player={player}
                      isSelf={player.sessionId === mySessionId}
                      isHostUser={isHost}
                      onKick={() => kickPlayer(player.sessionId)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* FFA Unified Roster */
          <div className="flex flex-col gap-3 p-5 rounded-3xl bg-slate-900/60 border border-rose-500/30 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
              <div className="flex items-center gap-2">
                <GiCarnivalMask className="text-rose-400 text-lg" />
                <span className="font-mono font-black text-rose-300 tracking-wide text-sm">
                  FREE-FOR-ALL BRAWLERS
                </span>
                <span className="text-xs font-mono text-slate-400">
                  ({activeCombatants.length}/{modeDef.maxPlayers})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-[180px]">
              {activeCombatants.map((player) => (
                <PlayerCard
                  key={player.sessionId}
                  player={player}
                  isSelf={player.sessionId === mySessionId}
                  isHostUser={isHost}
                  onKick={() => kickPlayer(player.sessionId)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Spectator Bench (if any or if team mode) */}
        {!isFFA && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">Spectator Bench:</span>
              <div className="flex items-center gap-2">
                {spectatorPlayers.length === 0 ? (
                  <span className="text-slate-600 italic">None</span>
                ) : (
                  spectatorPlayers.map((p) => (
                    <span
                      key={p.sessionId}
                      className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300"
                    >
                      {p.playerName}
                    </span>
                  ))
                )}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => switchTeam(-1)}
              disabled={myPlayer?.teamIndex === -1}
            >
              {myPlayer?.teamIndex === -1 ? "Spectating" : "Move to Spectator"}
            </Button>
          </div>
        )}

        {/* Bottom Control Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 text-xs font-mono">
            {isHost ? (
              <div className="flex flex-col">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <FaCrown /> HOST CONTROLS
                </span>
                <span className="text-slate-400 text-[11px]">
                  {!hasMinPlayers
                    ? "Requires at least 2 fighters to launch match."
                    : !isTeamBalanced
                      ? "Both teams must have at least 1 combatant."
                      : !allNonHostsReady
                        ? "Waiting for all fighters to READY UP."
                        : "All fighters ready! You can start the battle."}
                </span>
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="font-bold text-slate-300">
                  {myPlayer?.isReady ? "YOU ARE READY" : "NOT READY"}
                </span>
                <span className="text-slate-400 text-[11px]">
                  {myPlayer?.isReady
                    ? "Waiting for host to launch the battle..."
                    : "Toggle ready status when you are prepared to fight."}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isHost ? (
              <Button
                variant="primary"
                size="lg"
                onClick={startGame}
                disabled={!canLaunch}
                leftIcon={<GiSwordsPower />}
                className={`w-full sm:w-auto shadow-xl ${
                  canLaunch ? "animate-pulse" : ""
                }`}
              >
                {canLaunch ? "START MATCH" : "WAITING FOR READY"}
              </Button>
            ) : (
              <Button
                variant={myPlayer?.isReady ? "secondary" : "primary"}
                size="lg"
                onClick={toggleReady}
                leftIcon={<FaCheck />}
                className="w-full sm:w-auto"
              >
                {myPlayer?.isReady ? "CANCEL READY" : "I'M READY!"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
}

interface PlayerCardProps {
  player: any;
  isSelf: boolean;
  isHostUser: boolean;
  onKick: () => void;
}

function PlayerCard({ player, isSelf, isHostUser, onKick }: PlayerCardProps) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
        isSelf
          ? "bg-slate-900 border-amber-500/50 shadow-md shadow-amber-500/5"
          : "bg-slate-950/70 border-slate-800"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xs text-amber-400 font-mono">
          {player.playerName.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-slate-200">
            {player.playerName}
          </span>
          {isSelf && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
              YOU
            </span>
          )}
          {player.isHost && (
            <span className="text-amber-400 text-xs" title="Lobby Host">
              <FaCrown />
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {player.isHost ? (
          <Badge variant="amber">
            HOST
          </Badge>
        ) : player.isReady ? (
          <Badge variant="emerald" pulse>
            READY
          </Badge>
        ) : (
          <Badge variant="slate">
            NOT READY
          </Badge>
        )}

        {isHostUser && !player.isHost && (
          <button
            onClick={onKick}
            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
            title="Kick Player"
          >
            <FaUserSlash className="text-xs" />
          </button>
        )}
      </div>
    </div>
  );
}
