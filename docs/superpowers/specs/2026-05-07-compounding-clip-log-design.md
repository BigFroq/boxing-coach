---
title: Plan 2 — Compounding clip log (full version)
date: 2026-05-07
status: design approved, awaiting spec review
plan_type: full-version (not MVP — user explicitly chose to skip MVP discipline)
predecessor: Plan 1 (foundation) — shipped 2026-05-07, merged to main, migration 013 applied
upstream_design: docs/ideas/2026-05-07-floman-feedback-idea-map.md (item #5: "Daily-graded clip log (Hevy-pattern for technique)")
---

# Plan 2 — Compounding Clip Log

## Goal

Transform clip review from a one-shot tool into a **compounding personal-progress library**. Every clip the user uploads becomes a dated row in their timeline. Numeric phase scores let them see technique trends over time. The coach references clip history in its chat context. Mark's strategic bet — the moat versus a generic AI clip analyzer.

This implements item #5 from the FLOMAN idea map and operationalizes Hormozi's `give-info-sell-personalization` (the personalized log is the moat — the analysis is the giveaway), Mark's `practice-as-product` (visible compounding artifact), and `competence-creates-passion` (measurable improvement is the passion engine).

**Out-of-scope explicitly chosen:** MVP-then-iterate discipline. Mark accepted the risk that the strategic bet may not pay off ("idk if it'll work") in exchange for shipping a polished v1 directly.

## Success criteria

- Every successful clip review is persisted automatically with date + analysis + thumbnail + numeric scores.
- The user sees their full clip history as a scrollable timeline.
- After ≥3 clips, a 30-day trend graph renders four phase lines + an overall line.
- After each new analysis, a "vs last clip" diff card shows phase deltas.
- The coach references the user's clip history in chat answers without being explicitly asked.
- All of the above without unbounded video storage cost (thumbnails only, no full video persistence).

## Architecture

Eight components, broadly two layers:

**Data layer** (Tasks 1–3):
1. `clip_logs` table (Supabase, anon-userId model, permissive RLS).
2. AI prompt extension to return numeric scores per phase.
3. Auto-persistence on successful analysis from the existing clip-review flow.

**UI layer** (Tasks 4–7):
4. Timeline view in My Coach → Clip Review (below upload area).
5. Trend graph card in My Coach → Progress.
6. "vs last clip" diff card in the post-analysis result view.
7. Client-side aggregation of clip history injected into the coach chat's `extraContext`.

**Plus** Task 8: end-to-end manual QA (human-gated like Plan 1's Task 8).

### Boundaries / file structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/014_clip_logs.sql` | Create | Schema + RLS for `clip_logs` |
| `src/lib/clip-log-types.ts` | Create | Shared TS types for clip log rows |
| `src/lib/clip-log-aggregation.ts` | Create | Pure aggregation: trend deltas, score averages, recent history block for coach context |
| `src/lib/clip-log-aggregation.test.ts` | Create | Unit tests for aggregation logic |
| `src/lib/clip-log-storage.ts` | Create | Supabase read/write helpers (mirrors `style-profile-sync` shape) |
| `src/app/api/coach/clip-review/route.ts` | Modify | Update prompt to also return phase scores |
| `src/components/coach-clip-review.tsx` | Modify | Capture thumbnail; persist on success; render diff card and timeline |
| `src/components/clip-log/timeline.tsx` | Create | Timeline list component |
| `src/components/clip-log/diff-card.tsx` | Create | "vs last clip" card |
| `src/components/clip-log/trend-graph.tsx` | Create | Recharts line chart |
| `src/components/coach-progress.tsx` | Modify | Mount trend graph card |
| `src/components/chat-tab.tsx` | Modify | Aggregate clip history client-side, inject into `extraContext` |
| `src/lib/validation.ts` | Modify | Extend `chatRequestSchema` with optional `clipHistory` field; export `clipHistorySchema` |
| `src/app/api/chat/route.ts` | Modify | Accept `clipHistory` from request, format it via `formatClipHistory()`, append to system prompt |
| `package.json` | Modify | Add `recharts` dependency (~50KB gzip) |

### Decomposition principles

- `clip-log-aggregation.ts` is pure (no DB, no Date.now, no globals). All inputs explicit. Tests hit it directly.
- `clip-log-storage.ts` is the I/O boundary. Single-flight not needed (writes are user-action-driven, not boot-driven), but read functions should handle errors gracefully.
- UI components are dumb renderers — they receive aggregated data via props and render. No fetches inside leaves.
- `coach-clip-review.tsx` is the orchestration layer that ties upload → analysis → persistence → diff render → timeline refresh.

## 1. Schema — `clip_logs` table

```sql
-- 014_clip_logs.sql
-- Per-clip persistence for the compounding clip log. Each successful clip
-- analysis becomes a row here. Anonymous-userId model (matches user_engagement,
-- user_profiles, training_sessions). Permissive RLS — same pattern as the
-- post-migration-012 convention.

CREATE TABLE IF NOT EXISTS clip_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Source metadata
  filename text,
  duration_seconds numeric(5,2),

  -- Analysis content (mirrors the existing AnalysisResult shape from clip-review)
  summary text NOT NULL,
  phases jsonb NOT NULL,                          -- [{phase, feedback, score}]
  strengths text[] NOT NULL DEFAULT '{}',
  improvements text[] NOT NULL DEFAULT '{}',

  -- Denormalized numeric scores for fast trend queries
  score_loading int CHECK (score_loading BETWEEN 1 AND 10),
  score_hip_explosion int CHECK (score_hip_explosion BETWEEN 1 AND 10),
  score_energy_transfer int CHECK (score_energy_transfer BETWEEN 1 AND 10),
  score_follow_through int CHECK (score_follow_through BETWEEN 1 AND 10),
  score_overall numeric(3,1),

  -- Visual
  thumbnail_b64 text,                             -- one frame, JPEG quality 0.6, ~5–15 KB

  -- Versioning so we can interpret old rows correctly
  model_version text NOT NULL DEFAULT 'sonnet-4-6',
  prompt_version text NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_clip_logs_user_created
  ON clip_logs (user_id, created_at DESC);

ALTER TABLE clip_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on clip_logs" ON clip_logs;
CREATE POLICY "Allow all on clip_logs"
  ON clip_logs FOR ALL USING (true) WITH CHECK (true);
```

**Rationale:**
- `id` is uuid (not user_id PK) because a user can have many clips.
- `score_*` columns are denormalized so trend queries are `SELECT score_overall, created_at FROM clip_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`. No JSON parsing in SQL.
- `thumbnail_b64` is base64 in DB. ~10KB × 100 clips = 1MB per power user. Acceptable for now. Migrate to Supabase Storage if rows get heavy.
- `prompt_version` and `model_version` so a future prompt upgrade can be detected — old rows get tagged as v1, new ones v2, trend graphs can warn about mixed-version comparisons.

## 2. Scoring approach — absolute, not relative

The existing analysis prompt asks for free-text feedback per phase. Extend it to also return a numeric score per phase calibrated against an absolute reference (textbook technique), not against the user's own history.

**Why absolute:** enables claims like "you improved 18% in 30 days." Relative scoring would only give "vs yesterday."

**Rubric (in the system prompt):**
- 1–3 — needs significant work (basic alignment off)
- 4–6 — developing (form recognizable, key flaws present)
- 7–8 — competent (textbook execution)
- 9–10 — elite (fight-ready precision)

**Updated response shape:**

```ts
interface AnalysisResult {
  summary: string;
  phases: Array<{
    phase: string;          // "Loading" | "Hip Explosion" | "Energy Transfer" | "Follow Through"
    feedback: string;
    score: number;          // 1-10, integer
  }>;
  strengths: string[];
  improvements: string[];
}
```

**Backward compatibility:** existing `AnalysisResult` consumers in `coach-clip-review.tsx` already render `phases[].feedback`. Adding `phases[].score` is additive — old rendering still works. The score chip in the new timeline+diff card is the only consumer that requires the new field.

**Score noise mitigations:**
- Trend graph displays a 3-clip rolling average, not raw points
- Score chip in timeline/diff card shows the integer score directly (users see noise but trend smooths it)
- Empty state on trend graph until ≥3 clips logged: "Log 3 clips to see your trend"
- A small "scores are AI-generated, expect ±1 variance" tooltip on the trend card

## 3. Persistence flow

Auto-persist on successful analysis. No "save" button.

**Sequence:**
1. User uploads video, frames extracted (existing flow).
2. Frontend POSTs to `/api/coach/clip-review` (existing endpoint).
3. Endpoint returns the new shape (with scores).
4. Frontend renders the result (existing flow + new diff card).
5. Frontend asynchronously writes the row to `clip_logs` from the browser via the anon-key Supabase client. **Does not block UI rendering.** Errors are logged but do not surface to the user (passive failure — clip review still works, just not persisted).
6. Frontend refreshes the timeline list state to show the new clip immediately.

**Thumbnail capture:** the existing canvas in `coach-clip-review.tsx` extracts frames at 5fps (post-Plan-1: capped at 80 frames). Pick the middle frame as the thumbnail (most representative of the clip's "main moment"), re-encode at JPEG 0.6 quality and ~320×240 max dimensions to keep size ~5–15 KB. Stored as `thumbnail_b64`.

## 4. Timeline UX

**Lives in:** `My Coach` → `Clip Review` tab, *below* the upload area, visible whenever no clip is mid-analysis.

**Component:** `src/components/clip-log/timeline.tsx`

**Each row:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ [thumbnail]  May 7 · 12:14                                            │
│   80×60     "Lead-side jab — solid hip drive, late guard recovery"   │
│             Loading 7 · Hip 6 · Transfer 8 · Follow 5                │
└──────────────────────────────────────────────────────────────────────┘
```

- Click row → expand to show full strengths/improvements/feedback (collapsible).
- Date format: today/yesterday/relative for first 7 days, then absolute date.
- Score chips color-coded: red (1–3), yellow (4–6), green (7–8), gold (9–10).
- Empty state when no clips: "Log your first clip above to start your record."
- Lazy-load: render first 20, infinite scroll for older.

## 5. Trend graph UX

**Lives in:** `My Coach` → `Progress`, in a new card above the existing stats grid.

**Component:** `src/components/clip-log/trend-graph.tsx`

**Library:** Recharts. **Not currently a dependency** — implementation plan must `pnpm add recharts`. ~50KB gzip. Popular, well-maintained, handles tooltips/scales/accessibility out of the box.

**Graph spec:**
- 30-day rolling window, x-axis date.
- Y-axis 1–10, fixed range.
- Five lines: Loading (blue), Hip Explosion (orange), Energy Transfer (red), Follow Through (purple), and Overall (thick gray).
- Each line renders a 3-clip rolling average — not raw points — to smooth model variance.
- Below the graph, a current snapshot row: "Last 5 clips avg: Loading 7.2 · Hip 6.8 · Transfer 7.4 · Follow 6.0".
- Empty state: "Log 3 clips to see your trend." (Renders if user has 0–2 clips logged.)

## 6. "vs last clip" diff card

**Lives in:** `coach-clip-review.tsx`, rendered immediately after a new analysis lands, *above* the existing strengths/improvements blocks.

**Component:** `src/components/clip-log/diff-card.tsx`

**Format (single line, dense):**

```
┌─ vs your last clip · 3 days ago ────────────────────────────────────┐
│ Loading 7 → 8 ↑   Hip 6 → 6 –   Transfer 7 → 8 ↑   Follow 5 → 5 – │
└──────────────────────────────────────────────────────────────────────┘
```

- Green up-arrow + green text for improvements (Δ ≥ +1).
- Yellow down-arrow + yellow text for regressions (Δ ≤ -1).
- Gray dash for unchanged (-0..+0).
- Header text shows relative time of previous clip.
- If no previous clip: card hidden (this is the user's first clip — no diff to show).

## 7. Coach chat context integration

**Pattern to mirror:** the codebase already has a `styleProfile` integration in [`src/app/api/chat/route.ts`](../../../src/app/api/chat/route.ts). Frontend passes structured data via `extraContext`, schema validates it (Zod), `formatStyleProfile()` renders it into a system-prompt fragment, fragment is appended to `SYSTEM_PROMPT + contextText + contextNote + styleNote + ...`. Plan 2 adds a parallel `clipHistory` integration following the same shape.

### Frontend (client-side aggregation)

`clip-log-aggregation.ts` exports a pure function `aggregateClipHistory(clips, today): ClipHistoryContext` that returns structured data (not pre-formatted text):

```ts
interface ClipHistoryContext {
  windowDays: number;        // e.g. 14
  totalClips: number;
  trend?: {                  // omitted if <6 clips (need 5+5 for last/prior split)
    last5Avg: { loading: number; hipExplosion: number; energyTransfer: number; followThrough: number };
    prior5Avg: { loading: number; hipExplosion: number; energyTransfer: number; followThrough: number };
  };
  mostRecent?: {
    daysAgo: number;
    summary: string;
  };
}
```

`chat-tab.tsx` calls this on mount and on each submit, passes the result via `extraContext.clipHistory`.

### Backend (schema + format + append)

Three changes to make the chat API consume `clipHistory`:

1. `src/lib/validation.ts` — add `clipHistorySchema` and an optional `clipHistory` field on `chatRequestSchema`.
2. `src/app/api/chat/route.ts` — destructure `clipHistory` from `parsed.data`, call new `formatClipHistory(clipHistory)` to produce a system-prompt fragment, append it to the `system:` parameter on the Anthropic call (alongside `styleNote`).
3. `formatClipHistory()` lives in `route.ts` (or a sibling) and produces text like:

```
Clip history (last 14 days, 8 clips logged):
- Phase trend (avg of last 5 vs prior 5):
  · Loading 6.2 → 7.0 (+13%)
  · Hip Explosion 5.8 → 5.9 (+2%)
  · Energy Transfer 7.4 → 6.8 (-8%)
  · Follow Through 6.0 → 6.5 (+8%)
- Most recent clip: 2 days ago — "good hip drive but late guard recovery"
```

If `clipHistory` is absent or `totalClips < 1`, the fragment is empty (the coach falls back to pre-Plan-2 behavior).

**Coach prompting:** No system-prompt rewrite. The existing system prompt already accepts trailing context fragments. The LLM organically picks up the trend and references it: "Your hip rotation has been improving — let's protect that gain. Try drill X."

**Trigger:** Aggregation runs when `chat-tab.tsx` mounts and on each chat submission (cheap — it's a single SELECT + in-memory reduce). The fetch is a one-shot from `clip_logs` filtered by `user_id` and `created_at >= now() - interval '14 days'`.

## Error handling

| Path | Error | Behavior |
|---|---|---|
| Persistence write fails | Network error / Supabase down | Log via `console.error("[clip-log-storage] persist failed:", err)` and `track("clip_log_persist_failed")`. **Do not** show error to user — clip review UI still works. Row simply isn't saved. |
| Score parsing fails (LLM returned invalid JSON) | Malformed response | Existing JSON-extraction fallback in clip-review route handles this. If scores are missing on a row, the row is still saved with `score_*` NULL. Trend graph excludes rows with NULL scores. |
| Thumbnail capture fails | Canvas error | Save row without thumbnail. Timeline renders a placeholder block in the thumbnail slot. |
| Coach context aggregation fails | Read error | Log + track, omit the clip-history block from `extraContext`. Coach falls back to pre-Plan-2 behavior (no clip awareness). |

**Principle:** clip review must never break because of clip-log persistence failure. Plan-2 features degrade gracefully to Plan-1 behavior.

## Testing

**Unit tests (Vitest):**
- `clip-log-aggregation.test.ts` — pure aggregation logic: trend deltas (last-5 vs prior-5), avg computation, edge cases (0 clips, 1 clip, mixed-version clips, missing scores).
- Schema validation tests if a new Zod schema is introduced (probably yes for the score-extended `AnalysisResult`).

**Integration / manual QA (Task 8):**
- Upload a clip → verify a row appears in `clip_logs` with non-null scores and a thumbnail.
- Upload a 2nd clip → verify diff card renders and matches the score deltas.
- Reload the page → verify timeline persists.
- Scroll back to find oldest clip → verify lazy-load works.
- Log 3 clips → verify trend graph renders.
- Open coach chat → verify the response references your trend (qualitatively — "your delivery has been improving" in some form).
- Force a network error during persist → verify clip review UI still completes successfully and only the row write is the visible failure (in console).

## Risks & open issues

1. **Score noise.** Already covered by 3-clip rolling average + ≥3-clip empty state. Watch for: if early-user feedback says scores feel random, we may need to constrain the prompt further or add explicit calibration examples.
2. **Storage growth.** Thumbnail base64 in DB rows. At 10KB × 100 clips × N users, this can grow. Migration to Supabase Storage is straightforward later if it becomes a problem. Not a v1 concern.
3. **Backfill migration for existing users.** None — past clip reviews were ephemeral. Users start with a clean log. This is acceptable; the feature is forward-looking.
4. **Mixed-version comparisons.** If we update the prompt later (v2), clips logged under v1 may score differently than v2 clips. The `prompt_version` column lets the trend graph detect mixed-version data and warn the user. v1 only for now — handled by the column existing, not by current logic.
5. **The strategic bet may not pay off.** Mark accepted this risk. If retention metrics from Plan 1 + Plan 2 don't move, we've over-invested. Surfacing this for full transparency.
6. **Recharts dependency size.** ~50KB gzip. If the bundle gets noticeably larger, consider a lighter alternative (e.g., handwritten SVG line). Not a v1 concern.

## What's NOT in this plan

Reconfirmed for clarity:

- **Tagging clips** (combo / defense / footwork) — Plan 3+
- **User notes on clips** — Plan 3+
- **Re-running old clips** with newer model — Plan 3+
- **Share cards / export** — Plan 3+ or never
- **Full video storage** — explicitly avoided due to cost; can be added later
- **Clip-specific streak** (separate from user_engagement app-streak) — data-model creep; the existing app-streak is the daily-return measurement
- **Today's drill** — Plan 3
- **Reaction games** — Plan 4

## What I'd want next

1. Spec review by Mark.
2. After approval, invoke `superpowers:writing-plans` to produce the implementation plan with task breakdown.
3. Execute via `superpowers:subagent-driven-development` (same flow as Plan 1).
