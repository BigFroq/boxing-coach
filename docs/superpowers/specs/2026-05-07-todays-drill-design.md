---
title: Plan 3b — Today's drill (personalized daily-decision card)
date: 2026-05-07
status: design approved, awaiting spec review
predecessor: Plan 3a (Coach context refresh) — shipped 2026-05-07, merged to main
upstream_design: docs/ideas/2026-05-07-floman-feedback-idea-map.md (item #6: "personalized today's drill")
---

# Plan 3b — Today's Drill

## Goal

Surface ONE personalized drill on the My Coach tab that targets the user's current weakness — diagnosed from their clip-log scores (Plan 2), neglected focus areas (pre-existing), and style profile. The drill is picked once per UTC day per user via a Haiku 4.5 call, cached in a new `daily_drill_picks` table, and rendered as a dismissible card with a "Mark done" or "Skip today" action.

This implements the "daily-decision-loop" primitive from Mark's vault doctrine — `[[show-up-daily]]` (lower the daily cost until it's automatic) + `[[mamba-mentality]]` (isolate the specific weakness).

## Success criteria

- Each user gets exactly one drill pick per UTC day, deterministic after first request.
- The drill is selected from their existing `style_profiles.drill_program.drills` pool (no fresh content generation — reuse curated drills).
- The diagnosis (1–2 sentences explaining "why this drill today") is visible in the UI as the card's load-bearing signal.
- Cold-starts handle gracefully: no drill_program → CTA to style quiz; no clips yet → fallback to focus areas only; nothing → fallback to first available drill.
- Clicking "Mark done" persists `completed_at`; clicking "Skip today" persists `skipped_at`. Both transitions render correctly.
- LLM cost stays under ~$0.001/user/day on the daily pick path.
- Plan 1 + 2 + 3a tests (232/232) continue to pass.

## Architecture

Five components, two layers:

**Data + server (Tasks 1–4):**
1. `daily_drill_picks` table (Supabase, anon-userId model, permissive RLS, one row per user per day).
2. Pure picker logic in `src/lib/today-drill-picker.ts`: takes (drillProgram, recentClipScores, focusAreas, styleProfile) → builds the LLM prompt; takes LLM result → validates the chosen drill_id is in the pool. Testable.
3. Haiku 4.5 wrapper in `src/lib/today-drill-llm.ts` that calls `anthropic.messages.create` with structured JSON output.
4. API route `src/app/api/coach/today-drill/route.ts` (GET): cache-or-pick orchestration + UPSERT to DB + completion/skip via PATCH on the same path.

**UI (Tasks 5–7):**
5. `TodayDrillCard` component in `src/components/today-drill/card.tsx`.
6. Mount in `src/components/coach-progress.tsx` ABOVE the existing streak chip.
7. Manual QA (Task 8).

### File structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/015_daily_drill_picks.sql` | Create | Schema + index + RLS |
| `src/lib/today-drill-types.ts` | Create | Shared TS types: `DailyDrillPick`, `DiagnosisInputs`, `PickResult`, `PickStatus` |
| `src/lib/today-drill-picker.ts` | Create | Pure logic: build LLM prompt, validate LLM result, fallback selection. No I/O. |
| `src/lib/today-drill-picker.test.ts` | Create | Vitest unit tests for prompt building + result validation + cold-start fallbacks |
| `src/lib/today-drill-llm.ts` | Create | Anthropic call wrapper. Single function: `pickDrillViaLLM(inputs) → {drillId, diagnosis}` |
| `src/app/api/coach/today-drill/route.ts` | Create | GET (read or pick + persist), PATCH (mark complete or skip) |
| `src/lib/validation.ts` | Modify | Add `dailyDrillPickRequestSchema` + `dailyDrillPickPatchSchema` |
| `src/components/today-drill/card.tsx` | Create | UI component — pre-completion / post-completion / post-skip states |
| `src/components/coach-progress.tsx` | Modify | Mount `<TodayDrillCard userId={userId} />` at top |

