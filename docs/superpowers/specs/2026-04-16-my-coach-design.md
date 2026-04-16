# My Coach — Design Spec

## Context

The Video Review tab in the Punch Doctor AI app is being replaced. The current feature uploads video, extracts frames, and sends them to Claude's vision model for technique analysis — but the AI fundamentally can't assess boxing technique from still frames. Technique is about motion, timing, and force, none of which are visible in static images. The analysis sounds plausible but isn't genuinely useful.

The knowledge base (80+ video transcripts, Power Punching Blueprint course, Obsidian concept vault) is the real asset. The AI is excellent at coaching through Alex Wiant's framework when given the right context. The gap is that the app is stateless — it doesn't know anything about the individual user across sessions.

**Goal:** Replace Video Review with a persistent AI coaching journal ("My Coach") that knows each user over time, guides post-training reflection, tracks focus areas, and prescribes drills grounded in Alex's system.

## What's Removed

- Video upload, drag-and-drop, file validation
- Client-side frame extraction (canvas-based)
- Vision analysis (Claude Sonnet with image inputs)
- All of `video-review-tab.tsx` UI
- The `/api/video-review` route (both passes)

## What's Added

### Auth (Supabase Auth)

- Magic link authentication (email-based, no passwords)
- Invite-only — controlled access for Alex's students / small community
- Auth gate wraps the entire app (all tabs require login, not just My Coach)
- Supabase Auth handles session management, tokens, refresh

### Tab: "My Coach" (replaces Video Review)

Two sub-views toggled by internal tabs:

#### Sub-view 1: Log Session

**Opening state (returning user):**
- AI greeting with context from last session and current focus areas
- Quick context bar showing active focus areas and pending drill prescriptions
- "Ready to log today's session?" prompt

**Opening state (new user):**
- Welcome message explaining what this tab does
- Kicks off an onboarding conversation: "Tell me about your training — how long have you been boxing, what are you working on, what do you struggle with?"
- Builds initial user profile from onboarding answers

**Guided conversation (3-5 questions):**
- Questions are tailored to the user's active focus areas and recent history
- Example flow:
  1. "What did you work on today?" (session type, rounds, focus)
  2. Follow-up on active focus area: "You've been working on hip rotation for the cross — how did that feel today?"
  3. Drill follow-up: "Did you try the hip opening drill? How did it go?"
  4. Open-ended: "Anything else notable — breakthroughs, frustrations, questions?"
- AI provides coaching context inline (not just logging — actually coaching during the conversation)
- Coaching advice grounded in knowledge base via existing `retrieveContext()` RAG pipeline

**Session wrap-up:**
- Summary card with:
  - **Breakthroughs** (green) — what's improving
  - **Working on** (yellow) — ongoing issues
  - **Next session prescription** (blue) — specific drills with reps, focus cues
- Focus area statuses updated
- "Session logged" confirmation

#### Sub-view 2: My Progress

**Stats bar:**
- Sessions logged (total count)
- Areas improving (focus areas with `improving` status)
- Active focus areas (count of `active` status)

**Focus Areas section:**
- Each focus area displayed as a card with:
  - Name (e.g., "Hip rotation (cross)")
  - Status badge: `new` | `active` | `improving` | `resolved`
  - Description of current state (AI-generated, updated each session)
  - Progress bar (visual indicator of status, not a computed metric)
  - Linked to knowledge graph concept under the hood
- Sorted: active first, then improving, then resolved

**Session Timeline:**
- Chronological list of logged sessions
- Each entry shows: date, session type, rounds, one-line summary
- Tags for focus areas worked and breakthroughs
- "View all" pagination for history beyond recent 5

### Data Model (4 new Supabase tables)

#### `user_profiles`
```
id: uuid (PK, references auth.users)
display_name: text
tendencies: jsonb        -- AI-accumulated notes: {"cross": "pushes under intensity", "guard": "drops on jab"}
skill_levels: jsonb      -- {"loading_phase": "solid", "hip_rotation": "developing"}
preferences: jsonb       -- {"training_frequency": "3x/week", "prefers": "bag_work"}
onboarding_complete: boolean
created_at: timestamptz
updated_at: timestamptz
```

#### `training_sessions`
```
id: uuid (PK)
user_id: uuid (FK → auth.users)
session_type: text       -- 'bag_work' | 'shadow_boxing' | 'sparring' | 'drills' | 'mixed'
rounds: int
transcript: jsonb        -- full conversation as message array [{role, content}]
summary: jsonb           -- AI-extracted: {breakthroughs: [], struggles: [], focus_areas_worked: [], drills_done: []}
prescriptions_given: jsonb -- drills prescribed for next session
created_at: timestamptz
```

