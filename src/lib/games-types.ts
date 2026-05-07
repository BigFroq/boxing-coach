// Shared types for the Reaction Games (Reflex Hub) feature. Imported by
// storage, API routes, and all game UI components.

export type GameType = "reaction_tap" | "schulte" | "punch_prediction";
export type ScoreUnit = "ms" | "seconds" | "accuracy_pct";
export type PunchLabel = "jab" | "cross" | "hook" | "uppercut";
export type Difficulty = "easy" | "medium" | "hard";

export interface GameScore {
  id: string;
  userId: string;
  gameType: GameType;
  scoreValue: number;
  scoreUnit: ScoreUnit;
  playedAt: string; // ISO timestamp
}

export interface LeaderboardEntry {
  rank: number;
  playerToken: string;     // anonymized display token
  scoreValue: number;
  scoreUnit: ScoreUnit;
}

export interface PunchClip {
  id: string;
  sourceFilename: string;
  imageB64: string;
  punchLabel: PunchLabel;
  difficulty: Difficulty;
  llmConfidence: number | null;
  llmNotes: string | null;
}

// Sort direction for leaderboards: lower-better for ms/seconds, higher-better for pct.
export function sortDirectionFor(unit: ScoreUnit): "asc" | "desc" {
  return unit === "accuracy_pct" ? "desc" : "asc";
}
