# Punch Doctor AI — Optimization Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Goal:** Transform the boxing coach MVP from naive context-stuffing into a proper RAG-powered coaching platform that can be pitched to Alex Wiant (The Punch Doctor) this week.

## Context

We have a Next.js 16 app with ~1.1MB of Punch Doctor content (79 YouTube transcripts + 16 PDF course chunks from the Power Punching Blueprint). Currently, the entire knowledge base is concatenated into the system prompt on every request — no embeddings, no vector search, no chunking. Supabase is installed but unused. The app has 4 tabs: Technique, Drills, Video Review, and Find Your Style (placeholder).

The goal is to maximize AI quality across 4 use cases: knowledge Q&A, video technique analysis, structured coaching program, and pitch-ready presentation for the coach.

## Architecture Overview

```
User Question → Voyage AI embed → Supabase pgvector search → Top 10 chunks → Claude (focused context + citations)
Video Upload  → Frame extraction → Claude Vision (phase analysis) → RAG retrieval for fixes → Grounded feedback
Coaching      → Phase progression → RAG retrieval per phase → Drills + concepts from knowledge base
```

**Stack:** Next.js 16 + Supabase pgvector + Voyage AI embeddings + Claude Sonnet 4 + Tailwind

## 1. Content Pipeline (Chunking + Embeddings)

### Chunking Strategy

**PDF chunks (16 files):** Already well-segmented by topic. Keep as-is, one embedding per chunk.

**Transcripts (79 files):** Split into semantic chunks of ~500-800 tokens using natural breakpoints:
- Topic shifts ("next," "now let's talk about," "moving on")
- Fall back to paragraph/sentence boundaries
- Preserve enough surrounding context that each chunk is self-contained

### Metadata Extraction

Each chunk gets:
- `source_type`: "pdf" | "transcript"
- `video_id`, `video_title`, `video_url` (transcripts only)
- `pdf_file` (PDF chunks only)
- `chunk_index`: position within source document
- `techniques`: extracted tags — "jab", "hook", "uppercut", "kinetic chain", "phase 1-4", etc.
- `fighters`: extracted names — "Canelo", "GGG", "Beterbiev", "Tyson", "Mayweather", etc.
- `category`: "mechanics" | "analysis" | "drill" | "injury_prevention" | "theory"

Metadata extraction done by Claude during the ingest pipeline (batch process, not real-time).

### Embeddings

- **Model:** Voyage AI `voyage-3-lite` (512 dimensions, optimized for retrieval)
- **Storage:** Supabase pgvector

### Database Schema

