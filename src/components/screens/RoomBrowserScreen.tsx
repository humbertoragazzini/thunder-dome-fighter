// ==================================================
// SCREEN: CUSTOM ROOM BROWSER & LOBBY DISCOVERY
//
// WHAT IT DOES:
// Provides an arcade lobby browser interface (Phase 19 Step 19.1):
// - Lists active public custom match lobbies with live player counts, host info,
//   game mode, arena, and score/time limits.
// - Supports mode filtering (All, 1v1, 3v3, 4v4, FFA) and keyword search.
// - Offers a direct "Join by Code" input for private matches.
// - Features a prominent "Create Room" action opening `CreateRoomModal`.
//
// HOW IT WORKS:
// - Fetches live room listings from `/matchmake/custom-lobbies`.
// - Polls or manually refreshes active listings on demand.
// - Dispatches join intentions directly to `useCustomLobbyStore`.
//
// WHY IT EXISTS:
// Eliminates match isolation by giving players a public arcade lobby browser
// to discover and join community battles.
// ==================================================

import { useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaArrowRotateRight,
  FaKey,
  FaPlus,
  FaMagnifyingGlass,
  FaUserGroup,
} from "react-icons/fa6";
import {
  GiBangingGavel,
  GiCarnivalMask,
  GiCrossedPistols,
  GiFist,
  GiRadarDish,
} from "react-icons/gi";
import type { GameModeId } from "../../../shared/domain/GameMode";
import { useCustomLobbyStore } from "../../store/useCustomLobbyStore";
import { useNavigationStore } from "../../store/useNavigationStore";
import { Badge } from "../ui/atoms/Badge";
import { Button } from "../ui/atoms/Button";
import { Heading } from "../ui/atoms/Heading";
import { CreateRoomModal } from "../ui/organisms/CreateRoomModal";
import { ScreenLayout } from "../ui/templates/ScreenLayout";

type ModeFilter = "ALL" | GameModeId;

