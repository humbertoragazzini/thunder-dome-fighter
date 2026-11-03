// ==================================================
// AUTHORITATIVE TOURNAMENT LOBBY COLYSEUS ROOM
//
// WHAT IT DOES:
// Authoritative Colyseus room managing tournament staging, participant registration,
// seeding, ready-check validation, concurrent match launching in isolated GameRooms,
// downstream round progression, and champion podium crowning (Phase 21).
//
// HOW IT WORKS:
// - Manages `TournamentLobbyState` synchronized to all contestants and spectators.
// - Supports configurable tournament capacities: 4 (Cuadrangular), 8 (Octagonal), 16 (Sweet 16).
// - Enforces launch barriers: tournament starts only when all slots are filled and non-hosts are ready.
// - On start, coordinates with `TournamentCoordinatorService` to seed bracket and persist to DB.
// - Concurrently spawns `GameRoom` instances for initial round matches (e.g. Semifinal 1 & Semifinal 2).
// - Generates authenticated seat reservations and dispatches `MATCH_ASSIGNED` to fighters.
// - Subscribes to match conclusion events: marks losers as eliminated, advances winners,
//   automatically spawns downstream matches (Grand Final), and crowns the Champion.
//
// WHY IT EXISTS:
// Bridges player intent from menus into structured multi-tier tournament gameplay.
// ==================================================

