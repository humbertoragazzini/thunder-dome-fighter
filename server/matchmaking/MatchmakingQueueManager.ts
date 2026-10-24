// ==================================================
// SERVER MATCHMAKING SUBSYSTEM: QUEUE MANAGER
//
// WHAT IT DOES:
// Pools solo and party matchmaking tickets per game mode (1v1, 3v3, 4v4, ffa),
// evaluates minimum player thresholds, dynamically allocates authoritative GameRooms
// via Colyseus matchMaker, and generates atomic seat reservations.
//
// HOW IT WORKS:
// - Maintains queue arrays per GameModeId.
// - Processes tickets in FIFO order, respecting atomic party tickets (ADR-013).
// - Once total player count reaches GAME_MODES[modeId].minPlayers:
//   1. Creates a new GameRoom instance via `matchMaker.createRoom('game', options)`.
//   2. Generates an ISeatReservation per participant via `matchMaker.reserveSeatFor(room, options)`.
//   3. Notifies each ticket's callback with their seat reservation.
//
// WHY IT EXISTS:
// Enforces Phase 15 requirements. Completely automates match allocation,
// eliminating manual room code entry while guaranteeing party cohesion.
// ==================================================

import crypto from "node:crypto";
import { matchMaker } from "colyseus";
import { type GameModeId, GAME_MODES } from "../../shared/domain/GameMode.ts";

export interface QueuedParticipant {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  token: string;
  sessionId?: string;
}

export interface QueuedTicket {
  ticketId: string;
  gameModeId: GameModeId;
  partyId: string | null;
  playerIds: string[];
  participants: QueuedParticipant[];
  queuedAt: number;
  onMatchFound: (reservation: any, roomId: string) => void;
}

export class MatchmakingQueueManager {
  private queues = new Map<GameModeId, QueuedTicket[]>();
  private playerToTicketId = new Map<string, string>();
  private ticketById = new Map<string, QueuedTicket>();
  private processingLocks = new Map<GameModeId, boolean>();

  constructor() {
    this.queues.set("1v1", []);
    this.queues.set("3v3", []);
    this.queues.set("4v4", []);
    this.queues.set("ffa", []);
  }

  /**
   * Submits a matchmaking ticket to the queue.
   */
  public addTicket(
    params: Omit<QueuedTicket, "ticketId" | "queuedAt">,
  ): QueuedTicket {
    // If any player is already in a queue, remove their existing ticket first
    for (const pid of params.playerIds) {
      if (this.playerToTicketId.has(pid)) {
        this.removePlayer(pid);
      }
    }

    const ticketId = `ticket_${crypto.randomUUID()}`;
    const queuedAt = Date.now();

    const ticket: QueuedTicket = {
      ...params,
      ticketId,
      queuedAt,
    };

    const modeQueue = this.queues.get(params.gameModeId) ?? [];
    modeQueue.push(ticket);
    this.queues.set(params.gameModeId, modeQueue);

    this.ticketById.set(ticketId, ticket);
    for (const pid of params.playerIds) {
      this.playerToTicketId.set(pid, ticketId);
    }

    // Trigger queue evaluation asynchronously
    void this.processQueue(params.gameModeId);

    return ticket;
  }

  /**
   * Removes a ticket from the queue.
   */
  public removeTicket(ticketId: string): boolean {
    const ticket = this.ticketById.get(ticketId);
    if (!ticket) return false;

    this.ticketById.delete(ticketId);
    for (const pid of ticket.playerIds) {
      this.playerToTicketId.delete(pid);
    }

    const modeQueue = this.queues.get(ticket.gameModeId);
    if (modeQueue) {
      const filtered = modeQueue.filter((t) => t.ticketId !== ticketId);
      this.queues.set(ticket.gameModeId, filtered);
    }

    return true;
  }

  /**
   * Removes a player from whatever ticket and queue they are in.
   */
  public removePlayer(playerId: string): string | null {
    const ticketId = this.playerToTicketId.get(playerId);
    if (!ticketId) return null;

    this.removeTicket(ticketId);
    return ticketId;
  }

  /**
   * Looks up a ticket by player ID.
   */
  public getTicketByPlayerId(playerId: string): QueuedTicket | null {
    const ticketId = this.playerToTicketId.get(playerId);
    if (!ticketId) return null;
    return this.ticketById.get(ticketId) ?? null;
  }

