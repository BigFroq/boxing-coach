# Vault Coverage Audit

**Purpose:** Inventory what's actually in the knowledge base that powers the AI coach, so we know what Alex will see when he tests it, and what gaps exist.

**Generated:** 2026-04-22 (Phase 1 of pre-outreach plan)

---

## Sources ingested

| Source | Count | Total size | Notes |
|---|---|---|---|
| **Punch Doctor YouTube transcripts** | 79 successfully ingested / 81 total in manifest | ~877k characters | 2 failed (listed below). Range: 6k–36k chars each. |
| **Power Punching Blueprint PDF** | 15 chapters + metadata | structured into topic-aligned chunks in `content/pdf-chunks/` | Named chapters: What Is Power, Common Misconceptions, Torque & Four Phases, Kinetic Chains, Shearing Force & Knuckles, Stance & Phase 1, Phase 2 Hip Mechanics, Phase 3 Core Transfer, Phase 4 Follow Through, Jab/Straight/Hook/Uppercut Mechanics, Hand Wrapping, Bag Work & Combos |

### Failed transcripts (not in vault)
- `vELRa6zZxHM` — *Corrales vs Manfredy First Knockdown* (0 chars — fetch failed)
- `Uhfn3CN7cjQ` — *Shoulder Stability for Boxers Part 4: Kinetic Chain Activation* (0 chars — fetch failed)

The Shoulder Stability one is worth retrying — it's part of a series (Parts 1, 2, 3 are all ingested) and injury prevention is a real content pillar.

---

## Synthesized vault structure

After ingestion, content is distilled into 6 cross-linked note types (Obsidian-style `[[wikilinks]]`, served to the RAG via Supabase vector search):

| Type | Count | Examples |
|---|---|---|
| **Concepts** | 27 | Kinetic Chains, Torque, Shearing Force, Arc Trajectory, Stretch-Shortening Cycle, Lateral Hip Muscles, Knuckle Landing Pattern, Telegraphing, Frame, Spiral Line, Ring IQ, Strategic Cheating, Positional Readiness, Ground Reaction Force, Cross-Body Chains, Front Functional Line, Weight Transfer, Wrist Position at Impact, Linear Style Mechanics, Kinetic Integrated Mechanics, Throw vs Push, Four Phases (two variants), Edge of the Bubble, Hip Rotation, Oblique to Serratus Connection |
| **Techniques** | 14 | Jab, Cross, Hook, Uppercut, Left Hook, One Inch Punch, Jab Mechanics, Cross Mechanics, Straight Punch Mechanics, Hook Mechanics, Uppercut Mechanics, Overhand Mechanics, Pull Counter, Roundhouse Kick |
| **Phases** | 8 | Accelerate, Explode, Follow Through, Load, Phase 1 Loading, Phase 2 Hip Torque, Phase 3 Energy Transfer, Phase 4 Follow Through |
| **Fighters** | 18 | Alex Pereira, Canelo Alvarez, Charles Oliveira, Ciryl Gane, Deontay Wilder, Devin Haney, Dmitry Bivol, Earnie Shavers, Floyd Mayweather Jr, Gervonta Davis, Ilia Topuria, Jake Paul, James Toney, Mike Tyson, Oscar De La Hoya, Ramon Dekkers, Terence Crawford, Tim Bradley |
| **Drills** | 8 | Barbell Punch, Bounce Step, Club Bell Training, Heavy Weight Visualization, Hip Rotation Drill, Kinetic Power Training, Lateral Foot Push Drill, Power Punching Blueprint |
| **Injury prevention** | 9 | Athletic Frame, Background Tension, Hand Wrapping (x2), Hip Hinge Mechanics, Neck Training, Pec Minor Release, Rotator Cuff Strengthening, Shoulder Integrity |

Each synthesized file has frontmatter (type, aliases, centrality, source count), a **Summary**, **What Alex Teaches** section with direct quotes from Blueprint + videos, **Common Mistakes**, and **Connections** (bidirectional to related notes). Example: `vault/concepts/kinetic-chains.md` has 12 sources contributing and 6+ bidirectional connections.

---

## Coverage strengths (things the AI will handle well)

These show up strongly in the vault and are safe bets for Alex to test:

