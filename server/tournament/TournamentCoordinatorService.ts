// ==================================================
// TOURNAMENT COORDINATOR SERVICE
//
// WHAT IT DOES:
// Authoritative coordinator for tournament lifecycle, participant seeding,
// match spawning, bracket progression, and championship resolution (Phase 20).
//
// HOW IT WORKS:
// - Generates and advances bracket trees using pure functional algorithms.
// - Persists tournament states atomically via `TournamentRepository`.
// - Delegates match simulation to Colyseus `GameRoom` instances via `matchMaker`.
// - Receives match completion events and advances winners to subsequent bracket nodes.
// - Resolves tournament champion and final participant rankings upon final conclusion.
//
// WHY IT EXISTS:
// Game-genre-agnostic competitive tournament engine decoupled from physics simulation,
// powering 1v1 and Team (3v3 / 4v4) championships.
// ==================================================

import { matchMaker } from "colyseus";
import type {
  CreateTournamentParams,
  ITournament,
  ITournamentMatch,
  MatchOutcomeData,
} from "../../shared/domain/tournament/TournamentTypes.js";
import {
  advanceKnockoutMatch,
  generateKnockoutTournament,
} from "../../shared/domain/tournament/BracketGenerator.js";
import { TournamentRepository } from "./TournamentRepository.js";
import type { MatchSummaryPayload } from "../match/MatchStatsTracker.js";

export type TournamentEventType =
  | "TOURNAMENT_CREATED"
  | "TOURNAMENT_STARTED"
  | "MATCH_SCHEDULED"
  | "MATCH_STARTED"
  | "MATCH_COMPLETED"
  | "TOURNAMENT_COMPLETED";

export interface TournamentEvent {
  type: TournamentEventType;
  tournamentId: string;
  tournament: ITournament;
  matchId?: string;
  match?: ITournamentMatch;
  championId?: string;
}

export type TournamentEventListener = (event: TournamentEvent) => void;

export class TournamentCoordinatorService {
  private repository: TournamentRepository;
  private activeTournaments = new Map<string, ITournament>();
  private matchToTournament = new Map<string, string>(); // matchId -> tournamentId
  private listeners: TournamentEventListener[] = [];

  constructor(repository: TournamentRepository = new TournamentRepository()) {
    this.repository = repository;
  }

