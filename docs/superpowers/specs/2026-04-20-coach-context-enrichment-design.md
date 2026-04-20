# Coach Context Enrichment — Design

**Date:** 2026-04-20
**Scope:** `src/app/api/coach/session/route.ts`, `src/app/api/coach/save-session/route.ts`, `src/components/coach-session.tsx`, one new Supabase migration.
**Non-scope:** Technique tab, Drills tab, Style Finder tab, clip review.

## Problem

The coach system prompt carries more weight than it should. The route already injects profile, focus areas, recent sessions, and pending drills — the feeding architecture is half-finished, not absent. Three specific gaps make the context thinner than it looks:

1. **Pending drills grow forever.** `drill_prescriptions.followed_up` is never flipped to `true`. The coach has no reliable signal for "ask if they did this specific drill."
2. **Style Finder results are siloed.** The coach has no idea who the user is as a fighter — their Style Finder profile lives in a different table (or localStorage) and never reaches the coach prompt.
3. **"Avoidance" is invisible.** A focus area can sit `active` for weeks while the user talks around it. Nothing surfaces that pattern.

Once those three land, the prompt itself can shrink — the numbered "How to Coach This Session" block is load-bearing today only because the context beneath it is thin.

## Goals

- Pending drills reconcile automatically against what the user says they've done.
- Coach prompt knows the user's 8-dimension style profile and matched fighters.
- Coach prompt surfaces focus areas the user has been avoiding.
- Coach system prompt shrinks to rely on context rather than scripted steps.

## Non-goals

- No changes to Technique, Drills, or Style Finder tabs.
- No clip-review changes.
- No new cross-session "behavioural summary" LLM pass.
- No confidence/source gating on focus-area extraction (separate follow-up if wanted).
- No re-architecture of the RAG pipeline.

## Design

### Piece 1 — Drill follow-up reconciliation

**Files:** `src/app/api/coach/save-session/route.ts`, new migration `005_drill_followup.sql`.

**Schema delta (migration 005):**

```sql
ALTER TABLE drill_prescriptions
  ADD COLUMN followed_up_at timestamptz,
  ADD COLUMN followed_up_session_id uuid REFERENCES training_sessions(id);
```

No changes to the existing `followed_up boolean` column; the new columns enrich it.

**Extraction prompt change:** Before calling Claude, `save-session` queries pending prescriptions for this user:

```ts
const { data: pending } = await supabase
  .from("drill_prescriptions")
  .select("id, drill_name, details")
  .eq("user_id", userId)
  .eq("followed_up", false);
```

The `EXTRACTION_PROMPT` grows a new JSON field:

```
"drills_followed_up": [{"prescription_id": "<uuid>", "drill_name": "<name>"}]
```

The prompt includes the pending list inline so Claude has the ids to cite:

```
## Pending prescriptions for this user
- <id>: <drill_name> — <details>
...

If the Fighter reports doing any of these (by name, paraphrase, or nickname),
include them in drills_followed_up. Match loosely — "barbell punch thing"
matches "Barbell Punch Drill".
```

**Server update step:** After DB save of the session, iterate `extracted.drills_followed_up`:

```ts
for (const fu of extracted.drills_followed_up ?? []) {
  await supabase
    .from("drill_prescriptions")
    .update({
      followed_up: true,
      followed_up_at: new Date().toISOString(),
      followed_up_session_id: session.id,
    })
    .eq("id", fu.prescription_id)
    .eq("user_id", userId); // belt-and-braces: never touch another user's row
}
```

Guard: if `prescription_id` is not a UUID or not in the pending list, skip (defensive — Claude occasionally hallucinates ids).

### Piece 2 — Style profile injection

**Files:** `src/app/api/coach/session/route.ts`, `src/components/coach-session.tsx`.

**Server read (authed users):** `loadUserContext` gains a fifth parallel query:

```ts
supabase
  .from("style_profiles")
  .select("dimension_scores, matched_fighters, ai_result")
  .eq("user_id", userId)
  .eq("is_current", true)
  .maybeSingle(),
```

`maybeSingle` because most users haven't taken the quiz.

**Client fallback (anonymous users):** `style_profiles.user_id` references `auth.users`, so anonymous localStorage-only users have no row. The coach frontend reads the current style profile from localStorage key `boxing-coach-style-profile` (set by `style-finder-tab.tsx`; shape `{ result: StyleProfileResult, physicalContext, experienceLevel }` — `result.dimension_scores` and `result.matched_fighters` are already present). `coach-session.tsx` passes `result` into the POST body as `styleProfile`. Server precedence:

```ts
const styleProfile = dbStyleProfile ?? body.styleProfile ?? null;
```

The client-supplied value is trusted for prompt shaping but never written to the DB. A zod schema on the server validates the expected shape; failure → treat as null.

**Prompt injection:** New `## Style Profile` section, placed between `## This Fighter's Profile` and `## Relevant Knowledge Base Content`. Injects all 8 dimension scores, the style name, and the top matched fighter:

```
## Style Profile
Style: <ai_result.style_name>
Dimension scores (0-100):
- Power Mechanics: <score>
- Positional Readiness: <score>
- Range Control: <score>
- Defensive Integration: <score>
- Ring IQ: <score>
- Output / Pressure: <score>
- Deception / Setup: <score>
- Killer Instinct: <score>
Top matched fighter: <matched_fighters[0].name> (overlapping dimensions: <matched_fighters[0].overlappingDimensions joined by comma>)
```

All 8 dimensions (not just top/bottom) — the coach decides what's relevant.

If `styleProfile` is null, the entire `## Style Profile` block is omitted, not printed as "no profile."

