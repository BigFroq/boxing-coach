# Style Profile Dashboard

**Status:** design awaiting user review
**Date:** 2026-04-25
**Branch:** TBD (likely `feat/style-profile-dashboard`)

## Summary

Transform the post-quiz `/?tab=style` view from a static "results page" into a persistent **style profile dashboard**. The dashboard becomes the home users land on whenever they have an existing profile — no longer "stuck on results" with only a "Retake quiz" forward path.

The dashboard also becomes the surface for **content-additions awareness**: when new questions, dimensions, or fighters are added to the app, the existing user is notified and can refine their profile incrementally without redoing the entire quiz from scratch.

## Goals

- Reframe the post-quiz experience as a persistent dashboard, not a frozen quiz output. "Retake the quiz" demoted to a small footer link, not the primary forward action.
- Give returning users a way to absorb new content (questions, dimensions, fighters) added after their original quiz take, without forcing a full re-quiz.
- Keep the AI-cost surface controlled — every Claude regeneration is an explicit user click, never an automatic side effect of "user opened the dashboard."
- Add a clickable dimension-explainer drawer so users can explore what each dimension means for their score (Q4 → option B during brainstorming).

## Non-goals (explicitly deferred)

- **Profile evolution / history widget** (Q4 → option C). The `is_current=false` rows already preserve quiz history, but no UI surfaces them in this spec. Deferred until we see retake frequency in production.
- **Scoring algorithm versioning.** If `computeDimensionScores()` logic changes (it has, recently — `M src/lib/dimension-scoring.ts`), existing profiles aren't auto-resynced. Handle as a one-off migration when it next happens, not as part of this spec.
- **Auto-regen of fighter explanations on every roster change.** Explicitly chosen against in Q3: stale prose for new top fighters gets a placeholder; user clicks "Generate analysis" or the bigger "Refresh my analysis" button to spend the Claude call.
- **Per-question dimension tagging for granular per-dimension refinement banners** (Q2 → option B). Bundled refinement (Q2 → option C) is the chosen pattern — over-engineering not warranted at current scale (8 dimensions, ~20 questions).
- **Multi-user / shared dashboards.** Existing `/profile/[id]` share URL is unchanged; no new sharing surface.

## Decisions baked in (from brainstorming)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| Q1 | Where does the dashboard live? | A — transform `/?tab=style` results view in place | Smallest blast radius; preserves nav and existing data flow |
| Q2 | How does refinement work? | C — bundled mini-quiz; scores update instantly, AI narrative regen is explicit user click | Controls Claude cost; user agency over the expensive bit |
| Q3 | When a fighter is added and re-ranks into the user's top 3? | A — re-rank silently, leave stale prose with placeholder | Cheapest; consistent with Q2's user-controlled regen pattern |
| Q4 | Dashboard content scope | B — reframe + clickable dimension explainer drawers | Adds genuine "explore your style" value beyond reframe alone, without LLM cost (drawer content is static prose) |

## Architecture

### View state in StyleFinderTab

[src/components/style-finder-tab.tsx](src/components/style-finder-tab.tsx) currently has two view states: `quiz` and `results` (plus `loading`). After this change:

```
view: "quiz" | "loading" | "dashboard"
```

The renamed `dashboard` state is the persistent home for any user whose `style_profiles` row exists. The transitions:

- No saved profile → `quiz` (unchanged)
- Saved profile loaded → `dashboard`
- Refinement modal opens over `dashboard` (does not transition view state)
- Explicit "Retake quiz from scratch" → confirmation → `quiz` (unchanged)

### "What's new" detection — pure runtime ID-set diff

No version metadata stored on profiles. Detection is computed every dashboard mount:

- **New questions:** `Object.keys(currentQuestions) − Object.keys(profile.answers)` = list of unanswered question IDs.
- **New dimensions:** `DIMENSION_KEYS − Object.keys(profile.dimension_scores)` = list of new dimension keys missing from the stored scores.
- **New fighters / re-rank:** `matchFighters(profile.dimension_scores, 3)` runs against the current code-side roster every dashboard load. If the result's top-3 slugs differ from `profile.matched_fighters`, the stored slugs are silently UPDATED. New top fighters whose slug is missing from `profile.ai_result.fighter_explanations` get an empty placeholder card with a "Generate analysis" button.