### Decomposition principles

- `today-drill-picker.ts` is pure — no DB, no Anthropic call, no time of day. All inputs explicit. Tests hit it directly.
- `today-drill-llm.ts` is the I/O boundary for the LLM call. Returns tagged result (success / parse-failed / api-error). Never throws.
- API route composes both: read DB → if miss, gather inputs → call picker (build prompt) → call LLM wrapper → call picker again (validate result) → persist → return.
- UI component is dumb — fetches via the API, renders three states (loading / pre-completion / done|skip). No business logic.

## 1. Schema — `daily_drill_picks` table

```sql
-- 015_daily_drill_picks.sql
-- One row per (user, UTC day) holding the picked drill, the LLM's diagnosis,
-- and completion/skip state. Anonymous-userId model, permissive RLS — same
-- pattern as clip_logs and user_engagement (post-migration-012 convention).

CREATE TABLE IF NOT EXISTS daily_drill_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  drill_date date NOT NULL,                              -- UTC day this pick is for

  drill_id text NOT NULL,                                -- DrillEntry.id from drill_program
  drill_snapshot jsonb NOT NULL,                         -- frozen DrillEntry at pick time
  diagnosis text NOT NULL,                               -- LLM's "why this drill today" rationale

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

**Rationale:**
- `drill_snapshot` freezes the drill at pick-time so the card stays consistent if the user regenerates their drill_program later in the day.
- `UNIQUE (user_id, drill_date)` enforces one pick per user per day at the DB level.
- `completed_at` and `skipped_at` are mutually exclusive in practice but not enforced via constraint (kept simple).
- Index supports the lookup `WHERE user_id = ? AND drill_date = ?` (the cache check).

## 2. Picker logic — `today-drill-picker.ts`

Pure functions, two halves:

**a) Build the LLM prompt** from `DiagnosisInputs`:

```ts
export interface DiagnosisInputs {
  drillProgram: DrillProgram;                  // type from drill-program-types.ts
  recentClipHistory: ClipHistoryContext | null;  // from aggregateClipHistory
  neglectedFocusArea: { dimension: string; lastWorkedDaysAgo: number } | null;
  styleSummary: string | null;                 // brief style description if available
}

export interface PromptResult {
  systemPrompt: string;
  userPayload: string;       // serialized JSON for the LLM
  validDrillIds: string[];   // for post-LLM validation
}

export function buildPickerPrompt(inputs: DiagnosisInputs): PromptResult { ... }
```

**b) Validate the LLM result:**

```ts
export interface RawLLMPick {
  drill_id: string;
  diagnosis: string;
}

export type ValidationResult =
  | { status: "ok"; drill_id: string; diagnosis: string }
  | { status: "invalid-drill"; reason: string }
  | { status: "missing-fields"; reason: string };

export function validateLLMPick(
  raw: unknown,
  validDrillIds: string[]
): ValidationResult { ... }
```

**c) Cold-start fallback:** if `drillProgram.drills.length === 0`, picker returns a sentinel that the API route translates into `{ status: "no-program" }`. If the program has drills but no clips/focus areas, picker still builds a prompt — the LLM picks based on style profile alone.

**Tests:** prompt-building variations (full inputs, only focus areas, only style), validator edge cases (drill_id not in pool, missing fields, malformed JSON), fallback signal.

## 3. LLM wrapper — `today-drill-llm.ts`

```ts
export type LLMPickResult =
  | { status: "ok"; raw: RawLLMPick }
  | { status: "parse-failed"; raw: string }
  | { status: "api-error"; reason: string };

