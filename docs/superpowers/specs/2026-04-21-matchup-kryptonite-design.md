# Matchup / Kryptonite — Design

**Date:** 2026-04-21
**Scope:** Style Finder results page. New section "Fighters Strongest Against You" showing 3 fighters whose profile exploits the user's weaknesses, each with a rich analytical paragraph grounded in vault content.
**Non-scope:** Coach tab, clip review, Technique/Drills tabs, RAG pipeline changes, new fighter metadata.

## Problem

The Style Finder answers "who are you like?" but not "who beats you?". Matching on similarity (Euclidean closest-match) is identity-focused — it flatters the user but gives them no training stakes. The owner's product notes explicitly flagged a missing "strongest against you" section as the feature that converts identity into motivation.

The gap also limits the app's coaching loop: the user sees the fighters they resemble, but never learns what their profile is vulnerable to, what archetypes exploit them, or what to train to close those gaps. The Style Finder today is all mirror, no stakes.

## Goals

1. Rank each user's 3 most threatening counter-fighters deterministically from their 8-dimension profile.
2. Produce a specific, analytical, vault-grounded paragraph per counter explaining *why* that matchup is bad and *what* to train, not a generic "watch out for him" blurb.
3. Surface the section inline on the results page in a way that preserves the existing narrative arc (identity → threat → training).
4. Persist results alongside the existing `matched_fighters` so retakes are reproducible and anonymous users don't lose the data.
5. Never fabricate counter analysis — every claim in the paragraph must trace to a vault source.

## Non-goals (v1)

- **Physical asymmetry.** Fighter records in `src/data/fighter-profiles.ts` have no stance/height/reach metadata. The ranking does not use physical context; paragraphs may reference it generically when supported by the quiz's `physical_context`. Enriching fighter records is a separate sub-project.
- **Gas tank / chin / mentality dimensions.** Would require new quiz fields and new fighter metadata.
- **Style-taxonomy tags on fighter records.** Attack-vector classification is computed per-analysis from the 8 scores, not persisted on the fighter.
- **Per-counter follow-up chat context.** The "Ask about this matchup" CTA opens the existing embedded style chat with a pre-filled query; it does not pre-load the counter paragraph as history.
- **Backfill of counter_fighters for legacy profiles.** New column stays NULL for rows written before this feature; retaking the quiz regenerates.

## Design

### Ranking (new pure function, deterministic)

**Files to create:**
- `src/lib/fighter-counter-matching.ts`
- `src/lib/fighter-counter-matching.test.ts`

**Reuses:** `DimensionScores`, `DIMENSION_KEYS`, `FighterProfile`, `FIGHTER_PROFILES` from `src/data/fighter-profiles.ts`. Patterns from `src/lib/fighter-matching.ts` (Euclidean distance) but inverted semantics — does NOT call `matchFighters`.

**Attack-vector model.** Four named archetypes, each a subset of the 8 dimensions, with a corresponding defensive counterpart:

| Attack vector        | Attacker dims                                        | Defensive counterpart dims                          |
|---------------------|------------------------------------------------------|------------------------------------------------------|
| Power puncher       | `powerMechanics`, `killerInstinct`                   | `defensiveIntegration`, `positionalReadiness`        |
| Pressure fighter    | `outputPressure`, `positionalReadiness`              | `defensiveIntegration`, `ringIQ`, `rangeControl`     |
| Technical boxer     | `deceptionSetup`, `rangeControl`, `ringIQ`           | `ringIQ`, `defensiveIntegration`, `rangeControl`     |
| Defensive sniper    | `defensiveIntegration`, `positionalReadiness`, `ringIQ` | `deceptionSetup`, `outputPressure`, `rangeControl` |

**Threat score per fighter:**

```
for each attack vector v:
  vector_threat_v = max(0, mean(fighter[attacker_dims_v]) - mean(user[defensive_counterpart_dims_v]))
threat_score = sum over v of vector_threat_v + one_shot_bonus
```

