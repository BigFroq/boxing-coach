// Mirrors style-profile-sync.ts pattern: single-flight per userId, defensive
// against StrictMode double-mounts and concurrent consumers. No throws — every
// failure path returns a tagged result so callers can render a noop without
// surfacing transient DB errors to users.

import { createBrowserClient } from "./supabase-browser";
import { track } from "./analytics";
import { computeStreakUpdate } from "./streak-math";

export interface EngagementRow {
  last_session_date: string; // ISO date (YYYY-MM-DD)
  current_streak_days: number;
  longest_streak_days: number;
  session_count: number;
}

export type DecideInput = {
  existing: EngagementRow | null;
  today: Date;
};

export type DecidePlan =
  | { kind: "insert"; row: EngagementRow }
  | { kind: "update"; row: EngagementRow }
  | { kind: "touch" };

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Pure decision function — extracted so it's directly unit-testable without
// hitting Supabase. The sync function below composes this with DB I/O.
export function decideEngagementUpdate(input: DecideInput): DecidePlan {
  const { existing, today } = input;

  if (!existing) {
    return {
      kind: "insert",
      row: {
        last_session_date: utcDateString(today),
        current_streak_days: 1,
        longest_streak_days: 1,
        session_count: 1,
      },
    };
  }

  const lastDate = new Date(`${existing.last_session_date}T00:00:00Z`);
  const { newStreak, isNewDay } = computeStreakUpdate({
    prevStreak: existing.current_streak_days,
    lastSessionDate: lastDate,
    today,
  });

  if (!isNewDay) {
    return { kind: "touch" };
  }

  return {
    kind: "update",
    row: {
      last_session_date: utcDateString(today),
      current_streak_days: newStreak,
      longest_streak_days: Math.max(newStreak, existing.longest_streak_days),
      session_count: existing.session_count + 1,
    },
  };
}

export type SyncResult =
  | { status: "synced"; plan: DecidePlan["kind"]; engagement: EngagementRow }
  | { status: "error"; reason: string };

const inFlight = new Map<string, Promise<SyncResult>>();

export function ensureUserEngagement(userId: string): Promise<SyncResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ status: "error", reason: "server-side" });
  }
  if (!userId || userId === "anon") {
    return Promise.resolve({ status: "error", reason: "no-userid" });
  }
  const cached = inFlight.get(userId);
  if (cached) return cached;

  const promise = run(userId);
  inFlight.set(userId, promise);
  return promise;
}

async function run(userId: string): Promise<SyncResult> {
  let supabase: ReturnType<typeof createBrowserClient>;
  try {
    supabase = createBrowserClient();
  } catch (err) {
    console.error("[user-engagement-sync] supabase client init failed:", err);
    track("engagement_sync_failed", { stage: "client-init" });
    return { status: "error", reason: "supabase-init-failed" };
  }

  // 1) Read existing row.
  let existing: EngagementRow | null = null;
  try {
    const { data, error } = await supabase
      .from("user_engagement")
      .select("last_session_date, current_streak_days, longest_streak_days, session_count")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[user-engagement-sync] DB select failed:", error);
      track("engagement_sync_failed", { stage: "db-select", code: error.code });
      return { status: "error", reason: "db-select-failed" };
    }
    existing = (data as EngagementRow | null) ?? null;
  } catch (err) {
    console.error("[user-engagement-sync] DB select threw:", err);
    track("engagement_sync_failed", { stage: "db-select-throw" });
    return { status: "error", reason: "db-select-throw" };
  }

  const today = new Date();
  const plan = decideEngagementUpdate({ existing, today });

  // 2) Apply the plan.
  try {
    if (plan.kind === "insert") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("user_engagement") as any).insert({
        user_id: userId,
        last_seen_at: today.toISOString(),
        last_session_date: plan.row.last_session_date,
        current_streak_days: plan.row.current_streak_days,
        longest_streak_days: plan.row.longest_streak_days,
        session_count: plan.row.session_count,
      });
      if (error) {
        console.error("[user-engagement-sync] insert failed:", error);
        track("engagement_sync_failed", { stage: "db-insert", code: error.code });
        return { status: "error", reason: "db-insert-failed" };
      }
      track("engagement_synced", { plan: "insert", streak: plan.row.current_streak_days });
      return { status: "synced", plan: "insert", engagement: plan.row };
    }

    if (plan.kind === "update") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("user_engagement") as any)
        .update({
          last_seen_at: today.toISOString(),
          last_session_date: plan.row.last_session_date,
          current_streak_days: plan.row.current_streak_days,
          longest_streak_days: plan.row.longest_streak_days,
          session_count: plan.row.session_count,
          updated_at: today.toISOString(),
        })
        .eq("user_id", userId);
      if (error) {
        console.error("[user-engagement-sync] update failed:", error);
        track("engagement_sync_failed", { stage: "db-update", code: error.code });
        return { status: "error", reason: "db-update-failed" };
      }
      track("engagement_synced", { plan: "update", streak: plan.row.current_streak_days });
      return { status: "synced", plan: "update", engagement: plan.row };
    }

    // plan.kind === "touch" — just bump last_seen_at, leave streak/count alone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("user_engagement") as any)
      .update({ last_seen_at: today.toISOString(), updated_at: today.toISOString() })
      .eq("user_id", userId);
    if (error) {
      console.error("[user-engagement-sync] touch failed:", error);
      track("engagement_sync_failed", { stage: "db-touch", code: error.code });
      return { status: "error", reason: "db-touch-failed" };
    }
    // existing is non-null here because plan==="touch" implies an existing row
    track("engagement_synced", { plan: "touch", streak: existing!.current_streak_days });
    return { status: "synced", plan: "touch", engagement: existing! };
  } catch (err) {
    console.error("[user-engagement-sync] write threw:", err);
    track("engagement_sync_failed", { stage: "db-write-throw" });
    return { status: "error", reason: "db-write-throw" };
  }
}
