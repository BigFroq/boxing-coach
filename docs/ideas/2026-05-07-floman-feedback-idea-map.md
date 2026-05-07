---
title: Idea map — FLOMAN feedback (20s cap + retention games)
date: 2026-05-07
status: approved with modifications — proceeding to implementation plan
inputs:
  - workstream-A: codebase audit of 20s video cap
  - workstream-B: codebase audit of retention surface
  - workstream-C: second-brain vault mining (Hormozi + Mark's habit doctrine)
  - workstream-D: external research (Anthropic limits, competitors, hand-eye-coordination evidence, retention teardowns, FTC)
decisions:
  - both-bets: compounding clip log AS PRIMARY + reaction games AS SECONDARY (framed as warmup-ritual + fun-competition, NEVER as performance training — FTC)
  - duration-cap: 40s (not 30s)
  - frame-cap: bump 60 → 80, sampling 2fps (the recommended middle option; +30% per-call cost, well under Anthropic's 100-image ceiling)
  - validation-discipline: ship MVP version of compounding clip log first to validate the hypothesis (Mark's hedge — "idk if it will work as well") before building full progression dashboard
  - instrumentation-first: yes — last_seen / session_count / streak fields ship before anything that depends on them
  - floman-response: not a priority; ship the work, response is optional
---

# Idea Map: FLOMAN Feedback — The 20s Cap and the Retention Question

## TL;DR

Three load-bearing findings:

1. **The 20s cap is mostly fake.** It's a frontend display string. The real binding constraint is a 60-frame validation cap. Going from 20s to 30s costs zero — same 60 frames, sampled sparser. Going to 45s is engineering work but feasible (Anthropic's hard limit is 100 images / 32 MB per request).

2. **The retention surface is empty.** No streaks, no daily loop, no DB-backed return metrics. Every feature shows the same thing on day 2 as day 1. We can't even measure if FLOMAN's suggestion would work because we don't track returns.

3. **The right strategic move is probably *not* what FLOMAN named.** His feedback gives us two surface ideas (longer clips, hand-eye games) but the underlying signal is "the app doesn't compound." The principle-stack from Mark's vault — Hormozi's `give-info-sell-personalization` + `reason-to-buy-vs-reason-to-stay` + Mark's native `practice-as-product` + `competence-creates-passion` + `verifiability-shapes-capability` — points at a different bet: **a compounding personal-progress library**, with the cap fix and (maybe) the games as supporting acts.

The single highest-leverage move is **the daily-graded video log** (Hevy pattern applied to boxing technique) — an asset that compounds and creates switching cost. The 20s→30s extension is a free side-quest. The games are a third, more speculative bet that should be validated before serious investment.

---

## Part 1: What the 20s cap actually is

From workstream A:

| Layer | Cap | File |
|---|---|---|
| Frontend duration check | 20s | [coach-clip-review.tsx#L81-88](../../src/components/coach-clip-review.tsx#L81) |
| Backend schema | max 60 frames | [validation.ts#L60](../../src/lib/validation.ts#L60) |
| Anthropic API hard limit (Sonnet 4.6) | 100 images, 32 MB | docs.anthropic.com |
| Vercel Pro timeout | 60s (we use ~16s) | inferred |

**The cap is arbitrary at the duration level.** The real binding constraint is the 60-frame validation cap, which combined with our 5fps sampling produces the 20s effective ceiling. Cost per call: **~$0.29 on Sonnet 4.6** (60 frames × ~1,442 tokens + 2,048 max output).

**Three regimes worth distinguishing:**

- **0→30s**: Free. Same 60 frames, sparser sampling. One-line frontend change. The model still sees enough temporal resolution for single combos.
- **30→45s**: Costs engineering work. Either raise frame cap to 90 (still under Anthropic's 100 limit) which 1.5× the API cost, or downsample to ~1.3fps and stay at 60 frames (free but loses temporal detail). Files API (beta `files-api-2025-04-14`) is non-optional past 30s — base64 inline blows past the 32 MB request cap at 1080p.
- **45s+ → full round (3min)**: Needs chunked multi-pass analysis (the [vault-generation pass1/pass2/pass3 pattern](../../scripts/vault-generation/) is a precedent). 3× cost, parallelizable for ~16s wall time. Or async/queue (Trigger.dev) — fixed cost, no timeout pressure, worse UX.

**Risk callouts on the technical side:**
- Anthropic Files API is in beta — could break.
- No native video API as of 2026-05; we'd be building on frame-extraction forever-or-until-Anthropic-ships-video.
- Bedrock/Vertex have lower request caps (20-30 MB) — we couldn't route long clips through those providers.

---

## Part 2: The retention surface — what we have

From workstream B:

| Tab | Classification | Why |
|---|---|---|
| Technique | One-shot | Static answers to questions; no day-2 reason. |
| Drills | Daily-return *potential* | Style-tailored programs cached in `style_profiles.drill_program`. No daily refresh, no streak, no rotation. |
| My Coach (log session) | Daily-return | Already context-aware across sessions, references neglected focus areas. **The closest thing we have to a daily loop**, but no time-gated push, no streak, no "you haven't logged in 3 days" nudge. |
| My Coach (clip review) | One-shot | No clip library, no progression view, no streak. Each upload is its own event. |
| My Coach (progress) | Daily-return *potential* | Renders stats but no time-anchored "today" framing. |
| Find Your Style | One-shot | Quiz, dashboard. Static after completion. |
| Profile / About | One-shot / static | — |

**Telemetry status:** PostHog event tracking exists (`tab_switch`, `chat_submit`, profile events, style_profile_sync). **Zero DB-backed retention measurement** — no `last_seen`, no session count, no streak fields, no D1/D7/D30 cohort capability.

**Daily loop status: nothing exists.** No rotating prompts, no time-gated content, no notifications. A returning user on day 4 sees the same drill program they saw on day 1.

**Architectural good news:** the anon `punch-doctor-user-id` model is solid — no auth overhaul needed for new tables. Sync patterns from `style-profile-sync.ts` are reusable.

---

## Part 3: The principle stack (the lens)

From workstream C — Mark's vault is rich on retention philosophy and habit doctrine. The relevant principles, in order of how much they constrain this decision:

### Hormozi (the load-bearing economist)

- **`consumption-gap-kills-retention`** ([[tactics/consumption-gap-kills-retention]]): "Rather than thinking I'm getting all this for $59, they're just thinking I'm only using 20% of my $59." Adding capability (longer clips) without surfacing daily use creates guilt. The instinct to fix the cap as a *feature add* may backfire; the cap fix should be invisible — just the friction goes away.
- **`reason-to-buy-vs-reason-to-stay`** ([[tactics/reason-to-buy-vs-reason-to-stay]]): "The reason someone buys isn't always necessarily the reason someone stays." **FLOMAN's feedback literally splits along this axis.** "What would *stop* me from using it" = the buy/onboard side (clip cap). "What would *keep me coming back*" = the stay side (games, workouts). Don't confuse the two.
- **`give-info-sell-personalization`** ([[tactics/give-info-sell-personalization]]): "Give away the information, sell the personalization." Generic clip analysis is information — every model will do it free in 18 months. The personalized progression layer (your specific weakness, your specific drill, your specific arc) is the moat.
- **`features-not-bugs`** ([[principles/features-not-bugs]]): Test whether the 20s cap is a feature (forced focus on one combo) before treating it as a bug to fix. *(The audit shows it's just an arbitrary marketing string, but the framing applies to whatever we ship next.)*

### Mark's native habit doctrine

- **`show-up-daily`** ([[principles/show-up-daily]]): "The compounding is in the unbroken streak, not the intense session." Daily cost must be brushing-teeth low. **Implication:** a daily loop should be ≤60s with zero decision overhead. Any "log a session" UX that takes a minute of typing breaks this.
- **`mamba-mentality`** ([[principles/mamba-mentality]]): "Identify the specific weakness in your game, isolate it, design a targeted drill, execute the drill repeatedly at a volume that would bore anyone watching." Generic games miss this. The drill must target *your* diagnosed weakness, not be a leaderboard of arbitrary scores.
- **`practice-as-product`** ([[principles/practice-as-product]]): "The visible game is the artifact and practice is the actual product." Reframe: the user's product isn't the upload-and-receive-feedback event; it's the daily practice session. The clip is just a checkpoint.
- **`competence-creates-passion`** ([[principles/competence-creates-passion]]): "Passion usually comes from competence, not creates competence." Users return when they feel themselves getting better. **Visible measurable improvement** (% hip rotation, ms reaction time, technique score trend) is the passion engine.
- **`verifiability-shapes-capability`** ([[principles/verifiability-shapes-capability]]): "Feedback-driven systems improve where outputs can be measured and stagnate where they can't." Games (score) are verifiable. Clip critique (qualitative) is partially verifiable. **The verifiable feature compounds; the qualitative one plateaus.**

### Craft (AI-product paradigm)

- **`agentic-engineering`** ([[craft/agentic-engineering]]): "Is this an old-paradigm app that shouldn't exist?" The 20s clip-upload UI may be a relic of constraints that no longer exist. New-paradigm question: *what does the daily user experience look like if the model can simply watch them shadow-box for 5 minutes and answer questions about it?* This isn't shippable in May 2026, but it's the direction of travel — architect so the Anthropic call sits behind a swappable interface.

### Negative-space findings (just as important)

The vault has **no** principle files on:
- Hooked model / Nir Eyal / BJ Fogg / variable rewards / dopamine loops
- James Clear / atomic habits / Ericsson / deliberate practice
- Hand-eye coordination science, peripheral vision, reaction-time training
- Real-world top-fighter training methodology (only an Ali stub)

**That means:** any retention strategy that leans on Hooked-style behavior design is reaching outside the vault. Mark's native frame is "lower the daily cost until it's automatic + isolate the weakness + treat practice as product + let competence create passion." That's a *different stack* from the consumer-app habit-engineering literature.

The external research (workstream D) confirms: the actual evidence base for hand-eye / Schulte / NeuroTracker training transfer to combat sports is **thin to non-existent**. Building games = fine for retention. Marketing them as "improves your boxing" = FTC exposure.

---

## Part 4: Conservative idea map

Scored on **implementation cost (effort to ship) × retention impact (likelihood of D7/D30 lift)**. Conservative = grounded in the audit + research. Speculative ideas are in Part 7.

### 1-day fixes (ship this week)

| # | Idea | Cost | Impact | Notes |
|---|---|---|---|---|
| 1 | **Raise duration cap from 20s → 30s** | 1 line frontend + UI copy | Low-medium | Free at the API level (60-frame cap unchanged, sampling sparser). Directly addresses FLOMAN's blocker. Low risk. Tells him we listened. |
| 2 | **Instrument basic retention** | Half day | Indirect (enables decisions) | Add `last_seen_at`, `session_count`, `current_streak_days` to a `user_engagement` table; backfill from PostHog or zero-out. We literally cannot make data-driven calls without this. |
| 3 | **Add "logged today" indicator + streak counter (passive)** | Half day | Low alone, multiplier on (4) | A small visible "🔥 3 days" counter that updates passively. No notifications, no nag. Just makes the streak visible. Requires (2) first. |
| 4 | **Scope spec for the daily compounding library** | Half day | High (planning) | Decide what "log today's training" means in the smallest possible UX: 30-second clip, one drill done, one note. The artifact that compounds. |

### 1-week builds (ship this sprint)

| # | Idea | Cost | Impact | Notes |
|---|---|---|---|---|
| 5 | **Daily-graded clip log (Hevy-pattern for technique)** | 3-5 days | **HIGH** — the strategic bet | Each day: upload short clip (≤30s) → AI grades 4-phase technique → stored as a row in your timeline. Over weeks, the trend becomes the artifact. Maps to `practice-as-product` + `competence-creates-passion` + `give-info-sell-personalization`. **This is the recommended #1 move.** |
| 6 | **Personalized "today's drill" based on neglected focus area** | 2-3 days (logic exists; needs daily framing) | Medium-high | We already track neglected focus areas. Surface ONE drill on app open: "Today: hip rotation — 20 reps, slow." Counts toward streak. Maps to `mamba-mentality` (isolate the weakness) + `show-up-daily` (single decision, brushing-teeth low cost). |
| 7 | **Extend clip cap to 45s with proper engineering** | 2-3 days | Medium | Files API integration + frame downsampling logic. Defer until (5) is shipped — they probably want to be unified anyway (one upload pipeline). Cost stays manageable (~$0.42/call at 1080p, 2fps). |
| 8 | **"Yesterday vs today" technique diff card** | 2 days, requires (5) | Medium-high | After uploading today's clip, show "vs your last session": which phase improved, which regressed. Verifiability + competence. Requires (5)'s data. |

### 1-month investments (ship this quarter)

| # | Idea | Cost | Impact | Notes |
|---|---|---|---|---|
| 9 | **Progression dashboard with technique trend lines** | 1-2 weeks | High | Multi-week view of phase scores, neglected focus areas, drill completions. The compounding asset becomes legible. Strong moat — switching apps = losing this graph. |
| 10 | **Hand-eye warm-up mini-game (tied to clip session)** | 1-2 weeks | Speculative — validate first | A 30-60s coordination warm-up that gates the clip upload. Frame as "warm-up ritual" not "training". Brushing-teeth low. **Marketing language matters — see FTC callout.** Build only if (2) shows we can measure D7 lift. |
| 11 | **Long-clip support via chunked multi-pass** | 1-2 weeks | Medium-low | Splits 60s+ into 15s windows, analyzes each, synthesizes. The vault-generation pattern. Only if data shows users want full-round analysis. Probably premature. |
| 12 | **Daily push (web push, no app needed yet)** | 3-5 days | High *if* we have streak | "Don't break your streak — 30-second drill" web push at user's preferred time. Duolingo's whole growth story was push timing. **Only after (3), (5), (6) exist.** |
| 13 | **Coach references streak/progression in chat context** | 1 week | Medium | "You're on day 12 — your hip rotation has improved 18% since week 1." Already have the chat extraContext mechanism. Light touch but compounds. |

### Highest-leverage conservative bundle

If we had to pick exactly five:

**1 (cap fix) + 2 (instrumentation) + 5 (compounding clip log) + 6 (today's drill) + 8 (yesterday-vs-today diff)**

That's the spine. Cap fix removes the named blocker. Instrumentation lets us measure. Daily clip log is the compounding asset. Today's drill is the brushing-teeth daily loop. Yesterday-vs-today is the visible competence growth.

Total estimated effort: ~2 weeks. Estimated D7 retention lift: 2-3× off a low base (current is unmeasured but presumed near zero).

---

## Part 5: The single highest-leverage move

If forced to pick one: **#5 — the daily-graded clip log.**

The reasoning, principle by principle:

- **Hormozi `give-info-sell-personalization`**: clip analysis as a one-off is information. Clip analysis as a compounding personalized timeline is the personalization. Defensible.
- **Hormozi `reason-to-buy-vs-reason-to-stay`**: solves both axes. The first clip is the buy trigger. The Nth clip with "you've improved 23% since clip 1" is the stay mechanism.
- **`competence-creates-passion`**: nothing produces "I'm getting better" feeling more legibly than seeing your own technique scores trend up.
- **`practice-as-product`**: reframes the app from "tool that judges your videos" to "log of your practice." That's a different product.
- **`verifiability-shapes-capability`**: each clip produces a measurable score on each phase. The system improves as the user logs more (more comparison data, better personalization).
- **Hevy pattern (Strong/Hevy retention teardown, workstream D)**: workout history compounds. Switching cost grows linearly with logs. Hevy reports this is the dominant retention mechanic in their category.
- **FLOMAN signal**: he said the workout tab and seeing his striking improve over time is what would keep him coming back. The clip log IS that — the workout tab + video analysis + progression tracking unified.

**Counter-argument considered:** "But isn't this just adding features, which Hormozi warns against?" — No. It's *re-shaping existing capability* into a compounding asset. We already have clip review and we already have a coaching log. We're connecting them with a date axis and a trend view. Net new surface area is small; net new value is large.

**Risk:** clip review accuracy is partially verifiable. If the AI grades phase 3 as "weight transfer good" today and "weight transfer poor" tomorrow on similar footage, the trend line is noise. **Mitigation:** consistent framing (same camera angle, same drill prescription each day), ground-truth checks on a sample, expose model confidence, allow user "this seemed wrong" feedback. This is the [[principles/measurement-as-craft]] discipline applied.

---

## Part 6: Direct response to FLOMAN

The temptation is to ship exactly what he asked for. Don't. Ship the strategic move and frame it so it covers his asks.

What to send him (after shipping #1, ideally with #5 in beta):

> "Three updates from your feedback:
> 1. Clip cap is now 30 seconds — covers most full combos. We'll push longer with a multi-pass approach soon if you tell us you need it.
> 2. Workout tab now logs each clip as a dated session — you'll see your hip rotation / weight transfer / etc. trend over weeks. That's the thing that should keep you coming back: watch yourself get better, on a graph.
> 3. We're holding off on the games for now — we want to ship them as proper boxing-relevant warm-ups, not generic Schulte tables, and that's a deeper build. Coming."

This addresses all three of his points and reframes the conversation around the compounding asset, not the feature surface.

**N=1 caveat:** FLOMAN is one user. Don't over-rotate. The strategic move is defensible regardless of his specific phrasing because the principle stack supports it.

---

## Part 7: Expansive section (clearly speculative)

The conservative ideas above are grounded. These below are not — they're "what if you took the constraints off."

### 7a. Live shadow-boxing analysis

WebRTC stream from the user's phone propped on the gym floor. Claude (or its successor) watches in real time. Real-time audio feedback: "drop your right hand, hip rotation is late." This eliminates the upload-wait UX entirely. The 20s vs 45s question becomes irrelevant.

**Why speculative:** Anthropic doesn't ship native streaming video in 2026. We'd be building on workarounds (frame snapshots every N seconds streamed via WebSocket). Latency budget is brutal — 1-2s feedback is the floor for it to feel real-time. Cost would balloon (effectively unlimited frames). But this is the new-paradigm shape per [[craft/agentic-engineering]].

### 7b. The boxing GPT-the-coach

Persistent agent with full memory of every clip you've ever uploaded, every drill you've completed, every quiz answer. Doesn't just analyze — programs your camp. "Tomorrow we're working on slip footwork because you've been weight-locked for the last six clips." Asks you questions. Adjusts the program when you get sick.

**Why speculative:** the orchestration is non-trivial. Memory architecture, schedule generation, coach-personality calibration. We have the building blocks (style_profile, focus areas, drill program, session log) but stitching them into a coach-with-agency is a large bet.

### 7c. Pair-training social

Two users analyze each other's clips. "FLOMAN's coach assigned you to review his clip — what do *you* see?" The assignment is the daily push. The social pressure is the streak motivator. Network effects on the AI side (one user's correction becomes training data for everyone).

**Why speculative:** introduces social UX, friend-finding, moderation. Heavy. Probably wrong for a v1 audience.

### 7d. Sparring footage time-machine

Past fight footage of pro fighters tagged at the same drill the user is practicing. "Here's Lomachenko's lateral movement — same drill you did today. Spot 3 differences." Mixes celebrity content with the user's practice. Passive entertainment + technique benchmarking.

**Why speculative:** licensing. Showing pro fight footage commercially is legally fraught. Could potentially work with permitted highlight clips or amateur footage you own.

### 7e. Progression NFT — kidding, but

A semi-serious version: a publicly shareable "training card" that updates daily. "FLOMAN — Day 47 — 18% improvement on hip rotation." Shareable to socials. Acts as a brag/commitment device. Strava's Local Legend mechanic translated to skill development.

**Why speculative:** social shareability is genuinely useful as a retention multiplier (Strava data: leaderboard exposure correlates with engagement) but designing the card UX and avoiding the "another fitness flex" eyeroll is craft. Could backfire.

### 7f. Live-event tie-in

Big PPV night — app prompts: "Watching Crawford-Canelo III? Predict the round-by-round phase scores. Compare to AI's analysis afterward." Couples your daily practice loop to the boxing calendar. Creates real-world events to come back for.

**Why speculative:** lots of integration; PPV calendars, model predictions on live footage, social comparison. Probably worth nothing alone but huge as a periodic flashpoint inside an existing daily loop.

### 7g. Reverse-coaching — the user grades the AI

Show clip + AI's analysis side by side. User flags errors. The user becomes the verifier. This generates RLHF-style data, and it gives users a "smartness ladder" — the more clips they review, the more accurate their AI gets *for them*.

**Why speculative:** UX requires careful design (becomes work, not play, fast). But the alignment-with-user signal is enormous and it solves the verifiability problem from Part 5.

---

## Part 8: Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| **FTC enforcement on hand-eye game performance claims** | High if we ship games with "improves boxing" copy | Frame games as "warm-up rituals" / "fun coordination challenges" — never as performance enhancers. Disclaimers don't fix misleading main claims. |
| **Anthropic Files API beta deprecated** | Medium | Architect Anthropic call behind interface; keep base64 path as fallback for short clips. |
| **AI grading inconsistency producing noisy trend lines** | High — undermines the whole compounding library bet | Ground-truth checks; consistent camera/framing prescription; user-facing model-confidence; "this seemed wrong" feedback. |
| **Streak rage-quit when broken** | Medium | Duolingo had to add Streak Freeze. Plan it from day one — don't ship raw streak. |
| **Schulte / NeuroTracker / FitLight trademark collision** | Low if avoided | Don't use those names. 10-min USPTO check before launch on any game name. |
| **Privacy / minor users uploading footage** | Medium-high | We don't currently age-gate. If targeting youth boxing, COPPA implications. Adult-only positioning is cleaner for now. |
| **Bedrock/Vertex routing breaks at long clips** | Low (we don't currently route there) | Direct Anthropic API only for vision. Document the constraint. |
| **Anthropic compute shortage drives latency or rate limits** | Medium-low | Already a known industry issue (workstream D). Mitigation: Haiku 4.5 for triage, Sonnet 4.6 for detail. |
| **EU DSA/DMA "addictive design" rules** | Low-medium if EU users | Streak design should never coerce; opt-out paths must work; no dark patterns. |
| **Model-as-medical-device line crossed** | Medium | Stick to technique/coaching language. Never reference body parts in injury terms ("knee strain," "shoulder impingement"). |

---

## Part 9: What's not in the vault that we'd need

Negative-space findings from workstream C — if any of these strategies move forward, Mark's vault should grow to support them:

1. **Hooked-model / Fogg-model habit-engineering literature.** The vault has Mark's native habit doctrine (show-up-daily, mamba-mentality, practice-as-product) but no Eyal/Fogg-school behavior-design principle files. If we ship streak/notification/variable-reward mechanics, we'd benefit from a [[principles/hooked-model]] or [[principles/fogg-behavior-model]] entry.

2. **Real-fighter training methodology.** Only an Ali stub exists. If we want to seed authentic coaching language or compare user technique to known fighter archetypes, profiles for Mayweather, Crawford, Lomachenko, Inoue, etc. would help. A [[people/freddie-roach]] entry would map cleanly to coaching app voice.

3. **Sports-vision and reaction-time science.** No vault content. If we ship games, we should have a [[principles/quiet-eye]] or [[craft/sports-vision-evidence]] note grounding what's actually evidenced vs. marketing. Workstream D produced this — it should be ported to the vault.

4. **Deliberate practice (Ericsson) and skill acquisition.** The vault has practice-as-product but not the Ericsson framework explicitly. Adjacent to mamba-mentality but distinct.

5. **Variable-reward and dopamine-loop ethics.** If we adopt Hooked-style mechanics, the ethics of designing for compulsion deserve a principle entry. Distinguishing "lowering daily cost so the user can show up" (Mark's frame) from "engineering compulsion" (the dark-pattern frame) is a real line.

These aren't blockers. They're flags for vault growth aligned with where the product is going.

---

## Part 10: What I'd want next

I'm at the end of synthesis, but before any code work:

1. **Decision on the strategic frame.** Is the compounding clip-log (#5) the right primary bet, or do you want to lead with games / clip extension / something else?
2. **Decision on instrumentation.** Are we OK shipping (1) cap fix without (2) instrumentation, or do we want measurement first so we can defend whatever bet we make?
3. **Approval to draft an implementation plan.** The next skill in line is `superpowers:writing-plans`. I'd take the conservative bundle (#1+#2+#5+#6+#8) and produce a phased implementation spec with task breakdown.
4. **Confirmation on FLOMAN response.** Should we tell him what we're shipping when we ship, or wait?

If you want me to compress: **the recommended move is the daily-graded clip log (#5), supported by the free 30s cap fix (#1) and basic retention instrumentation (#2). The hand-eye games are a third bet, not the first one, and they need different framing (warm-up not training) for FTC reasons.**
