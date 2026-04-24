# Vault Graph Audit — Quality, Connectivity, and Unshipped Work

**Purpose:** A structural audit of the 84-note synthesis at `/Users/mark/boxing-coach/vault/`. Where [vault-contents.md](vault-contents.md) counts what's *in* the vault and [alex-principles.md](alex-principles.md) catalogues what's *taught* inside it, this doc catalogues what's *broken* or *incomplete* in the vault's graph — the stuff that affects what the RAG can retrieve and what a careful reader (like Alex) will notice.

**TL;DR** — Vault is healthier than expected: zero broken wikilinks, consistent frontmatter schema, strong typed `## Connections` taxonomy. But there's a clear signature of an **unshipped "Pass 3"** — 8 notes have empty or placeholder `## Connections` sections with literal comments like `[Leave empty — to be filled in Pass 3]`. Plus three duplicate concept pairs, 10 unreciprocated links, three fighters missing `## Common Mistakes`, a `_MOC.md` with phase-naming drift, and a `centrality: 0` field that nobody ever populated.

**Fix timeline estimate:** ~2 hours to close the "fix before Alex sees it" tier.

**Generated:** 2026-04-23

---

## 1. Health summary

| Signal | Count | State |
|---|---|---|
| Total notes | 84 | — |
| Total wikilinks (outgoing) | 1,272 | — |
| Unique wikilink targets | 354 | — |
| Broken wikilinks (unresolvable) | **0** | Clean |
| Orphan notes (no inbound links) | 8 | **Unshipped Pass 3** |
| Unreciprocated `## Connections` | 10 pairs | Integration gap |
| Frontmatter type distribution | 27 concept / 14 technique / 18 fighter / 8 drill / 8 phase / 9 injury-prevention | Consistent |
| Notes missing `## Common Mistakes` | 3 (all fighters) | Minor |
| Concept pairs looking like duplicates | 3 pairs | Confirmed |
| Notes with `centrality: 0` (never populated) | 84 of 84 | Dead field |
| `_MOC.md` entries with filename mismatch | 4 (phases) | Cosmetic |

---

## 2. Actual centrality — top hubs by inbound link count

The `centrality` frontmatter field is `0` on every single note. Computed from actual inbound links, the real hubs are:

| Rank | Note | Inbound |
|---|---|---|
| 1 | [Hip Rotation](../../vault/concepts/hip-rotation.md) | 34 |
| 2 | [Cross Body Chains](../../vault/concepts/cross-body-chains.md) | 28 |
| 3 | [Kinetic Chains](../../vault/concepts/kinetic-chains.md) | 27 |
| 4 | [Weight Transfer](../../vault/concepts/weight-transfer.md) | 23 |
| 5 | [Stretch-Shortening Cycle](../../vault/concepts/stretch-shortening-cycle.md) | 23 |
| 6 | [Left Hook](../../vault/techniques/left-hook.md) | 21 |
| 7 | [Torque](../../vault/concepts/torque.md) | 18 |
| 8 | [Power Punching Blueprint](../../vault/drills/power-punching-blueprint.md) | 17 |
| 9 | [Phase 2: Hip Torque](../../vault/phases/phase-2-hip-torque.md) | 17 |
| 10 | [Linear Style Mechanics](../../vault/concepts/linear-style-mechanics.md) | 17 |
| 11 | [Gervonta Davis](../../vault/fighters/gervonta-davis.md) | 17 |
| 12 | [Uppercut](../../vault/techniques/uppercut.md) | 16 |
| 13 | [Kinetic Power Training](../../vault/drills/kinetic-power-training.md) | 16 |
| 14 | [Kinetic Integrated Mechanics](../../vault/concepts/kinetic-integrated-mechanics.md) | 16 |
| 15 | [Cross](../../vault/techniques/cross.md) | 16 |

**Observations**

- The vault's actual center of gravity is hip mechanics + cross-body chains + SSC — which matches Alex's teaching. Good sign.
- Top fighter is Gervonta Davis (17 inbound), not Alex Pereira (13), despite Pereira being framed as the "gold-standard" exemplar. Davis appears more broadly because he's used as the exemplar across *multiple* punch types (uppercut, hook, cross, body shot).
- Hub fighters to protect: Davis, [Deontay Wilder](../../vault/fighters/deontay-wilder.md) (14), [Charles Oliveira](../../vault/fighters/charles-oliveira.md) (14), [Alex Pereira](../../vault/fighters/alex-pereira.md) (13). Quality issues in these four cascade through the most notes.

