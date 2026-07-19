# SPEC: Punch-specific clip review (Alex feedback, 2026-07-18)

Source: Alex's Discord feedback — clips of a student "loading with the slip" confused the AI because the analysis prompt is one generic 4-phase framework. His ask:

1. Before analysis, the user picks which punch they want assessed (jab / rear hand / lead hook / rear hook / …).
2. Each punch gets its own coach-authored instruction set (reference material, sequential assessment steps, if/then recommendation logic).
3. The AI uses general training + the punch-specific instruction set.
4. A dialog/message field so the user can discuss the analysis with the AI afterwards.
5. Minimum bar: "at the very least the user should specify what punch they want analyzed."

## GOAL

Clip review becomes punch-aware: user selects a punch type before analyzing, the analysis prompt is assembled from that punch's instruction file, the punch type is stored with the log, and the user can chat with the coach AI about a specific completed analysis.

## CURRENT STATE (verified in codebase)

- Upload + analysis UI: `src/components/coach-clip-review.tsx` (client-side frame extraction + MediaPipe overlay), mounted from `src/components/coach-tab.tsx`.
- Analysis route: `src/app/api/coach/clip-review/route.ts` — `ANALYSIS_PROMPT` is a hardcoded const (generic Loading / Hip Explosion / Energy Transfer / Follow Through). Only dynamic input is `fetchCalibrationBlock()` (last 5 `clip_corrections`).
- Request schema: `clipReviewRequestSchema` in `src/lib/validation.ts`.
- Persistence: `clip_logs` table (migration `014_clip_logs.sql`) — has `prompt_version` but **no punch_type column**.
- Vault: `vault/techniques/*.md` (~25 files: `jab.md`, `cross.md`, `hook.md`, `uppercut.md`, etc.) — Alex's reference material, structured frontmatter + "What Alex Teaches" + "Common Mistakes". NOT currently read by the clip-review route.
- Chat: `src/app/api/chat/route.ts` (SSE, RAG) — accepts aggregated `clipHistory` but has no per-clip context path.
- `src/lib/vault-reader.ts` already reads vault dirs from disk at runtime (fighters, drills) — reuse this pattern; do NOT wire the RAG/ingest pipeline into the clip route.

## SUCCESS CRITERIA

1. **Punch picker (required).** In `coach-clip-review.tsx`, before "Analyze" is enabled, user must pick a punch from a menu. Canonical list is a hardcoded const (slug + label), slugs matching `vault/techniques/` filenames: start with `jab`, `cross` (label "Rear Hand"), `lead-hook`, `rear-hook`, `lead-uppercut`, `rear-uppercut`, `overhand-right`, plus an `other / general` option that runs today's generic prompt. → verify: Analyze button disabled until selection; selection sent in request body.
2. **Per-punch instruction files.** New dir `src/content/clip-review/<punch-slug>.md` — one file per punch, plain markdown that Alex authors: reference notes, sequential assessment steps (ordered checklist), if/then recommendations. Seed each file by distilling the matching `vault/techniques/<slug>.md` (mark clearly as DRAFT — Alex will rewrite). Route reads the file from disk at request time (vault-reader pattern). Missing file → fall back to generic prompt, log a warning. → verify: analyzing a jab clip includes jab.md content in the prompt (assert via a unit test on the prompt-builder function, not a live API call).
3. **Prompt assembly.** Refactor `ANALYSIS_PROMPT` into `buildAnalysisPrompt(punchType)`: shared scoring/JSON-format contract + punch instruction block + existing calibration block. Keep the response JSON schema unchanged (summary/phases/strengths/improvements) so the UI and `clip_logs` columns keep working. Bump `prompt_version`. → verify: existing result rendering unchanged for all punch types.
4. **Persist punch type.** Migration: `ALTER TABLE clip_logs ADD COLUMN punch_type text;` Save it in `saveClipLog()` (`src/lib/clip-log-storage.ts`) and show it as a badge on the result + clip-log history cards. Zod: add `punch_type` to `clipReviewRequestSchema` (enum of known slugs + `general`). → verify: new row has punch_type; old rows render fine (null-safe).
5. **Follow-up dialog about a specific analysis.** On the completed-analysis view, add a "Discuss with coach" affordance that opens the existing chat with this clip's context. Implementation: extend `POST /api/chat` to accept an optional `clipLogId`; when present, the route fetches that `clip_logs` row and injects a context block (punch type, scores, summary, strengths, improvements, plus the punch instruction file) into the system prompt. No new LLM endpoint, no new chat UI — reuse `chat-tab.tsx` streaming. → verify: asking "why did my hip explosion score 4?" gets an answer referencing that clip's actual scores.