#### `focus_areas`
```
id: uuid (PK)
user_id: uuid (FK → auth.users)
name: text               -- "Hip rotation (cross)"
description: text        -- current AI summary of where user is
status: text             -- 'new' | 'active' | 'improving' | 'resolved'
knowledge_node_slug: text -- optional link to knowledge_nodes.slug
history: jsonb           -- [{date, note}] progression log
created_at: timestamptz
updated_at: timestamptz
```

#### `drill_prescriptions`
```
id: uuid (PK)
user_id: uuid (FK → auth.users)
focus_area_id: uuid (FK → focus_areas)
session_id: uuid (FK → training_sessions, the session where it was prescribed)
drill_name: text
details: text            -- "3 sets of 10, focus on hip-before-arm timing"
followed_up: boolean     -- did the user report doing it?
follow_up_notes: text    -- what they said about it
created_at: timestamptz
```

### Memory in Context

When starting a new session, the API loads:
1. `user_profiles` row → tendencies, skill levels, preferences
2. Active `focus_areas` (status = 'new' or 'active' or 'improving')
3. Last 3 `training_sessions` → summaries only (not full transcripts, to save context)
4. Pending `drill_prescriptions` that haven't been followed up on

This context is injected into the system prompt for the guided conversation. The AI sees ~1-2K tokens of user history, not the entire training log.

### API Routes

**`/api/auth/`** — handled by Supabase Auth (magic link flow)

**`/api/coach/session` (POST)** — handles the guided conversation
- Streaming response (same pattern as `/api/chat`)
- Request: `{ messages: [], user_id: string }`
- Loads user context from DB before generating response
- System prompt includes: Alex Wiant framework + user profile + recent sessions + active focus areas + RAG context for any drill/technique questions

**`/api/coach/save-session` (POST)** — called at conversation end
- Makes one Claude call with the full conversation transcript, asking it to extract structured JSON: summary, breakthroughs, struggles, focus area updates, drill prescriptions, profile updates
- Creates `training_sessions` row with transcript + extracted summary
- Updates `user_profiles.tendencies` and `skill_levels` with new observations
- Creates/updates `focus_areas` based on what was discussed
- Creates `drill_prescriptions` if any were given
- All DB writes in a single transaction

**`/api/coach/progress` (GET)** — returns data for Progress view
- `user_id` from auth session
- Returns: profile stats, focus areas, recent sessions

### Integration with Existing App

- **RAG pipeline:** Reuses `retrieveContext()` from `graph-rag.ts` unchanged. Drill prescriptions and coaching advice cite the same knowledge base as Technique and Drills tabs.
- **Framework constants:** Reuses `PHASES`, `ANALYSIS_PROMPT` concepts from `framework.ts` for consistent Alex Wiant voice.
- **Auth gate:** All tabs (Technique, Drills, Find Your Style, My Coach) require login. This is a breaking change — the app goes from anonymous to authenticated. No anonymous access is preserved; this is intentional for the invite-only small group model.
- **Other tabs unaffected:** Chat and style-finder tabs work exactly as before, just behind auth. No data model changes to existing features.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/video-review-tab.tsx` | **Replace entirely** | → `coach-tab.tsx` with Log Session + Progress views |
| `src/app/api/video-review/route.ts` | **Delete** | Replaced by `/api/coach/*` routes |
| `src/app/page.tsx` | **Edit** | Rename tab, swap component import |
| `src/app/layout.tsx` | **Edit** | Add auth provider wrapper |
| `src/lib/supabase.ts` | **Edit** | Add auth client helpers (may need server + browser clients) |
| `supabase/migrations/` | **New migration** | 4 new tables + RLS policies |
| `src/app/api/coach/session/route.ts` | **New** | Guided conversation endpoint |
| `src/app/api/coach/save-session/route.ts` | **New** | Session persistence + extraction |
| `src/app/api/coach/progress/route.ts` | **New** | Progress dashboard data |
| `src/components/auth-gate.tsx` | **New** | Login/magic-link UI wrapper |
| `src/components/coach-session.tsx` | **New** | Log Session conversation UI |
| `src/components/coach-progress.tsx` | **New** | Progress dashboard UI |

## Verification

1. **Auth flow:** Sign up with magic link → receive email → click → land in app authenticated
2. **New user onboarding:** First visit to My Coach → onboarding conversation → profile created
3. **Log session (first):** Complete guided conversation → session saved → prescription given → visible in Progress view
4. **Log session (returning):** AI references last session's focus areas and prescriptions → continuity confirmed
5. **Progress view:** Shows stats, focus areas with correct statuses, session timeline
6. **Memory across sessions:** Close browser, come back → AI remembers everything from previous sessions
7. **RAG grounding:** Coaching advice and drill prescriptions cite specific Alex Wiant videos/course content
8. **Other tabs still work:** Technique and Drills chat function normally behind auth
9. **RLS:** User A cannot see User B's sessions or profile