export function RoomBrowserScreen() {
  const goBack = useNavigationStore((state) => state.goBack);
  const publicLobbies = useCustomLobbyStore((state) => state.publicLobbies);
  const fetchPublicLobbies = useCustomLobbyStore((state) => state.fetchPublicLobbies);
  const joinCustomRoom = useCustomLobbyStore((state) => state.joinCustomRoom);
  const joinByRoomCode = useCustomLobbyStore((state) => state.joinByRoomCode);
  const isSearching = useCustomLobbyStore((state) => state.isSearching);
  const isLoading = useCustomLobbyStore((state) => state.isLoading);
  const error = useCustomLobbyStore((state) => state.error);
  const clearError = useCustomLobbyStore((state) => state.clearError);

  const [selectedFilter, setSelectedFilter] = useState<ModeFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [directCode, setDirectCode] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    fetchPublicLobbies();
    const interval = setInterval(fetchPublicLobbies, 5000);
    return () => clearInterval(interval);
  }, [fetchPublicLobbies]);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directCode.trim()) return;
    await joinByRoomCode(directCode.trim());
  };

  const filteredLobbies = publicLobbies.filter((lobby) => {
    if (selectedFilter !== "ALL" && lobby.gameMode !== selectedFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = lobby.roomName.toLowerCase().includes(q);
      const matchHost = lobby.hostName.toLowerCase().includes(q);
      if (!matchName && !matchHost) return false;
    }
    return true;
  });

  const getModeIcon = (mode: GameModeId) => {
    switch (mode) {
      case "1v1":
        return <GiFist className="text-amber-400" />;
      case "3v3":
        return <GiBangingGavel className="text-cyan-400" />;
      case "4v4":
        return <GiCrossedPistols className="text-purple-400" />;
      case "ffa":
        return <GiCarnivalMask className="text-rose-400" />;
      default:
        return <GiRadarDish className="text-cyan-400" />;
    }
  };

  return (
    <ScreenLayout
      header={
        <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex items-center justify-between backdrop-blur-md select-none">
          <Button variant="ghost" size="sm" onClick={goBack} leftIcon={<FaArrowLeft />}>
            Back to Hub
          </Button>

          <Heading level="h4" color="gold">
            Custom Arena Browser
          </Heading>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<FaPlus />}
          >
            Create Room
          </Button>
        </div>
      }
    >
      <div className="w-full max-w-5xl flex flex-col gap-5 py-4">
        {/* Banner & Code Input Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md">
          <div className="flex flex-col text-center md:text-left">
            <span
              className="text-sm font-black font-mono text-cyan-400 tracking-wide"
            >
              COMMUNITY BATTLEGROUNDS
            </span>
            <span
              className="text-xs text-slate-400"
              style={{ fontFamily: "var(--font-tech)" }}
            >
              Browse active custom matches or join private sessions via room code
            </span>
          </div>

          {/* Join by Code Form */}
          <form
            onSubmit={handleJoinByCode}
            className="flex items-center gap-2 w-full md:w-auto"
          >
            <div className="relative flex-1 md:w-48">
              <FaKey className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
              <input
                type="text"
                value={directCode}
                onChange={(e) => setDirectCode(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={6}
                className="w-full pl-8 pr-3 py-2 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs font-mono font-bold tracking-widest text-amber-400 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors uppercase"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={isLoading || directCode.trim().length < 4}
            >
              Join
            </Button>
          </form>
        </div>

        {error && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs font-mono">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="hover:text-white font-bold ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Mode Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-950/80 border border-slate-800/80 w-full sm:w-auto overflow-x-auto">
            {(["ALL", "1v1", "3v3", "4v4", "ffa"] as ModeFilter[]).map((filter) => {
              const active = selectedFilter === filter;
              return (
                <button
                  key={filter}
                  onClick={() => setSelectedFilter(filter)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider transition-colors cursor-pointer shrink-0 ${
                    active
                      ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          {/* Search Box & Refresh */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lobby or host..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-600"
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={fetchPublicLobbies}
              disabled={isSearching}
              className="p-2.5"
              title="Refresh Lobbies"
            >
              <FaArrowRotateRight className={isSearching ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* Lobby Listings Grid */}
        <div className="flex flex-col gap-3 min-h-[300px]">
          {filteredLobbies.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-12 rounded-3xl bg-slate-900/40 border border-slate-800/60 text-center">
              <GiRadarDish className="text-5xl text-slate-600" />
              <div className="flex flex-col">
                <span className="text-sm font-bold font-mono text-slate-300">
                  NO PUBLIC LOBBIES ACTIVE
                </span>
                <span
                  className="text-xs text-slate-500"
                  style={{ fontFamily: "var(--font-tech)" }}
                >
                  Be the champion who sets up the next arena clash!
                </span>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsCreateOpen(true)}
                leftIcon={<FaPlus />}
                className="mt-2"
              >
                Create Room
              </Button>
            </div>
          ) : (
            filteredLobbies.map((lobby) => {
              const isFull = lobby.currentPlayers >= lobby.maxPlayers;
              return (
                <div
                  key={lobby.roomId}
                  className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700/80 transition-all backdrop-blur-sm"
                >
                  <div className="flex items-center gap-3.5 w-full sm:w-auto">
                    <div className="w-11 h-11 rounded-2xl bg-slate-950 flex items-center justify-center text-xl border border-slate-800 shrink-0">
                      {getModeIcon(lobby.gameMode)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black font-mono text-white truncate">
                          {lobby.roomName}
                        </span>
                        <Badge
                          variant={
                            lobby.gameMode === "1v1"
                              ? "amber"
                              : lobby.gameMode === "3v3"
                                ? "cyan"
                                : lobby.gameMode === "4v4"
                                  ? "purple"
                                  : "red"
                          }
                        >
                          {lobby.gameMode.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <span>Host: <strong className="text-slate-300">{lobby.hostName}</strong></span>
                        <span>•</span>
                        <span>{lobby.scoreLimit} KOs</span>
                        <span>•</span>
                        <span>{Math.round(lobby.timeLimitSeconds / 60)}m</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                    {/* Capacity Indicator */}
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <FaUserGroup className="text-slate-500 text-xs" />
                      <span
                        className={`font-bold ${
                          isFull ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {lobby.currentPlayers}/{lobby.maxPlayers}
                      </span>
                    </div>

                    <Button
                      variant={isFull ? "secondary" : "primary"}
                      size="sm"
                      onClick={() => joinCustomRoom(lobby.roomId)}
                      disabled={isFull || isLoading}
                    >
                      {isFull ? "Room Full" : "Join Arena"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <CreateRoomModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </ScreenLayout>
  );
}