**Recommendation:** Populate the `centrality` field from link counts on each ingestion pass, **or** remove the field. Search the codebase first for consumers (`grep -r "centrality" src/ scripts/`) — if nothing reads it, delete.

---

## 3. Orphan notes (8) — the "unshipped Pass 3"

Eight notes are never linked to by any other note. Looking at their `## Connections` sections reveals the cause: this isn't random orphaning, it's **incomplete work**. Six of the eight contain literal placeholder text like `[Leave empty — to be filled in Pass 3]`. The other two (Oscar, one-inch-punch) have empty sections without the placeholder — same intent, less verbose.

| Note | Evidence | Should link to |
|---|---|---|
| [fighters/ciryl-gane.md](../../vault/fighters/ciryl-gane.md) | Connections: `[Leave empty — to be filled in Pass 3]` | Kinetic Chains, Cross Body Chains, Overhand Mechanics, Linear Style, Alex Pereira (contrast) |
| [fighters/dmitry-bivol.md](../../vault/fighters/dmitry-bivol.md) | Connections: `[Leave empty for Pass 3]` | Torque, Phase 2, Stretch-Shortening, Shoulder Integrity |
| [fighters/james-toney.md](../../vault/fighters/james-toney.md) | Connections: `[Leave this section empty — it will be filled in Pass 3]` | Arc Trajectory, Shearing Force, Cross Body Chains, Straight Punch Mechanics |
| [fighters/tim-bradley.md](../../vault/fighters/tim-bradley.md) | Connections: `[Leave this section empty — it will be filled in Pass 3]` | Throw vs Push, Linear Style Mechanics, Uppercut Mechanics, Jab |
| [fighters/oscar-de-la-hoya.md](../../vault/fighters/oscar-de-la-hoya.md) | Connections section empty | Ring IQ, Jab, Floyd Mayweather Jr (psychological) |
| [phases/accelerate-phase.md](../../vault/phases/accelerate-phase.md) | Connections section empty | Kinetic Chains, SSC, Torque, Phase 2, Phase 3 |
| [phases/follow-through-phase.md](../../vault/phases/follow-through-phase.md) | Connections: `[Leave this section empty — it will be filled in Pass 3]` | Weight Transfer, Shearing Force, Hook Mechanics |
| [techniques/one-inch-punch.md](../../vault/techniques/one-inch-punch.md) | Connections section empty | Four Phases (explicitly referenced in prose), Hip Rotation, GRF |

**Why this matters for outreach.** Tim Bradley is referenced *by name* as a negative exemplar in [Throw vs Push](../../vault/concepts/throw-vs-push.md)'s prose — Alex explicitly uses him for "arm disconnected from body" — but Bradley's own note has no backlink. If the RAG retrieves Bradley's note to answer "why is his punch weak," it surfaces the answer but misses the chain to Alex's teaching concepts. Same for Ciryl Gane (10+ prose references), James Toney (shearing force exemplar), and every other orphan.

**Why this matters for the graph.** Orphan notes fracture the Obsidian graph view. When Alex opens the graph (he will), eight disconnected nodes floating away from the cluster look unfinished — because they are.

**Fix:** Run the missing "Pass 3" — one pass per orphan, adding typed `## Connections` entries using the pattern established in other files (`Demonstrates: [[X]]`, `See also: [[Y]]`, `Corrects: [[Z]]`). Pattern examples live in [fighters/alex-pereira.md](../../vault/fighters/alex-pereira.md) and [fighters/gervonta-davis.md](../../vault/fighters/gervonta-davis.md). Est. 30–45 min for all 8.

---

## 4. Unreciprocated connections (10)

A has B in its `## Connections`; B doesn't list A anywhere. This makes the graph asymmetric in ways Obsidian's auto-backlinks do cover in the UI, but which still break the `## Connections` sections' self-documenting intent (half the "related notes" list is missing depending on which direction you enter from).

**Dominated by two sources:**

| Outgoing-only source | Destinations not linking back |
|---|---|
| [fighters/ramon-dekkers.md](../../vault/fighters/ramon-dekkers.md) | Four Phases of Punching, Kinetic Chains, Stretch-Shortening Cycle, Roundhouse Kick, Hook Mechanics |
| [concepts/strategic-cheating.md](../../vault/concepts/strategic-cheating.md) | Stretch-Shortening Cycle, Kinetic Chains, Four Phases of Punching, Hip Rotation |
| [drills/bounce-step.md](../../vault/drills/bounce-step.md) | Ramon Dekkers |