  /**
   * Returns current queue statistics for a game mode.
   */
  public getQueueStatus(gameModeId: GameModeId): {
    queuedPlayers: number;
    queuedTickets: number;
    estimatedWaitSeconds: number;
  } {
    const modeQueue = this.queues.get(gameModeId) ?? [];
    let queuedPlayers = 0;
    for (const t of modeQueue) {
      queuedPlayers += t.playerIds.length;
    }

    // Default estimate: 10s base, scaled down if more players are waiting
    const minPlayers = GAME_MODES[gameModeId]?.minPlayers ?? 2;
    const remaining = Math.max(1, minPlayers - queuedPlayers);
    const estimatedWaitSeconds = Math.max(5, remaining * 5);

    return {
      queuedPlayers,
      queuedTickets: modeQueue.length,
      estimatedWaitSeconds,
    };
  }

  /**
   * Evaluates queue for the given mode and forms matches when player threshold is reached.
   */
  public async processQueue(modeId: GameModeId): Promise<void> {
    if (this.processingLocks.get(modeId)) {
      return;
    }

    const modeConfig = GAME_MODES[modeId];
    if (!modeConfig) return;

    const minPlayers = modeConfig.minPlayers;
    const maxPlayers = modeConfig.maxPlayers;
    const queue = this.queues.get(modeId) ?? [];

    // Calculate total players waiting
    let totalPlayersWaiting = 0;
    for (const t of queue) {
      totalPlayersWaiting += t.playerIds.length;
    }

    if (totalPlayersWaiting < minPlayers) {
      return;
    }

    this.processingLocks.set(modeId, true);

    try {
      // Accumulate tickets up to maxPlayers (or at least minPlayers)
      const matchedTickets: QueuedTicket[] = [];
      let accumulatedPlayers = 0;

      while (queue.length > 0) {
        const nextTicket = queue[0];
        if (accumulatedPlayers + nextTicket.playerIds.length > maxPlayers) {
          // If adding next ticket exceeds maxPlayers, stop accumulating unless we haven't reached minPlayers
          if (accumulatedPlayers >= minPlayers) {
            break;
          }
        }

        queue.shift(); // Remove from queue
        matchedTickets.push(nextTicket);
        accumulatedPlayers += nextTicket.playerIds.length;

        if (accumulatedPlayers >= minPlayers) {
          break;
        }
      }

      if (accumulatedPlayers < minPlayers) {
        // Put tickets back into the front of queue if threshold wasn't satisfied
        queue.unshift(...matchedTickets);
        return;
      }

      // Cleanup lookup maps for matched tickets
      for (const t of matchedTickets) {
        this.ticketById.delete(t.ticketId);
        for (const pid of t.playerIds) {
          this.playerToTicketId.delete(pid);
        }
      }

      // Allocate Colyseus GameRoom
      const room = await matchMaker.createRoom("game", {
        modeId,
        levelId: "thunder-dome-alpha",
      });

      // Generate seat reservations for all participants
      for (const ticket of matchedTickets) {
        for (const participant of ticket.participants) {
          const reservation = await matchMaker.reserveSeatFor(room, {
            token: participant.token,
            playerId: participant.playerId,
            playerName: participant.playerName,
            avatarUrl: participant.avatarUrl,
            modeId,
          });

          ticket.onMatchFound(reservation, room.roomId);
        }
      }
    } catch (err) {
      console.error(`❌ Matchmaking error processing queue for ${modeId}:`, err);
    } finally {
      this.processingLocks.set(modeId, false);

      // Check if more matches can be made immediately
      const remainingQueue = this.queues.get(modeId) ?? [];
      let remainingPlayers = 0;
      for (const t of remainingQueue) {
        remainingPlayers += t.playerIds.length;
      }
      if (remainingPlayers >= minPlayers) {
        void this.processQueue(modeId);
      }
    }
  }

  /**
   * Resets all queues and mappings (for testing).
   */
  public reset(): void {
    this.queues.forEach((q) => (q.length = 0));
    this.playerToTicketId.clear();
    this.ticketById.clear();
    this.processingLocks.clear();
  }
}

// Global singleton instance
export const matchmakingQueueManager = new MatchmakingQueueManager();
