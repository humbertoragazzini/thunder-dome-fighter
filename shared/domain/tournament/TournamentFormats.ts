// ==================================================
// TOURNAMENT FORMAT PRESETS & SIZING CONFIGURATION
//
// WHAT IT DOES:
// Defines standard competitive tournament format configurations and sizing
// presets for 1v1 fighting championships:
// - Cuadrangular (4 Participants: Semifinals -> Final)
// - Octagonal (8 Participants: Quarterfinals -> Semifinals -> Final)
// - Sweet 16 (16 Participants: Round of 16 -> Quarters -> Semis -> Final)
//
// HOW IT WORKS:
// - Provides strongly typed declarations for participant capacity and round structures.
// - Defines default arena rules (score limits, match durations) per format.
//
// WHY IT EXISTS:
// Implements Step 21.1 of Phase 21. Powers the tournament creation wizard
// and validates lobby capacity bounds across the application.
// ==================================================

import type { CompetitionFormat, ParticipantType } from "./TournamentTypes";

export interface TournamentFormatPreset {
  id: string;
  name: string;
  description: string;
  format: CompetitionFormat;
  participantType: ParticipantType;
  participantCapacity: number;
  gameModeId: string;
  defaultLevelId: string;
  defaultScoreLimit: number;
  defaultTimeLimitSeconds: number;
  expectedRounds: number;
  roundLabels: string[];
}

export const TOURNAMENT_PRESETS: Record<number, TournamentFormatPreset> = {
  4: {
    id: "CUADRANGULAR_1V1",
    name: "Cuadrangular Championship (4 Fighters)",
    description: "Classic 4-player knockout bracket: 2 Semifinals and 1 Grand Final.",
    format: "KNOCKOUT",
    participantType: "INDIVIDUAL",
    participantCapacity: 4,
    gameModeId: "1v1",
    defaultLevelId: "thunder-dome-alpha",
    defaultScoreLimit: 5,
    defaultTimeLimitSeconds: 180,
    expectedRounds: 2,
    roundLabels: ["Semifinals", "Grand Final"],
  },
  8: {
    id: "OCTAGONAL_1V1",
    name: "Octagonal Championship (8 Fighters)",
    description: "Expanded 8-player bracket: 4 Quarterfinals, 2 Semifinals, and 1 Grand Final.",
    format: "KNOCKOUT",
    participantType: "INDIVIDUAL",
    participantCapacity: 8,
    gameModeId: "1v1",
    defaultLevelId: "thunder-dome-alpha",
    defaultScoreLimit: 5,
    defaultTimeLimitSeconds: 180,
    expectedRounds: 3,
    roundLabels: ["Quarterfinals", "Semifinals", "Grand Final"],
  },
  16: {
    id: "SWEET16_1V1",
    name: "Major Championship (16 Fighters)",
    description: "Major 16-player bracket: Round of 16, Quarterfinals, Semifinals, and 1 Grand Final.",
    format: "KNOCKOUT",
    participantType: "INDIVIDUAL",
    participantCapacity: 16,
    gameModeId: "1v1",
    defaultLevelId: "thunder-dome-alpha",
    defaultScoreLimit: 5,
    defaultTimeLimitSeconds: 180,
    expectedRounds: 4,
    roundLabels: ["Round of 16", "Quarterfinals", "Semifinals", "Grand Final"],
  },
};

export const DEFAULT_TOURNAMENT_PRESET = TOURNAMENT_PRESETS[4];
