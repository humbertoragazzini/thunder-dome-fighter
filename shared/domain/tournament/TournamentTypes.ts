// ==================================================
// TOURNAMENT DOMAIN ENTITIES & TYPES
//
// WHAT IT DOES:
// Defines core tournament, bracket, match, and participant data structures
// for Phase 20 Generic Competition & Tournament Architecture.
//
// HOW IT WORKS:
// - Completely game-genre-agnostic data models.
// - Supports both KNOCKOUT (single-elimination brackets) and ROUND_ROBIN stages.
// - Supports both INDIVIDUAL (1v1) and TEAM (3v3 / 4v4) participants.
// - Provides strongly typed representations for bracket nodes and progression links.
//
// WHY IT EXISTS:
// Single source of truth for tournament state across client UI, backend coordination,
// and database persistence.
// ==================================================

export type CompetitionFormat = "KNOCKOUT" | "ROUND_ROBIN";

export type TournamentStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type ParticipantType = "INDIVIDUAL" | "TEAM";

export type StageType = "KNOCKOUT" | "ROUND_ROBIN";

export type MatchStatus =
  | "PENDING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface ITournamentParticipant {
  id: string;
  tournamentId: string;
  participantType: ParticipantType;
  seed: number;
  name: string;
  avatarUrl?: string;
  playerId?: string; // Optional foreign key if individual player
  memberIds?: string[]; // Player IDs roster if team participant
  isEliminated: boolean;
  finalPlacement?: number; // 1 = Champion, 2 = Runner-up, 3 = Semifinalist, etc.
}

export interface ITournamentMatch {
  id: string;
  tournamentId: string;
  stageIndex: number;
  roundIndex: number;
  matchIndex: number;
  roundName: string;
  participantAId?: string;
  participantBId?: string;
  winnerId?: string;
  scoreA: number;
  scoreB: number;
  status: MatchStatus;
  gameRoomId?: string;
  referencedMatchId?: string; // Links to authoritative Match record
  nextMatchId?: string; // Target match in next round
  nextMatchSlot?: "A" | "B"; // Slot in target match (A or B)
}

export interface ITournamentRound {
  id: string;
  stageIndex: number;
  roundIndex: number;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  matches: ITournamentMatch[];
}

export interface ITournamentStage {
  id: string;
  stageIndex: number;
  stageType: StageType;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  rounds: ITournamentRound[];
}

export interface ITournament {
  id: string;
  name: string;
  format: CompetitionFormat;
  status: TournamentStatus;
  participantType: ParticipantType;
  gameModeId: string;
  championId?: string;
  championName?: string;
  participants: ITournamentParticipant[];
  stages: ITournamentStage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTournamentParams {
  name: string;
  format: CompetitionFormat;
  participantType: ParticipantType;
  gameModeId: string;
  participants: Array<{
    name: string;
    avatarUrl?: string;
    playerId?: string;
    memberIds?: string[];
    seed?: number;
  }>;
}

export interface MatchOutcomeData {
  winnerId: string;
  scoreA: number;
  scoreB: number;
  referencedMatchId?: string;
}
