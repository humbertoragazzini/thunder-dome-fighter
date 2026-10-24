// ==================================================
// SERVER MATCHMAKING SUBSYSTEM: MATCHMAKING COLYSEUS ROOM
//
// WHAT IT DOES:
// Authoritative Colyseus room managing pre-match lobby presence, party formation,
// readiness coordination, and ticket dispatch into MatchmakingQueueManager.
//
// HOW IT WORKS:
// - Authenticates incoming WebSocket connections with JWT session tokens.
// - Handles client messages: PARTY_CREATE, PARTY_JOIN, PARTY_LEAVE, PARTY_SET_READY.
// - Handles MATCH_QUEUE: validates squad readiness, packages indivisible tickets,
//   and subscribes to match allocation callbacks.
// - Broadcasts synchronized party state (PARTY_UPDATED) and queue search status (MATCHMAKING_STATUS).
// - On match found, sends seat reservations directly to clients for automatic room transition.
//
// WHY IT EXISTS:
// Enforces Phase 15 requirements. Provides a unified, low-latency WebSocket hub
// for squad management and automated matchmaking.
// ==================================================

import { Room, type Client, ServerError } from "colyseus";
import {
  ClientMessageType,
  type PartyJoinPayload,
  type PartySetReadyPayload,
  type MatchQueuePayload,
} from "../../shared/contracts/network/ClientMessages.ts";
import {
  ServerMessageType,
  type MatchmakingStatusPayload,
  type PartyUpdatedPayload,
  type ServerErrorPayload,
} from "../../shared/contracts/network/ServerMessages.ts";
import {
  verifySessionToken,
  type AuthenticatedUser,
} from "../auth/TokenVerifier.ts";
import { partyManager } from "./PartyManager.ts";
import {
  matchmakingQueueManager,
  type QueuedParticipant,
} from "./MatchmakingQueueManager.ts";

export interface MatchmakingClientAuth {
  user: AuthenticatedUser;
  token: string;
}

export class MatchmakingRoom extends Room {
  private clientByPlayerId = new Map<string, Client>();
  private clientTokens = new Map<string, string>(); // sessionId -> token

