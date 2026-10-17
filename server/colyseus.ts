import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

const gameServer = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    game: defineRoom(GameRoom).filterBy(["modeId", "levelId"]),
  },
});

const port = Number(process.env.PORT ?? process.env.COLYSEUS_PORT ?? 2567);
const host = process.env.COLYSEUS_HOST ?? "0.0.0.0";

async function startServer() {
  await gameServer.listen(port, host);
  console.log(
    `🚀 Colyseus Game Server listening on ws://${host}:${port} (Dynamic Matchmaking Active)`,
  );
}

startServer();
