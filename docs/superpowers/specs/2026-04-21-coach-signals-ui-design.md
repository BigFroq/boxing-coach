# Coach Signals in UI — Design

**Date:** 2026-04-21
**Scope:** My Coach → My Progress tab + the Log Session chat view. Three new surfaces on My Progress, one collapsible banner on Log Session.
**Non-scope:** Style Finder, Technique/Drills tabs, clip review, database migrations, prompt changes, RAG changes.

## Problem

The coach-context-enrichment feature (PR #1, merged `c2d3566`) built a rich signal stack — drill follow-up observability, canonical-key focus-area tracking, neglected-area detection — but everything flows into the coach's system prompt and never surfaces to the user. A fighter can only learn "the coach thinks I've been avoiding head movement" by asking the coach directly. The signals exist; they're invisible.

This sub-project closes that loop. Three surfaces on My Progress make the coach's view visible. A fourth collapsible surface on Log Session shows the avoidance list at the moment the user is about to chat, so they can anticipate what the coach will raise (or dismiss the reveal if they prefer the surprise).

## Goals

1. Users can see which focus areas the coach considers neglected, without asking.
2. Users can see drill follow-up history — which drills were prescribed, which were done, and when.
3. Users can see when each focus area was last touched.
4. Log Session optionally shows the avoidance list as a collapsible banner, respecting user preference.
5. No new API cost, no new migrations. Pure consumer of data migrations 005 and 006 already populate.

## Non-goals

- **New data.** No schema changes, no new LLM calls, no RAG extensions.
- **Cross-session behavioural summary.** Deferred in the enrichment spec and still deferred.
- **Confidence/source gating on focus-area extraction.** Unchanged.
- **Retroactive backfill of `focus_areas_worked_keys`.** Legacy sessions remain keyless; the "last worked" timeline gracefully ignores them (returns `null`, rendered as "never worked").
- **Inline drill-follow-up status inside the chat stream.** Only on the Progress tab.

## Design

### Data layer — extend the progress route

**File to modify:** [src/app/api/coach/progress/route.ts](src/app/api/coach/progress/route.ts)

The existing route returns `{ stats, focusAreas, recentSessions }`. Extend it:

- Add `dimension` and `knowledge_node_slug` to the `focus_areas` SELECT. Needed for canonical keying.
- Import and call existing `computeNeglected` from `src/lib/neglected-focus-areas.ts`. Adds `neglectedFocusAreas: string[]` to the response.
- Add one new Supabase query: `drill_prescriptions` for `user_id = userId`, ordered by `created_at DESC`, selecting `id, drill_name, details, followed_up, followed_up_at, followed_up_session_id, created_at`. Split in-memory into `pending` (`followed_up = false`) and `recent` (`followed_up = true`, top 10 by `followed_up_at DESC`).
- Compute `focusAreaLastWorked` via a new pure helper that joins focus areas' canonical keys against each session's `summary.focus_areas_worked_keys`.

**Final response shape:**

```ts
{
  stats: { totalSessions, areasImproving, activeFocusAreas },
  focusAreas: [{ id, name, description, status, history, dimension, knowledge_node_slug, created_at, updated_at }],
  recentSessions: [{ id, session_type, rounds, summary, created_at }],
  neglectedFocusAreas: string[],
  drillPrescriptions: {
    pending: Array<{ id, drill_name, details, created_at }>,
    recent: Array<{ id, drill_name, details, followed_up_at, followed_up_session_id, created_at }>
  },
  focusAreaLastWorked: Record<string /* focusAreaId */, string | null /* ISO timestamp */>
}
```

### Pure helpers (new lib files)

Two new pure modules, both tested.

**`src/lib/focus-area-last-worked.ts`**

```ts
type FocusAreaWithKey = {
  id: string;
  dimension: string | null;
  knowledge_node_slug: string | null;
};
type SessionLite = {
  created_at: string;
  summary: { focus_areas_worked_keys?: string[] } | null;
};

export function computeLastWorkedMap(
  focusAreas: FocusAreaWithKey[],
  sessions: SessionLite[]
): Record<string, string | null>;
```

Iterates sessions newest-first, records the first session containing each focus area's canonical key. Legacy sessions (no `focus_areas_worked_keys`) are skipped. Legacy focus areas (`dimension === null`) map to `null`.

**`src/lib/relative-time.ts`**

```ts
export function formatRelativeTime(
  isoTimestamp: string | null,
  now?: Date  // defaults to new Date() — overridable for tests
): string;
```

Returns `"never"` for null, `"today"`, `"yesterday"`, `"3 days ago"`, `"2 weeks ago"`, `"3 months ago"`. Keeps the existing boxing-app tone (no "8d" abbreviations, no "just now"). Pure function, deterministic given a `now`.

### UI — My Progress (`src/components/coach-progress.tsx`)

**Section order after changes:**

1. Stats bar (unchanged)
2. **Been Avoiding** (NEW, conditional)
3. Focus Areas (modified — adds "last worked" per row)
4. **Drill History** (NEW, conditional)
5. Recent Sessions (unchanged)

**Been Avoiding panel.**
- Renders only when `neglectedFocusAreas.length > 0`.
- Heading: `<h3>Been Avoiding</h3>` with `AlertTriangle` icon, red accent.
- Subheading: "Focus areas not touched in your last 3 sessions."
- Body: chip list of names (one red-tinted chip per entry). No additional action — just surfacing.

**Focus Areas section (existing, extended).**
- Each row renders its existing content plus a new right-aligned muted timestamp: `formatRelativeTime(focusAreaLastWorked[area.id])`. Examples: "worked today", "not worked in 2 weeks", "never worked". Label prefix differs by whether the value is null vs recent.

**Drill History panel.**
- Renders only when `drillPrescriptions.pending.length > 0 OR drillPrescriptions.recent.length > 0`.
- Heading: `<h3>Drill History</h3>` with `Target` icon.
- Two sub-lists:
  - **"Pending (N)"**: pending drills with name, details, "prescribed <relative time>". Slightly dimmer.
  - **"Recently done (N)"**: completed drills with name, details, "done <relative time>". Highlights followed_up_at in accent color.
- Empty state for each sub-list within the panel: sub-list heading omitted when that list is empty.

### UI — Log Session (`src/components/coach-session.tsx`)

**Collapsible "Been Avoiding" banner.**

- Rendered above the chat message list, before the first coach message.
- Renders only when `neglected.length > 0` AND `!collapsed`.
- Collapse state persisted in `localStorage` under key `coach-avoiding-banner-collapsed` (boolean). Default: expanded (`false`).
- Layout:
  ```
  ┌─────────────────────────────────────────────┐
  │ ⚠ Coach flagged: you've been avoiding         [×] │
  │ head movement · hip rotation · jab setups        │
  └─────────────────────────────────────────────┘
  ```
- When collapsed: a tiny single-line "Show avoidance list" button in the same area that restores the banner.
- Data source: on mount, one `fetch("/api/coach/progress")` call to get `neglectedFocusAreas`. No new endpoint. Progress route is lightweight (already only reads 4 tables).

### Error handling

- **Progress route fails.** Existing UI already handles this (shows an error state). The new sections just don't render.
- **Drill query returns empty.** Section hidden entirely.
- **`focusAreaLastWorked[id]` missing.** Treated as `null` by `formatRelativeTime` → "never worked".
- **Malformed `localStorage` banner flag.** Wrap the read in try/catch; default to expanded on failure.
- **coach-session mount fetch to progress fails.** Banner silently doesn't render; don't block the chat stream.

## Data flow

```
My Progress tab render
  → GET /api/coach/progress
  → loadUserContext (existing, extended):
      stats + focusAreas (with dimension, slug) + recentSessions + drillPrescriptions (split pending/recent)
  → server computes:
      neglectedFocusAreas = computeNeglected(focusAreas, recentSessions)
      focusAreaLastWorked = computeLastWorkedMap(focusAreas, recentSessions)
  → respond with extended JSON
  → UI renders: stats | Been Avoiding (if >0) | Focus Areas (with recency) | Drill History (if >0) | Recent Sessions

Log Session tab mount
  → GET /api/coach/progress  (reuses same endpoint)
  → extract neglectedFocusAreas from response
  → read localStorage coach-avoiding-banner-collapsed
  → render banner if neglected.length > 0 AND !collapsed
  → user interactions: collapse button writes localStorage; expand button clears it
```

## Testing

**Vitest unit tests (new):**

- `src/lib/focus-area-last-worked.test.ts`:
  - Empty focus areas → `{}`.
  - Focus area never worked → `{id: null}`.
  - Single session worked the area → correct timestamp returned.
  - Multiple sessions, newest wins — uses the most recent session's `created_at`.
  - Legacy session (no `focus_areas_worked_keys`) skipped.
  - Legacy focus area (`dimension === null`) maps to null regardless of sessions.

- `src/lib/relative-time.test.ts`:
  - `null` → `"never"`.
  - Same day → `"today"`.
  - 1 day ago → `"yesterday"`.
  - 2-6 days → `"N days ago"`.
  - 1 week → `"1 week ago"`.
  - 2-4 weeks → `"N weeks ago"`.
  - 1-11 months → `"N months ago"`.
  - 12+ months → `"over a year ago"`.
  - Deterministic with overridable `now`.

**API integration test (new):**

- `src/app/api/coach/progress/route.test.ts`:
  - Seeded user with focus areas + sessions + pending/followed-up drills → response has `neglectedFocusAreas`, `drillPrescriptions.pending`, `drillPrescriptions.recent`, `focusAreaLastWorked`.
  - User with no data → response has empty arrays and empty map (not null).

**Playwright smoke (in Task 8):**

- Seed a test user with 1 neglected focus area, 1 pending drill, 1 followed-up drill, 2 sessions.
- Navigate to My Coach → My Progress.
- Assert "Been Avoiding" section renders with the expected name.
- Assert "Drill History" renders with both sub-lists populated.
- Assert focus area rows show relative timestamps.
- Switch to Log Session tab. Assert the collapsible banner appears. Click collapse → assert it hides and localStorage has the flag. Reload → assert it stays collapsed.

## Sequencing / build order

1. `src/lib/relative-time.ts` + tests (pure, no dependencies).
2. `src/lib/focus-area-last-worked.ts` + tests (pure, depends only on types).
3. Extend `/api/coach/progress/route.ts`: new query, new computed fields, new response shape. No UI depends on this yet — can ship green.
4. API integration tests for the extended route.
5. `coach-progress.tsx`: render Been Avoiding section.
6. `coach-progress.tsx`: render Drill History section.
7. `coach-progress.tsx`: add "last worked" row detail to Focus Areas.
8. `coach-session.tsx`: collapsible banner + localStorage persistence + mount-time fetch.
9. Playwright smoke + cleanup.

Each step ships independently; a partial ship still adds value (e.g., just the API extension unblocks any client reading the new fields).

## Not in scope for v1

- Drill detail view / click-through. Chips only; no modal.
- Drill-follow-up editing (flip a drill manually without the LLM). Server-only today.
- Historical charts ("you've improved on X over 6 weeks"). Separate feature.
- Notifications / badges for avoidance. Passive rendering only.