  override onCreate(): void {
    this.maxClients = 10000;

    // --------------------------------------------------
    // 1. Party Creation
    // --------------------------------------------------
    this.onMessage(ClientMessageType.PARTY_CREATE, (client) => {
      const auth = client.auth as MatchmakingClientAuth | undefined;
      if (!auth) return;

      const party = partyManager.createParty({
        playerId: auth.user.playerId,
        playerName: auth.user.playerName,
        avatarUrl: null,
      });

      const payload: PartyUpdatedPayload = { party };
      client.send(ServerMessageType.PARTY_UPDATED, payload);
    });

    // --------------------------------------------------
    // 2. Party Join (via 6-char Invite Code)
    // --------------------------------------------------
    this.onMessage(
      ClientMessageType.PARTY_JOIN,
      (client, message: PartyJoinPayload) => {
        const auth = client.auth as MatchmakingClientAuth | undefined;
        if (!auth) return;

        const result = partyManager.joinParty(message.inviteCode, {
          playerId: auth.user.playerId,
          playerName: auth.user.playerName,
          avatarUrl: null,
        });

        if (result.error || !result.party) {
          const errPayload: ServerErrorPayload = {
            code: "PARTY_JOIN_FAILED",
            message: result.error ?? "Failed to join party.",
            fatal: false,
          };
          client.send(ServerMessageType.SERVER_ERROR, errPayload);
          return;
        }

        this.broadcastPartyUpdate(result.party);
      },
    );

    // --------------------------------------------------
    // 3. Party Leave
    // --------------------------------------------------
    this.onMessage(ClientMessageType.PARTY_LEAVE, (client) => {
      const auth = client.auth as MatchmakingClientAuth | undefined;
      if (!auth) return;

      // Cancel any ongoing queue for this party/player first
      this.cancelQueueForPlayer(auth.user.playerId);

      const { updatedParty } = partyManager.leaveParty(auth.user.playerId);

      // Notify the leaving client that they have no party
      const leavePayload: PartyUpdatedPayload = { party: null };
      client.send(ServerMessageType.PARTY_UPDATED, leavePayload);

      // Broadcast remaining party state to other members if party still exists
      if (updatedParty) {
        this.broadcastPartyUpdate(updatedParty);
      }
    });

    // --------------------------------------------------
    // 4. Party Member Ready State Toggle
    // --------------------------------------------------
    this.onMessage(
      ClientMessageType.PARTY_SET_READY,
      (client, message: PartySetReadyPayload) => {
        const auth = client.auth as MatchmakingClientAuth | undefined;
        if (!auth) return;

        const updatedParty = partyManager.setMemberReady(
          auth.user.playerId,
          message.isReady,
        );

        if (updatedParty) {
          this.broadcastPartyUpdate(updatedParty);
        }
      },
    );

    // --------------------------------------------------
    // 5. Enter Matchmaking Queue (Solo or Party Leader)
    // --------------------------------------------------
    this.onMessage(
      ClientMessageType.MATCH_QUEUE,
      (client, message: MatchQueuePayload) => {
        const auth = client.auth as MatchmakingClientAuth | undefined;
        if (!auth) return;

        const playerId = auth.user.playerId;
        const gameModeId = message.gameModeId;
        const party = partyManager.getPartyByPlayerId(playerId);

        if (party) {
          // If in a party, only the leader can initiate matchmaking
          if (party.leaderPlayerId !== playerId) {
            const errPayload: ServerErrorPayload = {
              code: "NOT_PARTY_LEADER",
              message: "Only the party leader can initiate matchmaking.",
              fatal: false,
            };
            client.send(ServerMessageType.SERVER_ERROR, errPayload);
            return;
          }

          // Verify all members are marked ready
          const membersList = Object.values(party.members);
          const allReady = membersList.every((m) => m.isReady);
          if (!allReady) {
            const unreadyCount = membersList.filter((m) => !m.isReady).length;
            const errPayload: ServerErrorPayload = {
              code: "MEMBERS_NOT_READY",
              message: `Cannot start matchmaking: ${unreadyCount} party member(s) are not ready.`,
              fatal: false,
            };
            client.send(ServerMessageType.SERVER_ERROR, errPayload);
            return;
          }

          // Verify party size does not exceed mode capacity
          const modeDef = GAME_MODES[gameModeId];
          const maxTeamSize = modeDef?.teamSize ?? (modeDef?.maxPlayers ?? 4);
          if (membersList.length > maxTeamSize) {
            const errPayload: ServerErrorPayload = {
              code: "PARTY_TOO_LARGE",
              message: `Party size of ${membersList.length} exceeds maximum team size of ${maxTeamSize} for ${gameModeId}.`,
              fatal: false,
            };
            client.send(ServerMessageType.SERVER_ERROR, errPayload);
            return;
          }

          // Gather participants with tokens
          const participants: QueuedParticipant[] = membersList.map((m) => {
            const memberClient = this.clientByPlayerId.get(m.playerId);
            const token =
              (memberClient?.auth as MatchmakingClientAuth | undefined)?.token ??
              auth.token;
            return {
              playerId: m.playerId,
              playerName: m.playerName,
              avatarUrl: m.avatarUrl,
              token,
              sessionId: memberClient?.sessionId,
            };
          });

          const playerIds = membersList.map((m) => m.playerId);

          // Add indivisible party ticket
          matchmakingQueueManager.addTicket({
            gameModeId,
            partyId: party.id,
            playerIds,
            participants,
            onMatchFound: (reservation, roomId) => {
              // Dispatch seat reservation to all party members
              for (const pid of playerIds) {
                const memberClient = this.clientByPlayerId.get(pid);
                if (memberClient) {
                  const matchFoundPayload: MatchmakingStatusPayload = {
                    status: "MATCH_FOUND",
                    gameModeId,
                    reservation,
                    roomId,
                  };
                  memberClient.send(
                    ServerMessageType.MATCHMAKING_STATUS,
                    matchFoundPayload,
                  );
                }
              }
            },
          });

          // Broadcast queued status to all party members
          const queueStats = matchmakingQueueManager.getQueueStatus(gameModeId);
          for (const pid of playerIds) {
            const memberClient = this.clientByPlayerId.get(pid);
            if (memberClient) {
              const statusPayload: MatchmakingStatusPayload = {
                status: "QUEUED",
                gameModeId,
                estimatedWaitSeconds: queueStats.estimatedWaitSeconds,
              };
              memberClient.send(
                ServerMessageType.MATCHMAKING_STATUS,
                statusPayload,
              );
            }
          }
        } else {
          // Solo queue
          matchmakingQueueManager.addTicket({
            gameModeId,
            partyId: null,
            playerIds: [playerId],
            participants: [
              {
                playerId,
                playerName: auth.user.playerName,
                avatarUrl: null,
                token: auth.token,
                sessionId: client.sessionId,
              },
            ],
            onMatchFound: (reservation, roomId) => {
              const matchFoundPayload: MatchmakingStatusPayload = {
                status: "MATCH_FOUND",
                gameModeId,
                reservation,
                roomId,
              };
              client.send(
                ServerMessageType.MATCHMAKING_STATUS,
                matchFoundPayload,
              );
            },
          });

          const queueStats = matchmakingQueueManager.getQueueStatus(gameModeId);
          const statusPayload: MatchmakingStatusPayload = {
            status: "QUEUED",
            gameModeId,
            estimatedWaitSeconds: queueStats.estimatedWaitSeconds,
          };
          client.send(ServerMessageType.MATCHMAKING_STATUS, statusPayload);
        }
      },
    );

    // --------------------------------------------------
    // 6. Cancel Matchmaking Queue
    // --------------------------------------------------
    this.onMessage(ClientMessageType.MATCH_CANCEL_QUEUE, (client) => {
      const auth = client.auth as MatchmakingClientAuth | undefined;
      if (!auth) return;

      this.cancelQueueForPlayer(auth.user.playerId);
    });
  }

