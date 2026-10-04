// ==================================================
// COLYSEUS CONNECTION CONTROLLER COMPONENT
//
// WHAT IT DOES:
// Provides a connection control toggle (Connect/Disconnect) to attach
// the client to the authoritative Colyseus GameRoom WebSocket server.
//
// HOW IT WORKS:
// - Fetches the authenticated JWT from `useAuthStore`.
// - Connects via Colyseus SDK using `VITE_COLYSEUS_URL` (defaulting to ws://localhost:2567).
// - Transmits `{ token }` during `client.join("game", { token })` to pass
//   authoritative server handshake (`server/GameRoom.ts:onAuth`).
// - Synchronizes room handle into `useAppStore`.
//
// WHY IT EXISTS:
// Ensures network connections supply the required authentication credentials
// verified by `server/GameRoom.ts:onAuth()`.
// ==================================================

import { Client, type Room } from "@colyseus/sdk";
import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import { getColyseusUrl } from "../config/network";

// ==================================================
// CONNECT
// ==================================================

async function connect() {
  const colyseusUrl = getColyseusUrl();
  const token = useAuthStore.getState().token;

  if (!token) {
    throw new Error("Must be logged in to join the arena. Please log in first.");
  }

  const client = new Client(colyseusUrl);
  const room = await client.join("game", { token });

  return room;
}

// ==================================================
// DISCONNECT
// ==================================================

async function disconnect(room: Room) {
  await room.leave();
}

// ==================================================
// COMPONENT
// ==================================================

export default function ConnectToColyseus() {
  const room = useAppStore((state) => state.room);
  const setRoom = useAppStore((state) => state.setRoom);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Room changed:", room?.state);
  }, [room]);

  return (
    <div className="fixed bottom-4 right-4 flex flex-col items-end gap-2">
      {connectError && (
        <div className="bg-red-900/90 text-white text-xs px-3 py-1.5 rounded max-w-xs text-right shadow">
          {connectError}
        </div>
      )}
      <button
        className={`px-4 py-2 font-bold text-lg rounded shadow-lg transition-colors ${
          room?.roomId
            ? "bg-red-500 hover:bg-red-600 text-white"
            : !isAuthenticated
              ? "bg-neutral-600 text-neutral-300 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-500 text-white"
        }`}
        disabled={!room?.roomId && !isAuthenticated}
        onClick={async () => {
          setConnectError(null);

          // ------------------------------------------
          // Already connected → leave the room.
          // ------------------------------------------
          if (room?.roomId) {
            await disconnect(room);
            setRoom(null);
            return;
          }

          // ------------------------------------------
          // Not connected → join the room.
          // ------------------------------------------
          try {
            const connectionRoom = await connect();
            setRoom(connectionRoom);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to connect to arena.";
            console.error("Colyseus connection error:", err);
            setConnectError(message);
          }
        }}
      >
        {room?.roomId ? "Disconnect" : isAuthenticated ? "Connect" : "Log In First"}
      </button>
    </div>
  );
}