**One-shot dominance bonus.** For every dimension `d`, if `fighter[d] >= 85` AND `user[d] <= 40`, add `25` to `threat_score`. Captures "Wilder's right hand" kill scenarios that vector averages smooth away.

**Gate.** A fighter only counts as a counter if they have at least one dimension where `fighter[d] >= 75` AND `user[d] <= 40`. If no fighter passes the gate, the function returns `[]` — the UI hides the section rather than invent weak threats for balanced users.

**Primary attack vector.** The vector with the highest `vector_threat_v`. Used for UI labels and as an explicit signal to the paragraph-writing LLM.

**Exclusion.** Accepts an `excludeSlugs: string[]` parameter. Fighters already in the user's top-3 *matches* should be passed in so they're not double-duty as counters. The function does NOT compute matches itself.

**Return shape:**

```ts
export interface CounterMatch {
  fighter: FighterProfile;
  threatScore: number;
  primaryAttackVector: "power" | "pressure" | "technical" | "defensive-sniper";
  exploitedDimensions: Array<{
    dimension: keyof DimensionScores;
    user_score: number;
    fighter_score: number;
    gap: number;
  }>; // top-3 dims by gap, descending
  oneShotDominance: (keyof DimensionScores)[]; // may be empty
}

export function matchCounters(
  userScores: DimensionScores,
  excludeSlugs?: string[],
  count?: number  // defaults to 3
): CounterMatch[];
```

### Per-counter deep analysis (API route)

**File to modify:** `src/app/api/style-finder/route.ts`.

The route currently runs a single Anthropic call (`claude-sonnet-4-20250514`, `max_tokens: 2048`, `retrieveContext` with style-relevant categories) that returns the structured style profile. It is extended (not replaced):

**New steps, in order:**

1. Compute `matches = matchFighters(...)` (existing).
2. Compute `counters = matchCounters(userScores, excludeSlugs: matches.map(m => m.fighter.slug), 3)`.
3. If `counters.length > 0`, gather per-counter context in parallel:
   - **Vault fighter entry** — direct file read of `vault/fighters/<slug>.md`. Every entry has Summary / What Alex Teaches / Key Quotes / Common Mistakes / Connections sections with YAML frontmatter. This is the authoritative source for citable claims about the fighter.
   - **Graph-RAG retrieval** — one call per counter using existing `retrieveContext(query, { count: 6, categories: ["analysis", "mechanics", "drill"] })` with a query constructed from the matchup: `"How does a {primaryAttackVector} like {fighter.name} exploit a fighter with low {exploitedDimensions.map(d=>label).join(', ')}? Drills and concepts to train against this archetype."`. Returns concept notes + drill chunks + citations.