  override async onAuth(
    _client: Client,
    options: unknown,
  ): Promise<MatchmakingClientAuth> {
    const token =
      typeof options === "object" && options !== null && "token" in options
        ? (options as { token: unknown }).token
        : undefined;

    if (!token || typeof token !== "string") {
      throw new ServerError(401, "Authentication token required for matchmaking.");
    }

    try {
      const user = await verifySessionToken(token);
      return { user, token };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Invalid session token.";
      throw new ServerError(401, message);
    }
  }

  override onJoin(client: Client): void {
    const auth = client.auth as MatchmakingClientAuth | undefined;
    if (!auth) return;

    this.clientByPlayerId.set(auth.user.playerId, client);
    this.clientTokens.set(client.sessionId, auth.token);

    // If player already belongs to a party, sync it immediately
    const existingParty = partyManager.getPartyByPlayerId(auth.user.playerId);
    if (existingParty) {
      const payload: PartyUpdatedPayload = { party: existingParty };
      client.send(ServerMessageType.PARTY_UPDATED, payload);
    }
  }

  override onLeave(client: Client): void {
    const auth = client.auth as MatchmakingClientAuth | undefined;
    if (!auth) return;

    const playerId = auth.user.playerId;
    this.clientByPlayerId.delete(playerId);
    this.clientTokens.delete(client.sessionId);

    // Clean up queue
    this.cancelQueueForPlayer(playerId);

    // Clean up party
    const { updatedParty } = partyManager.leaveParty(playerId);
    if (updatedParty) {
      this.broadcastPartyUpdate(updatedParty);
    }
  }

  private cancelQueueForPlayer(playerId: string): void {
    const party = partyManager.getPartyByPlayerId(playerId);

    if (party) {
      // If party member or leader cancels, remove ticket
      matchmakingQueueManager.removePlayer(playerId);

      // Broadcast IDLE status to all party members
      for (const pid of Object.keys(party.members)) {
        const memberClient = this.clientByPlayerId.get(pid);
        if (memberClient) {
          const idlePayload: MatchmakingStatusPayload = { status: "IDLE" };
          memberClient.send(
            ServerMessageType.MATCHMAKING_STATUS,
            idlePayload,
          );
        }
      }
    } else {
      // Solo player
      matchmakingQueueManager.removePlayer(playerId);
      const client = this.clientByPlayerId.get(playerId);
      if (client) {
        const idlePayload: MatchmakingStatusPayload = { status: "IDLE" };
        client.send(ServerMessageType.MATCHMAKING_STATUS, idlePayload);
      }
    }
  }

  private broadcastPartyUpdate(party: import("../../shared/domain/Party.ts").Party): void {
    const payload: PartyUpdatedPayload = { party };
    for (const memberId of Object.keys(party.members)) {
      const client = this.clientByPlayerId.get(memberId);
      if (client) {
        client.send(ServerMessageType.PARTY_UPDATED, payload);
      }
    }
  }
}