export async function pickDrillViaLLM(
  systemPrompt: string,
  userPayload: string
): Promise<LLMPickResult>;
```

- Model: `claude-haiku-4-5-20251001`
- max_tokens: 512 (diagnosis is short)
- Uses existing `withRetry` from `@/lib/retry` for resilience
- Returns tagged result, never throws

The system prompt instructs the LLM to return strict JSON: `{"drill_id": "...", "diagnosis": "..."}` — and the wrapper extracts from markdown fences if needed (same JSON-extraction pattern as `clip-review/route.ts`).

## 4. API route — `/api/coach/today-drill`

**GET** `/api/coach/today-drill?userId=...&today=YYYY-MM-DD`

`today` query param is optional — if missing, the route uses `new Date()` to derive UTC day. Including it lets the client be explicit (avoids server vs client clock skew issues).

Flow:
1. Validate via Zod (userId + optional today).
2. SELECT from `daily_drill_picks` WHERE user_id = ? AND drill_date = ?. Hit → return.
3. Miss → gather inputs:
   - SELECT drill_program from style_profiles WHERE user_id = ? AND is_current = true LIMIT 1
   - SELECT recent clip_logs (last 10) — build clip history via aggregateClipHistory
   - SELECT focus_areas WHERE user_id = ? ORDER BY last_worked_at ASC LIMIT 5 — pick most-neglected
4. If no drill_program: return `{ status: "no-program" }` 200.
5. buildPickerPrompt → pickDrillViaLLM → validateLLMPick.
6. If LLM fails or returns invalid drill: pick fallback drill (first in program) with diagnosis "Default starter drill while we learn your style."
7. INSERT into daily_drill_picks. Handle UNIQUE collision (concurrent request) via `ON CONFLICT (user_id, drill_date) DO NOTHING` then re-SELECT — the first writer wins.
8. Return `{ status: "ok", pick: { ... } }`.

**PATCH** `/api/coach/today-drill?userId=...&today=YYYY-MM-DD`

Body: `{ action: "complete" | "skip" }`

Flow:
1. Validate.
2. UPDATE daily_drill_picks SET completed_at = now() (or skipped_at) WHERE user_id = ? AND drill_date = ?
3. Return `{ status: "ok" }`.

## 5. UI — `TodayDrillCard`

**Lives in:** top of `coach-progress.tsx`, above the streak chip from Plan 1.

**Component:** `src/components/today-drill/card.tsx`

**Self-fetches** on mount (mirrors TrendGraph pattern — no prop drilling, no shared state).

**States rendered:**

```
[loading]      — small spinner placeholder
[no-program]   — "Take the style quiz first to get your drill program."
                  Link → /style
[pre-completion]
  🎯 Today's drill
  <drill.name>
  <diagnosis text from LLM>
  ⏱ 20 min · 🥊 bag · medium
  Cues:
   • cue 1
   • cue 2
  Dose: <rounds_or_dose>
  [ Mark done ]   [ Skip today ]

