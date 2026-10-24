// ==================================================
// MATCH STATISTICS TRACKER (SERVER RUNTIME)
//
// WHAT IT DOES:
// Authoritatively tracks, accumulates, and indexes all combat metrics
// (kills, deaths, assists, damage dealt/received, weapon hits/kills)
// in server RAM for the duration of a match.
//
// HOW IT WORKS:
// - Maintains in-memory maps of participant metrics keyed by sessionId.
// - Records recent damage contributions to calculate assists on knockout
//   (players dealing damage within a 10-second window prior to death receive assists).
// - Tracks item/weapon-specific metrics (hits, damage, kills) per player.
// - Exports comprehensive match summary payloads ready for Colyseus broadcast
//   and Prisma database persistence.
//
// WHY IT EXISTS:
// In compliance with ADR-005 and ADR-012, match statistics must be accumulated
// authoritatively in server memory during gameplay without database I/O overhead,
// then finalized atomically when the match concludes.
// ==================================================

export interface ParticipantMatchStats {
  sessionId: string;
  playerId: string;
  teamIndex: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageReceived: number;
  isWinner: boolean;
}

export interface PlayerItemMatchStats {
  sessionId: string;
  playerId: string;
  itemId: string;
  hits: number;
  kills: number;
  damageDealt: number;
}

export interface DamageContribution {
  attackerSessionId: string;
  damage: number;
  timestamp: number;
  weaponId: string;
}

export interface MatchSummaryPayload {
  matchId: string;
  roomCode?: string;
  gameModeId: string;
  levelId: string;
  status: "COMPLETED" | "CANCELLED";
  winningTeamIndex?: number;
  winningPlayerId?: string;
  durationSeconds: number;
  startedAt: Date;
  endedAt: Date;
  participants: ParticipantMatchStats[];
  itemStats: PlayerItemMatchStats[];
}

export class MatchStatsTracker {
  private readonly participants = new Map<string, ParticipantMatchStats>();
  private readonly itemStats = new Map<string, PlayerItemMatchStats>();
  private readonly damageHistory = new Map<string, DamageContribution[]>();
  private readonly assistWindowMs = 10_000; // 10 seconds attribution window

  /**
   * Registers a participant into tracking.
   */
  public registerParticipant(sessionId: string, playerId: string, teamIndex: number): void {
    if (this.participants.has(sessionId)) return;

    this.participants.set(sessionId, {
      sessionId,
      playerId,
      teamIndex,
      score: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damageDealt: 0,
      damageReceived: 0,
      isWinner: false,
    });
    this.damageHistory.set(sessionId, []);
  }

  /**
   * Unregisters or marks a participant as disconnected.
   */
  public unregisterParticipant(_sessionId: string): void {
    // Keep stats in memory for post-match finalization even if player disconnected
  }

  /**
   * Updates player's team affinity or persistent ID if resolved post-handshake.
   */
  public updateParticipantIdentity(sessionId: string, playerId: string, teamIndex?: number): void {
    const stats = this.participants.get(sessionId);
    if (!stats) return;

    stats.playerId = playerId;
    if (teamIndex !== undefined) {
      stats.teamIndex = teamIndex;
    }
  }

  /**
   * Records authoritative damage dealt between players.
   */
  public recordDamage(
    attackerSessionId: string,
    victimSessionId: string,
    weaponId: string,
    damage: number,
    timestamp: number = Date.now(),
  ): void {
    const attacker = this.participants.get(attackerSessionId);
    const victim = this.participants.get(victimSessionId);

    if (attacker) {
      attacker.damageDealt += damage;
    }

    if (victim) {
      victim.damageReceived += damage;

      // Record contribution for assist calculation
      let history = this.damageHistory.get(victimSessionId);
      if (!history) {
        history = [];
        this.damageHistory.set(victimSessionId, history);
      }
      history.push({
        attackerSessionId,
        damage,
        timestamp,
        weaponId,
      });
    }

    // Record weapon-specific stats
    if (attacker && weaponId) {
      const itemKey = `${attackerSessionId}:${weaponId}`;
      let itemRecord = this.itemStats.get(itemKey);
      if (!itemRecord) {
        itemRecord = {
          sessionId: attackerSessionId,
          playerId: attacker.playerId,
          itemId: weaponId,
          hits: 0,
          kills: 0,
          damageDealt: 0,
        };
        this.itemStats.set(itemKey, itemRecord);
      }
      itemRecord.hits += 1;
      itemRecord.damageDealt += damage;
    }
  }

