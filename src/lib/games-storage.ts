// Read/write helpers for the Reaction Games feature. All I/O paths go through
// fetch() to the games API routes (NOT the browser Supabase client directly —
// the routes handle service-role auth + leaderboard aggregation). Pure
// rowToScore and rowToClip mappers are exported for unit testing without a
// Supabase stub. All I/O paths return tagged results, never throw.

import { track } from "./analytics";
import type {
  GameScore,
  GameType,
  PunchClip,
  ScoreUnit,
} from "./games-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export function rowToScore(row: AnyRow): GameScore {
  return {
    id: row.id,
    userId: row.user_id,
    gameType: row.game_type,
    scoreValue: Number(row.score_value),
    scoreUnit: row.score_unit,
    playedAt: row.played_at,
  };
}

export function rowToClip(row: AnyRow): PunchClip {
  return {
    id: row.id,
    sourceFilename: row.source_filename,
    imageB64: row.image_b64,
    punchLabel: row.punch_label,
    difficulty: row.difficulty,
    llmConfidence: row.llm_confidence ?? null,
    llmNotes: row.llm_notes ?? null,
  };
}

export type SaveScoreResult =
  | { status: "saved" }
  | { status: "error"; reason: string };

export interface SaveScoreInput {
  userId: string;
  gameType: GameType;
  scoreValue: number;
  scoreUnit: ScoreUnit;
}

export async function saveScore(input: SaveScoreInput): Promise<SaveScoreResult> {
  if (typeof window === "undefined") {
    return { status: "error", reason: "server-side" };
  }
  if (!input.userId || input.userId === "anon") {
    return { status: "error", reason: "no-userid" };
  }
  try {
    const res = await fetch("/api/games/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[games-storage] saveScore non-ok:", body);
      track("game_score_save_failed", { stage: "non-ok", gameType: input.gameType });
      return { status: "error", reason: "non-ok" };
    }
    track("game_score_saved", { gameType: input.gameType, scoreValue: input.scoreValue });
    return { status: "saved" };
  } catch (err) {
    console.error("[games-storage] saveScore threw:", err);
    track("game_score_save_failed", { stage: "throw" });
    return { status: "error", reason: "fetch-throw" };
  }
}

export type FetchScoreResult =
  | { status: "ok"; score: number | null }
  | { status: "error"; reason: string };

export async function fetchUserBest(
  userId: string,
  gameType: GameType
): Promise<FetchScoreResult> {
  if (!userId || userId === "anon") return { status: "ok", score: null };
  try {
    const res = await fetch(
      `/api/games/score?gameType=${encodeURIComponent(gameType)}&userId=${encodeURIComponent(userId)}&kind=user-best`
    );
    if (!res.ok) return { status: "error", reason: "non-ok" };
    const body = (await res.json()) as { status: string; score: number | null };
    if (body.status === "ok") return { status: "ok", score: body.score };
    return { status: "error", reason: "bad-shape" };
  } catch (err) {
    console.error("[games-storage] fetchUserBest threw:", err);
    return { status: "error", reason: "fetch-throw" };
  }
}

export interface LeaderboardRow {
  rank: number;
  playerToken: string;
  scoreValue: number;
}

export type LeaderboardResult =
  | { status: "ok"; entries: LeaderboardRow[] }
  | { status: "error"; reason: string };

export async function fetchLeaderboard(
  gameType: GameType
): Promise<LeaderboardResult> {
  try {
    const res = await fetch(
      `/api/games/score?gameType=${encodeURIComponent(gameType)}&kind=leaderboard`
    );
    if (!res.ok) return { status: "error", reason: "non-ok" };
    const body = (await res.json()) as { status: string; entries?: LeaderboardRow[] };
    if (body.status === "ok" && Array.isArray(body.entries)) {
      return { status: "ok", entries: body.entries };
    }
    return { status: "error", reason: "bad-shape" };
  } catch (err) {
    console.error("[games-storage] fetchLeaderboard threw:", err);
    return { status: "error", reason: "fetch-throw" };
  }
}

export type FetchPunchClipsResult =
  | { status: "ok"; clips: PunchClip[] }
  | { status: "error"; reason: string };

export async function fetchPunchClips(
  count: number,
  excludeIds: string[] = []
): Promise<FetchPunchClipsResult> {
  try {
    const params = new URLSearchParams({ count: String(count) });
    if (excludeIds.length > 0) params.set("exclude", excludeIds.join(","));
    const res = await fetch(`/api/games/punch-clips?${params.toString()}`);
    if (!res.ok) return { status: "error", reason: "non-ok" };
    const body = (await res.json()) as { status: string; clips?: AnyRow[] };
    if (body.status === "ok" && Array.isArray(body.clips)) {
      return { status: "ok", clips: body.clips.map(rowToClip) };
    }
    return { status: "error", reason: "bad-shape" };
  } catch (err) {
    console.error("[games-storage] fetchPunchClips threw:", err);
    return { status: "error", reason: "fetch-throw" };
  }
}
