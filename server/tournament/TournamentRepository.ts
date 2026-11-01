// ==================================================
// TOURNAMENT REPOSITORY (POSTGRESQL VIA PRISMA)
//
// WHAT IT DOES:
// Atomically persists and retrieves tournament brackets, stages, rounds,
// matches, and participants to and from PostgreSQL.
//
// HOW IT WORKS:
// - Executes complex tree insertions inside an atomic `prisma.$transaction`.
// - Reconstitutes strongly-typed `ITournament` domain entities from relational data.
// - Persists match progress, participant eliminations, and champion crowning.
//
// WHY IT EXISTS:
// Ensures 100% ACID compliance and idempotency for championship tournaments.
// ==================================================

import { prisma as defaultPrisma } from "../db/prisma.js";
import type { PrismaClient } from "@prisma/client";
import type {
  CompetitionFormat,
  ITournament,
  ITournamentParticipant,
  ITournamentStage,
  MatchStatus,
  ParticipantType,
  StageType,
  TournamentStatus,
} from "../../shared/domain/tournament/TournamentTypes.js";

export class TournamentRepository {
  private db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  /**
   * Persists a newly generated tournament and its entire bracket tree atomically.
   */
  async createTournament(tournament: ITournament): Promise<ITournament> {
    await this.db.$transaction(async (tx) => {
      // 1. Create Tournament root record
      await tx.tournament.create({
        data: {
          id: tournament.id,
          name: tournament.name,
          format: tournament.format,
          status: tournament.status,
          participantType: tournament.participantType,
          gameModeId: tournament.gameModeId,
          championId: tournament.championId,
          championName: tournament.championName,
          createdAt: tournament.createdAt,
          updatedAt: tournament.updatedAt,
        },
      });

      // 2. Create Participants
      for (const p of tournament.participants) {
        await tx.tournamentParticipant.create({
          data: {
            id: p.id,
            tournamentId: tournament.id,
            participantType: p.participantType,
            seed: p.seed,
            name: p.name,
            avatarUrl: p.avatarUrl,
            playerId: p.playerId,
            memberIds: p.memberIds ?? [],
            isEliminated: p.isEliminated,
            finalPlacement: p.finalPlacement,
          },
        });
      }

      // 3. Create Stages, Rounds, and Matches
      for (const stage of tournament.stages) {
        await tx.tournamentStage.create({
          data: {
            id: stage.id,
            tournamentId: tournament.id,
            stageIndex: stage.stageIndex,
            stageType: stage.stageType,
            status: stage.status,
          },
        });

        for (const round of stage.rounds) {
          await tx.tournamentRound.create({
            data: {
              id: round.id,
              stageId: stage.id,
              roundIndex: round.roundIndex,
              name: round.name,
              status: round.status,
            },
          });

          for (const match of round.matches) {
            await tx.tournamentMatch.create({
              data: {
                id: match.id,
                roundId: round.id,
                matchIndex: match.matchIndex,
                participantAId: match.participantAId,
                participantBId: match.participantBId,
                winnerId: match.winnerId,
                scoreA: match.scoreA,
                scoreB: match.scoreB,
                status: match.status,
                gameRoomId: match.gameRoomId,
                referencedMatchId: match.referencedMatchId,
                nextMatchId: match.nextMatchId,
                nextMatchSlot: match.nextMatchSlot,
              },
            });
          }
        }
      }
    });

    return tournament;
  }