  /**
   * Subscribes an event listener to tournament lifecycle updates.
   */
  subscribe(listener: TournamentEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  private emit(event: TournamentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[TournamentCoordinator] Listener error:", err);
      }
    }
  }

  /**
   * Creates, seeds, and persists a new tournament.
   */
  async createTournament(params: CreateTournamentParams): Promise<ITournament> {
    const tournament = generateKnockoutTournament(params);

    // Save initial state to PostgreSQL
    await this.repository.createTournament(tournament);

    // Cache active in-memory record
    this.activeTournaments.set(tournament.id, tournament);
    for (const stage of tournament.stages) {
      for (const round of stage.rounds) {
        for (const match of round.matches) {
          this.matchToTournament.set(match.id, tournament.id);
        }
      }
    }

    this.emit({
      type: "TOURNAMENT_CREATED",
      tournamentId: tournament.id,
      tournament,
    });

    return tournament;
  }

  /**
   * Retrieves tournament by ID, from memory cache or database.
   */
  async getTournament(tournamentId: string): Promise<ITournament | null> {
    let tournament = this.activeTournaments.get(tournamentId);
    if (!tournament) {
      const dbTournament = await this.repository.getTournamentById(tournamentId);
      if (dbTournament) {
        tournament = dbTournament;
        this.activeTournaments.set(tournament.id, tournament);
        for (const stage of tournament.stages) {
          for (const round of stage.rounds) {
            for (const match of round.matches) {
              this.matchToTournament.set(match.id, tournament.id);
            }
          }
        }
      }
    }
    return tournament ?? null;
  }

  /**
   * Starts a tournament, promoting initial round matches to ready status.
   */
  async startTournament(tournamentId: string): Promise<ITournament> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    tournament.status = "IN_PROGRESS";
    if (tournament.stages[0]) {
      tournament.stages[0].status = "IN_PROGRESS";
      if (tournament.stages[0].rounds[0]) {
        tournament.stages[0].rounds[0].status = "IN_PROGRESS";
      }
    }

    await this.repository.saveTournamentState(tournament);

    this.emit({
      type: "TOURNAMENT_STARTED",
      tournamentId: tournament.id,
      tournament,
    });

    return tournament;
  }

  /**
   * Spawns an authoritative Colyseus GameRoom for an active tournament match node.
   */
  async spawnMatchGameRoom(
    tournamentId: string,
    matchId: string,
    extraOptions?: Record<string, unknown>,
  ): Promise<{ gameRoomId: string; room: any; roomListing: any }> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    let targetMatch: ITournamentMatch | undefined;
    for (const stage of tournament.stages) {
      for (const round of stage.rounds) {
        for (const m of round.matches) {
          if (m.id === matchId) {
            targetMatch = m;
            break;
          }
        }
        if (targetMatch) break;
      }
      if (targetMatch) break;
    }

    if (!targetMatch) {
      throw new Error(`Match ${matchId} not found in tournament ${tournamentId}`);
    }

    if (!targetMatch.participantAId || !targetMatch.participantBId) {
      throw new Error(`Match ${matchId} cannot be spawned: participants not yet determined`);
    }

    const participantA = tournament.participants.find((p) => p.id === targetMatch.participantAId);
    const participantB = tournament.participants.find((p) => p.id === targetMatch.participantBId);

    const roomName = `Tournament: ${tournament.name} - ${targetMatch.roundName} (Match ${targetMatch.matchIndex + 1})`;

    // Allocate authoritative GameRoom via Colyseus matchMaker
    const gameRoom = await matchMaker.createRoom("game", {
      modeId: tournament.gameModeId,
      levelId: "thunder-dome-alpha",
      serverName: roomName,
      tournamentId: tournament.id,
      tournamentMatchId: targetMatch.id,
      ...extraOptions,
    });

    // Update match state
    targetMatch.gameRoomId = gameRoom.roomId;
    targetMatch.status = "IN_PROGRESS";

    await this.repository.updateMatchRoom(targetMatch.id, gameRoom.roomId, "IN_PROGRESS");

    this.emit({
      type: "MATCH_STARTED",
      tournamentId: tournament.id,
      tournament,
      matchId: targetMatch.id,
      match: targetMatch,
    });

    console.log(
      `🏆 [TournamentCoordinator] Spawned GameRoom ${gameRoom.roomId} for Match ${matchId} (${participantA?.name} vs ${participantB?.name})`,
    );

    // Retrieve local room instance if running on local process
    const localRoom = matchMaker.getLocalRoomById(gameRoom.roomId);

    return { gameRoomId: gameRoom.roomId, room: localRoom ?? gameRoom, roomListing: gameRoom };
  }

  /**
   * Authoritative handler for completed match outcomes.
   * Advances winners, updates bracket tree, and persists to DB.
   */
  async handleMatchCompletion(
    tournamentId: string,
    matchId: string,
    outcome: MatchOutcomeData,
  ): Promise<{ tournament: ITournament; isTournamentComplete: boolean }> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    const { completedMatch, advancedMatch, isTournamentComplete } = advanceKnockoutMatch(
      tournament,
      matchId,
      outcome,
    );

    // Persist complete progression to PostgreSQL
    await this.repository.saveTournamentState(tournament);

    this.emit({
      type: "MATCH_COMPLETED",
      tournamentId: tournament.id,
      tournament,
      matchId: completedMatch.id,
      match: completedMatch,
    });

    if (advancedMatch) {
      this.emit({
        type: "MATCH_SCHEDULED",
        tournamentId: tournament.id,
        tournament,
        matchId: advancedMatch.id,
        match: advancedMatch,
      });
    }

    if (isTournamentComplete) {
      this.emit({
        type: "TOURNAMENT_COMPLETED",
        tournamentId: tournament.id,
        tournament,
        championId: tournament.championId,
      });
      console.log(
        `🏆 [TournamentCoordinator] TOURNAMENT COMPLETED! Champion: ${tournament.championName} (${tournament.championId})`,
      );
    }

    return { tournament, isTournamentComplete };
  }

  /**
   * Adapts a MatchSummaryPayload from MatchFinalizer to advance a tournament match.
   */
  async handleGameRoomSummary(
    tournamentId: string,
    matchId: string,
    summary: MatchSummaryPayload,
  ): Promise<{ tournament: ITournament; isTournamentComplete: boolean }> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    let targetMatch: ITournamentMatch | undefined;
    for (const stage of tournament.stages) {
      for (const round of stage.rounds) {
        for (const m of round.matches) {
          if (m.id === matchId) {
            targetMatch = m;
            break;
          }
        }
        if (targetMatch) break;
      }
      if (targetMatch) break;
    }

    if (!targetMatch) {
      throw new Error(`Match ${matchId} not found in tournament ${tournamentId}`);
    }

    const participantA = tournament.participants.find((p) => p.id === targetMatch.participantAId);
    const participantB = tournament.participants.find((p) => p.id === targetMatch.participantBId);

    // Map summary winner to tournament participant ID
    let winnerParticipantId: string | undefined;
    let scoreA = 0;
    let scoreB = 0;

    if (tournament.participantType === "INDIVIDUAL") {
      // Find matching participant by playerId or sessionId
      for (const p of summary.participants) {
        if (p.playerId === participantA?.playerId || p.sessionId === participantA?.playerId) {
          scoreA = p.score;
        }
        if (p.playerId === participantB?.playerId || p.sessionId === participantB?.playerId) {
          scoreB = p.score;
        }
      }

      if (summary.winningPlayerId === participantA?.playerId) {
        winnerParticipantId = participantA?.id;
      } else if (summary.winningPlayerId === participantB?.playerId) {
        winnerParticipantId = participantB?.id;
      } else {
        // Fallback: determine by score
        winnerParticipantId = scoreA >= scoreB ? participantA?.id : participantB?.id;
      }
    } else {
      // Team mode: Team 0 vs Team 1
      scoreA = summary.participants
        .filter((p) => p.teamIndex === 0)
        .reduce((sum, p) => sum + p.score, 0);
      scoreB = summary.participants
        .filter((p) => p.teamIndex === 1)
        .reduce((sum, p) => sum + p.score, 0);

      if (summary.winningTeamIndex === 0) {
        winnerParticipantId = participantA?.id;
      } else if (summary.winningTeamIndex === 1) {
        winnerParticipantId = participantB?.id;
      } else {
        winnerParticipantId = scoreA >= scoreB ? participantA?.id : participantB?.id;
      }
    }

    if (!winnerParticipantId) {
      winnerParticipantId = participantA?.id ?? "";
    }

    return await this.handleMatchCompletion(tournamentId, matchId, {
      winnerId: winnerParticipantId,
      scoreA,
      scoreB,
      referencedMatchId: summary.matchId,
    });
  }

  /**
   * Headless simulation helper for automated testing.
   */
  async simulateMatchOutcome(
    tournamentId: string,
    matchId: string,
    winnerParticipantId: string,
    scoreA: number,
    scoreB: number,
    referencedMatchId?: string,
  ): Promise<{ tournament: ITournament; isTournamentComplete: boolean }> {
    return await this.handleMatchCompletion(tournamentId, matchId, {
      winnerId: winnerParticipantId,
      scoreA,
      scoreB,
      referencedMatchId,
    });
  }
}

// Global default singleton instance
export const tournamentCoordinatorService = new TournamentCoordinatorService();