[completed]    — ✅ Drill done — see you tomorrow
[skipped]      — Skipped today (small pill, no further action)
[error]        — silent (card hidden), error logged to console + PostHog
```

**Click handlers:** Mark done / Skip today both POST to `PATCH /api/coach/today-drill` and update local state optimistically.

**Style:** uses existing className tokens (`bg-surface-hover`, `text-muted`, `text-accent`, etc.). Card visually similar to clip_log Timeline rows.

## 6. Streak interaction — none new

The existing Plan 1 `user_engagement` streak already updates on every app boot. Completing today's drill doesn't add a separate streak counter. Rationale: one streak, one truth. The streak chip + the daily drill completion are both visible signals of daily showing-up; we don't multiply the surfaces.

If we later want a "drill streak" specifically, that's a Plan 3d concern (campaign abstraction).

## 7. Cold-start handling

| Scenario | Behavior |
|---|---|
| No drill_program | Card shows "Take the style quiz first" with CTA to /style |
| drill_program exists, no clips logged yet | LLM picks based on focus areas + style only. Diagnosis is style-grounded ("starter drill matching your inside-fighter profile"). |
| drill_program exists, clips logged but no scores yet (legacy clips with NULL scores) | LLM picks based on focus areas. Filters out NULL-score clips when computing trend. |
| Nothing — fresh user | Goes through style quiz first (existing flow). When they hit My Coach → drill picker fires. |

## Error handling

| Path | Error | Behavior |
|---|---|---|
| LLM API call fails (rate limit, timeout) | `pickDrillViaLLM` returns `{status: "api-error"}` | Route falls back to first drill in program with default diagnosis. Pick is persisted normally. Tracked in PostHog. |
| LLM returns malformed JSON | `pickDrillViaLLM` returns `{status: "parse-failed"}` | Same fallback as above. Tracked separately. |
| LLM picks a drill_id not in the program | Validator returns `{status: "invalid-drill"}` | Same fallback. Tracked. |
| DB write fails (UNIQUE collision from concurrent request) | INSERT returns conflict | Re-SELECT and return the existing row. First writer wins, second sees its pick. |
| DB read fails | SELECT returns error | Return `{status: "error", message: "Try again"}`. UI shows hidden state. |

**Principle:** the user always sees something. Even if the LLM and the DB are both having a bad day, the fallback drill + default diagnosis renders.

## Testing

**Unit tests (Vitest):**
- `today-drill-picker.test.ts`: prompt building (full inputs, partial inputs, empty cold-start), validator (valid result, invalid drill_id, missing fields, malformed input).

**Integration / manual QA (Task 8):**
- Fresh user with no drill_program → CTA shown.
- User with drill_program, no clips → drill renders with style-based diagnosis.
- User with drill_program + clips → drill renders with score-based diagnosis (e.g. "Your hip explosion has dropped 12% — this targets your loading phase.").
- Click Mark done → card transitions to "Drill done." Reload → still shows "Drill done."
- Click Skip → card collapses to small pill. Reload → still shows skipped pill.
- Mid-day drill_program regeneration → today's pick stays the same (drill_snapshot is frozen).
- Day rollover (midnight UTC) → next day's pick fires fresh.
- LLM offline simulation (e.g. ANTHROPIC_API_KEY temporarily wrong) → fallback drill renders, no crash.

## Out of scope

- **Drill substitution** ("show me a different one today") — Plan 3d
- **Multi-day campaigns / training arcs** — Plan 3d
- **Logging-a-clip-counts-as-completion** — Mark done is the v1 signal
- **Push notifications / email reminders** — never planned
- **Drill streak metric** (separate from app-streak) — out of scope per §6
- **A/B testing different drill picks** — premature
- **Mobile push** — not in this app's stack today

## Risks

1. **LLM picks the same drill repeatedly across multiple days** if the user's data is stable. The diagnosis varies but the drill_id might not. Mitigation: if this becomes a complaint, add a "diversity" hint to the prompt ("avoid repeating drills picked in the last 3 days"). Out of scope for v1.
2. **Mark done is trustless.** Users could click without doing the drill. Mitigation: we measure completion patterns; if fake-completion becomes load-bearing for retention metrics, tighten later.
3. **Skip becomes the easy out.** Same as above — skip rate is measurable. We can later add a "skip reason" prompt if the rate is high.
4. **Provider failure path on first day** — user sees the fallback drill, which might not match their score profile well. Acceptable: the fallback is from their program (style-tailored), just not phase-targeted. They get a drill, just not the optimal one.

## What's NOT in this plan

- Plan 3c (Reaction games) — separate plan, vault prefill happens first
- Plan 3d (Agentic coach) — separate plan, builds on this primitive
- Tagging clips, user notes, share cards, etc. — explicitly deferred from earlier plans

## What I'd want next

1. Spec review by Mark.
2. After approval, invoke `superpowers:writing-plans` for task breakdown.
3. Execute via `superpowers:subagent-driven-development` (same flow as Plans 1, 2, 3a).

Estimated effort: ~6–8 tasks (migration + types + picker + LLM wrapper + route + card + mount + manual QA).