**Pattern.** Both Dekkers and Strategic Cheating read as smaller/later additions — Dekkers has only 2 `## Key Quotes`, Strategic Cheating has a conversational style distinct from the more formal tone elsewhere. They point outward to well-developed hubs, but the hubs were written earlier and don't know about them. Same unshipped-integration signature as the orphans.

**Fix:** Add reverse entries under `Demonstrates (from): [[Ramon Dekkers]]` in each of the 5 hub concepts, and `Trains (from): [[Strategic Cheating]]` (or the appropriate typed verb) in the 4 hub concepts it references. Est. 15 min.

---

## 5. Duplicate concept pairs (3 confirmed)

All three pairs have been confirmed by reading both members. Merge candidates:

### 5a. `four-phases-of-punching.md` ↔ `four-phases-of-the-punch.md`

Both notes describe the Load → Explode → Accelerate → Follow Through framework. Summaries near-identical. Key Quotes overlap (same Pereira quote appears in both). Aliases are complementary (`punch phases`, `mechanical phases` vs `four punch phases`, `4 phases`). Both have 15 sources cited. Inbound: 13 + 8 = 21 combined.

**Recommendation:** Merge. Pick `four-phases-of-punching.md` as canonical (higher inbound, more explicit name). Fold the other's aliases and any unique content, then delete the duplicate and update 8 inbound links.

**Additional MOC smell:** `_MOC.md` currently lists *both* under Core Concepts (lines 8 and 16). A reader scans the list and sees the same concept twice — visible evidence of the dup.

### 5b. `throw-vs-push.md` ↔ `throw-vs-push-mechanics.md`

Same principle, same direct quotes. The `-mechanics.md` variant has an emphasis on "planar vs rotational movement" that the primary doesn't fully replicate, but the quotes overlap and the Summary is describing the same distinction. Inbound: 12 + 5 = 17 combined.

**Recommendation:** Merge into [throw-vs-push.md](../../vault/concepts/throw-vs-push.md) (primary — higher inbound, simpler name). Fold the "planar movement" alias and any Key Quotes from `-mechanics.md` not already present. Update 5 inbound links.

### 5c. `hand-wrapping.md` ↔ `hand-wrapping-technique.md`

Both describe the same 15-step Mexican-style method with 6 knuckle layers and finger weaving. Key Quotes and Common Mistakes overlap.

**Recommendation:** Merge into [hand-wrapping.md](../../vault/injury-prevention/hand-wrapping.md) (shorter name). Fold aliases (`mexican wraps`, `15-step wrapping`). Low stakes — few inbound links.

**Combined impact:** 3 merges × 10-15 min each ≈ 45 min. Biggest value: cleaner MOC, no more "same thing, listed twice" for readers.

---

## 6. Missing `## Common Mistakes` sections (3)

Three fighter notes skip the section that's standard everywhere else:

- [fighters/floyd-mayweather-jr.md](../../vault/fighters/floyd-mayweather-jr.md)
- [fighters/ilia-topuria.md](../../vault/fighters/ilia-topuria.md)
- [fighters/terence-crawford.md](../../vault/fighters/terence-crawford.md)

**Pattern.** All three are fighters used primarily as *positive exemplars*, not negative ones. The mistakes they correct are documented in OTHER notes' Common Mistakes sections (e.g., Floyd's "Oscar abandoned his jab" lesson lives in [oscar-de-la-hoya.md](../../vault/fighters/oscar-de-la-hoya.md), not in Floyd's own note).

**Two ways to fix:**

1. **Add the section** even if short — "None materially documented; Crawford is used as a positive exemplar. See [Canelo Alvarez](../../vault/fighters/canelo-alvarez.md) for the counter-case of what his mechanics correct." Keeps the template uniform.
2. **Document the template choice.** Note in a vault-level schema doc that `## Common Mistakes` is only required for negative/neutral exemplars.

Preference: (1), because the vault doesn't currently have a schema doc and introducing one adds more work than filling three stubs. Est. 15 min.

---

## 7. `_MOC.md` drift

### Phase naming

`_MOC.md` lists four phase entries in colon-format:

- `[[Phase 1: Loading]]`
- `[[Phase 2: Hip Torque]]`
- `[[Phase 3: Energy Transfer]]`
- `[[Phase 4: Follow Through]]`

The actual filenames are kebab-case: `phases/phase-1-loading.md`, etc. Obsidian resolves through H1 or alias matching, so these work in-app. The cost: grep-based tooling reports them as broken until it checks aliases, and casual contributors may assume the filenames don't exist.