4. Bump `max_tokens` to **4096** (2048 won't fit 3 rich counter blocks plus the existing style fields).
5. Extend the system prompt to include, per counter: the `CounterMatch` record (threat score, attack vector, exploited dimensions, one-shot list), the fighter's vault entry (full content), the retrieved chunks, and instructions to produce a structured `counter_explanations` entry.
6. Extend the requested JSON output schema to include `counter_explanations` (below).

**`counter_explanations` entry shape (per counter):**

```ts
Array<{
  name: string;              // fighter name, echoed from ranking
  slug: string;              // fighter slug, echoed from ranking
  attack_vector: string;     // display label matching primaryAttackVector
  paragraph: string;         // 150-200 words, analytical, vault-grounded
  exploited_dimensions: Array<{
    dimension: string;
    user_score: number;
    fighter_score: number;
    gap: number;
  }>;
  one_shot_notes: string | null; // non-null when any dim passed the bonus; describes the kill-shot dynamic
  recommended_drills: Array<{    // links to existing vault nodes ONLY — never invented
    slug: string;                // must be in VAULT_SLUGS from src/lib/dimensions.ts
    name: string;
    why: string;                 // one sentence tying drill to the exploited gap
  }>;
  citations: Array<{         // sourced from retrieved chunks and the vault fighter entry
    title: string;
    url_or_path: string;
  }>;
}>;
```

**Validation.** After JSON parse, validate each `recommended_drills[].slug` against `VAULT_SLUGS`. Drop entries with unknown slugs (don't fail the whole response — degrade gracefully). Validate `counter_explanations[i].slug` matches the i-th counter slug; if mismatched, log warning and reorder by slug.

**Determinism guarantee.** The `CounterMatch` list is passed in; the LLM must not pick, drop, or reorder counters. Paragraph phrasing varies between retakes, which is acceptable. The ranking, dimensions, drills, and citations are stable.

### Results-page UI

**File to modify:** `src/components/style-finder/results-profile.tsx`.

**Section order before/after.** Current: Physical tags → Style header → Radar → Score breakdown → Retake compare → **Fighter Matches** → Strengths/Growth → Punches → Stance → Priorities → Insight → Chat → Actions. New: insert "Fighters Strongest Against You" *directly after* Fighter Matches, *before* Strengths/Growth. Preserves narrative arc (who you are → who beats you → what to train).

**New component:** `src/components/style-finder/fighter-counter-card.tsx`. Parallel to `fighter-match-card.tsx` but with warning/threat visual styling so users don't confuse match with counter. Card contents top-to-bottom:

1. Header: fighter name + attack-vector badge (e.g., "Power Puncher") + threat tag — the first counter in the list (highest `threatScore`) is tagged "High Threat", the rest "Moderate Threat". Tagging is positional, not threshold-based, so it stays stable across users with different score ranges.
2. Exploited-dimensions mini chart: horizontal bars showing user vs fighter on the top-3 exploited dimensions.
3. One-shot callout (conditional, red banner): `one_shot_notes` text, shown only when non-null.
4. Paragraph body: the `paragraph` field.
5. Recommended drills: chips listing `recommended_drills[]`. Each chip links to its vault slug (same link pattern as existing style-finder citations).
6. Citations footer: matches the existing citations rendering elsewhere on the results page.
7. CTA button: "Ask about this matchup" — opens the embedded ChatTab (already on the page) with a pre-filled query. Example: `"How do I train to survive a matchup against a power puncher like Mike Tyson given my profile?"`. Reuses the existing style-context embedded chat; no new chat plumbing.

**Section heading:** "Fighters Strongest Against You".

**Empty state.** When `counter_fighters` is `[]` (gate passed zero fighters), the whole section is omitted from the DOM. No "no counters" card.

### Persistence

**New migration:** `supabase/migrations/007_style_counter_fighters.sql`:

```sql
ALTER TABLE style_profiles
  ADD COLUMN counter_fighters jsonb;
```

Nullable. Legacy rows stay NULL. No backfill.

**Server write path.** `/api/style-finder` persists `counter_fighters` alongside `matched_fighters` when the authed user is writing to `style_profiles`. The shape is the full `counter_explanations` array.

**Anonymous localStorage path.** Mirrors `matched_fighters` treatment in `src/components/style-finder-tab.tsx`. The `result` blob saved under `boxing-coach-style-profile` gains a `counter_fighters` field alongside the existing `matched_fighters`.

**Load path.** `results-profile.tsx` already hydrates from either DB or localStorage depending on auth state. Extend the type and read `counter_fighters` the same way.

## Data Flow

```
Quiz completed
  → POST /api/style-finder { answers, scores, matches, physical_context, experience_level }
  → matches = matchFighters(scores, 3)                                  (existing)
  → counters = matchCounters(scores, excludeSlugs: matches.slugs, 3)    (new)
  → if counters.length > 0:
      parallel fetch per counter:
        - read vault/fighters/<slug>.md
        - retrieveContext(matchupQuery, categories: analysis/mechanics/drill)
  → retrieveContext for style-level context                              (existing)
  → Anthropic call (sonnet-4, 4096 tokens):
      system: Punch Doctor persona + style context + per-counter vault + per-counter chunks + structured matchup signals
      user: "Generate the style profile including counter_explanations for these 3 fighters."
  → parse JSON, validate drill slugs against VAULT_SLUGS, persist
  → 200 { ...existing fields, counter_explanations: [...] }

Results page render
  → hydrate profile from DB or localStorage
  → if result.counter_fighters?.length > 0:
      render "Fighters Strongest Against You" section between Fighter Matches and Strengths/Growth
      render one FighterCounterCard per entry
  → else: section omitted
```

## Error Handling

- **`matchCounters` returns [].** UI renders no counter section. API response has `counter_explanations: []`. This is expected for balanced users.
- **Vault file read fails for a counter.** Skip that counter's vault context, still retrieve from graph-RAG, note the degraded context in the system prompt. If all three vault reads fail, log an error and return `counter_explanations: []` rather than fake-writing paragraphs without source.
- **`retrieveContext` returns zero chunks for a counter.** Continue with just the vault entry; paragraph cites only the fighter's entry. Still viable.
- **Anthropic call returns malformed JSON or omits `counter_explanations`.** Existing style fields still return; `counter_explanations` defaults to `[]` with a warning log. UI hides the counter section. Style profile does NOT fail to save.
- **Drill slug validation.** Unknown slugs (not in `VAULT_SLUGS`) are dropped from `recommended_drills`. If all drills are dropped, the chips row is empty; card still renders.
- **Migration 007 not applied.** Server write to `counter_fighters` throws PostgREST error. Existing columns still save. Deploy sequence: migration first, then code.

## Testing

**Vitest (`fighter-counter-matching.test.ts`):**

- Low-defence user (`defensiveIntegration ≤ 30`, `positionalReadiness ≤ 40`, others middling) returns power-puncher and pressure-fighter top counters.
- Uniform user (all 60) returns `[]` — gate fails for every fighter.
- User with identical scores to a specific fighter's record: that fighter is excluded from counters (via exclusion list passed by caller, not inferred).
- One-shot bonus: user `powerMechanics=35` against fighter `powerMechanics=95` includes that dim in `oneShotDominance`.
- `excludeSlugs`: listed slug never appears in returned counters.
- Deterministic: same inputs → same outputs (multiple invocations).
- Return top 3 by default; `count` param respected; `count > 18` returns 18 − excluded.

**Vitest (API route integration, mocked Anthropic + retrieveContext):**

- With mocked `counters = [...]`, verify the system prompt contains vault content and retrieved chunks for each counter.
- `counter_explanations` array has correct shape, slug matches the counter's slug.
- Drill slug validation: injects a fake slug "not-a-real-drill" into the mock LLM response; verify it's dropped before persistence.
- Empty counters list → empty `counter_explanations`, 200 response, no retrieval attempted.
- `max_tokens: 4096` on the Anthropic call.

**Supabase persistence test.** Round-trip: insert a `style_profiles` row with `counter_fighters` jsonb, read back, assert shape matches.

**Playwright smoke.** Seed a style profile for a test user with powerMechanics=30, defensiveIntegration=25, rest middling. Navigate to results. Assert:

- Section "Fighters Strongest Against You" is visible.
- 2-3 counter cards rendered.
- Each card: non-empty paragraph, attack-vector badge, at least one drill chip.
- "Ask about this matchup" CTA opens chat with pre-filled query.
- Uniform-score user (all 60): section not in DOM.

**Regression.** Existing `fighter-matching` tests; existing style-finder route contract (`fighter_explanations` still correct); `results-profile.tsx` layout for users without counters.

## Sequencing / Build Order

1. Migration 007 (additive, safe to ship alone; legacy rows unaffected).
2. `fighter-counter-matching.ts` + tests (pure, no dependencies on API).
3. API route extension: matchup computation, per-counter context gathering, prompt expansion, `counter_explanations` parsing + validation, persistence.
4. Load path: extend type, read from DB/localStorage.
5. `fighter-counter-card.tsx` (new component) + results-profile integration.
6. Playwright smoke + clean-up.

Migration 007 and code must ship together; code writes to a column that only exists after 007.