  /**
   * Reconstitutes an ITournament tree from PostgreSQL by ID.
   */
  async getTournamentById(id: string): Promise<ITournament | null> {
    const record = await this.db.tournament.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: { seed: "asc" },
        },
        stages: {
          orderBy: { stageIndex: "asc" },
          include: {
            rounds: {
              orderBy: { roundIndex: "asc" },
              include: {
                matches: {
                  orderBy: { matchIndex: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!record) return null;

    const participants: ITournamentParticipant[] = record.participants.map((p) => ({
      id: p.id,
      tournamentId: p.tournamentId,
      participantType: p.participantType as ParticipantType,
      seed: p.seed,
      name: p.name,
      avatarUrl: p.avatarUrl ?? undefined,
      playerId: p.playerId ?? undefined,
      memberIds: p.memberIds.length > 0 ? p.memberIds : undefined,
      isEliminated: p.isEliminated,
      finalPlacement: p.finalPlacement ?? undefined,
    }));

    const stages: ITournamentStage[] = record.stages.map((s) => ({
      id: s.id,
      stageIndex: s.stageIndex,
      stageType: s.stageType as StageType,
      status: s.status as "PENDING" | "IN_PROGRESS" | "COMPLETED",
      rounds: s.rounds.map((r) => ({
        id: r.id,
        stageIndex: s.stageIndex,
        roundIndex: r.roundIndex,
        name: r.name,
        status: r.status as "PENDING" | "IN_PROGRESS" | "COMPLETED",
        matches: r.matches.map((m) => ({
          id: m.id,
          tournamentId: record.id,
          stageIndex: s.stageIndex,
          roundIndex: r.roundIndex,
          matchIndex: m.matchIndex,
          roundName: r.name,
          participantAId: m.participantAId ?? undefined,
          participantBId: m.participantBId ?? undefined,
          winnerId: m.winnerId ?? undefined,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          status: m.status as MatchStatus,
          gameRoomId: m.gameRoomId ?? undefined,
          referencedMatchId: m.referencedMatchId ?? undefined,
          nextMatchId: m.nextMatchId ?? undefined,
          nextMatchSlot: (m.nextMatchSlot as "A" | "B") ?? undefined,
        })),
      })),
    }));

    return {
      id: record.id,
      name: record.name,
      format: record.format as CompetitionFormat,
      status: record.status as TournamentStatus,
      participantType: record.participantType as ParticipantType,
      gameModeId: record.gameModeId,
      championId: record.championId ?? undefined,
      championName: record.championName ?? undefined,
      participants,
      stages,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Updates an in-memory tournament state to PostgreSQL.
   */
  async saveTournamentState(tournament: ITournament): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // 1. Update Tournament metadata
      await tx.tournament.update({
        where: { id: tournament.id },
        data: {
          status: tournament.status,
          championId: tournament.championId,
          championName: tournament.championName,
          updatedAt: new Date(),
        },
      });

      // 2. Update Participants
      for (const p of tournament.participants) {
        await tx.tournamentParticipant.update({
          where: { id: p.id },
          data: {
            isEliminated: p.isEliminated,
            finalPlacement: p.finalPlacement,
          },
        });
      }

      // 3. Update Stages, Rounds, and Matches
      for (const stage of tournament.stages) {
        await tx.tournamentStage.update({
          where: { id: stage.id },
          data: { status: stage.status },
        });

        for (const round of stage.rounds) {
          await tx.tournamentRound.update({
            where: { id: round.id },
            data: { status: round.status },
          });

          for (const match of round.matches) {
            await tx.tournamentMatch.update({
              where: { id: match.id },
              data: {
                participantAId: match.participantAId,
                participantBId: match.participantBId,
                winnerId: match.winnerId,
                scoreA: match.scoreA,
                scoreB: match.scoreB,
                status: match.status,
                gameRoomId: match.gameRoomId,
                referencedMatchId: match.referencedMatchId,
              },
            });
          }
        }
      }
    });
  }

  /**
   * Updates match room link when a GameRoom is spawned for a bracket node.
   */
  async updateMatchRoom(matchId: string, gameRoomId: string, status: MatchStatus = "IN_PROGRESS"): Promise<void> {
    await this.db.tournamentMatch.update({
      where: { id: matchId },
      data: {
        gameRoomId,
        status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Lists tournaments with optional status / gameMode filters.
   */
  async listTournaments(options?: {
    status?: TournamentStatus;
    gameModeId?: string;
    limit?: number;
  }): Promise<Array<Omit<ITournament, "stages">>> {
    const records = await this.db.tournament.findMany({
      where: {
        status: options?.status,
        gameModeId: options?.gameModeId,
      },
      include: {
        participants: { orderBy: { seed: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 20,
    });

    return records.map((r) => ({
      id: r.id,
      name: r.name,
      format: r.format as CompetitionFormat,
      status: r.status as TournamentStatus,
      participantType: r.participantType as ParticipantType,
      gameModeId: r.gameModeId,
      championId: r.championId ?? undefined,
      championName: r.championName ?? undefined,
      participants: r.participants.map((p) => ({
        id: p.id,
        tournamentId: p.tournamentId,
        participantType: p.participantType as ParticipantType,
        seed: p.seed,
        name: p.name,
        avatarUrl: p.avatarUrl ?? undefined,
        playerId: p.playerId ?? undefined,
        memberIds: p.memberIds.length > 0 ? p.memberIds : undefined,
        isEliminated: p.isEliminated,
        finalPlacement: p.finalPlacement ?? undefined,
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}
