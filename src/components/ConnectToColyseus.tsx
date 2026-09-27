import { Client, type Room } from "@colyseus/sdk";

import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

// ==================================================
// CONNECT
// ==================================================

async function connect() {
  const client = new Client("http://192.168.0.28:2567");

  const room = await client.join("game");

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

  useEffect(() => {
    console.log("Room changed:");
    console.log(room?.state);
  }, [room]);

  return (
    <div className="fixed bottom-4 right-4">
      <button
        className="px-4 py-2 bg-red-400 font-bold text-lg"
        onClick={async () => {
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

          const connectionRoom = await connect();

          setRoom(connectionRoom);
        }}
      >
        {room?.roomId ? "Disconnect" : "Connect"}
      </button>
    </div>
  );
}
