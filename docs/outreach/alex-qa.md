# Alex Q&A — pre-outreach reference

**Status:** draft scaffold. Claude wrote the first pass; **edit these answers in your own voice before the Discord DM.** This is a reference for you, not a document to send.

The goal: be able to answer these five questions in your own words without stumbling. Alex will ask some subset of them informally.

---

## 1. "What data is this trained on?"

**Short answer:** the Power Punching Blueprint PDF + 79 of 81 of your ingested YouTube transcripts. 27 concept notes, 14 techniques, 8 phases, 18 fighter profiles, 8 drills, 9 injury-prevention notes — all distilled from your material with quotes preserved.

**The /about page** spells this out in full, including what's *not* in the vault: no women's boxing, no amateur scoring, limited fighter roster beyond the 18 profiled. Showing radical honesty about gaps is part of the pitch.

**If he asks about consent/permission:** the starting position is: "this is a prototype I built from your public content to see if it was viable — I wanted to show you before scaling anything. Everything is held on my infra; nothing has shipped to users beyond a small private test group." Then offer to walk through what's possible from there (remove it, license it, partner on it — see packaging-options.md).

---

## 2. "How is this different from just asking ChatGPT?"

**Short answer:** ChatGPT gives generic boxing advice — "keep your guard up, pivot on the ball of your foot." This coach teaches *your* framework. Kinetic chains, throw-not-push, last-3-knuckles, the four phases. It corrects the myths *you* correct. It references the fighters *you* analyzed.

**Proof:** the fidelity eval in `docs/outreach/blueprint-fidelity.md` scores ~4.8/5 on questions drawn from your own content, graded against your teaching. Generic boxing advice would score 2/5 on groundedness. The methodology *is* the product.

---

## 3. "What about ownership / revenue?"

**Short answer:** the vault content is unambiguously yours — the app can't exist without your IP. The code, architecture, retrieval pipeline, and UX I built. Packaging is the conversation we're having now. I'm happy with any model that feels fair: standalone tool with revenue share, a free companion tool that drives your course sales, a license, or just ripping it down. See `packaging-options.md` for structured tradeoffs.

**What I don't want:** to ship anything that makes you uncomfortable. This DM is me showing it to you *before* I put it anywhere visible.

---

## 4. "How accurate is it really?"

**Short answer:** 4.8/5 on our internal fidelity eval across 38 questions drawn directly from your Blueprint and YouTube content. Scored by Claude Sonnet against your teaching as ground truth. Two known accuracy misses at the moment — the hook hip-opening-vs-extension phrasing and a known Crawford/Spence reference conflation — both documented in the report.

**Where it fails gracefully:** questions outside the vault (women's boxing, amateur scoring, weight cutting) get either a steered answer or a refusal with a pivot back to mechanics. Not false confidence.

**Where it could still bite:** retrieval occasionally misses edge cases. Show him the /about page — it says explicitly "this will miss nuances ~5% of the time. It's a force multiplier, not a replacement."

---

## 5. "Could my students use this?"

**Short answer:** yes, that's one of the three packaging models I'd like to discuss. Course add-on (free with Blueprint purchase) is arguably the best product fit — it turns static PDF + video content into a coach that can answer a student's specific question at 11pm about why their jab feels off. Students get more value; the Blueprint becomes stickier.

**The open questions:** (a) do students see this as Alex's tool or a third-party tool, (b) how much of the coach's voice should mirror yours vs. be a neutral teacher of your framework (currently the neutral-teacher framing, explicitly avoiding impersonation), (c) how does he want bug reports and content updates to flow back to him.

---

## Questions I should expect but haven't drafted yet

- **"Did you ask permission first?"** — prep a direct, honest answer. Don't spin.
- **"Who else has seen this?"** — pilot group from the course WhatsApp/Discord, two or three close friends. Small. Private. Name-able if he presses.
- **"How much did this cost to build?"** — honesty is fine. Back-of-envelope in LLM spend + your time.
- **"What's your ask?"** — prep a concrete one before you send the DM. "I'd love 10 minutes on a call to walk you through it" is better than "what do you think?"

---

## One thing to NOT do in the DM

Don't send this document. Don't send the fidelity report. Don't send the plan file. Send the *link* and a short personal message. Alex is a pro-facing content creator — respect his time. The documents are for you.
