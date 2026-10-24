// ==================================================
// PLAYER PROFILE & CAREER DOSSIER REST ROUTES
//
// WHAT IT DOES:
// Implements HTTP endpoints for fetching comprehensive fighter profiles
// (/profile) and public player cards (/:id/public).
//
// HOW IT WORKS:
// - /profile: Validates JWT Bearer session token, loads Player and lifetime
//   PlayerStats, calculates zero-safe derived ratios, aggregates weapon mastery
//   from PlayerItemStats, and retrieves the 15 most recent match history logs.
// - /:id/public: Public read-only endpoint for viewing another fighter's combat dossier.
//
// WHY IT EXISTS:
// Enforces Phase 14 requirements and ADR-004/ADR-012, serving full career
// records to the React ProfileScreen and ProfileModal.
// ==================================================

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../db/prisma.ts";
import { GAME_ITEMS } from "../../../shared/domain/GameItem.ts";
import type {
  FullPlayerProfileView,
  PlayerWeaponMastery,
  PlayerMatchHistoryEntry,
} from "../../../shared/domain/Identity.ts";

export const playerRoutes: FastifyPluginAsync = async (app) => {
  // --------------------------------------------------
  // 1. GET /api/player/profile (Authenticated Current Player)
  // --------------------------------------------------
  app.get<{
    Reply: FullPlayerProfileView | { statusCode: number; error: string; message: string };
  }>(
    "/profile",
    {
      onRequest: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Missing or invalid session token. Please log in.",
          });
        }
      },
    },
    async (request, reply) => {
      const { playerId } = request.user;

      // 1. Query Player and permanent lifetime PlayerStats
      const playerWithStats = await prisma.player.findUnique({
        where: { id: playerId },
        include: { stats: true },
      });

      if (!playerWithStats || !playerWithStats.stats) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Player profile not found.",
        });
      }

      const { stats, ...playerData } = playerWithStats;

      // 2. Calculate derived ratios safely on read (prevent data drift)
      const totalMatches = stats.totalMatches;
      const wins = stats.wins;
      const kills = stats.kills;
      const deaths = stats.deaths;
      const assists = stats.assists;
      const damageDealt = stats.damageDealt;
      const damageReceived = stats.damageReceived;

      const killDeathRatio =
        deaths === 0 ? kills : Number((kills / deaths).toFixed(2));
      const winRatePercentage =
        totalMatches === 0 ? 0 : Number(((wins / totalMatches) * 100).toFixed(1));
      const averageDamageDealt =
        totalMatches === 0 ? 0 : Math.round(damageDealt / totalMatches);
      const averageDamageReceived =
        totalMatches === 0 ? 0 : Math.round(damageReceived / totalMatches);
      const kdDifferential = kills - deaths;
      const combatScore =
        wins * 100 + kills * 25 + assists * 10 + Math.round(damageDealt / 10);

      // 3. Query and aggregate Weapon / Item Mastery
      const rawItemStats = await prisma.playerItemStats.findMany({
        where: { playerId },
      });

      const weaponAggregates = new Map<
        string,
        { matchesUsed: number; hits: number; kills: number; damageDealt: number }
      >();

      for (const item of rawItemStats) {
        const existing = weaponAggregates.get(item.itemId) ?? {
          matchesUsed: 0,
          hits: 0,
          kills: 0,
          damageDealt: 0,
        };
        existing.matchesUsed += 1;
        existing.hits += item.hits;
        existing.kills += item.kills;
        existing.damageDealt += item.damageDealt;
        weaponAggregates.set(item.itemId, existing);
      }

      // Ensure catalog weapons are populated even if never deployed
      const catalogWeaponIds = ["FISTS", "ENERGY_BLADE", "THUNDER_HAMMER", "PLASMA_PISTOL"];
      for (const weaponId of catalogWeaponIds) {
        if (!weaponAggregates.has(weaponId)) {
          weaponAggregates.set(weaponId, {
            matchesUsed: 0,
            hits: 0,
            kills: 0,
            damageDealt: 0,
          });
        }
      }

      const weaponMastery: PlayerWeaponMastery[] = Array.from(weaponAggregates.entries()).map(
        ([itemId, agg]) => {
          const itemDef = GAME_ITEMS[itemId] ?? {
            id: itemId,
            name: itemId === "FISTS" ? "Bare Fists" : itemId,
            category: "WEAPON",
            accentColor: "#94a3b8",
          };

          const damagePerHit =
            agg.hits > 0 ? Number((agg.damageDealt / agg.hits).toFixed(1)) : 0;

          return {
            itemId,
            name: itemDef.name,
            category: itemDef.category,
            accentColor: itemDef.accentColor,
            matchesUsed: agg.matchesUsed,
            hits: agg.hits,
            kills: agg.kills,
            damageDealt: agg.damageDealt,
            damagePerHit,
          };
        },
      );

      // 4. Query Recent Match History Logs (Last 15 matches)
      const recentParticipations = await prisma.matchParticipant.findMany({
        where: { playerId },
        include: {
          match: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 15,
      });

      const recentMatches: PlayerMatchHistoryEntry[] = recentParticipations.map((p) => ({
        matchId: p.matchId,
        gameModeId: p.match.gameModeId,
        levelId: p.match.levelId,
        status: p.match.status,
        isWinner: p.isWinner,
        score: p.finalScore,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        damageDealt: p.damageDealt,
        damageReceived: p.damageReceived,
        durationSeconds: p.match.durationSeconds,
        endedAt: p.match.endedAt ?? p.createdAt,
      }));

      return reply.status(200).send({
        player: {
          id: playerData.id,
          userId: playerData.userId,
          playerName: playerData.playerName,
          avatarUrl: playerData.avatarUrl,
          createdAt: playerData.createdAt,
        },
        stats: {
          playerId: stats.playerId,
          totalMatches: stats.totalMatches,
          wins: stats.wins,
          losses: stats.losses,
          kills: stats.kills,
          deaths: stats.deaths,
          assists: stats.assists,
          damageDealt: stats.damageDealt,
          damageReceived: stats.damageReceived,
          updatedAt: stats.updatedAt,
        },
        derived: {
          killDeathRatio,
          winRatePercentage,
          averageDamageDealt,
          averageDamageReceived,
          kdDifferential,
          combatScore,
        },
        weaponMastery,
        recentMatches,
      });
    },
  );

  // --------------------------------------------------
  // 2. GET /api/player/:id/public (Public View for any Fighter)
  // --------------------------------------------------
  app.get<{
    Params: { id: string };
  }>("/:id/public", async (request, reply) => {
    const { id } = request.params;

    const playerWithStats = await prisma.player.findUnique({
      where: { id },
      include: { stats: true },
    });

    if (!playerWithStats || !playerWithStats.stats) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Fighter not found.",
      });
    }

    const { stats, ...playerData } = playerWithStats;

    const killDeathRatio =
      stats.deaths === 0 ? stats.kills : Number((stats.kills / stats.deaths).toFixed(2));
    const winRatePercentage =
      stats.totalMatches === 0
        ? 0
        : Number(((stats.wins / stats.totalMatches) * 100).toFixed(1));

    return reply.status(200).send({
      player: {
        id: playerData.id,
        playerName: playerData.playerName,
        avatarUrl: playerData.avatarUrl,
        createdAt: playerData.createdAt,
      },
      stats: {
        totalMatches: stats.totalMatches,
        wins: stats.wins,
        losses: stats.losses,
        kills: stats.kills,
        deaths: stats.deaths,
        damageDealt: stats.damageDealt,
      },
      derived: {
        killDeathRatio,
        winRatePercentage,
      },
    });
  });
};