import { Room, type Client, ServerError, matchMaker } from "colyseus";
import {
  TournamentClientMessage,
  TournamentServerMessage,
  type CreateTournamentLobbyOptions,
  type TournamentUpdateSettingsPayload,
  type TournamentKickParticipantPayload,
  type TournamentMatchAssignedPayload,
  type TournamentChampionCrownedPayload,
  type TournamentPlacementItem,
  type TournamentRequestSpectatePayload,
  type TournamentSpectateGrantedPayload,
  type TournamentRequestMatchReservationPayload,
} from "../../shared/contracts/network/TournamentMessages.js";
import {
  TournamentLobbyState,
  TournamentLobbyParticipant,
} from "./TournamentLobbyState.js";
import { tournamentCoordinatorService } from "./TournamentCoordinatorService.js";
import { verifySessionToken, type AuthenticatedUser } from "../auth/TokenVerifier.js";
import { getWebTransportFingerprint } from "../transport/webTransportCert.js";
import type { ITournamentMatch } from "../../shared/domain/tournament/TournamentTypes.js";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class TournamentLobbyRoom extends Room<{ state: TournamentLobbyState }> {
  override state = new TournamentLobbyState();
  private clientTokens = new Map<string, string>(); // sessionId -> token
  private clientSockets = new Map<string, Client>(); // sessionId -> Client
  private unsubscribeCoordinator?: () => void;

  private getAuthUser(client: Client): AuthenticatedUser | undefined {
    const auth = client.auth as any;
    if (!auth) return undefined;
    if (auth.user && typeof auth.user.playerId === "string") {
      return auth.user as AuthenticatedUser;
    }
    if (typeof auth.playerId === "string") {
      return auth as AuthenticatedUser;
    }
    return undefined;
  }

  override onCreate(options: CreateTournamentLobbyOptions = {} as CreateTournamentLobbyOptions): void {
    const capacity = [4, 8, 16].includes(options.participantCapacity)
      ? options.participantCapacity
      : 4;

    this.state.tournamentName = options.tournamentName
      ? options.tournamentName.trim().slice(0, 32)
      : (capacity === 4 ? "Cuadrangular Championship" : `${capacity}-Fighter Championship`);
    this.state.participantCapacity = capacity;
    this.state.format = "KNOCKOUT";
    this.state.status = "WAITING";
    this.state.scoreLimit = options.scoreLimit && options.scoreLimit > 0 ? options.scoreLimit : 5;
    this.state.timeLimitSeconds =
      options.timeLimitSeconds && options.timeLimitSeconds > 0 ? options.timeLimitSeconds : 180;
    this.state.isPrivate = Boolean(options.isPrivate);
    this.state.roomCode = options.roomCode ? options.roomCode.trim().toUpperCase() : generateRoomCode();
    this.state.currentRoundName = "Registration";

    this.maxClients = capacity + 8; // Participants + spectator slots
    this.autoDispose = true;

    this.setMetadata({
      tournamentName: this.state.tournamentName,
      hostName: "",
      participantCapacity: this.state.participantCapacity,
      currentParticipants: 0,
      scoreLimit: this.state.scoreLimit,
      timeLimitSeconds: this.state.timeLimitSeconds,
      isPrivate: this.state.isPrivate,
      roomCode: this.state.roomCode,
      status: "WAITING",
      currentRoundName: this.state.currentRoundName,
    });

    // Subscribe to tournament coordinator events
    this.unsubscribeCoordinator = tournamentCoordinatorService.subscribe(
      this.handleTournamentCoordinatorEvent.bind(this),
    );

    // --------------------------------------------------
    // MESSAGE HANDLERS
    // --------------------------------------------------

    this.onMessage(TournamentClientMessage.TOGGLE_READY, (client: Client) => {
      const participant = this.state.participants.get(client.sessionId);
      if (!participant || this.state.status !== "WAITING") return;

      // Host is always considered ready
      if (participant.isHost) {
        participant.isReady = true;
        return;
      }

      participant.isReady = !participant.isReady;
    });

    this.onMessage(
      TournamentClientMessage.UPDATE_SETTINGS,
      (client: Client, payload: TournamentUpdateSettingsPayload) => {
        if (client.sessionId !== this.state.hostSessionId || this.state.status !== "WAITING") {
          return;
        }

        if (payload.tournamentName && typeof payload.tournamentName === "string") {
          this.state.tournamentName = payload.tournamentName.trim().slice(0, 32);
        }
        if (typeof payload.scoreLimit === "number" && payload.scoreLimit > 0) {
          this.state.scoreLimit = Math.min(Math.max(payload.scoreLimit, 1), 50);
        }
        if (typeof payload.timeLimitSeconds === "number" && payload.timeLimitSeconds > 0) {
          this.state.timeLimitSeconds = Math.min(Math.max(payload.timeLimitSeconds, 30), 1200);
        }

        // Reset non-host readiness upon settings alteration
        for (const p of this.state.participants.values()) {
          if (!p.isHost) {
            p.isReady = false;
          }
        }

        this.setMetadata({
          tournamentName: this.state.tournamentName,
          scoreLimit: this.state.scoreLimit,
          timeLimitSeconds: this.state.timeLimitSeconds,
        });
      },
    );

    this.onMessage(
      TournamentClientMessage.KICK_PARTICIPANT,
      (client: Client, payload: TournamentKickParticipantPayload) => {
        if (client.sessionId !== this.state.hostSessionId || this.state.status !== "WAITING") {
          return;
        }

        if (payload.targetSessionId === this.state.hostSessionId) {
          return; // Host cannot kick themselves
        }

        const targetClient = this.clientSockets.get(payload.targetSessionId);
        if (targetClient) {
          targetClient.send(TournamentServerMessage.PARTICIPANT_KICKED, {
            reason: "Removed by tournament host",
          });
          targetClient.leave();
        }
      },
    );

    this.onMessage(
      TournamentClientMessage.REQUEST_SPECTATE,
      async (client: Client, payload: TournamentRequestSpectatePayload) => {
        try {
          const tournament = await tournamentCoordinatorService.getTournament(this.state.tournamentId);
          if (!tournament) return;

          let targetMatch: ITournamentMatch | undefined;
          for (const s of tournament.stages) {
            for (const r of s.rounds) {
              for (const m of r.matches) {
                if (m.id === payload.matchId) {
                  targetMatch = m;
                  break;
                }
              }
              if (targetMatch) break;
            }
            if (targetMatch) break;
          }

          if (!targetMatch || !targetMatch.gameRoomId || targetMatch.status !== "IN_PROGRESS") {
            return;
          }

          const localRoom = matchMaker.getLocalRoomById(targetMatch.gameRoomId);
          const roomListing = localRoom ?? { roomId: targetMatch.gameRoomId };
          const token = this.clientTokens.get(client.sessionId) ?? "";
          const user = this.getAuthUser(client);

          const reservation = await matchMaker.reserveSeatFor(roomListing as any, {
            token,
            playerId: user?.playerId ?? "",
            playerName: user?.playerName ?? "Spectator",
            avatarUrl: "",
            modeId: "1v1",
            isSpectator: true,
          });

          const pA = tournament.participants.find((p) => p.id === targetMatch!.participantAId);
          const pB = tournament.participants.find((p) => p.id === targetMatch!.participantBId);

          const response: TournamentSpectateGrantedPayload = {
            tournamentId: this.state.tournamentId,
            matchId: targetMatch.id,
            roundName: targetMatch.roundName,
            gameRoomId: targetMatch.gameRoomId,
            reservation,
            participantAName: pA?.name ?? "Fighter 1",
            participantBName: pB?.name ?? "Fighter 2",
            fingerprint: getWebTransportFingerprint(),
          };

          client.send(TournamentServerMessage.SPECTATE_GRANTED, response);
        } catch (err) {
          console.error("[TournamentLobby] Spectate reservation failed:", err);
        }
      },
    );

    this.onMessage(
      TournamentClientMessage.REQUEST_MATCH_RESERVATION,
      async (client: Client, payload: TournamentRequestMatchReservationPayload) => {
        try {
          const tournament = await tournamentCoordinatorService.getTournament(this.state.tournamentId);
          if (!tournament) return;

          let targetMatch: ITournamentMatch | undefined;
          for (const s of tournament.stages) {
            for (const r of s.rounds) {
              for (const m of r.matches) {
                if (m.id === payload.matchId) {
                  targetMatch = m;
                  break;
                }
              }
              if (targetMatch) break;
            }
            if (targetMatch) break;
          }

          if (!targetMatch || !targetMatch.gameRoomId) {
            return;
          }

          const user = this.getAuthUser(client);
          if (!user) return;

          const pA = tournament.participants.find((p) => p.id === targetMatch!.participantAId);
          const pB = tournament.participants.find((p) => p.id === targetMatch!.participantBId);

          const isPartA = pA?.playerId === user.playerId;
          const isPartB = pB?.playerId === user.playerId;

          if (!isPartA && !isPartB) {
            console.warn(`[TournamentLobby] Client ${user.playerName} is not a combatant in match ${targetMatch.id}`);
            return;
          }

          const myParticipant = isPartA ? pA! : pB!;
          const opponent = isPartA ? pB : pA;
          const teamIndex = isPartA ? 0 : 1;
          const slot = isPartA ? "A" : "B";

          const localRoom = matchMaker.getLocalRoomById(targetMatch.gameRoomId);
          const roomListing = localRoom ?? { roomId: targetMatch.gameRoomId };
          const token = this.clientTokens.get(client.sessionId) ?? "";

          const reservation = await matchMaker.reserveSeatFor(roomListing as any, {
            token,
            playerId: myParticipant.playerId ?? user.playerId,
            playerName: myParticipant.name,
            avatarUrl: myParticipant.avatarUrl ?? "",
            modeId: "1v1",
            teamIndex,
          });

          const matchAssignedPayload: TournamentMatchAssignedPayload = {
            tournamentId: this.state.tournamentId,
            matchId: targetMatch.id,
            roundName: targetMatch.roundName,
            gameRoomId: targetMatch.gameRoomId,
            reservation,
            opponentName: opponent?.name ?? "Opponent",
            opponentAvatarUrl: opponent?.avatarUrl,
            slot,
            fingerprint: getWebTransportFingerprint(),
          };

          client.send(TournamentServerMessage.MATCH_ASSIGNED, matchAssignedPayload);
          console.log(`🏆 [TournamentLobby] Re-dispatched match reservation to ${myParticipant.name} for ${targetMatch.roundName}`);
        } catch (err) {
          console.error("[TournamentLobby] Error in REQUEST_MATCH_RESERVATION:", err);
        }
      },
    );

    this.onMessage(TournamentClientMessage.START_TOURNAMENT, async (client: Client) => {
      if (client.sessionId !== this.state.hostSessionId) {
        return;
      }

      if (this.state.status !== "WAITING") {
        return;
      }

      // Collect registered combatants (slots 0 .. capacity - 1)
      const combatants: TournamentLobbyParticipant[] = [];
      for (const p of this.state.participants.values()) {
        if (p.slotIndex >= 0 && p.slotIndex < this.state.participantCapacity) {
          combatants.push(p);
        }
      }

      combatants.sort((a, b) => a.slotIndex - b.slotIndex);

      // Verify slot capacity
      if (combatants.length !== this.state.participantCapacity) {
        console.warn(
          `[TournamentLobby] Cannot start: Need exactly ${this.state.participantCapacity} fighters, got ${combatants.length}`,
        );
        return;
      }

      // Verify all non-host participants are ready
      const allReady = combatants.every((c) => c.isHost || c.isReady);
      if (!allReady) {
        console.warn("[TournamentLobby] Cannot start: Not all participants are ready");
        return;
      }

      try {
        this.state.status = "STARTING";
        this.setMetadata({ status: "STARTING" });

        // Assign seeds 1 .. capacity
        for (let i = 0; i < combatants.length; i++) {
          combatants[i].seed = i + 1;
        }

        // Create authoritative tournament aggregate
        const tournament = await tournamentCoordinatorService.createTournament({
          name: this.state.tournamentName,
          format: "KNOCKOUT",
          participantType: "INDIVIDUAL",
          gameModeId: "1v1",
          participants: combatants.map((c) => ({
            name: c.playerName,
            avatarUrl: c.avatarUrl,
            playerId: c.playerId,
            seed: c.seed,
          })),
        });

        // Advance to IN_PROGRESS
        await tournamentCoordinatorService.startTournament(tournament.id);

        this.state.tournamentId = tournament.id;
        this.state.status = "IN_PROGRESS";
        const initialRound = tournament.stages[0]?.rounds[0];
        this.state.currentRoundName = initialRound?.name ?? "Round 1";

        this.setMetadata({
          status: "IN_PROGRESS",
          currentRoundName: this.state.currentRoundName,
        });

        console.log(
          `🏆 [TournamentLobby] Tournament ${tournament.id} launched with ${combatants.length} fighters in round '${this.state.currentRoundName}'!`,
        );

        // Broadcast initial bracket state
        this.broadcast(TournamentServerMessage.BRACKET_UPDATED, {
          tournamentId: tournament.id,
          stages: tournament.stages,
          participants: tournament.participants,
        });

        // Spawn all opening round matches concurrently
        if (initialRound && initialRound.matches) {
          for (const match of initialRound.matches) {
            await this.launchTournamentMatch(tournament.id, match);
          }
        }
      } catch (err) {
        console.error("[TournamentLobby] Failed to start tournament:", err);
        this.state.status = "WAITING";
        this.setMetadata({ status: "WAITING" });
      }
    });
  }

  /**
   * Spawns an isolated GameRoom for a match node and dispatches seat reservations to players.
   */
  public async launchTournamentMatch(tournamentId: string, match: ITournamentMatch): Promise<void> {
    try {
      const tournament = await tournamentCoordinatorService.getTournament(tournamentId);
      if (!tournament) return;

      const participantA = tournament.participants.find((p) => p.id === match.participantAId);
      const participantB = tournament.participants.find((p) => p.id === match.participantBId);

      if (!participantA || !participantB) {
        console.warn(`[TournamentLobby] Match ${match.id} missing participants`);
        return;
      }

      // Spawn authoritative GameRoom
      const { gameRoomId, roomListing } = await tournamentCoordinatorService.spawnMatchGameRoom(
        tournamentId,
        match.id,
        {
          scoreLimit: this.state.scoreLimit,
          timeLimitSeconds: this.state.timeLimitSeconds,
        },
      );

      const fp = getWebTransportFingerprint();

      // Find client sessions for participant A and B
      let clientA: Client | undefined;
      let clientB: Client | undefined;

      for (const [sessionId, p] of this.state.participants.entries()) {
        if (p.playerId === participantA.playerId) {
          clientA = this.clientSockets.get(sessionId);
        }
        if (p.playerId === participantB.playerId) {
          clientB = this.clientSockets.get(sessionId);
        }
      }

      // Reserve seats & dispatch MATCH_ASSIGNED
      if (clientA) {
        const tokenA = this.clientTokens.get(clientA.sessionId) ?? "";
        const reservationA = await matchMaker.reserveSeatFor(roomListing, {
          token: tokenA,
          playerId: participantA.playerId ?? "",
          playerName: participantA.name,
          avatarUrl: participantA.avatarUrl ?? "",
          modeId: "1v1",
          teamIndex: 0,
        });

        const payloadA: TournamentMatchAssignedPayload = {
          tournamentId,
          matchId: match.id,
          roundName: match.roundName,
          gameRoomId,
          reservation: reservationA,
          opponentName: participantB.name,
          opponentAvatarUrl: participantB.avatarUrl,
          slot: "A",
          fingerprint: fp,
        };
        clientA.send(TournamentServerMessage.MATCH_ASSIGNED, payloadA);
      }

      if (clientB) {
        const tokenB = this.clientTokens.get(clientB.sessionId) ?? "";
        const reservationB = await matchMaker.reserveSeatFor(roomListing, {
          token: tokenB,
          playerId: participantB.playerId ?? "",
          playerName: participantB.name,
          avatarUrl: participantB.avatarUrl ?? "",
          modeId: "1v1",
          teamIndex: 1,
        });

        const payloadB: TournamentMatchAssignedPayload = {
          tournamentId,
          matchId: match.id,
          roundName: match.roundName,
          gameRoomId,
          reservation: reservationB,
          opponentName: participantA.name,
          opponentAvatarUrl: participantA.avatarUrl,
          slot: "B",
          fingerprint: fp,
        };
        clientB.send(TournamentServerMessage.MATCH_ASSIGNED, payloadB);
      }

      console.log(
        `🏆 [TournamentLobby] Dispatched Match ${match.id} (${participantA.name} vs ${participantB.name}) in GameRoom ${gameRoomId}`,
      );
    } catch (err) {
      console.error(`[TournamentLobby] Error launching match ${match.id}:`, err);
    }
  }

  /**
   * Listener for tournament coordinator events (match completions, champion crowning).
   */
  private async handleTournamentCoordinatorEvent(event: any): Promise<void> {
    if (event.tournamentId !== this.state.tournamentId) {
      return;
    }

    if (event.type === "MATCH_COMPLETED" && event.match) {
      const match: ITournamentMatch = event.match;
      const tournament = event.tournament;

      // Mark eliminated participant in lobby state
      const loserId = match.winnerId === match.participantAId ? match.participantBId : match.participantAId;
      const loser = tournament.participants.find((p: any) => p.id === loserId);

      if (loser) {
        for (const p of this.state.participants.values()) {
          if (p.playerId === loser.playerId) {
            p.isEliminated = true;
            if (loser.finalPlacement) {
              p.finalPlacement = loser.finalPlacement;
            }
          }
        }
      }

      // Broadcast bracket update
      this.broadcast(TournamentServerMessage.BRACKET_UPDATED, {
        tournamentId: this.state.tournamentId,
        lastCompletedMatchId: match.id,
        stages: tournament.stages,
        participants: tournament.participants,
      });
    } else if (event.type === "MATCH_SCHEDULED" && event.match) {
      const match: ITournamentMatch = event.match;
      const tournament = event.tournament;

      this.broadcast(TournamentServerMessage.BRACKET_UPDATED, {
        tournamentId: this.state.tournamentId,
        stages: tournament.stages,
        participants: tournament.participants,
      });

      // When downstream match (e.g. Grand Final) has both combatants resolved, automatically spawn it!
      if (match.participantAId && match.participantBId && match.status === "SCHEDULED") {
        this.state.currentRoundName = match.roundName;
        this.setMetadata({ currentRoundName: match.roundName });
        await this.launchTournamentMatch(this.state.tournamentId, match);
      }
    } else if (event.type === "TOURNAMENT_COMPLETED") {
      this.state.status = "COMPLETED";
      this.state.championId = event.tournament.championId ?? "";
      this.state.championName = event.tournament.championName ?? "";
      this.state.currentRoundName = "Finished";

      const placements: TournamentPlacementItem[] = [];

      for (const p of event.tournament.participants) {
        placements.push({
          participantId: p.id,
          name: p.name,
          seed: p.seed,
          placement: p.finalPlacement ?? 0,
        });

        // Sync to schema participants
        for (const lp of this.state.participants.values()) {
          if (lp.playerId === p.playerId) {
            lp.finalPlacement = p.finalPlacement ?? 0;
            if (p.finalPlacement === 1) {
              lp.isEliminated = false;
            }
          }
        }
      }

      placements.sort((a, b) => a.placement - b.placement);

      this.setMetadata({
        status: "COMPLETED",
        currentRoundName: "Finished",
      });

      const payload: TournamentChampionCrownedPayload = {
        tournamentId: this.state.tournamentId,
        championId: this.state.championId,
        championName: this.state.championName,
        placements,
      };

      this.broadcast(TournamentServerMessage.CHAMPION_CROWNED, payload);
    }
  }

  override async onAuth(client: Client, options: any): Promise<AuthenticatedUser> {
    const token = options?.token ?? options?._authToken;
    let user: AuthenticatedUser | undefined;

    if (token) {
      try {
        user = await verifySessionToken(token);
        (client as any)._sessionToken = token;
      } catch {
        // Fall back to test credentials if available
      }
    }

    if (!user) {
      if (options?.playerId && options?.playerName) {
        user = {
          userId: options.userId ?? `user-${options.playerId}`,
          playerId: options.playerId,
          playerName: options.playerName,
          email: `${options.playerId}@example.com`,
        };
      } else {
        throw new ServerError(401, "Authentication required to join tournament lobby");
      }
    }

    // Verify room code for private tournaments
    if (this.state.isPrivate && this.state.hostSessionId) {
      const submittedCode = options?.roomCode ? String(options.roomCode).trim().toUpperCase() : "";
      if (submittedCode !== this.state.roomCode) {
        throw new ServerError(403, "Invalid private tournament code");
      }
    }

    // If tournament has already completed, block new joiners
    if (this.state.status === "COMPLETED") {
      throw new ServerError(403, "Tournament has already completed");
    }

    return user;
  }

  override onJoin(client: Client, options: any): void {
    const user = this.getAuthUser(client);
    if (!user) return;

    const token = (client as any)._sessionToken ?? options?.token ?? options?._authToken ?? "";
    this.clientTokens.set(client.sessionId, token);
    this.clientSockets.set(client.sessionId, client);

    const participant = new TournamentLobbyParticipant();
    participant.sessionId = client.sessionId;
    participant.playerId = user.playerId;
    participant.playerName = user.playerName;
    participant.avatarUrl = options?.avatarUrl ?? "";

    const isFirstParticipant = !this.state.hostSessionId;
    if (isFirstParticipant) {
      this.state.hostSessionId = client.sessionId;
      this.state.hostPlayerId = user.playerId;
      participant.isHost = true;
      participant.isReady = true;
      participant.slotIndex = 0;
      participant.seed = 1;
    } else {
      participant.isHost = false;
      participant.isReady = false;

      // Assign first available fighter slot (0 .. capacity - 1), or -1 if spectator
      const occupiedSlots = new Set<number>();
      for (const p of this.state.participants.values()) {
        if (p.slotIndex >= 0) {
          occupiedSlots.add(p.slotIndex);
        }
      }

      let assignedSlot = -1;
      for (let s = 0; s < this.state.participantCapacity; s++) {
        if (!occupiedSlots.has(s)) {
          assignedSlot = s;
          break;
        }
      }

      participant.slotIndex = assignedSlot;
      participant.seed = assignedSlot >= 0 ? assignedSlot + 1 : 0;
    }

    this.state.participants.set(client.sessionId, participant);

    const fighterCount = Array.from(this.state.participants.values()).filter(
      (p) => p.slotIndex >= 0,
    ).length;

    this.setMetadata({
      tournamentName: this.state.tournamentName,
      hostName: this.state.participants.get(this.state.hostSessionId)?.playerName ?? participant.playerName,
      participantCapacity: this.state.participantCapacity,
      currentParticipants: fighterCount,
      scoreLimit: this.state.scoreLimit,
      timeLimitSeconds: this.state.timeLimitSeconds,
      isPrivate: this.state.isPrivate,
      roomCode: this.state.roomCode,
      status: this.state.status,
      currentRoundName: this.state.currentRoundName,
    });

    if (this.state.status === "IN_PROGRESS" || this.state.status === "COMPLETED") {
      tournamentCoordinatorService.getTournament(this.state.tournamentId).then(async (t) => {
        if (t) {
          client.send(TournamentServerMessage.BRACKET_UPDATED, {
            tournamentId: t.id,
            stages: t.stages,
            participants: t.participants,
          });

          // Check if joining player is a combatant in an active/scheduled match
          if (this.state.status === "IN_PROGRESS") {
            for (const stage of t.stages) {
              for (const round of stage.rounds) {
                for (const m of round.matches) {
                  if (m.gameRoomId && (m.status === "SCHEDULED" || m.status === "IN_PROGRESS")) {
                    const pA = t.participants.find((p) => p.id === m.participantAId);
                    const pB = t.participants.find((p) => p.id === m.participantBId);
                    const isPartA = pA?.playerId === user.playerId;
                    const isPartB = pB?.playerId === user.playerId;

                    if (isPartA || isPartB) {
                      const myParticipant = isPartA ? pA! : pB!;
                      const opponent = isPartA ? pB : pA;
                      const teamIndex = isPartA ? 0 : 1;
                      const slot = isPartA ? "A" : "B";

                      const localRoom = matchMaker.getLocalRoomById(m.gameRoomId);
                      const roomListing = localRoom ?? { roomId: m.gameRoomId };
                      const token = this.clientTokens.get(client.sessionId) ?? "";

                      const reservation = await matchMaker.reserveSeatFor(roomListing as any, {
                        token,
                        playerId: myParticipant.playerId ?? user.playerId,
                        playerName: myParticipant.name,
                        avatarUrl: myParticipant.avatarUrl ?? "",
                        modeId: "1v1",
                        teamIndex,
                      });

                      const matchAssignedPayload: TournamentMatchAssignedPayload = {
                        tournamentId: this.state.tournamentId,
                        matchId: m.id,
                        roundName: m.roundName,
                        gameRoomId: m.gameRoomId,
                        reservation,
                        opponentName: opponent?.name ?? "Opponent",
                        opponentAvatarUrl: opponent?.avatarUrl,
                        slot,
                        fingerprint: getWebTransportFingerprint(),
                      };

                      client.send(TournamentServerMessage.MATCH_ASSIGNED, matchAssignedPayload);
                      console.log(`🏆 [TournamentLobby] Auto-dispatched match assignment to returning player ${myParticipant.name} for ${m.roundName}`);
                    }
                  }
                }
              }
            }
          }
        }
      }).catch(() => {});
    }
  }

  override onLeave(client: Client): void {
    this.state.participants.delete(client.sessionId);
    this.clientTokens.delete(client.sessionId);
    this.clientSockets.delete(client.sessionId);

    // If host leaves while WAITING, elect new host if participants remain
    if (client.sessionId === this.state.hostSessionId && this.state.status === "WAITING") {
      let nextHost: TournamentLobbyParticipant | undefined;
      for (const p of this.state.participants.values()) {
        nextHost = p;
        break;
      }

      if (nextHost) {
        this.state.hostSessionId = nextHost.sessionId;
        this.state.hostPlayerId = nextHost.playerId;
        nextHost.isHost = true;
        nextHost.isReady = true;
      }
    }

    const fighterCount = Array.from(this.state.participants.values()).filter(
      (p) => p.slotIndex >= 0,
    ).length;

    this.setMetadata({
      hostName: this.state.participants.get(this.state.hostSessionId)?.playerName ?? "Host",
      currentParticipants: fighterCount,
    });
  }

  override onDispose(): void {
    if (this.unsubscribeCoordinator) {
      this.unsubscribeCoordinator();
      this.unsubscribeCoordinator = undefined;
    }
  }
}
