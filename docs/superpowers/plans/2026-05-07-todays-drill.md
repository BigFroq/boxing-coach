# Today's Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface ONE personalized drill on the My Coach tab per UTC day per user, picked by Haiku 4.5 from the user's existing drill_program based on their recent clip scores + neglected focus areas + style profile. Card supports Mark done / Skip today actions, persists in a new `daily_drill_picks` table.

**Architecture:** Three layers. **Data:** new `daily_drill_picks` table with `UNIQUE (user_id, drill_date)`. **Server:** pure picker (`today-drill-picker.ts` for prompt building + result validation) + LLM wrapper (`today-drill-llm.ts` for Haiku call) + API route (`/api/coach/today-drill` GET for read-or-pick, PATCH for complete/skip). **UI:** `TodayDrillCard` component on the My Coach tab top, self-fetches.

**Tech Stack:** Next.js (App Router) · React · Supabase · Anthropic SDK (Haiku 4.5) · Zod · Vitest

**Spec:** [docs/superpowers/specs/2026-05-07-todays-drill-design.md](../specs/2026-05-07-todays-drill-design.md)

**Project uses npm.** Use `npm test`, `npx tsc --noEmit`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/015_daily_drill_picks.sql` | Create | Schema + index + RLS |
| `src/lib/today-drill-types.ts` | Create | Shared TS types |
| `src/lib/today-drill-picker.ts` | Create | Pure: build LLM prompt, validate LLM result, fallback selection |
| `src/lib/today-drill-picker.test.ts` | Create | Vitest unit tests for picker |
| `src/lib/today-drill-llm.ts` | Create | Haiku 4.5 wrapper, returns tagged result |
| `src/lib/validation.ts` | Modify | Add `dailyDrillPickPatchSchema` |
| `src/app/api/coach/today-drill/route.ts` | Create | GET (read-or-pick), PATCH (complete/skip) |
| `src/components/today-drill/card.tsx` | Create | UI: 5 visual states |
| `src/components/coach-progress.tsx` | Modify | Mount `<TodayDrillCard userId={userId} />` at top |

**Decomposition:**
- `today-drill-picker.ts` is pure — no DB, no Anthropic, no Date.now. Tests target it directly.
- `today-drill-llm.ts` is the I/O boundary for the LLM call. Returns tagged result. Never throws.
- API route composes both — orchestration only, no business logic.
- UI fetches via `/api/coach/today-drill` — no business logic in the component.

---

## Task 1: Migration 015 — `daily_drill_picks` table

**Files:**
- Create: `supabase/migrations/015_daily_drill_picks.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/015_daily_drill_picks.sql`:

```sql
-- 015_daily_drill_picks.sql
-- One row per (user, UTC day) holding the picked drill, the LLM's diagnosis,
-- and completion/skip state. Anonymous-userId model, permissive RLS — same
-- pattern as clip_logs and user_engagement (post-migration-012 convention).

CREATE TABLE IF NOT EXISTS daily_drill_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  drill_date date NOT NULL,

  drill_id text NOT NULL,
  drill_snapshot jsonb NOT NULL,
  diagnosis text NOT NULL,

  completed_at timestamptz,
  skipped_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, drill_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_drill_picks_user_date
  ON daily_drill_picks (user_id, drill_date DESC);

ALTER TABLE daily_drill_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on daily_drill_picks" ON daily_drill_picks;
CREATE POLICY "Allow all on daily_drill_picks"
  ON daily_drill_picks FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Skip local apply**

Production migration application happens at the parent-controller level via the Supabase MCP after this task completes. Do NOT attempt to apply locally.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_daily_drill_picks.sql
git commit -m "feat(db): add daily_drill_picks table for today's drill"
```

---

## Task 2: Shared types — `today-drill-types.ts`

**File:**
- Create: `src/lib/today-drill-types.ts`

- [ ] **Step 1: Create the types file**

Create `src/lib/today-drill-types.ts` with EXACTLY:

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/today-drill-types.ts
git commit -m "feat(today-drill): shared types"
```

---

## Task 3: Pure picker — `today-drill-picker.ts` + tests

