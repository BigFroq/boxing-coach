// Read/write helpers for the clip_logs table. Anon-key Supabase client (the
// post-migration-012 permissive-RLS pattern). All I/O paths return tagged
// results, never throw. The pure rowToClipLog mapper is exported so it can
// be unit-tested without a Supabase stub.

import { createBrowserClient } from "./supabase-browser";
import { track } from "./analytics";
import type {
  ClipLog,
  ClipAnalysis,
  ClipScores,
} from "./clip-log-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export function rowToClipLog(row: AnyRow): ClipLog {
  const analysis: ClipAnalysis = {
    summary: row.summary,
    phases: row.phases ?? [],
    strengths: row.strengths ?? [],
    improvements: row.improvements ?? [],
  };
  const scores: ClipScores = {
    loading: row.score_loading ?? null,
    hipExplosion: row.score_hip_explosion ?? null,
    energyTransfer: row.score_energy_transfer ?? null,
    followThrough: row.score_follow_through ?? null,
    overall: row.score_overall ?? null,
  };
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    filename: row.filename ?? null,
    durationSeconds: row.duration_seconds ?? null,
    analysis,
    scores,
    thumbnailB64: row.thumbnail_b64 ?? null,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    punchType: row.punch_type ?? null,
  };
}

export interface SaveClipLogInput {
  userId: string;
  filename: string | null;
  durationSeconds: number | null;
  analysis: ClipAnalysis;
  thumbnailB64: string | null;
  punchType?: string | null;
  /** Returned by the analysis route; omitted falls back to the column default. */
  promptVersion?: string;
}

export type SaveResult =
  | { status: "saved"; clip: ClipLog }
  | { status: "error"; reason: string };

function extractScoresFromAnalysis(analysis: ClipAnalysis): {
  loading: number | null;
  hipExplosion: number | null;
  energyTransfer: number | null;
  followThrough: number | null;
  overall: number | null;
} {
  const byPhase = new Map<string, number>();
  for (const p of analysis.phases) {
    if (typeof p.score === "number" && p.phase) {
      byPhase.set(p.phase, p.score);
    }
  }
  const loading = byPhase.get("Loading") ?? null;
  const hipExplosion = byPhase.get("Hip Explosion") ?? null;
  const energyTransfer = byPhase.get("Energy Transfer") ?? null;
  const followThrough = byPhase.get("Follow Through") ?? null;
  const present = [loading, hipExplosion, energyTransfer, followThrough].filter(
    (s): s is number => typeof s === "number"
  );
  const overall = present.length > 0
    ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10
    : null;
  return { loading, hipExplosion, energyTransfer, followThrough, overall };
}

export async function saveClipLog(input: SaveClipLogInput): Promise<SaveResult> {
  if (typeof window === "undefined") {
    return { status: "error", reason: "server-side" };
  }
  if (!input.userId || input.userId === "anon") {
    return { status: "error", reason: "no-userid" };
  }
  let supabase: ReturnType<typeof createBrowserClient>;
  try {
    supabase = createBrowserClient();
  } catch (err) {
    console.error("[clip-log-storage] supabase init failed:", err);
    track("clip_log_persist_failed", { stage: "client-init" });
    return { status: "error", reason: "supabase-init-failed" };
  }

  const scores = extractScoresFromAnalysis(input.analysis);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("clip_logs") as any)
      .insert({
        user_id: input.userId,
        filename: input.filename,
        duration_seconds: input.durationSeconds,
        summary: input.analysis.summary,
        phases: input.analysis.phases,
        strengths: input.analysis.strengths,
        improvements: input.analysis.improvements,
        score_loading: scores.loading,
        score_hip_explosion: scores.hipExplosion,
        score_energy_transfer: scores.energyTransfer,
        score_follow_through: scores.followThrough,
        score_overall: scores.overall,
        thumbnail_b64: input.thumbnailB64,
        punch_type: input.punchType ?? null,
        ...(input.promptVersion ? { prompt_version: input.promptVersion } : {}),
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[clip-log-storage] insert failed:", error);
      track("clip_log_persist_failed", { stage: "db-insert", code: error?.code });
      return { status: "error", reason: "db-insert-failed" };
    }
    track("clip_log_persisted", { hasScores: scores.overall !== null });
    return { status: "saved", clip: rowToClipLog(data) };
  } catch (err) {
    console.error("[clip-log-storage] insert threw:", err);
    track("clip_log_persist_failed", { stage: "db-insert-throw" });
    return { status: "error", reason: "db-insert-throw" };
  }
}

export type FetchResult =
  | { status: "ok"; clips: ClipLog[] }
  | { status: "error"; reason: string };

export async function fetchRecentClips(
  userId: string,
  limit = 30
): Promise<FetchResult> {
  if (typeof window === "undefined") {
    return { status: "error", reason: "server-side" };
  }
  if (!userId || userId === "anon") {
    return { status: "ok", clips: [] };
  }
  try {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("clip_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[clip-log-storage] fetchRecent failed:", error);
      track("clip_log_fetch_failed", { stage: "db-select", code: error.code });
      return { status: "error", reason: "db-select-failed" };
    }
    return { status: "ok", clips: (data ?? []).map(rowToClipLog) };
  } catch (err) {
    console.error("[clip-log-storage] fetchRecent threw:", err);
    track("clip_log_fetch_failed", { stage: "db-select-throw" });
    return { status: "error", reason: "db-select-throw" };
  }
}

export async function fetchMostRecentClip(userId: string): Promise<ClipLog | null> {
  const r = await fetchRecentClips(userId, 1);
  if (r.status !== "ok") return null;
  return r.clips[0] ?? null;
}
