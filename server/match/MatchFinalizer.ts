// ==================================================
// MATCH FINALIZER (IDEMPOTENT ATOMIC PERSISTENCE)
//
// WHAT IT DOES:
// Atomically persists validated match outcomes to PostgreSQL via Prisma,
// recording the match, participant performances, team outcomes, weapon stats,
// and atomically updating lifetime player statistics.
//
// HOW IT WORKS:
// - Executes inside an atomic prisma.$transaction.
// - Enforces the Idempotency Invariant (ADR-012): Checks if matchId already exists.
//   If already finalized, returns the existing record immediately with zero stat drift.
// - Validates player identities against the database before inserting relational records,
//   gracefully handling guest or simulated entities without throwing foreign key errors.
// - Atomically increments lifetime PlayerStats (matches, wins, losses, kills, deaths, damage).
//
// WHY IT EXISTS:
// In distributed multiplayer architectures, duplicate finalization triggers
// (e.g., duplicate game-over RPCs, disconnect timeouts, reconnect retries)
// could otherwise result in double-counting lifetime wins and kills.
// ==================================================

import { prisma as defaultPrisma } from "../db/prisma.js";
import type { PrismaClient } from "@prisma/client";
import type { MatchSummaryPayload } from "./MatchStatsTracker.js";

export interface FinalizeResult {
  matchId: string;
  status: string;
  alreadyFinalized: boolean;
  persistedParticipantsCount: number;
}

export class MatchFinalizer {
  /**
   * Finalizes an active match, writing records to PostgreSQL idempotently.
   */
  public static async finalizeMatch(
    summary: MatchSummaryPayload,
    db: PrismaClient = defaultPrisma,
  ): Promise<FinalizeResult> {
    return await db.$transaction(async (tx) => {
      // 1. Idempotency Check: prevent duplicate stat inflation
      const existingMatch = await tx.match.findUnique({
        where: { id: summary.matchId },
      });

      if (existingMatch) {
        return {
          matchId: existingMatch.id,
          status: existingMatch.status,
          alreadyFinalized: true,
          persistedParticipantsCount: 0,
        };
      }

      // 2. Insert Match record
      const match = await tx.match.create({
        data: {
          id: summary.matchId,
          roomCode: summary.roomCode ?? null,
          gameModeId: summary.gameModeId,
          levelId: summary.levelId,
          status: summary.status,
          winningTeamIndex: summary.winningTeamIndex ?? null,
          winningPlayerId: summary.winningPlayerId ?? null,
          durationSeconds: summary.durationSeconds,
          startedAt: summary.startedAt,
          endedAt: summary.endedAt,
        },
      });

      // 3. Find all verified database players among the participants
      const candidatePlayerIds = summary.participants.map((p) => p.playerId);
      const verifiedPlayers = await tx.player.findMany({
        where: { id: { in: candidatePlayerIds } },
        select: { id: true },
      });
      const verifiedPlayerIds = new Set(verifiedPlayers.map((p) => p.id));

      let persistedParticipantsCount = 0;

      // 4. Record Participant results & update lifetime PlayerStats
      for (const p of summary.participants) {
        if (!verifiedPlayerIds.has(p.playerId)) {
          // Skip unauthenticated or mock guest IDs that have no Player DB row
          continue;
        }

        await tx.matchParticipant.create({
          data: {
            matchId: match.id,
            playerId: p.playerId,
            teamIndex: p.teamIndex,
            finalScore: p.score,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            damageDealt: p.damageDealt,
            damageReceived: p.damageReceived,
            isWinner: p.isWinner,
          },
        });
        persistedParticipantsCount++;

        // Atomically upsert lifetime PlayerStats
        await tx.playerStats.upsert({
          where: { playerId: p.playerId },
          create: {
            playerId: p.playerId,
            totalMatches: 1,
            wins: p.isWinner ? 1 : 0,
            losses: p.isWinner ? 0 : 1,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            damageDealt: p.damageDealt,
            damageReceived: p.damageReceived,
          },
          update: {
            totalMatches: { increment: 1 },
            wins: { increment: p.isWinner ? 1 : 0 },
            losses: { increment: p.isWinner ? 0 : 1 },
            kills: { increment: p.kills },
            deaths: { increment: p.deaths },
            assists: { increment: p.assists },
            damageDealt: { increment: p.damageDealt },
            damageReceived: { increment: p.damageReceived },
          },
        });
      }

      // 5. Record Team aggregates if team-based match
      const teams = new Map<number, { score: number; isWinner: boolean }>();
      for (const p of summary.participants) {
        if (p.teamIndex >= 0) {
          const current = teams.get(p.teamIndex) ?? { score: 0, isWinner: false };
          current.score += p.score;
          if (summary.winningTeamIndex !== undefined && summary.winningTeamIndex === p.teamIndex) {
            current.isWinner = true;
          }
          teams.set(p.teamIndex, current);
        }
      }

      for (const [teamIndex, teamData] of teams.entries()) {
        await tx.matchTeam.create({
          data: {
            matchId: match.id,
            teamIndex,
            teamName: teamIndex === 0 ? "Team Alpha" : teamIndex === 1 ? "Team Beta" : `Team ${teamIndex}`,
            score: teamData.score,
            isWinner: teamData.isWinner,
          },
        });
      }

      // 6. Record PlayerItemStats for verified players
      for (const itemStat of summary.itemStats) {
        if (!verifiedPlayerIds.has(itemStat.playerId)) {
          continue;
        }

        await tx.playerItemStats.create({
          data: {
            matchId: match.id,
            playerId: itemStat.playerId,
            itemId: itemStat.itemId,
            hits: itemStat.hits,
            kills: itemStat.kills,
            damageDealt: itemStat.damageDealt,
          },
        });
      }

      return {
        matchId: match.id,
        status: match.status,
        alreadyFinalized: false,
        persistedParticipantsCount,
      };
    });
  }

  /**
   * Records a match as CANCELLED (e.g. server crash or early abort)
   * with zero mutation to lifetime PlayerStats.
   */
  public static async cancelMatch(
    matchId: string,
    gameModeId: string,
    levelId: string,
    roomCode?: string,
    db: PrismaClient = defaultPrisma,
  ): Promise<FinalizeResult> {
    return await db.$transaction(async (tx) => {
      const existing = await tx.match.findUnique({ where: { id: matchId } });
      if (existing) {
        return {
          matchId: existing.id,
          status: existing.status,
          alreadyFinalized: true,
          persistedParticipantsCount: 0,
        };
      }

      const match = await tx.match.create({
        data: {
          id: matchId,
          roomCode: roomCode ?? null,
          gameModeId,
          levelId,
          status: "CANCELLED",
          durationSeconds: 0,
        },
      });

      return {
        matchId: match.id,
        status: match.status,
        alreadyFinalized: false,
        persistedParticipantsCount: 0,
      };
    });
  }
}
