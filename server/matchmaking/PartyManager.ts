// ==================================================
// SERVER MATCHMAKING SUBSYSTEM: PARTY MANAGER
//
// WHAT IT DOES:
// Manages the complete in-memory lifecycle of multiplayer pre-match parties:
// 1. Party creation with clean 6-character alphanumeric invite codes.
// 2. Member admittance and maximum capacity enforcement (max 4 members).
// 3. Dynamic party leader succession when the current leader leaves.
// 4. Member readiness toggling and atomic squad packaging.
// 5. Automatic cleanup and disbanding of empty parties.
//
// HOW IT WORKS:
// Maintains bidirectional in-memory indexes (partyId, inviteCode, and playerId).
// All mutations return immutable snapshots of the updated Party to broadcast
// immediately to connected WebSocket clients via PARTY_UPDATED.
//
// WHY IT EXISTS:
// Enforces Phase 15 and ADR-013 (Party Cohesion). Allows friends to group up
// before queuing so the matchmaker treats the entire group as an indivisible ticket.
// ==================================================

import crypto from "node:crypto";
import type { Party, PartyMember } from "../../shared/domain/Party.ts";

const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 chars, no 0/O, 1/I confusion
const INVITE_CODE_LENGTH = 6;
const DEFAULT_MAX_MEMBERS = 4;

export interface PlayerIdentityInput {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
}

export class PartyManager {
  private parties = new Map<string, Party>();
  private inviteCodeToPartyId = new Map<string, string>();
  private playerIdToPartyId = new Map<string, string>();

  /**
   * Generates a unique, human-readable 6-character invite code.
   */
  private generateInviteCode(): string {
    let attempts = 0;
    while (attempts < 100) {
      let code = "";
      const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
      for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
        code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
      }
      if (!this.inviteCodeToPartyId.has(code)) {
        return code;
      }
      attempts++;
    }
    // Fallback if saturated
    return `P${Date.now().toString(36).toUpperCase().slice(-5)}`;
  }

  /**
   * Creates a new party with the creator as leader and first member.
   * If the creator is already in a party, leaves that party first.
   */
  public createParty(leader: PlayerIdentityInput): Party {
    // If player is already in a party, leave it first
    if (this.playerIdToPartyId.has(leader.playerId)) {
      this.leaveParty(leader.playerId);
    }

    const partyId = `party_${crypto.randomUUID()}`;
    const inviteCode = this.generateInviteCode();
    const now = Date.now();

    const leaderMember: PartyMember = {
      playerId: leader.playerId,
      playerName: leader.playerName,
      avatarUrl: leader.avatarUrl,
      isReady: true, // Leader is automatically ready
      joinedAt: now,
    };

    const newParty: Party = {
      id: partyId,
      leaderPlayerId: leader.playerId,
      inviteCode,
      maxMembers: DEFAULT_MAX_MEMBERS,
      members: {
        [leader.playerId]: leaderMember,
      },
      createdAt: now,
    };

    this.parties.set(partyId, newParty);
    this.inviteCodeToPartyId.set(inviteCode, partyId);
    this.playerIdToPartyId.set(leader.playerId, partyId);

    return this.cloneParty(newParty);
  }

  /**
   * Admits a player into an existing party using its 6-character invite code.
   */
  public joinParty(
    inviteCode: string,
    player: PlayerIdentityInput,
  ): { party: Party | null; error?: string } {
    const normalizedCode = inviteCode.trim().toUpperCase();
    const partyId = this.inviteCodeToPartyId.get(normalizedCode);

    if (!partyId) {
      return { party: null, error: "Invalid party invite code." };
    }

    const party = this.parties.get(partyId);
    if (!party) {
      return { party: null, error: "Party not found or has been disbanded." };
    }

    // Already in this party
    if (party.members[player.playerId]) {
      return { party: this.cloneParty(party) };
    }

    // Capacity limit
    const currentMemberCount = Object.keys(party.members).length;
    if (currentMemberCount >= party.maxMembers) {
      return { party: null, error: `Party is full (maximum ${party.maxMembers} fighters).` };
    }

    // If player is in another party, leave it
    if (this.playerIdToPartyId.has(player.playerId)) {
      this.leaveParty(player.playerId);
    }

    const newMember: PartyMember = {
      playerId: player.playerId,
      playerName: player.playerName,
      avatarUrl: player.avatarUrl,
      isReady: false, // New joiners start unready
      joinedAt: Date.now(),
    };

    party.members[player.playerId] = newMember;
    this.playerIdToPartyId.set(player.playerId, partyId);

    return { party: this.cloneParty(party) };
  }

  /**
   * Removes a player from their current party.
   * If the leaving player is the leader, promotes the next senior member.
   * If no members remain, disbands the party.
   */
  public leaveParty(
    playerId: string,
  ): { leftPartyId: string | null; updatedParty: Party | null } {
    const partyId = this.playerIdToPartyId.get(playerId);
    if (!partyId) {
      return { leftPartyId: null, updatedParty: null };
    }

    this.playerIdToPartyId.delete(playerId);
    const party = this.parties.get(partyId);
    if (!party) {
      return { leftPartyId: partyId, updatedParty: null };
    }

    delete party.members[playerId];
    const remainingMembers = Object.values(party.members);

    if (remainingMembers.length === 0) {
      // Disband party
      this.parties.delete(partyId);
      this.inviteCodeToPartyId.delete(party.inviteCode);
      return { leftPartyId: partyId, updatedParty: null };
    }

    // If leader left, promote oldest remaining member
    if (party.leaderPlayerId === playerId) {
      remainingMembers.sort((a, b) => a.joinedAt - b.joinedAt);
      party.leaderPlayerId = remainingMembers[0].playerId;
      // Newly promoted leader is automatically ready
      remainingMembers[0].isReady = true;
    }

    return { leftPartyId: partyId, updatedParty: this.cloneParty(party) };
  }

  /**
   * Sets member readiness inside the party lobby.
   */
  public setMemberReady(playerId: string, isReady: boolean): Party | null {
    const partyId = this.playerIdToPartyId.get(playerId);
    if (!partyId) return null;

    const party = this.parties.get(partyId);
    if (!party || !party.members[playerId]) return null;

    party.members[playerId].isReady = isReady;
    return this.cloneParty(party);
  }

  /**
   * Retrieves party by party ID.
   */
  public getParty(partyId: string): Party | null {
    const party = this.parties.get(partyId);
    return party ? this.cloneParty(party) : null;
  }

  /**
   * Retrieves party that the player currently belongs to.
   */
  public getPartyByPlayerId(playerId: string): Party | null {
    const partyId = this.playerIdToPartyId.get(playerId);
    if (!partyId) return null;
    return this.getParty(partyId);
  }

  /**
   * Retrieves party by 6-character invite code.
   */
  public getPartyByInviteCode(inviteCode: string): Party | null {
    const normalized = inviteCode.trim().toUpperCase();
    const partyId = this.inviteCodeToPartyId.get(normalized);
    if (!partyId) return null;
    return this.getParty(partyId);
  }

  /**
   * Resets all party state (used in automated testing).
   */
  public reset(): void {
    this.parties.clear();
    this.inviteCodeToPartyId.clear();
    this.playerIdToPartyId.clear();
  }

  private cloneParty(party: Party): Party {
    return {
      ...party,
      members: { ...party.members },
    };
  }
}

// Global singleton instance
export const partyManager = new PartyManager();
