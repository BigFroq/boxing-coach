// Shared types for the Today's Drill feature. Imported by picker, LLM wrapper,
// API route, and UI card. Phase names match the existing analysis prompt
// (Loading / Hip Explosion / Energy Transfer / Follow Through).

import type { DrillEntry, DrillProgram } from "./drill-program-types";
import type { ClipHistoryContext } from "./clip-log-types";

export interface DailyDrillPick {
  id: string;
  userId: string;
  drillDate: string;            // YYYY-MM-DD UTC
  drillId: string;
  drillSnapshot: DrillEntry;    // frozen drill at pick time
  diagnosis: string;            // LLM's "why this drill today"
  completedAt: string | null;   // ISO timestamp
  skippedAt: string | null;     // ISO timestamp
  createdAt: string;            // ISO timestamp
}

// Inputs gathered server-side and fed to the picker's prompt builder.
export interface DiagnosisInputs {
  drillProgram: DrillProgram;
  recentClipHistory: ClipHistoryContext | null;
  neglectedFocusAreas: string[];      // names of neglected areas, ordered most-neglected first
  styleSummary: string | null;        // brief style description if available
}

// Result of the prompt-build step. The systemPrompt + userPayload go to the
// LLM; validDrillIds is retained for post-LLM validation.
export interface PromptResult {
  systemPrompt: string;
  userPayload: string;
  validDrillIds: string[];
}

// Raw shape the LLM is asked to return.
export interface RawLLMPick {
  drill_id: string;
  diagnosis: string;
}

// Validation outcomes for the LLM's raw response.
export type ValidationResult =
  | { status: "ok"; drillId: string; diagnosis: string }
  | { status: "invalid-drill"; reason: string }
  | { status: "missing-fields"; reason: string };

// LLM call wrapper return type — tagged result, never throws.
export type LLMPickResult =
  | { status: "ok"; raw: RawLLMPick }
  | { status: "parse-failed"; raw: string }
  | { status: "api-error"; reason: string };

// Top-level response shape from GET /api/coach/today-drill.
export type TodayDrillResponse =
  | { status: "ok"; pick: DailyDrillPick }
  | { status: "no-program"; message: string }
  | { status: "error"; message: string };