If either of the first two diffs is non-empty, the dashboard surfaces a single refinement banner: **"N new questions available — refine your profile (~Xs)"**.

This intentionally has **no version column**. The diff is cheap; ID-set comparison is the most robust signal because it doesn't require remembering to bump a version field on every content change.

### Refinement flow (Q2 → option C)

1. User clicks the refinement banner.
2. `<RefinementModal>` opens — a mini-quiz that iterates only the new question IDs.
3. On submit, client POSTs `/api/style-finder/refine` (new endpoint).
4. Server merges new answers into the existing `answers` jsonb, recomputes `dimension_scores` deterministically with `computeDimensionScores()`, re-runs `matchFighters()`, and INSERTs a new `style_profiles` row with `narrative_stale=true`. The `ai_result` and `fighter_explanations` from the previous row are carried forward unchanged. The existing `mark_previous_profiles_not_current` trigger handles `is_current` flipping.
5. Modal closes; UI returns to dashboard with updated scores on the radar.
6. Refinement banner is replaced with a **"Your analysis is out of date — Refresh my analysis"** button.
7. User clicks Refresh → POST `/api/style-finder` (existing endpoint) with the full merged answer set. Server regenerates `ai_result` (including `fighter_explanations`), INSERTs a new row with `narrative_stale=false`. Refresh button disappears.

The Refresh step is the only Claude-cost path. Users can choose to live with stale narrative + fresh dimension scores indefinitely; the dimension-radar values are always current after refinement.

### Schema change — one column added

Migration `010_style_profile_dashboard.sql`:

```sql
ALTER TABLE style_profiles
  ADD COLUMN narrative_stale boolean NOT NULL DEFAULT false;
```

- `false` for all existing rows (those `ai_result` values were generated alongside their `dimension_scores`).
- Set `true` by `/api/style-finder/refine` when carrying forward the previous `ai_result`.
- Set `false` (default) by `/api/style-finder` on the explicit user-initiated regen.

No other schema changes. No new tables.

### Dimension explainer drawer (Q4 → option B)

Each dimension on the radar becomes a clickable button. Clicking opens a side drawer with four sections, all driven by static editorial content:

1. **What this dimension is** — ~80–100 words of static prose per dimension (8 total).
2. **Your score: NN / Band** — score-band lookup. Bands proposed: Below avg <40, Average 40–60, Strong 60–75, Elite 75–90, Peak 90+. One-line interpretation per (dimension × band) cell.
3. **What to work on** — 2–3 static drill recommendations per dimension.
4. **CTA: "Ask the coach about your [dimension] →"** — deep-links to the chat tab with a pre-filled query like `"Help me develop my [dimension label] — my score is NN."` Reuses the existing `onSwitchToChat` prop already plumbed into the tab.

No LLM calls in the drawer. All content lives in [src/data/dimension-explainers.ts](src/data/dimension-explainers.ts) (new). Editorial scope: ~250 words per dimension × 8 dimensions ≈ 2,000 words written once.

### Stale fighter cards

When `compareTopFighters()` returns a different top-3 than `profile.matched_fighters`, the dashboard:

1. Renders the new top-3 in order.
2. For any fighter whose slug is missing from `profile.ai_result.fighter_explanations`, renders a placeholder card: name, dimension overlap, **"Generate analysis →"** button.
3. The Generate button kicks the same `/api/style-finder` regen flow as the global "Refresh my analysis" button — there is no per-fighter narrow regen endpoint (over-scoped for v1).

## Components

### Modified