**Files:**
- Create: `src/lib/today-drill-picker.ts`
- Test: `src/lib/today-drill-picker.test.ts`

Pure functions: `buildPickerPrompt(inputs)` and `validateLLMPick(raw, validDrillIds)`. No DB, no LLM, no Date.now.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/today-drill-picker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPickerPrompt, validateLLMPick } from "./today-drill-picker";
import type { DiagnosisInputs } from "./today-drill-types";
import type { DrillProgram, DrillEntry } from "./drill-program-types";

function makeDrill(id: string, name: string): DrillEntry {
  return {
    id,
    name,
    vault_ref: null,
    duration_min: 20,
    intensity: ["medium"],
    context: ["bag"],
    why_fits_you: `because ${name}`,
    cues: ["cue 1", "cue 2"],
    rounds_or_dose: "4x 2-min rounds",
  };
}

function makeProgram(drills: DrillEntry[]): DrillProgram {
  return {
    generated_at: "2026-05-07T00:00:00Z",
    axis_values: {
      intensity: ["light", "medium", "heavy"] as const,
      context: ["bag", "shadow", "gym", "mitts"] as const,
      time_min: [10, 20, 30, 45] as const,
    },
    drills,
    sessions: [],
  };
}

describe("buildPickerPrompt", () => {
  it("includes all drill ids in validDrillIds", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab"), makeDrill("d2", "Hook")]),
      recentClipHistory: null,
      neglectedFocusAreas: [],
      styleSummary: null,
    };
    const result = buildPickerPrompt(inputs);
    expect(result.validDrillIds).toEqual(["d1", "d2"]);
  });

  it("references the user's clip score trend in userPayload when present", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab")]),
      recentClipHistory: {
        windowDays: 14,
        totalClips: 10,
        trend: {
          last5Avg: { loading: 7, hipExplosion: 5, energyTransfer: 7, followThrough: 6, overall: 6.3 },
          prior5Avg: { loading: 7, hipExplosion: 7, energyTransfer: 7, followThrough: 7, overall: 7 },
        },
        mostRecent: { daysAgo: 1, summary: "good jab, hip late" },
      },
      neglectedFocusAreas: [],
      styleSummary: null,
    };
    const result = buildPickerPrompt(inputs);
    expect(result.userPayload).toContain("hipExplosion");
    expect(result.userPayload).toContain("totalClips");
  });

  it("references neglected focus areas in userPayload when present", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab")]),
      recentClipHistory: null,
      neglectedFocusAreas: ["lateral footwork", "guard discipline"],
      styleSummary: null,
    };
    const result = buildPickerPrompt(inputs);
    expect(result.userPayload).toContain("lateral footwork");
    expect(result.userPayload).toContain("guard discipline");
  });

  it("references styleSummary in userPayload when present", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab")]),
      recentClipHistory: null,
      neglectedFocusAreas: [],
      styleSummary: "aggressive inside fighter",
    };
    const result = buildPickerPrompt(inputs);
    expect(result.userPayload).toContain("aggressive inside fighter");
  });

  it("instructs the LLM to return strict JSON in systemPrompt", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab")]),
      recentClipHistory: null,
      neglectedFocusAreas: [],
      styleSummary: null,
    };
    const result = buildPickerPrompt(inputs);
    expect(result.systemPrompt).toContain("JSON");
    expect(result.systemPrompt).toContain("drill_id");
    expect(result.systemPrompt).toContain("diagnosis");
  });
});

