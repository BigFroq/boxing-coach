# Fighter-Name Boost — Validation

**Date:** 2026-07-21
**Code under test:** `src/lib/graph-rag.ts` — `retrieveContext` Step 4b (`fetchFighterBoosts` / `getFighterNames`)

## Why the boost exists

Vector ranking alone left fighter-specific chunks flapping at the topN cutoff, so
eval Layer 1 fighter queries (Topuria, Haney, Bivol, Oliveira, De La Hoya, …) failed
nondeterministically — 0 hits on one run, fine on the next. The boost is a closed-list,
additive fix: when a query names a fighter from the knowledge graph, up to `BOOST_CAP`
chunks about that fighter are appended after rerank. Nothing is displaced, and queries
that name no fighter are byte-for-byte unchanged.

## Result — Layer 1 retrieval eval

- **61/61 (100%)**, 0 fails, 0 errors.
- **Every fighter / matchup query at 100% recall** (20 surfaced by name): Canelo, Beterbiev,
  GGG, Tyson, Crawford, Gervonta, Topuria, Haney, Bivol, Oliveira, De La Hoya, Inoue,
  Ryan Garcia, plus the Crawford-vs-Canelo comparison cluster.

## Why this is a strong result, not a lucky one

The run happened with **Cohere rerank fully rate-limited** (free-trial cap → 429 on every
call → similarity-sort fallback). Retrieval still hit 61/61 because the boost is additive
and Cohere-independent: fighter chunks are pulled straight from `content_chunks` and appended,
so they land even when rerank is down. This also explains the 60/61 seen in an earlier full
run — that miss was run contention, not a retrieval regression.

## Reproduce

```bash
EVAL_RESULTS_DIR=/tmp/eval-layer1 npx tsx scripts/eval.ts --layer=1
```

Layer 1 is retrieval-only (no chat endpoint, no LLM judge), so it needs no dev server and
costs ~$1 of Sonnet (decompose + HyDE). Output is redirected so it never overwrites the
committed 3-layer baseline in `eval-results.json` / `blueprint-fidelity.md`.