- **[src/components/style-finder-tab.tsx](src/components/style-finder-tab.tsx)** — `ViewState` type widens to include `"dashboard"`; load path unchanged but renames the rendered component; adds `handleRefinementSubmit()` and `handleNarrativeRefresh()` callbacks plumbed into the dashboard view.
- **[src/components/style-finder/results-profile.tsx](src/components/style-finder/results-profile.tsx)** — renamed/refactored to `dashboard-view.tsx`. Demotes "Retake quiz" to a small footer link with confirmation; adds the refinement banner slot at the top; adds the "narrative stale → Refresh my analysis" button slot; wraps each dimension on the radar in a button that opens the drawer; passes through stale-fighter placeholders to fighter cards.
- **[src/components/profile/style-snapshot.tsx](src/components/profile/style-snapshot.tsx)** — small "Refresh available" badge if `narrative_stale=true` or refinement is available. Click → routes to `/?tab=style`.
- **[src/app/api/style-finder/route.ts](src/app/api/style-finder/route.ts)** — explicitly set `narrative_stale: false` on the INSERT payload (don't lean on the column default). This makes the regen path's freshness intent visible at the call site and prevents accidental drift if the default ever changes.

### New

- **[src/components/style-finder/refinement-modal.tsx](src/components/style-finder/refinement-modal.tsx)** — modal containing only the unanswered question IDs. Reuses the existing `<Questionnaire>` rendering primitives. On submit, POSTs to `/api/style-finder/refine`.
- **[src/components/style-finder/dimension-drawer.tsx](src/components/style-finder/dimension-drawer.tsx)** — side drawer rendering the 4 sections from the dimension-explainer data file.
- **[src/data/dimension-explainers.ts](src/data/dimension-explainers.ts)** — static content map keyed by `DimensionKey`, with `definition`, `bands` (band → interpretation), and `drills` arrays.
- **[src/lib/profile-freshness.ts](src/lib/profile-freshness.ts)** — pure helpers:
  - `getMissingQuestionIds(answers, currentQuestions): string[]`
  - `getMissingDimensions(scores): DimensionKey[]`
  - `compareTopFighters(currentDimensionScores, storedTopFighters): { changed: boolean; newTop3: MatchResult[] }`
- **[src/app/api/style-finder/refine/route.ts](src/app/api/style-finder/refine/route.ts)** — POST endpoint. Authed users only (mirrors the existing route's auth check). Validates input (Zod schema), merges answers, recomputes scores, re-matches fighters, INSERTs a new `style_profiles` row with `narrative_stale=true` and the carried-forward `ai_result`. Returns the new row.
- **[supabase/migrations/010_style_profile_dashboard.sql](supabase/migrations/010_style_profile_dashboard.sql)** — the column-add above.

## Data flow — refinement, in detail

```
User opens /?tab=style
  ↓
StyleFinderTab loads existing profile (Supabase or localStorage)
  ↓
profile-freshness diffs: missing questions / dimensions / fighters
  ↓
If diffs non-empty → dashboard banner: "N new questions"
  ↓
User clicks → RefinementModal opens with only unanswered IDs
  ↓
User submits → POST /api/style-finder/refine
  ↓
Server merges answers, recomputes dimension_scores, re-runs matchFighters
  ↓
INSERT style_profiles { ...new fields, ai_result: prev.ai_result, narrative_stale: true }
  ↓ (trigger flips prev row to is_current=false)
  ↓
Client receives new row → setView('dashboard'), updates radar values
  ↓
Banner replaced by "Refresh my analysis" CTA
  ↓
User clicks Refresh (optional, may never happen) → POST /api/style-finder
  ↓
Server regenerates ai_result via Claude, INSERTs new row (narrative_stale defaults to false)
  ↓
Client receives → fighter_explanations populated, all placeholder cards resolve
```

## Error handling

- **Refinement endpoint failure (network / Claude irrelevant here — no LLM call):** modal shows inline error, keeps user's answers in form state, retry button. No partial DB writes — INSERT is atomic.
- **Refresh-narrative failure (Claude call fails):** existing `/api/style-finder` already handles this; UI surfaces the error toast and the Refresh button stays available. `narrative_stale=true` row remains the current row.
- **localStorage-only user (no Supabase auth):** refinement still works against the localStorage payload — same merge logic, no INSERT, just rewrite the `boxing-coach-style-profile` key. `narrative_stale` becomes a derived client-side flag in this branch.
- **profile-freshness diff returns empty (no new content) but server-side roster has been re-ranked:** silent UPDATE of `matched_fighters` and `counter_fighters` columns; no banner shown. Stale fighter cards (if any) get the per-fighter "Generate analysis" placeholder.
- **Malformed `answers` blob from a much older profile:** treat unknown question IDs as "answered" (drop them from the missing set) so we don't re-prompt for questions that have been removed. Only IDs in the *current* `currentQuestions` set are candidates for the missing-set diff.

## Testing

### Unit

- **`profile-freshness.test.ts`** — every diff helper:
  - `getMissingQuestionIds` returns new IDs only; ignores deleted IDs in stored answers
  - `getMissingDimensions` returns new dimension keys only
  - `compareTopFighters` detects re-rank, returns `changed=false` when slugs+order match

- **`refinement-route.test.ts`** (mocked Supabase, in the same style as existing route tests):
  - merges new answers into existing answers
  - INSERTs with `narrative_stale=true` and carries forward `ai_result`
  - rejects requests where merged answer set still has missing required IDs
  - 401 for unauthed users

- **`dashboard-view.test.tsx`** (RTL):
  - banner renders when `getMissingQuestionIds` is non-empty
  - "Refresh my analysis" button renders when `narrative_stale=true`
  - dimension button click opens drawer with the right dimension's content

### E2E (Playwright, extending the `/me` profile e2e patterns)

- Take quiz cold → land on dashboard → no banner shown.
- Simulate a new question by appending to `currentQuestions` in a test fixture → reload `/?tab=style` → banner appears with correct count.
- Click banner → modal renders only the new question → submit → modal closes → radar score for the affected dimension changed → "Refresh my analysis" button visible.
- Click Refresh → narrative regenerates → button disappears.
- Click a dimension on the radar → drawer opens with definition, score band, drills, and chat-CTA.

### Manual verification

- Take the quiz with three deliberate answer patterns (pressure / slick / rangy) and confirm the dashboard reads sensibly for each.
- Add one of the Tier-A fighters from the roster-expansion plan, refresh the dashboard, and confirm the silent re-rank lands them in the right place with a placeholder card if applicable.
- Confirm `localStorage`-only path works end-to-end without Supabase auth.

## Staging

Three commits, smallest first, each independently shippable:

1. **`feat(style-dashboard): rename results to dashboard, demote retake`** — purely visual + naming, no schema. Includes migration 010 (column adds with default false; no behavior change yet).
2. **`feat(style-dashboard): dimension explainer drawer + static content`** — adds the new component and `dimension-explainers.ts`. No schema, no API changes. The dashboard radar gains clickable dimensions.
3. **`feat(style-dashboard): refinement modal + endpoint`** — adds the refine endpoint, the freshness helpers, the modal, the banner. This is the largest commit and the one that exercises the new column.

This staging order lets the user smoke-test the visual reframe and the drawer in production before any of the freshness/refinement code is merged.

## Files to modify (summary)

Modified:

- [src/components/style-finder-tab.tsx](src/components/style-finder-tab.tsx)
- [src/components/style-finder/results-profile.tsx](src/components/style-finder/results-profile.tsx) (renamed → `dashboard-view.tsx`)
- [src/components/profile/style-snapshot.tsx](src/components/profile/style-snapshot.tsx)
- [src/app/api/style-finder/route.ts](src/app/api/style-finder/route.ts) (verify `narrative_stale` defaults are respected on the regen path)

New:

- [src/components/style-finder/refinement-modal.tsx](src/components/style-finder/refinement-modal.tsx)
- [src/components/style-finder/dimension-drawer.tsx](src/components/style-finder/dimension-drawer.tsx)
- [src/data/dimension-explainers.ts](src/data/dimension-explainers.ts)
- [src/lib/profile-freshness.ts](src/lib/profile-freshness.ts) + `.test.ts`
- [src/app/api/style-finder/refine/route.ts](src/app/api/style-finder/refine/route.ts) + `.test.ts`
- [supabase/migrations/010_style_profile_dashboard.sql](supabase/migrations/010_style_profile_dashboard.sql)

## Open questions / risks

- **Editorial workload for `dimension-explainers.ts`** is real — ~2,000 words written once. Could be drafted by Alex (the SME) in batches; not a blocker for the engineering scaffolding, which can ship with placeholder copy and replace iteratively.
- **Interaction with the in-flight roster expansion plan** (`~/.claude/plans/fighter-roster-expansion.md`): roster expansion is the perfect first real-world test of the silent fighter re-rank path — once that plan ships, every existing user's dashboard will exercise the placeholder-card flow. Worth coordinating staging order: ship dashboard staging-1 (rename + migration) and ideally staging-3 (refinement) before roster expansion lands so the placeholder UX is in place when new fighters first re-rank into existing users' top 3.
- **Scoring algorithm changes mid-flight** (`M src/lib/dimension-scoring.ts` is currently dirty): if scoring behavior changes, every existing profile's `dimension_scores` becomes inconsistent with `answers`. Out of scope for this spec — but worth flagging to the user that this is a parallel concern that may bite during the same release window.