  /**
   * Records a kill, awards score and kill count, updates weapon stats,
   * evaluates assist attribution, and resets victim's recent damage history.
   * Returns list of sessionIds that earned an assist.
   */
  public recordKill(
    killerSessionId: string | null,
    victimSessionId: string,
    weaponId: string = "FISTS",
    timestamp: number = Date.now(),
    minDamageThresholdPct: number = 0,
    victimMaxHealth: number = 100,
    requireSameTeam: boolean = false,
  ): string[] {
    const victim = this.participants.get(victimSessionId);
    if (victim) {
      victim.deaths += 1;
    }

    if (killerSessionId) {
      const killer = this.participants.get(killerSessionId);
      if (killer) {
        killer.kills += 1;
        killer.score += 1;

        // Weapon kill credit
        if (weaponId) {
          const itemKey = `${killerSessionId}:${weaponId}`;
          let itemRecord = this.itemStats.get(itemKey);
          if (!itemRecord) {
            itemRecord = {
              sessionId: killerSessionId,
              playerId: killer.playerId,
              itemId: weaponId,
              hits: 0,
              kills: 0,
              damageDealt: 0,
            };
            this.itemStats.set(itemKey, itemRecord);
          }
          itemRecord.kills += 1;
        }
      }
    }

    // Determine assists
    const awardedAssists: string[] = [];
    const history = this.damageHistory.get(victimSessionId) || [];
    const cutoff = timestamp - this.assistWindowMs;
    const damageByAttacker = new Map<string, number>();

    const killer = killerSessionId ? this.participants.get(killerSessionId) : null;

    for (const entry of history) {
      if (
        entry.timestamp >= cutoff &&
        entry.attackerSessionId !== killerSessionId &&
        entry.attackerSessionId !== victimSessionId
      ) {
        // In team modes, ensure the assister is on the same team as the killer
        if (requireSameTeam && killer && killer.teamIndex >= 0) {
          const assister = this.participants.get(entry.attackerSessionId);
          if (!assister || assister.teamIndex !== killer.teamIndex) {
            continue;
          }
        }

        const current = damageByAttacker.get(entry.attackerSessionId) || 0;
        damageByAttacker.set(entry.attackerSessionId, current + entry.damage);
      }
    }

    const minDamageRequired = victimMaxHealth * minDamageThresholdPct;

    for (const [contributorSessionId, damageDealt] of damageByAttacker) {
      if (damageDealt >= minDamageRequired) {
        const assister = this.participants.get(contributorSessionId);
        if (assister) {
          assister.assists += 1;
          awardedAssists.push(contributorSessionId);
        }
      }
    }

    // Clear damage history for victim now that they have died
    this.damageHistory.set(victimSessionId, []);

    return awardedAssists;
  }

  /**
   * Directly sets score for a participant.
   */
  public setScore(sessionId: string, score: number): void {
    const p = this.participants.get(sessionId);
    if (p) {
      p.score = score;
    }
  }

  /**
   * Retrieves current stats for a single participant.
   */
  public getParticipantStats(sessionId: string): ParticipantMatchStats | undefined {
    return this.participants.get(sessionId);
  }

  /**
   * Retrieves all participant stats as an array.
   */
  public getAllParticipantStats(): ParticipantMatchStats[] {
    return Array.from(this.participants.values());
  }

  /**
   * Retrieves all item/weapon stats as an array.
   */
  public getAllItemStats(): PlayerItemMatchStats[] {
    return Array.from(this.itemStats.values());
  }

  /**
   * Exports full match summary payload.
   */
  public exportMatchSummary(
    matchId: string,
    gameModeId: string,
    levelId: string,
    startedAt: Date,
    endedAt: Date,
    winningPlayerId?: string,
    winningTeamIndex?: number,
    roomCode?: string,
  ): MatchSummaryPayload {
    const durationSeconds = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 1000);

    const participants = Array.from(this.participants.values()).map((p) => {
      const isWinner =
        (winningPlayerId !== undefined && p.playerId === winningPlayerId) ||
        (winningTeamIndex !== undefined && winningTeamIndex >= 0 && p.teamIndex === winningTeamIndex);

      return {
        ...p,
        isWinner,
      };
    });

    return {
      matchId,
      roomCode,
      gameModeId,
      levelId,
      status: "COMPLETED",
      winningTeamIndex,
      winningPlayerId,
      durationSeconds,
      startedAt,
      endedAt,
      participants,
      itemStats: Array.from(this.itemStats.values()),
    };
  }
}
