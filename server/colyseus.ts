import { defineServer, defineRoom, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

const gameServer = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    game: defineRoom(GameRoom),
  },
});

const port = Number(process.env.PORT ?? process.env.COLYSEUS_PORT ?? 2567);
const host = process.env.COLYSEUS_HOST ?? "0.0.0.0";
const serverName = process.env.SERVER_NAME ?? "room-1";
const serverSlot = Number(process.env.SERVER_SLOT ?? 1);

async function startServer() {
  await gameServer.listen(port, host);
  const initialRoom = await matchMaker.createRoom("game", {
    serverName,
    serverSlot,
  });
  console.log(
    `🚀 Colyseus Game Server listening on ws://${host}:${port} (Initial Room: ${initialRoom.roomId})`,
  );
}

startServer();