1. **Kinetic chain biomechanics** — *the* core concept. 27 concept notes, Blueprint chapters 4, 7, 8, PDF + ~30 videos all reinforce it.
2. **Four-phase punch model** (Load → Accelerate → Explode → Follow Through) — 8 dedicated notes + Blueprint chapters 6–9.
3. **Individual punch mechanics** — Jab, straight, hook, uppercut each have both a "technique" note and a "mechanics" note, plus Blueprint chapters 10–13.
4. **Fighter case studies** — 18 fighter profiles distilled from their dedicated videos. Tyson, Crawford, Canelo, Pereira, Beterbiev, Gervonta, Mayweather, and Shavers are the deepest.
5. **Common misconceptions / myth correction** — explicit "Common Mistakes" sections on concept notes + Blueprint chapter 2 + video "5 Boxing Myths You Hear in the Gym" fully ingested.
6. **Arc vs straight-line punch** — directly in multiple videos, Blueprint, and two concept notes.
7. **Hand wrapping** — dedicated video + Blueprint chapter 14 + two injury-prevention notes.
8. **Shoulder stability / rotator cuff** — Parts 1, 2, 3 of the series ingested (Part 4 failed — retry recommended).

---

## Coverage gaps (what the AI will struggle with or have to refuse)

These are the **known limitations** to surface on the About page and prep for in the Q&A doc:

1. **Women's boxing** — zero women's fighter profiles in the vault. If a user asks about Claressa Shields, Katie Taylor, Amanda Serrano, Seniesa Estrada, etc., the AI has no primary source.
2. **Amateur / Olympic scoring** — Alex's content is pro-focused (heavy pro boxing + MMA). Amateur stance, headgear, point scoring, Olympic tactics aren't covered.
3. **Opponent-specific tactics beyond the ~18 profiled fighters** — e.g. "how would I beat Tszyu" or questions about fighters Alex hasn't filmed about.
4. **Weight cutting / nutrition / S&C programming** — Alex touches on kinetic-chain-relevant S&C (medicine ball, club bells, squat depth stretches) but there's no ingested content on nutrition, cutting weight, or full training periodization.
5. **Cardio / conditioning progressions** — secondary in Alex's content.
6. **Defensive fundamentals** as a standalone topic — defense shows up inside fighter analyses (Mayweather, Bivol) and in concepts like Frame and Positional Readiness, but there's no dedicated "defensive boxing" cluster.
7. **Referee / rules / scoring** — not Alex's focus; AI will be general-knowledge only here.
8. **Specific sparring drill prescriptions by level** — drills vault is about power-generation drills, not partner sparring.
9. **Beginner onboarding content** — Alex's Blueprint assumes an intermediate audience. A total beginner asking "what's a jab" gets good answers, but "I've never trained, where do I start" will lean on general LLM knowledge more than his teaching.
10. **Newest content** — anything Alex has posted since the ingestion cutoff isn't in here. (Confirm cutoff date before outreach.)
11. **Visual/video output** — the AI can't watch sparring footage, can't generate diagrams or videos, can't give form feedback on a user's punches.

---

## Existing eval infrastructure (relevant for Fidelity task #1)

Good news: a 3-layer eval already exists at [`scripts/eval.ts`](../../scripts/eval.ts) (637 lines):

- **Layer 1 — Retrieval coverage**: 62 queries, keyword-match scoring
- **Layer 2 — Adversarial**: 21 queries (misspellings, vague, off-topic, multi-topic, myth)
- **Layer 3 — Answer quality**: 31 queries, Claude-as-judge scoring on `accuracy`, `voice`, `groundedness`, `actionability`, `myth_correction`

Run via `npm run eval` or `npm run eval -- --layer=3`.

**Implication for plan task #1:** Instead of writing a new 25-question eval, the smart move is:
1. Run the existing eval, get baseline scores, identify weak dimensions
2. Extract Alex's documented answers from vault concepts (each has a "What Alex Teaches" section + direct quotes) and add a new **"matches Alex's documented answer"** dimension to the Layer 3 judge — this is the true Blueprint Fidelity check missing from the current eval
3. Add ~10 new Layer 3 queries targeted at the coverage gaps above (to verify graceful limitations, not to expand coverage)

Cost estimate: existing Layer 3 uses Sonnet — ~$0.10–0.30 per full run.

---

## Recommendations before Alex tests it

1. **Re-run failed transcript fetch** for the Shoulder Stability Part 4 video — the series is otherwise complete, and this is cheap to fix.
2. **Confirm ingestion cutoff date** and explicitly list it on the About page ("trained on videos up to [date]").
3. **Document women's boxing as an explicit limitation** on the About page. He'll notice.
4. **Run the existing eval end-to-end first** (Layer 1 + 2 + 3) and capture a baseline in `docs/outreach/blueprint-fidelity.md` before extending.
5. **Check if his newest video is in the vault** — a quick "hey the newest one isn't in yet but will be soon" on the About page shows you're iterating.