### Piece 3 — Neglected focus areas

**File:** `src/app/api/coach/session/route.ts`.

**Computation (pure function, no new DB call):** `loadUserContext` already fetches:
- `focusAreas` where `status IN ('new', 'active', 'improving')`
- `recentSessions` (last 3) with `summary.focus_areas_worked: string[]`

Derive the neglected set:

```ts
function computeNeglected(
  focusAreas: FocusArea[],
  recentSessions: RecentSession[]
): string[] {
  const workedNames = new Set<string>();
  for (const s of recentSessions) {
    const worked = (s.summary?.focus_areas_worked ?? []) as string[];
    for (const name of worked) workedNames.add(name.toLowerCase());
  }
  return focusAreas
    .filter((f) => f.status === "new" || f.status === "active")
    .filter((f) => !workedNames.has(f.name.toLowerCase()))
    .map((f) => f.name);
}
```

`improving` areas are excluded — they're progressing, not being avoided.

**Prompt injection:** Appended to the existing `## This Fighter's Profile` block only when non-empty:

```
**Been avoiding (focus areas not touched in recent sessions):**
- <name>
- <name>
```

Empty → omit the block entirely. Don't print "none."

### Piece 4 — Coach prompt shrink

**File:** `src/app/api/coach/session/route.ts`, `buildCoachSystemPrompt`.

**Keep unchanged:**
- Opening line ("You are a boxing coach powered by Dr. Alex Wiant's Power Punching Blueprint methodology…")
- `## Your Framework`, `## Core Principles`, `## Myth Corrections` — these are substance, not scaffolding.
- `## This Fighter's Profile` and its children (with new `Been avoiding` block per Piece 3).
- `## Style Profile` block (new per Piece 2).
- `## Relevant Knowledge Base Content` block.
- Onboarding branch (`if !profile.onboarding_complete`) — new users still need explicit scaffolding.

**Replace:** The current `## How to Coach This Session` (5 numbered steps) and `## Rules` (8 bullets) sections become a single terse closing block:

```
## How to Use This Context
You have this fighter's profile, style, recent sessions, active focus areas, pending drills, and what they've been avoiding. Use it. Prioritise their gaps and avoidance over whatever they raise first — surface those before answering. Be direct. Plain prose, no markdown, no bolded subheadings. Ask one question at a time. End with one drill, never a list. Never fabricate — if the knowledge base content doesn't cover it, say so.
```

The onboarding branch keeps its own explicit guidance (unchanged).

## Data Flow

```
Coach chat turn
  → POST /api/coach/session { messages, userId, styleProfile? }
  → loadUserContext (parallel):
      profile, focusAreas, recentSessions, pendingDrills, styleProfile(DB)
  → styleProfile = dbStyleProfile ?? body.styleProfile ?? null
  → neglected = computeNeglected(focusAreas, recentSessions)
  → retrieveContext(lastUserMsg) → RAG chunks + citations
  → buildCoachSystemPrompt({ ...ctx, styleProfile, neglected }, rag)
  → Anthropic stream (sonnet-4)
  → SSE to client

Session finish (user clicks "Finish & save")
  → POST /api/coach/save-session { messages, userId }
  → load pending drill_prescriptions
  → Claude extraction (prompt now includes pending list, returns drills_followed_up)
  → save training_sessions row
  → upsert user_profiles fields
  → upsert focus_areas updates
  → insert new drill_prescriptions
  → mark matched prescriptions followed_up=true + followed_up_at + followed_up_session_id
```

## Error Handling

- **Style profile query fails:** treat as null, omit the block. Don't fail the request.
- **Client sends malformed `styleProfile`:** zod-validate the shape. On failure, treat as null.
- **Claude returns invalid `prescription_id`:** the `.eq("id", fu.prescription_id).eq("user_id", userId)` filter silently no-ops. Log a warning.
- **`drills_followed_up` missing from extraction:** treat as empty array. Piece 1 degrades gracefully to current behaviour.
- **Migration fails on deploy:** new columns are nullable, so old `save-session` code keeps working unmodified until the new code ships.

## Testing

Vitest unit tests (no new framework):

- `computeNeglected`:
  - Empty focus areas → `[]`.
  - Focus area worked in last 3 sessions → not neglected.
  - Focus area with `status='improving'` → not neglected (excluded).
  - Focus area with `status='active'`, not in any recent session → neglected.
  - Case-insensitive name comparison.

- Drill reconciliation helper (extract to pure function):
  - Valid prescription_id in pending list → update call made.
  - prescription_id not in pending list → skipped.
  - Non-UUID string → skipped.
  - Empty `drills_followed_up` → no update calls.

Integration check (manual):

- Seed a user with: 2 pending drills, 1 stale active focus area ("hip rotation"), 1 current style profile. Load coach. Confirm the system prompt (log it) contains:
  - Style Profile block with 8 dimensions.
  - `Been avoiding` line with "hip rotation".
  - Pending drills list.
- Simulate a session where the user says "I did the hip rotation drill today." Save session. Confirm:
  - `followed_up = true`, `followed_up_at` populated, `followed_up_session_id` = the new session id.
  - The matching focus area no longer appears in `Been avoiding` on the next coach load.

## Sequencing / Build Order

1. Migration `005_drill_followup.sql` (additive, safe to ship first).
2. `save-session` extraction prompt + reconciliation step.
3. `session` route: style profile read + `computeNeglected` + prompt injection.
4. `coach-session.tsx` frontend: send `styleProfile` from localStorage.
5. Coach prompt shrink (Piece 4) — last, after contexts 2 and 3 are confirmed landing in the prompt.

Each step ships independently; a partial ship is still an improvement.
