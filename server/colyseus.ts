import { defineServer, defineRoom, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

const gameServer = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    game: defineRoom(GameRoom),
  },
});

const port = Number(process.env.PORT ?? 2567);
const serverName = process.env.SERVER_NAME ?? "room-1";
const serverSlot = Number(process.env.SERVER_SLOT ?? 1);

async function startServer() {
  await gameServer.listen(port);
  const room1 = await matchMaker.createRoom("game", {
    serverName,
    serverSlot,
  });
  console.log(room1);
}

startServer();
