// Single source of truth for "does the DB have this user's style profile, and
// if not, can we backfill it from localStorage?". Multiple consumers
// (StyleFinderTab, DrillProgramView, ProfileView via /me) all depend on the DB
// being authoritative, but legacy users may have profiles only in
// localStorage — a relic of the pre-migration-012 era when DB writes silently
// failed against the auth.uid() FK. Each consumer used to be on its own; that
// duplication caused the recurring "Find your style first" bug on /drills and
// /me even when the user clearly had a profile visible on /style.
//
// This helper is client-only — it reads localStorage and uses the browser
// (anon-key) Supabase client.

import { createBrowserClient } from "./supabase-browser";
import { track } from "./analytics";

const LS_KEY = "boxing-coach-style-profile";

export type SyncResult =
  | { status: "db-existing"; profileId: string }
  | { status: "db-inserted"; profileId: string }
  | { status: "no-profile" }
  | { status: "error"; reason: string };

// Dedup: concurrent callers in the same render pass (e.g. StyleFinderTab and
// DrillProgramView both mounting under StrictMode) share one INSERT instead
// of racing into duplicate rows. Replaces the per-component backfillFiredRef.
const inFlight = new Map<string, Promise<SyncResult>>();

export function ensureStyleProfileInDb(userId: string): Promise<SyncResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ status: "error", reason: "server-side" });
  }
  if (!userId) {
    return Promise.resolve({ status: "error", reason: "no-userid" });
  }
  const cached = inFlight.get(userId);
  if (cached) return cached;

  const promise = run(userId).finally(() => {
    // Keep the result memoized for the lifetime of the page — once the DB
    // has the row, callers can short-circuit on `db-existing` without
    // re-querying. Map gets cleared on full reload.
  });
  inFlight.set(userId, promise);
  return promise;
}

async function run(userId: string): Promise<SyncResult> {
  let supabase: ReturnType<typeof createBrowserClient>;
  try {
    supabase = createBrowserClient();
  } catch (err) {
    console.error("[style-profile-sync] supabase client init failed:", err);
    track("style_profile_sync_failed", { stage: "client-init" });
    return { status: "error", reason: "supabase-init-failed" };
  }

  // 1) DB read.
  let dbRow: { id: string } | null = null;
  try {
    const { data, error } = await supabase
      .from("style_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[style-profile-sync] DB select failed:", error);
      track("style_profile_sync_failed", { stage: "db-select", code: error.code });
      // Fall through to localStorage; if backfill succeeds we still recover.
    } else {
      dbRow = (data as { id: string } | null) ?? null;
    }
  } catch (err) {
    console.error("[style-profile-sync] DB select threw:", err);
    track("style_profile_sync_failed", { stage: "db-select-throw" });
  }
  if (dbRow) {
    return { status: "db-existing", profileId: dbRow.id };
  }

  // 2) localStorage probe.
  let parsed: unknown;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { status: "no-profile" };
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("[style-profile-sync] localStorage parse failed:", err);
    track("style_profile_sync_failed", { stage: "ls-parse" });
    return { status: "error", reason: "ls-parse-failed" };
  }

  // 3) Validate shape — three columns are NOT NULL on style_profiles
  // (dimension_scores, physical_context, ai_result, matched_fighters). If any
  // is missing, the INSERT will fail. Bail with a clear log instead of letting
  // it fail silently like the pre-fix code did.
  const ls = parsed as {
    result?: {
      dimension_scores?: unknown;
      matched_fighters?: unknown;
      counter_fighters?: unknown;
    };
    physicalContext?: unknown;
    experienceLevel?: unknown;
    answers?: unknown;
    narrativeStale?: unknown;
  };
  if (!ls?.result || !ls.result.dimension_scores || !ls.physicalContext) {
    console.error("[style-profile-sync] localStorage shape invalid", {
      hasResult: !!ls?.result,
      hasDimensionScores: !!ls?.result?.dimension_scores,
      hasPhysicalContext: !!ls?.physicalContext,
    });
    track("style_profile_sync_failed", { stage: "ls-shape-invalid" });
    return { status: "error", reason: "ls-shape-invalid" };
  }

  // 4) Backfill INSERT. Mirrors the original style-finder-tab backfill body
  // (was lines 96-109). Trigger `mark_previous_profiles_not_current` keeps
  // is_current consistent across rows.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newRow, error } = await (supabase.from("style_profiles") as any)
      .insert({
        user_id: userId,
        answers: ls.answers ?? {},
        dimension_scores: ls.result.dimension_scores,
        physical_context: ls.physicalContext,
        experience_level: ls.experienceLevel ?? "beginner",
        ai_result: ls.result,
        matched_fighters: ls.result.matched_fighters ?? [],
        counter_fighters: ls.result.counter_fighters ?? [],
        narrative_stale: Boolean(ls.narrativeStale),
      })
      .select("id")
      .single();
    if (error || !newRow) {
      console.error("[style-profile-sync] DB insert failed:", error);
      track("style_profile_sync_failed", {
        stage: "db-insert",
        code: error?.code,
        message: error?.message,
      });
      return { status: "error", reason: "db-insert-failed" };
    }
    track("style_profile_sync_backfilled", { profileId: newRow.id });
    return { status: "db-inserted", profileId: newRow.id as string };
  } catch (err) {
    console.error("[style-profile-sync] DB insert threw:", err);
    track("style_profile_sync_failed", { stage: "db-insert-throw" });
    return { status: "error", reason: "db-insert-throw" };
  }
}