```sql
CREATE TABLE content_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(512),
  source_type text NOT NULL,        -- 'pdf' | 'transcript'
  video_id text,
  video_title text,
  video_url text,
  pdf_file text,
  chunk_index int NOT NULL,
  techniques text[],
  fighters text[],
  category text NOT NULL,
  char_count int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON content_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

### Ingest Script

Standalone Node.js script at `scripts/ingest.ts` (runnable via `npm run ingest` using `tsx`):
1. Read all PDF chunks and transcript files
2. Split transcripts into semantic chunks
3. Use Claude to extract metadata (techniques, fighters, category) per chunk
4. Embed each chunk via Voyage AI
5. Upsert into Supabase
6. Idempotent — re-runnable when new content is added

## 2. Retrieval + Chat (RAG Pipeline)

### Query Flow

1. User asks a question (e.g. "How does Canelo use his jab?")
2. Embed the question with Voyage AI `voyage-3-lite`
3. Vector similarity search in Supabase — top 10 chunks, with metadata filters:
   - Technique tab: `category IN ('mechanics', 'theory', 'analysis')`
   - Drills tab: `category IN ('drill', 'injury_prevention')`
4. Pass retrieved chunks to Claude as structured context:
   ```
   [Source: Canelo Alvarez Excellent Jab Mechanics | Video: youtube.com/watch?v=sZ1caNzodLU]
   {chunk text}
   ```
5. Claude answers grounded in retrieved content, citing sources
6. Response includes clickable video links

### System Prompt

- Keep the 10 core principles of Alex Wiant's methodology (already exists)
- Add: "Always cite which video or course section your answer draws from. If the retrieved context doesn't cover the question, say so honestly rather than guessing."
- Add persona: coaching voice matching Punch Doctor's style — direct, biomechanics-focused, no fluff

### Conversation Memory

- Last 10 messages kept in conversation for follow-ups
- No persistent memory across sessions

### Key Files to Modify

- `src/app/api/chat/route.ts` — replace full-context concatenation with vector retrieval
- New: `src/lib/rag.ts` — embedding + retrieval functions
- New: `src/lib/voyage.ts` — Voyage AI client

## 3. Video Review (Frame Analysis + RAG Grounding)

### Two-Pass Analysis

**Pass 1 — Vision Analysis:**
- User uploads video, frames extracted (keep current approach)
- Claude Vision analyzes frames against the 4-phase framework
- Returns structured observations per phase (stance, hip rotation, core transfer, follow-through)

**Pass 2 — RAG Grounding:**
- Take identified issues (e.g. "hip rotation initiates late") as a query
- Embed and retrieve relevant Punch Doctor chunks about those problems
- Combine: vision analysis + coaching content + specific video links for each fix

### Response Format

Per-phase breakdown:
- What was observed in the frames
- What the Punch Doctor methodology says about this
- Specific drills to fix it (from knowledge base)
- Link to the relevant video explaining the concept

### Key Files to Modify

- `src/app/api/video-review/route.ts` — add RAG grounding pass
- `src/components/video-review-tab.tsx` — render frame + analysis side-by-side with source cards

## 4. Structured Coaching Program ("Find Your Style" Tab)

### Onboarding Quiz

5-6 questions:
- Experience level (beginner / intermediate / advanced)
- Primary goal (power / speed / defense / overall)
- Dominant hand (orthodox / southpaw)
- Current training (bag work / sparring / shadow boxing / none)
- Known weaknesses (free text or multi-select)

### Phase Progression

Maps to Power Punching Blueprint structure:
1. **Phase 1:** Stance & base (PDF chunk 06)
2. **Phase 2:** Hip mechanics (PDF chunk 07)
3. **Phase 3:** Core transfer (PDF chunk 08)
4. **Phase 4:** Follow-through (PDF chunk 09)
5. **Punch-specific:** Jab → Straight → Hook → Uppercut (chunks 10-13)

### Session Flow

- AI presents current phase concept (retrieved from relevant chunks)
- Suggests drills from knowledge base
- User marks complete or asks questions (enters chat mode with phase context)
- Progress tracked in localStorage

### Fighter Style Matching

After fundamentals, AI references fighter analysis videos based on user profile:
"Your build and stance are similar to Beterbiev's approach. Here's how he generates power..."
Retrieved via RAG using user profile + fighter metadata.

### Key Files to Modify

- `src/app/page.tsx` — implement Find Your Style tab
- New: `src/components/coaching-tab.tsx` — quiz + progression UI

## 5. UI Polish

### Branding
- "Punch Doctor AI" branding with logo placeholder
- Keep existing dark theme (red/black matches Punch Doctor aesthetic)

### Chat Responses
- Source citations rendered as clickable cards: video thumbnail + title + link
- Not plain text links

### Video Review Results
- Frame displayed alongside phase analysis
- Visual layout, not text dump

### Coaching Program
- Progress bar across 4 phases
- Card-based drill presentation

### Landing State
- When chat is empty: compelling intro with 4-5 suggested questions that showcase best answers

### Mobile Responsive
- Coach may demo on phone

### Out of Scope
- Auth/login
- Payment/billing
- User accounts / persistent profiles
- Admin panel

## Verification Plan

1. **Ingest pipeline:** Run `npm run ingest`, verify chunks in Supabase (count, metadata quality, embedding dimensions)
2. **RAG quality:** Ask 5 test questions, verify answers cite correct videos and contain specific Punch Doctor methodology (not generic boxing advice)
3. **Video review:** Upload a test clip, verify the analysis references specific Punch Doctor concepts and links to relevant videos
4. **Coaching flow:** Complete the onboarding quiz, verify phase progression pulls correct content
5. **UI:** Test all 4 tabs on desktop and mobile, verify source cards render correctly
6. **Build:** `npm run build` passes with no errors

## Environment Variables Needed

```
VOYAGE_API_KEY=...          # Voyage AI for embeddings
SUPABASE_URL=...            # Already configured
SUPABASE_SERVICE_ROLE_KEY=... # For ingest script (server-side)
ANTHROPIC_API_KEY=...       # Already configured
```