## OUT OF SCOPE

- Coach-facing editing UI for instruction sets. Alex authors markdown; it ships via the repo. (Net-new admin surface — separate project if ever.)
- Automatic punch detection from the video. User declares the punch; if the clip doesn't match, that's fine — the AI can say so.
- Multi-punch / combo assessment; one punch type per analysis.
- Wiring clip review into the RAG/`content_chunks` pipeline.
- Gating `clip_corrections` (known pre-existing issue, untouched).
- Migrating/backfilling punch_type on existing rows.

## EDGE CASES

- Punch with no `vault/clip-review/` file yet → generic prompt fallback, never a 500.
- `other / general` selection → exactly today's behavior + `punch_type = 'general'` stored.
- Vault dir absent at runtime (Vercel deploy): confirm vault files are included in the deployment bundle the same way `vault/drills` already is for `vault-reader.ts` — if drills work in prod, clip-review files will too; verify before assuming.
- `clipLogId` in chat that doesn't exist or belongs to another user_id → ignore context, proceed as normal chat.
- Instruction file very long → cap the injected block (~4k chars, truncate with note) so frames + prompt stay within request limits.

## NON-OBVIOUS DECISIONS (surface to Mark, don't bury)

0. **CHANGED DURING BUILD — instruction sets live in `src/content/clip-review/`, not `vault/`.**
   `vault/` is gitignored (`.gitignore:52`, zero tracked files) because it is pipeline
   output regenerated by `scripts/generate-vault.ts` and served from `content_chunks`.
   Anything stored there never reaches a deployment, so the originally-specified
   location could not satisfy the approved decision "markdown files in the repo that
   ship with a deploy." Moving to tracked source honours that intent. Two knock-on
   findings, both pre-existing and NOT fixed here:
   - `/api/style-finder` and `/api/drill-program` also read `vault/` at request time
     (`readFighterVaultEntry`, `readAllDrillVaultEntries`). Those files are not in the
     repo and not traced, so those reads almost certainly return null in production
     today, silently.
   - `vault/vault` is a symlink pointing at its own parent (created 2026-04-25). Any
     `outputFileTracingIncludes` glob rooted inside `vault/` panics the Turbopack build
     with an infinite loop. Left in place — not mine to delete.

1. **Instruction sets are markdown files read from disk, not DB rows.** Matches how Alex already works (he writes markdown-shaped material), zero new tables. Trade-off: edits require a deploy. Revisit only if Alex needs same-day self-service editing.
2. **If/then logic stays in prose, not code.** Alex's "if X then recommend Y" rules go verbatim into the markdown; the model executes them. No rules engine.
3. **Response JSON contract unchanged.** Per-punch prompts may describe different phase *content*, but the four phase score fields stay — otherwise the `clip_logs` schema, trend charts, and corrections loop all break. If Alex later wants per-punch phase names, that's a follow-up spec.
4. **`cross` labeled "Rear Hand"** in the UI to match Alex's vocabulary while keeping vault slugs canonical.

## BUILD ORDER

1. Migration + zod + `saveClipLog` punch_type plumbing → verify: insert works, old rows null-safe.
2. `buildAnalysisPrompt(punchType)` + `vault/clip-review/` loader + fallback → verify: unit test on prompt assembly.
3. Seed draft instruction files for the 7 punches from `vault/techniques/` → verify: files load, marked DRAFT.
4. Punch picker UI + badge on results/history → verify: button gating, badge renders.
5. Chat `clipLogId` context path + "Discuss with coach" button → verify: end-to-end question about a real analysis.

Each step is independently shippable; step 1–4 alone delivers Alex's "at the very least" bar.