describe("validateLLMPick", () => {
  const validIds = ["d1", "d2", "d3"];

  it("accepts a well-formed result with a valid drill_id", () => {
    const raw = { drill_id: "d2", diagnosis: "this targets your hip rotation" };
    const result = validateLLMPick(raw, validIds);
    expect(result).toEqual({
      status: "ok",
      drillId: "d2",
      diagnosis: "this targets your hip rotation",
    });
  });

  it("rejects a result with an unknown drill_id", () => {
    const raw = { drill_id: "d99", diagnosis: "..." };
    const result = validateLLMPick(raw, validIds);
    expect(result.status).toBe("invalid-drill");
  });

  it("rejects a result missing drill_id", () => {
    const raw = { diagnosis: "..." };
    const result = validateLLMPick(raw, validIds);
    expect(result.status).toBe("missing-fields");
  });

  it("rejects a result missing diagnosis", () => {
    const raw = { drill_id: "d1" };
    const result = validateLLMPick(raw, validIds);
    expect(result.status).toBe("missing-fields");
  });

  it("rejects null or non-object input", () => {
    expect(validateLLMPick(null, validIds).status).toBe("missing-fields");
    expect(validateLLMPick("string", validIds).status).toBe("missing-fields");
    expect(validateLLMPick(42, validIds).status).toBe("missing-fields");
  });

  it("rejects empty diagnosis string", () => {
    const raw = { drill_id: "d1", diagnosis: "" };
    const result = validateLLMPick(raw, validIds);
    expect(result.status).toBe("missing-fields");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/today-drill-picker.test.ts`
Expected: FAIL with "Cannot find module './today-drill-picker'".

- [ ] **Step 3: Implement `today-drill-picker.ts`**

Create `src/lib/today-drill-picker.ts`:

```ts
// Pure logic for Today's Drill: build the LLM prompt, validate the LLM's
// response. No DB, no LLM, no Date.now() — all inputs explicit. Both halves
// are exported separately so the API route can call them around the LLM
// boundary in today-drill-llm.ts.

import type {
  DiagnosisInputs,
  PromptResult,
  ValidationResult,
} from "./today-drill-types";

const SYSTEM_PROMPT = `You are picking the single best drill for a boxer to do today, given their data.

You will receive:
- drills: an array of available drills (each with id, name, why_fits_you, cues, rounds_or_dose, duration_min, intensity, context)
- recentClipHistory: their score trends (Loading, Hip Explosion, Energy Transfer, Follow Through). May be null.
- neglectedFocusAreas: areas they haven't worked recently. May be empty.
- styleSummary: brief description of their fighting style. May be null.

Return strict JSON:
{
  "drill_id": "<id from drills[]>",
  "diagnosis": "1-2 sentences explaining why THIS drill TODAY based on their data"
}

The drill_id MUST be one of the ids in the drills array. The diagnosis should reference the user's data — e.g. "Your hip explosion has dropped from 7.0 to 5.0 over your last 5 clips — this targets the loading-phase weight shift you've been skipping."

If the user has no clip data, ground the diagnosis in their style or neglected areas instead.

Be honest, specific, and concrete. Don't pad. Don't recommend a drill that doesn't exist in the array.`;

export function buildPickerPrompt(inputs: DiagnosisInputs): PromptResult {
  const validDrillIds = inputs.drillProgram.drills.map((d) => d.id);

  const userPayload = JSON.stringify(
    {
      drills: inputs.drillProgram.drills.map((d) => ({
        id: d.id,
        name: d.name,
        why_fits_you: d.why_fits_you,
        cues: d.cues,
        rounds_or_dose: d.rounds_or_dose,
        duration_min: d.duration_min,
        intensity: d.intensity,
        context: d.context,
      })),
      recentClipHistory: inputs.recentClipHistory,
      neglectedFocusAreas: inputs.neglectedFocusAreas,
      styleSummary: inputs.styleSummary,
    },
    null,
    2
  );

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPayload,
    validDrillIds,
  };
}

export function validateLLMPick(
  raw: unknown,
  validDrillIds: string[]
): ValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return { status: "missing-fields", reason: "not an object" };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.drill_id !== "string" || r.drill_id.length === 0) {
    return { status: "missing-fields", reason: "drill_id missing or empty" };
  }
  if (typeof r.diagnosis !== "string" || r.diagnosis.length === 0) {
    return { status: "missing-fields", reason: "diagnosis missing or empty" };
  }
  if (!validDrillIds.includes(r.drill_id)) {
    return {
      status: "invalid-drill",
      reason: `drill_id "${r.drill_id}" not in pool`,
    };
  }
  return { status: "ok", drillId: r.drill_id, diagnosis: r.diagnosis };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/lib/today-drill-picker.test.ts`
Expected: all 11 cases PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: 232/232 + 11 new = 243/243 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/today-drill-picker.ts src/lib/today-drill-picker.test.ts
git commit -m "feat(today-drill): pure picker — prompt build + result validation"
```

---

## Task 4: LLM wrapper — `today-drill-llm.ts`

**File:**
- Create: `src/lib/today-drill-llm.ts`

The wrapper calls Haiku 4.5 with the prompt from Task 3, extracts JSON from a possible markdown fence, returns a tagged result. Never throws.

- [ ] **Step 1: Implement `today-drill-llm.ts`**

Create `src/lib/today-drill-llm.ts`:

```ts
// Haiku 4.5 wrapper for the today-drill picker. Single function, tagged
// result, never throws. Extraction follows the same pattern as
// clip-review/route.ts (handles markdown-fenced JSON).

import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "./retry";
import type { LLMPickResult, RawLLMPick } from "./today-drill-types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function pickDrillViaLLM(
  systemPrompt: string,
  userPayload: string
): Promise<LLMPickResult> {
  let response;
  try {
    response = await withRetry(
      () =>
        anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: "user", content: userPayload }],
        }),
      { label: "today-drill-pick", maxAttempts: 3 }
    );
  } catch (err) {
    console.error("[today-drill-llm] api call failed:", err);
    return { status: "api-error", reason: err instanceof Error ? err.message : "unknown" };
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[today-drill-llm] JSON parse failed:", { text: text.slice(0, 200), err });
    return { status: "parse-failed", raw: text };
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "drill_id" in parsed &&
    "diagnosis" in parsed
  ) {
    return { status: "ok", raw: parsed as RawLLMPick };
  }

  return { status: "parse-failed", raw: text };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: 243/243 (no new tests, no regression).

- [ ] **Step 4: Commit**

```bash
git add src/lib/today-drill-llm.ts
git commit -m "feat(today-drill): Haiku wrapper for daily drill pick"
```

---

## Task 5: Validation schema for PATCH

**File:**
- Modify: `src/lib/validation.ts`

Add the Zod schema for the PATCH body that marks a drill complete or skipped.

- [ ] **Step 1: Add the schema**

Find the end of `src/lib/validation.ts` (after the existing `clipHistorySchema`/`chatRequestSchema`/`clipReviewRequestSchema` exports). Append:

```ts
export const dailyDrillPickPatchSchema = z.object({
  action: z.enum(["complete", "skip"]),
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: 243/243.

- [ ] **Step 4: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(validation): add dailyDrillPickPatchSchema"
```

---

## Task 6: API route — `/api/coach/today-drill`

**Files:**
- Create: `src/app/api/coach/today-drill/route.ts`

The route handles GET (read or pick) and PATCH (complete or skip). Uses Supabase via the SERVER client (`@/lib/supabase`), not the browser client. Mirrors the patterns from `clip-review/route.ts`.

- [ ] **Step 1: Implement the route**

Create `src/app/api/coach/today-drill/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dailyDrillPickPatchSchema } from "@/lib/validation";
import { buildPickerPrompt, validateLLMPick } from "@/lib/today-drill-picker";
import { pickDrillViaLLM } from "@/lib/today-drill-llm";
import { aggregateClipHistory } from "@/lib/clip-log-aggregation";
import { rowToClipLog } from "@/lib/clip-log-storage";
import { computeNeglected } from "@/lib/neglected-focus-areas";
import type { DrillEntry, DrillProgram } from "@/lib/drill-program-types";
import type { DailyDrillPick, DiagnosisInputs } from "@/lib/today-drill-types";

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rowToPick(row: Record<string, unknown>): DailyDrillPick {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    drillDate: row.drill_date as string,
    drillId: row.drill_id as string,
    drillSnapshot: row.drill_snapshot as DrillEntry,
    diagnosis: row.diagnosis as string,
    completedAt: (row.completed_at as string | null) ?? null,
    skippedAt: (row.skipped_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

async function gatherInputs(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<DiagnosisInputs | { status: "no-program" }> {
  // 1) Style profile + drill_program
  const { data: styleRow } = await supabase
    .from("style_profiles")
    .select("drill_program, ai_result, style_name, description")
    .eq("user_id", userId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const drillProgram = (styleRow?.drill_program ?? null) as DrillProgram | null;
  if (!drillProgram || !drillProgram.drills || drillProgram.drills.length === 0) {
    return { status: "no-program" };
  }

  // 2) Recent clip logs (last 10) → aggregate
  const { data: clipRows } = await supabase
    .from("clip_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const clips = (clipRows ?? []).map(rowToClipLog);
  const recentClipHistory = clips.length > 0 ? aggregateClipHistory(clips, new Date()) : null;

  // 3) Focus areas + recent training sessions → neglected names
  const { data: focusRows } = await supabase
    .from("focus_areas")
    .select("id, name, dimension, knowledge_node_slug, status")
    .eq("user_id", userId);

  const { data: sessionRows } = await supabase
    .from("training_sessions")
    .select("summary")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const focusAreas = (focusRows ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (sessionRows ?? []) as any[];
  const neglectedFocusAreas = computeNeglected(focusAreas, sessions);

  // 4) Style summary (one-line)
  const styleSummary = (styleRow?.style_name as string | undefined) ?? null;

  return {
    drillProgram,
    recentClipHistory,
    neglectedFocusAreas,
    styleSummary,
  };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId || userId === "anon") {
      return NextResponse.json({ status: "error", message: "userId required" }, { status: 400 });
    }
    const todayParam = url.searchParams.get("today");
    const today = todayParam ?? utcDateString(new Date());

    const limited = await enforceRateLimit(request, userId);
    if (limited) return limited;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    // 1) Cache check
    const { data: existing } = await supabase
      .from("daily_drill_picks")
      .select("*")
      .eq("user_id", userId)
      .eq("drill_date", today)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ status: "ok", pick: rowToPick(existing) });
    }

    // 2) Gather inputs
    const inputs = await gatherInputs(supabase, userId);
    if ("status" in inputs && inputs.status === "no-program") {
      return NextResponse.json({
        status: "no-program",
        message: "Take the style quiz first to get your drill program.",
      });
    }
    const diagnosisInputs = inputs as DiagnosisInputs;

    // 3) Build prompt + call LLM + validate
    const prompt = buildPickerPrompt(diagnosisInputs);
    const llmResult = await pickDrillViaLLM(prompt.systemPrompt, prompt.userPayload);

    let drillId: string;
    let diagnosis: string;
    if (llmResult.status === "ok") {
      const validation = validateLLMPick(llmResult.raw, prompt.validDrillIds);
      if (validation.status === "ok") {
        drillId = validation.drillId;
        diagnosis = validation.diagnosis;
      } else {
        // LLM picked invalid drill — fall back
        console.error("[today-drill] LLM returned invalid pick:", validation);
        drillId = prompt.validDrillIds[0];
        diagnosis = "Default starter drill while we calibrate to your style.";
      }
    } else {
      // LLM failed — fall back
      console.error("[today-drill] LLM failed:", llmResult);
      drillId = prompt.validDrillIds[0];
      diagnosis = "Default starter drill while we calibrate to your style.";
    }

    // 4) Persist (handle UNIQUE collision from concurrent requests)
    const drillSnapshot = diagnosisInputs.drillProgram.drills.find((d) => d.id === drillId)!;

    const { data: inserted, error: insertError } = await supabase
      .from("daily_drill_picks")
      .insert({
        user_id: userId,
        drill_date: today,
        drill_id: drillId,
        drill_snapshot: drillSnapshot,
        diagnosis,
      })
      .select("*")
      .maybeSingle();

    if (insertError) {
      // Likely a UNIQUE collision from a concurrent request — re-SELECT.
      const { data: existing2 } = await supabase
        .from("daily_drill_picks")
        .select("*")
        .eq("user_id", userId)
        .eq("drill_date", today)
        .maybeSingle();
      if (existing2) {
        return NextResponse.json({ status: "ok", pick: rowToPick(existing2) });
      }
      console.error("[today-drill] insert failed:", insertError);
      return NextResponse.json({ status: "error", message: "Failed to save pick" }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", pick: rowToPick(inserted) });
  } catch (err) {
    console.error("[today-drill] GET threw:", err);
    return NextResponse.json({ status: "error", message: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId || userId === "anon") {
      return NextResponse.json({ status: "error", message: "userId required" }, { status: 400 });
    }
    const todayParam = url.searchParams.get("today");
    const today = todayParam ?? utcDateString(new Date());

    const raw = await request.json();
    const parsed = dailyDrillPickPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { action } = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;
    const update =
      action === "complete"
        ? { completed_at: new Date().toISOString() }
        : { skipped_at: new Date().toISOString() };

    const { error } = await supabase
      .from("daily_drill_picks")
      .update(update)
      .eq("user_id", userId)
      .eq("drill_date", today);

    if (error) {
      console.error("[today-drill] PATCH failed:", error);
      return NextResponse.json({ status: "error", message: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[today-drill] PATCH threw:", err);
    return NextResponse.json({ status: "error", message: "Server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: 243/243 (no new tests; route is integration-tested via manual QA).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/coach/today-drill/route.ts
git commit -m "feat(api): /api/coach/today-drill GET (pick) + PATCH (complete/skip)"
```

---

## Task 7: UI — `TodayDrillCard`

**File:**
- Create: `src/components/today-drill/card.tsx`

The card self-fetches on mount, renders 5 states: loading / no-program / pre-completion / completed / skipped. Mark done and Skip today both call PATCH and update local state optimistically.

- [ ] **Step 1: Create the directory and component**

Create `src/components/today-drill/card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, CheckCircle2, X } from "lucide-react";
import type { DailyDrillPick, TodayDrillResponse } from "@/lib/today-drill-types";

interface TodayDrillCardProps {
  userId: string;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "no-program" }
  | { kind: "pre-completion"; pick: DailyDrillPick }
  | { kind: "completed"; pick: DailyDrillPick }
  | { kind: "skipped"; pick: DailyDrillPick }
  | { kind: "error" };

function deriveState(pick: DailyDrillPick): ViewState {
  if (pick.completedAt) return { kind: "completed", pick };
  if (pick.skippedAt) return { kind: "skipped", pick };
  return { kind: "pre-completion", pick };
}

export function TodayDrillCard({ userId }: TodayDrillCardProps) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    if (!userId || userId === "anon") {
      setState({ kind: "error" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/coach/today-drill?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) {
          if (!cancelled) setState({ kind: "error" });
          return;
        }
        const data = (await res.json()) as TodayDrillResponse;
        if (cancelled) return;
        if (data.status === "no-program") {
          setState({ kind: "no-program" });
        } else if (data.status === "ok") {
          setState(deriveState(data.pick));
        } else {
          setState({ kind: "error" });
        }
      } catch (err) {
        console.error("[today-drill-card] fetch failed:", err);
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function patchDrill(action: "complete" | "skip") {
    if (state.kind !== "pre-completion") return;
    const prev = state;
    // Optimistic update
    if (action === "complete") {
      setState({
        kind: "completed",
        pick: { ...state.pick, completedAt: new Date().toISOString() },
      });
    } else {
      setState({
        kind: "skipped",
        pick: { ...state.pick, skippedAt: new Date().toISOString() },
      });
    }
    try {
      const res = await fetch(
        `/api/coach/today-drill?userId=${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        // Revert on failure
        setState(prev);
      }
    } catch (err) {
      console.error("[today-drill-card] patch failed:", err);
      setState(prev);
    }
  }

  if (state.kind === "loading" || state.kind === "error") return null;

  if (state.kind === "no-program") {
    return (
      <div className="rounded-xl bg-surface-hover p-5 text-center text-sm">
        <p className="text-muted mb-2">Take the style quiz first to get your drill program.</p>
        <Link
          href="/?tab=style"
          className="inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
        >
          Find your style
        </Link>
      </div>
    );
  }

  if (state.kind === "completed") {
    return (
      <div className="rounded-xl bg-green-500/10 p-4 flex items-center gap-3">
        <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
        <div className="text-sm">
          <div className="font-medium">Drill done — see you tomorrow</div>
          <div className="text-xs text-muted mt-0.5">{state.pick.drillSnapshot.name}</div>
        </div>
      </div>
    );
  }

  if (state.kind === "skipped") {
    return (
      <div className="rounded-full inline-flex items-center gap-2 bg-surface-hover px-3 py-1 text-xs text-muted">
        <X size={12} />
        <span>Skipped today</span>
      </div>
    );
  }

  // pre-completion
  const drill = state.pick.drillSnapshot;
  return (
    <div className="rounded-xl bg-surface-hover p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-accent mb-2">
        <Target size={14} />
        TODAY'S DRILL
      </div>
      <h3 className="text-base font-semibold mb-1">{drill.name}</h3>
      <p className="text-sm text-muted leading-relaxed mb-3">{state.pick.diagnosis}</p>
      <div className="text-xs text-muted mb-3">
        ⏱ {drill.duration_min} min · 🥊 {drill.context.join("/")} · {drill.intensity.join("/")}
      </div>
      {drill.cues.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold mb-1">Cues</div>
          <ul className="text-sm text-muted space-y-0.5">
            {drill.cues.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-xs text-muted mb-4">
        <span className="font-semibold">Dose:</span> {drill.rounds_or_dose}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => patchDrill("complete")}
          className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Mark done
        </button>
        <button
          onClick={() => patchDrill("skip")}
          className="rounded-lg bg-surface px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Skip today
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: 243/243.

- [ ] **Step 4: Commit**

```bash
git add src/components/today-drill/card.tsx
git commit -m "feat(today-drill): card component with 5 visual states"
```

---

## Task 8: Mount in coach-progress.tsx

**File:**
- Modify: `src/components/coach-progress.tsx`

Mount `<TodayDrillCard userId={userId} />` at the very top of the progress view (above the streak chip from Plan 1).

- [ ] **Step 1: Add import**

In `src/components/coach-progress.tsx`, add to imports near the existing `TrendGraph` import:

```tsx
import { TodayDrillCard } from "@/components/today-drill/card";
```

- [ ] **Step 2: Mount the card**

Find the location where the streak chip + TrendGraph are rendered (the start of the JSX inside the main return). Render TodayDrillCard FIRST, BEFORE the streak chip:

```tsx
{userId && userId !== "anon" && (
  <div className="mb-4">
    <TodayDrillCard userId={userId} />
  </div>
)}

{/* existing streak chip block follows */}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: 243/243.

- [ ] **Step 5: Commit**

```bash
git add src/components/coach-progress.tsx
git commit -m "feat(coach-progress): mount today's drill card at top"
```

---

## Task 9: End-to-end manual QA

**Goal:** Walk the whole flow end-to-end. No automated test covers the full Supabase + Anthropic round-trip.

- [ ] **Step 1: Migration applied**

Verify `daily_drill_picks` table exists in production Supabase via `mcp__claude_ai_Supabase__list_tables`. Schema should match Task 1.

- [ ] **Step 2: Cold-start — no drill_program**

1. In a fresh browser profile, open the app. Skip the style quiz.
2. Navigate to **My Coach → Progress**.
3. Verify the card shows "Take the style quiz first to get your drill program." with a CTA button.
4. Click the CTA → should navigate to /style.

- [ ] **Step 3: First drill — has program but no clips**

1. Complete the style quiz.
2. Wait for the drill program to generate.
3. Navigate to **My Coach → Progress**.
4. Verify the card renders with a drill, name, diagnosis (probably style-grounded since no clips yet), cues, dose.
5. Inspect the DB: a row should exist in `daily_drill_picks` for today.

- [ ] **Step 4: Drill renders with score-based diagnosis**

1. With at least 1 clip logged (and ideally several with scores), force a fresh pick by deleting today's row from `daily_drill_picks`.
2. Reload My Coach → Progress.
3. Verify the diagnosis references your clip data (e.g., "your hip explosion has dropped...").

- [ ] **Step 5: Mark done flow**

1. On a pre-completion card, click "Mark done."
2. Verify card transitions to "Drill done — see you tomorrow" with a green checkmark.
3. Reload — verify it stays in completed state (DB-backed).
4. Inspect DB: `completed_at` is set.

- [ ] **Step 6: Skip flow**

1. With a fresh row (delete + reload), click "Skip today."
2. Verify card collapses to "Skipped today" pill.
3. Reload — verify it stays.
4. Inspect DB: `skipped_at` is set, `completed_at` is null.

- [ ] **Step 7: Daily caching**

1. With a pick already made today, reload the page multiple times.
2. Inspect Network tab: each `/api/coach/today-drill` GET returns the same pick (no new LLM call).
3. Verify there's still only ONE row in `daily_drill_picks` for today.

- [ ] **Step 8: drill_snapshot stability**

1. Make a pick (any state).
2. In a separate session/window, regenerate the user's drill_program (via the existing UI).
3. Reload the original page.
4. Verify the card still renders the originally-picked drill (snapshot frozen, even though program changed).

- [ ] **Step 9: LLM failure resilience**

1. Temporarily break the ANTHROPIC_API_KEY (e.g., set to invalid value in `.env.local`, restart dev server).
2. Delete today's row from `daily_drill_picks`.
3. Reload My Coach → Progress.
4. Verify the card still renders with a drill (should be the first drill in the program, with diagnosis "Default starter drill while we calibrate to your style.").
5. Restore the API key.

- [ ] **Step 10: Document outcomes**

Append a `## Verification` section to this plan file noting the date, scenarios tested, deviations.

---

## Self-Review (before executing)

### Spec coverage
- Spec §1 schema → Task 1 ✅
- Spec §2 picker logic → Task 3 ✅
- Spec §3 LLM wrapper → Task 4 ✅
- Spec §4 API route → Task 6 ✅ (PATCH validation in Task 5)
- Spec §5 UI card → Task 7 ✅
- Spec §6 streak interaction (none new) → no task needed ✅
- Spec §7 cold-start handling → Task 6 (gatherInputs) + Task 7 (no-program state) ✅
- Spec error handling rows → Task 6 fallback path ✅
- Spec testing scope → Task 3 covers picker + Task 9 manual QA ✅

### Placeholder scan
No "TBD"/"TODO"/"add appropriate error handling". Every code block is complete.

### Type consistency
- `DailyDrillPick`, `DiagnosisInputs`, `PromptResult`, `RawLLMPick`, `ValidationResult`, `LLMPickResult`, `TodayDrillResponse` — all defined in Task 2, used consistently in Tasks 3, 4, 6, 7.
- `buildPickerPrompt` and `validateLLMPick` signatures match across Tasks 3 (definition), 6 (consumption).
- `pickDrillViaLLM` signature matches across Tasks 4 (definition), 6 (consumption).
- `dailyDrillPickPatchSchema` matches between Task 5 (definition) and Task 6 (consumption).

---

## Out of scope (re-confirmed)

- Plan 3c (Reaction games) — separate plan, vault prefill happens first
- Plan 3d (Agentic coach) — separate plan, builds on this primitive
- Drill substitution / "show me a different one today"
- Multi-day campaigns
- Logging-a-clip-counts-as-completion
- Push notifications / email reminders
- Drill streak metric (separate from app-streak)

---

## Notes for the executing engineer

- **Vitest, npm.** Run `npm test` (full) or `npm test -- <path>` (single file).
- **Anonymous localStorage UUID identity model.** Never `auth.getUser()`. New tables follow post-012 permissive-RLS pattern.
- **Use `createServerClient` from `@/lib/supabase`** for the API route (not the browser client) — it handles service-role auth for backend routes. Mirrors `clip-review/route.ts`.
- **`computeNeglected` from `@/lib/neglected-focus-areas`** is the canonical helper for finding neglected areas — uses focus_areas + recent training_sessions summaries.
- **`aggregateClipHistory` from `@/lib/clip-log-aggregation`** computes clip score trends from clip_logs rows — same helper used by Plan 2's coach context.
- **Don't `--amend`** if a pre-commit hook fails. Per project CLAUDE.md, hook failure means commit didn't happen — fix and create a new commit.
- The Anthropic model name for Haiku 4.5 is `claude-haiku-4-5-20251001`.
- **Edge case to remember:** if the LLM picks a drill_id that's not in the program, the validator returns `invalid-drill` and the API route falls back to `prompt.validDrillIds[0]`. The pick still persists with a default diagnosis.