**Recommendation:** Update `_MOC.md` to use the canonical kebab-case form **or** add the colon form as an explicit alias. Either way, pick one convention for the codebase. Cost: 5 min.

### Duplicate concept entries

Per §5a, `[[Four Phases of Punching]]` and `[[Four Phases of the Punch]]` both appear in `_MOC.md`'s Core Concepts list. Resolves once duplicates are merged.

---

## 8. The `centrality: 0` dead field

All 84 notes have `centrality: 0` in frontmatter — a field that was designed but never populated. §2 above gives the real numbers computed from inbound link counts.

**Two paths:**

- **A: Populate on ingestion.** Add a one-line computation to whatever script writes these notes (`pass2-synthesize.ts` per the CLAUDE.md note about incremental caching). `centrality = count_inbound_wikilinks(title)`. Useful if downstream code uses it — for embedding weight, retrieval ranking, or RAG prompt prioritization.
- **B: Remove the field.** If nothing reads it, `centrality: 0` is noise. Cleaner to delete.

**Check first:** `grep -r "centrality" src/ scripts/ app/` — if zero consumers, delete. If any consumer, populate.

---

## 9. What's working (the positives)

This audit is deliberately negative-weighted. For balance:

- **Zero broken wikilinks** across 1,272 links. The ingestion/synthesis pipeline does its core job reliably.
- **Consistent frontmatter schema.** 84 of 84 notes have the same `type / aliases / tags / centrality / sources` fields. No schema drift.
- **Rich, typed `## Connections`.** The vocabulary (`Requires`, `Demonstrates`, `Trains`, `Corrects`, `See also`, `Sequences to`) is precise and consistently applied. When it exists, it documents the relation type, not just the adjacency — better than raw backlinks.
- **Every note cites sources.** The `## Sources` sections at the end are uniform and trace back to specific Punch Doctor videos or Blueprint chapters. Alex will recognise his own sources.
- **Heavy direct quotation.** The `## Key Quotes` sections aren't paraphrased — they're verbatim transcript excerpts. High fidelity to Alex's actual phrasing.
- **Hub density is real.** The top 10 notes each have 15+ inbound links. The graph isn't a bag of loosely related files — it's a connected network with clear centers.

---

## 10. Prioritized fix list

### Tier 1 — Fix before Alex sees the product (≈2 hours)

1. **Run the missing Pass 3** on the 8 orphan notes — add typed `## Connections`. The notes with explicit placeholder text make the intent obvious.
2. **Merge the three duplicate pairs** — four-phases-*, throw-vs-push-*, hand-wrapping-*. Update inbound links. Remove from MOC.
3. **Add `## Common Mistakes`** to the 3 fighter files (Floyd, Topuria, Crawford), even if short.

### Tier 2 — Fix soon (next week, ≈30 min)

4. **Add reverse links** for the 10 unreciprocated `## Connections` (Dekkers, Strategic Cheating, Bounce Step).
5. **Reconcile `_MOC.md` phase naming** — pick one convention.

### Tier 3 — Nice to have

6. **`centrality` field** — populate from inbound count on next ingestion pass, or remove from frontmatter entirely.
7. **Retry the failed [Shoulder Stability Part 4 transcript](vault-contents.md#failed-transcripts-not-in-vault)** (noted in prior audit, still valid). Parts 1–3 of the series are all ingested — Part 4's omission is the only gap in a deliberate content cluster.
8. **Audit `src/` wikilinks** — notes reference source videos via `[[src/...]]` links that go to files outside the vault. Not strictly broken (by design, they point to the content layer), but worth documenting so a reader doesn't misread them as internal vault links.

---

## Appendix — Reproducing this audit

These signals can be re-generated from the vault at any time:

```bash
cd /Users/mark/boxing-coach/vault

# Total wikilinks
grep -rho '\[\[[^]]*\]\]' . | wc -l

# Unique wikilink targets
grep -rho '\[\[[^]]*\]\]' . | sort -u | wc -l

# Inbound link counts (centrality proxy) — top 20
grep -rho '\[\[[^]]*\]\]' . | sort | uniq -c | sort -rn | head -20

# Frontmatter type distribution
grep -rh "^type:" . | sort | uniq -c

# Find orphan notes (files whose H1 is never linked)
# (Manual: cross-check filenames against `[[Title]]` occurrences + alias list)

# Files with empty or placeholder Connections sections
grep -rl "Leave.*empty.*Pass 3\|Leave this section empty" .
```

Keep this audit in the outreach folder as the pairing to [alex-principles.md](alex-principles.md) — together they make the vault legible from both content and structural perspectives.
