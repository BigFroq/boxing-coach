# Fresh-browser audit — first-impression notes

**Run:** 2026-04-23, cold localStorage/sessionStorage, incognito-equivalent state, dev server on localhost:3001, desktop (1200px) + mobile (iPhone 13 viewport, 390×844).

## Summary

The first-30-seconds flow for Alex (/pd → seed question → streaming answer with feedback) works end-to-end. I fixed **two real bugs** during the audit — both would have hit Alex on his first click:

1. **`/api/chat` unhandledRejection: "Controller is already closed"** — when the Anthropic stream emitted a trailing error after `end` had already fired (common with Cohere 429 fallbacks), the ReadableStream controller threw an unhandled exception on a stale `enqueue` call. Fixed in [src/app/api/chat/route.ts](../../src/app/api/chat/route.ts) and [src/app/api/coach/session/route.ts](../../src/app/api/coach/session/route.ts) with a `safeEnqueue/safeClose` guard that tracks terminal state.
2. **`/pd` seed-question click never surfaced an assistant reply** — React 19 StrictMode dev double-mounts aborted the first `/api/chat` fetch mid-flight. Fixed by converting `/pd` to navigate to `/?q=<encoded>` and having the home page read the URL param once on mount, then strip it. See [src/app/pd/page.tsx](../../src/app/pd/page.tsx) and [src/app/page.tsx](../../src/app/page.tsx).

Everything else is polish-level or already well-designed.

## What works well

- **`/pd` copy is sharp.** "Hey Alex — this is built on your Blueprint" → framework enumeration → "What to look for" section at the bottom is the right framing. Directs him to the eval criteria (fidelity, hallucinations, nuance) that matter.
- **Private-preview chip** at the top (`Private preview — not public yet`) signals maturity and sets his expectations right.
- **Seed questions are specifically Alex's teachings** — palm-facing-you hook, front-foot pivot mechanics, shearing force + last three knuckles. Not generic boxing questions.
- **`/about` is the single strongest piece of polish.** The Known Limitations section (no women's boxing, ~18 profiled fighters, no amateur, no nutrition, no live-video form feedback, new videos lag) preempts every likely objection. "Where mistakes can still happen" with the explicit 95% accuracy claim is disarmingly honest.
- **Response quality on the shearing force test** was textbook Alex: ring-finger knuckle as primary, ulna-to-humerus structural explanation, wall-lean drill for the CTA. Would pass his eye-test.
- **Feedback widget → Supabase** confirmed end-to-end (row in `response_feedback`).
- **Sentry tunnel + PostHog event capture** both firing real traffic, verified in network panel during the audit.
- **Error boundary catches render errors gracefully** — I accidentally induced one mid-audit (stale HMR chunk referencing a removed import) and the fallback UI rendered cleanly with a Try-again button, not a white screen.

## Rough edges worth flagging to you

These aren't blockers but Alex may notice them.

### High-priority (would polish before send)

1. **My Coach tab auto-sends "I'm here to log my training session."** as a synthetic user message on cold open. Alex will see a user message he didn't type, which is surprising. Consider either hiding the first "user" bubble or making it a system greeting.
2. **Coach greeting bubble was truncated mid-sentence** ("…What did you work on today? I want to hear about the specific techniques you practiced, how the movements felt, and what you noticed during training. After we") — ended cleanly after "we". Possibly an artifact of tab-switching mid-stream, but worth testing.
3. **Markdown bold not rendered.** The system prompt lets the coach bold one phrase per answer; in the UI, `**text**` renders as literal asterisks, not bold. Cheap fix: pipe the assistant content through a minimal markdown-to-bold renderer, or strip the asterisks and rely on plain paragraphs (which the prompt already biases toward).

### Medium

4. **Find Your Style is a 30-question quiz.** That's a lot upfront. Alex may bounce before finishing. Consider: a 5-question "quick style read" version as an entry point that up-sells the full 30-question deep dive at the end.
5. **`/pd` uses a lot of whitespace on desktop** (content is centered in ~640px with ~280px empty on each side at 1200px). Looks fine, but could feel empty. A subtle right-side illustration or a small quote card could balance it — optional.
6. **Dev tools "N" icon overlaps the Think Longer button on mobile.** Dev-only artifact, won't ship.

### Low

7. **Upstash rate limiter + Cohere trial-tier rerank** both produced errors during the audit (Cohere 429s specifically). The app falls back to similarity-based reranking when Cohere caps out — retrieval quality likely drops marginally but no user-visible error. Upgrade Cohere to production tier before the DM if you want to be sure.
8. **No loading state between tab clicks** — tabs swap instantly, which is fine, but My Coach's first-load greeting takes ~5s of silence before the first bubble appears. A "Coach is thinking…" placeholder (like the one in Technique chat) would smooth it.

## Mobile

- /pd renders cleanly at 390px. CTAs stack vertically, seed questions are comfortable tap targets (~56px tall), no horizontal scroll.
- Home page ChatTab works on mobile; suggestion chips wrap sensibly.
- /about is a long read on mobile but the section hierarchy (`h2` per section) makes scanning easy.

## Screenshots

In [`screenshots/`](./screenshots/):
- `audit-01-pd-cold.png` — /pd landing
- `audit-02-drills-cold.png` — Drills tab empty state
- `audit-03-coach-cold.png` — My Coach greeting (note auto-sent user bubble)
- `audit-04-style-cold.png` — Find Your Style Q1 of 30
- `audit-05-about.png` — /about
- `audit-06-pd-mobile.png` — /pd at 390px
- `audit-07-home-mobile.png` — home at 390px

## What I'd do before the DM

1. Kill the auto-sent "I'm here to log my training session" bubble in My Coach, or convert it to a non-user-attributed greeting.
2. Render markdown bold in chat responses (or strip `**` from assistant output) — one-line fix either way.
3. Upgrade the Cohere key so retrieval quality stays consistent.
4. One more smoke run through /pd → Technique → Drills → My Coach (with the auto-bubble fix) → Style (skip through a few questions) to confirm nothing regressed.

That's ~1-2 hours of polish before you're ready to send.
