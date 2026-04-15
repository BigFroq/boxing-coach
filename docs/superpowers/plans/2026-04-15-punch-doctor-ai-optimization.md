# Punch Doctor AI Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace naive context-stuffing with Supabase pgvector RAG, add RAG-grounded video review, and polish all 4 tabs for a pitch demo to Alex Wiant.

**Architecture:** Content is chunked with metadata, embedded via Voyage AI, and stored in Supabase pgvector. Chat queries embed the question, retrieve top-10 relevant chunks, and pass focused context to Claude. Video review adds a second RAG pass to ground frame analysis in specific Punch Doctor content.

**Tech Stack:** Next.js 16, Supabase pgvector, Voyage AI `voyage-3-lite` (512 dims), Claude Sonnet 4, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-04-15-punch-doctor-ai-optimization-design.md`

**Scope note:** The spec's "structured coaching program" (phase-by-phase progression with localStorage) is deferred — the existing Style Finder tab already provides a strong pitch demo with quiz + AI recommendation. Task 7 upgrades it with RAG grounding, which is the high-impact move. Phase progression can be added post-pitch as a follow-up.

---

## File Structure

### New Files
- `scripts/ingest.ts` — Chunking + metadata extraction + Voyage embedding + Supabase upsert
- `src/lib/supabase.ts` — Supabase client init (server-side, service role key)
- `src/lib/voyage.ts` — Voyage AI embedding client
- `src/lib/rag.ts` — Embed query + vector search + format context
- `supabase/migrations/001_content_chunks.sql` — pgvector table + index

### Modified Files
- `src/app/api/chat/route.ts` — Replace full-context loading with RAG retrieval
- `src/app/api/video-review/route.ts` — Add RAG grounding pass after vision analysis
- `src/app/api/style-finder/route.ts` — Add RAG retrieval for fighter-specific content
- `src/components/chat-tab.tsx` — Render source citation cards below assistant messages
- `src/components/video-review-tab.tsx` — Show source cards alongside phase feedback
- `src/app/page.tsx` — Minor: update suggestions to showcase best RAG answers
- `package.json` — Add `voyageai`, `tsx`, `dotenv` deps + `ingest` script
- `.env.local` — Add `VOYAGE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

## Task 1: Database Schema + Supabase Client

**Files:**
- Create: `supabase/migrations/001_content_chunks.sql`
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Create the pgvector migration**

```sql
-- supabase/migrations/001_content_chunks.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE content_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(512),
  source_type text NOT NULL CHECK (source_type IN ('pdf', 'transcript')),
  video_id text,
  video_title text,
  video_url text,
  pdf_file text,
  chunk_index int NOT NULL,
  techniques text[] DEFAULT '{}',
  fighters text[] DEFAULT '{}',
  category text NOT NULL CHECK (category IN ('mechanics', 'analysis', 'drill', 'injury_prevention', 'theory')),
  char_count int NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- IVFFlat index for cosine similarity search
-- lists = 50 is appropriate for ~2000 chunks (sqrt of expected rows)
CREATE INDEX content_chunks_embedding_idx ON content_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Index for metadata filtering
CREATE INDEX content_chunks_category_idx ON content_chunks (category);
CREATE INDEX content_chunks_source_type_idx ON content_chunks (source_type);

-- Search function: returns top N chunks by cosine similarity with optional category filter
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(512),
  match_count int DEFAULT 10,
  filter_categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  source_type text,
  video_id text,
  video_title text,
  video_url text,
  pdf_file text,
  chunk_index int,
  techniques text[],
  fighters text[],
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.content,
    cc.source_type,
    cc.video_id,
    cc.video_title,
    cc.video_url,
    cc.pdf_file,
    cc.chunk_index,
    cc.techniques,
    cc.fighters,
    cc.category,
    1 - (cc.embedding <=> query_embedding) AS similarity
  FROM content_chunks cc
  WHERE (filter_categories IS NULL OR cc.category = ANY(filter_categories))
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run:
```bash
npx supabase db query --linked -f supabase/migrations/001_content_chunks.sql
```
Expected: SQL executes without errors, `content_chunks` table and `match_chunks` function created.

- [ ] **Step 3: Create the Supabase server client**

```typescript
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// Server-side client with service role key — never expose to frontend
export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key);
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/001_content_chunks.sql src/lib/supabase.ts
git commit -m "feat: add pgvector content_chunks table and Supabase server client"
```

---

## Task 2: Voyage AI Client + RAG Retrieval Module

**Files:**
- Create: `src/lib/voyage.ts`
- Create: `src/lib/rag.ts`
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/mark/boxing-coach && npm install voyageai
```

Note: `voyageai` is the official Voyage AI Node.js SDK.

- [ ] **Step 2: Create Voyage AI client**

```typescript
// src/lib/voyage.ts
import { VoyageAIClient } from "voyageai";

let client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient {
  if (!client) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error("Missing VOYAGE_API_KEY");
    client = new VoyageAIClient({ apiKey });
  }
  return client;
}

export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const result = await client.embed({
    input: [text],
    model: "voyage-3-lite",
  });
  return result.data![0].embedding!;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const client = getClient();
  // Voyage supports up to 128 inputs per batch
  const batchSize = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await client.embed({
      input: batch,
      model: "voyage-3-lite",
    });
    for (const item of result.data!) {
      allEmbeddings.push(item.embedding!);
    }
  }

  return allEmbeddings;
}
```

- [ ] **Step 3: Create RAG retrieval module**

```typescript
// src/lib/rag.ts
import { createServerClient } from "./supabase";
import { embedText } from "./voyage";

export interface RetrievedChunk {
  content: string;
  source_type: "pdf" | "transcript";
  video_id: string | null;
  video_title: string | null;
  video_url: string | null;
  pdf_file: string | null;
  techniques: string[];
  fighters: string[];
  category: string;
  similarity: number;
}

export async function retrieveChunks(
  query: string,
  options: {
    count?: number;
    categories?: string[];
  } = {}
): Promise<RetrievedChunk[]> {
  const { count = 10, categories } = options;

  const queryEmbedding = await embedText(query);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: count,
    filter_categories: categories ?? null,
  });

  if (error) {
    console.error("RAG retrieval error:", error);
    return [];
  }

  return data as RetrievedChunk[];
}

export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  return chunks
    .map((chunk) => {
      const source =
        chunk.source_type === "transcript"
          ? `[Video: ${chunk.video_title} | ${chunk.video_url}]`
          : `[Course: ${chunk.pdf_file}]`;
      return `${source}\n${chunk.content}`;
    })
    .join("\n\n---\n\n");
}

export interface SourceCitation {
  type: "video" | "course";
  title: string;
  url?: string;
  file?: string;
}

export function extractCitations(chunks: RetrievedChunk[]): SourceCitation[] {
  const seen = new Set<string>();
  const citations: SourceCitation[] = [];

  for (const chunk of chunks) {
    const key = chunk.video_id ?? chunk.pdf_file ?? "";
    if (seen.has(key)) continue;
    seen.add(key);

    if (chunk.source_type === "transcript" && chunk.video_title) {
      citations.push({
        type: "video",
        title: chunk.video_title,
        url: chunk.video_url ?? undefined,
      });
    } else if (chunk.pdf_file) {
      citations.push({
        type: "course",
        title: chunk.pdf_file.replace(".md", "").replace(/^\d+-/, "").replace(/-/g, " "),
        file: chunk.pdf_file,
      });
    }
  }

  return citations;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/voyage.ts src/lib/rag.ts package.json package-lock.json
git commit -m "feat: add Voyage AI embeddings and RAG retrieval module"
```

---

## Task 3: Ingest Pipeline Script

**Files:**
- Create: `scripts/ingest.ts`
- Modify: `package.json` (add `ingest` script)

- [ ] **Step 1: Install tsx for running TypeScript scripts**

```bash
cd /Users/mark/boxing-coach && npm install -D tsx dotenv
```

- [ ] **Step 2: Add ingest script to package.json**

Add to `"scripts"` in `package.json`:
```json
"ingest": "tsx scripts/ingest.ts"
```

- [ ] **Step 3: Create the ingest script**

```typescript
// scripts/ingest.ts
import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { VoyageAIClient } from "voyageai";

const CONTENT_DIR = path.join(process.cwd(), "content");
const CHUNK_TARGET = 2000; // ~500 tokens worth of characters
const CHUNK_MAX = 3200; // ~800 tokens hard cap

// --- Clients ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY,
});

// --- Chunking ---

interface RawChunk {
  content: string;
  source_type: "pdf" | "transcript";
  video_id?: string;
  video_title?: string;
  video_url?: string;
  pdf_file?: string;
  chunk_index: number;
}

function splitTranscript(text: string): string[] {
  // Split on natural topic-shift phrases, then fall back to sentence boundaries
  const topicBreaks = /(?:(?:now let'?s|let me|moving on|next|so now|alright|okay so|the next thing|another thing|number \d))/i;

  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    // Check if this sentence starts a new topic
    const isTopicShift = topicBreaks.test(sentence.slice(0, 60));
    const wouldExceedMax = (current + " " + sentence).length > CHUNK_MAX;
    const isAtTarget = current.length >= CHUNK_TARGET;

    if (current && (wouldExceedMax || (isAtTarget && isTopicShift))) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

async function loadPdfChunks(): Promise<RawChunk[]> {
  const pdfDir = path.join(CONTENT_DIR, "pdf-chunks");
  const files = (await fs.readdir(pdfDir)).filter((f) => f.endsWith(".md")).sort();
  const chunks: RawChunk[] = [];

  for (const file of files) {
    const content = await fs.readFile(path.join(pdfDir, file), "utf-8");
    chunks.push({
      content,
      source_type: "pdf",
      pdf_file: file,
      chunk_index: 0,
    });
  }

  console.log(`Loaded ${chunks.length} PDF chunks`);
  return chunks;
}

async function loadTranscriptChunks(): Promise<RawChunk[]> {
  const transcriptDir = path.join(CONTENT_DIR, "transcripts");
  const files = (await fs.readdir(transcriptDir)).filter((f) => f.endsWith(".md")).sort();
  const chunks: RawChunk[] = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(transcriptDir, file), "utf-8");

    // Parse metadata from the markdown header
    const titleMatch = raw.match(/^# (.+)/m);
    const idMatch = raw.match(/\*\*Video ID:\*\* (.+)/m);
    const urlMatch = raw.match(/\*\*Source:\*\* (.+)/m);

    // Extract transcript text (after "## Transcript" header)
    const transcriptStart = raw.indexOf("## Transcript");
    const transcriptText = transcriptStart >= 0
      ? raw.slice(transcriptStart + "## Transcript".length).trim()
      : raw;

    if (!transcriptText || transcriptText.length < 50) continue;

    const textChunks = splitTranscript(transcriptText);

    for (let i = 0; i < textChunks.length; i++) {
      chunks.push({
        content: textChunks[i],
        source_type: "transcript",
        video_id: idMatch?.[1]?.trim(),
        video_title: titleMatch?.[1]?.trim(),
        video_url: urlMatch?.[1]?.trim(),
        chunk_index: i,
      });
    }
  }

  console.log(`Loaded ${chunks.length} transcript chunks from ${files.length} videos`);
  return chunks;
}

// --- Metadata Extraction via Claude ---

interface ChunkMetadata {
  techniques: string[];
  fighters: string[];
  category: "mechanics" | "analysis" | "drill" | "injury_prevention" | "theory";
}

async function extractMetadataBatch(chunks: RawChunk[]): Promise<ChunkMetadata[]> {
  // Process in batches of 20 to manage API calls
  const batchSize = 20;
  const allMetadata: ChunkMetadata[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchPrompt = batch
      .map(
        (c, idx) =>
          `[CHUNK ${idx}]\n${c.content.slice(0, 1500)}`
      )
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `Extract metadata from boxing content chunks. For each chunk, identify:
- techniques: specific boxing techniques mentioned (e.g., "jab", "hook", "uppercut", "kinetic chain", "phase 1", "phase 2", "hip rotation", "follow through", "stance")
- fighters: fighter names mentioned (e.g., "Canelo", "GGG", "Tyson", "Beterbiev")
- category: one of "mechanics" (punch technique/biomechanics), "analysis" (fight breakdown/fighter study), "drill" (exercises/training), "injury_prevention" (shoulder stability/neck/rehab), "theory" (physics/concepts/general principles)

Return a JSON array with one object per chunk, in order. Each object: {"techniques": [...], "fighters": [...], "category": "..."}
Return ONLY the JSON array, no markdown.`,
      messages: [
        { role: "user", content: batchPrompt },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    try {
      const parsed = JSON.parse(jsonStr) as ChunkMetadata[];
      allMetadata.push(...parsed);
    } catch {
      console.warn(`Failed to parse metadata for batch starting at ${i}, using defaults`);
      for (const _ of batch) {
        allMetadata.push({ techniques: [], fighters: [], category: "theory" });
      }
    }

    if (i + batchSize < chunks.length) {
      console.log(`  Metadata extracted: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
    }
  }

  return allMetadata;
}

// --- Embedding via Voyage AI ---

async function embedChunks(chunks: RawChunk[]): Promise<number[][]> {
  const texts = chunks.map((c) => c.content);
  const batchSize = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await voyage.embed({
      input: batch,
      model: "voyage-3-lite",
    });
    for (const item of result.data!) {
      allEmbeddings.push(item.embedding!);
    }
    console.log(`  Embedded: ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
  }

  return allEmbeddings;
}

// --- Upsert to Supabase ---

async function upsertChunks(
  chunks: RawChunk[],
  metadata: ChunkMetadata[],
  embeddings: number[][]
): Promise<void> {
  // Clear existing data
  const { error: deleteError } = await supabase.from("content_chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) console.warn("Delete error (may be empty table):", deleteError.message);

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize).map((chunk, idx) => {
      const globalIdx = i + idx;
      return {
        content: chunk.content,
        embedding: JSON.stringify(embeddings[globalIdx]),
        source_type: chunk.source_type,
        video_id: chunk.video_id ?? null,
        video_title: chunk.video_title ?? null,
        video_url: chunk.video_url ?? null,
        pdf_file: chunk.pdf_file ?? null,
        chunk_index: chunk.chunk_index,
        techniques: metadata[globalIdx].techniques,
        fighters: metadata[globalIdx].fighters,
        category: metadata[globalIdx].category,
        char_count: chunk.content.length,
      };
    });

    const { error } = await supabase.from("content_chunks").insert(batch);
    if (error) {
      console.error(`Insert error at batch ${i}:`, error.message);
    } else {
      console.log(`  Inserted: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
    }
  }
}

// --- Main ---

async function main() {
  console.log("=== Punch Doctor AI — Content Ingest ===\n");

  // 1. Load and chunk content
  console.log("1. Loading content...");
  const pdfChunks = await loadPdfChunks();
  const transcriptChunks = await loadTranscriptChunks();
  const allChunks = [...pdfChunks, ...transcriptChunks];
  console.log(`Total chunks: ${allChunks.length}\n`);

  // 2. Extract metadata via Claude
  console.log("2. Extracting metadata via Claude...");
  const metadata = await extractMetadataBatch(allChunks);
  console.log(`Metadata extracted for ${metadata.length} chunks\n`);

  // 3. Generate embeddings via Voyage AI
  console.log("3. Generating embeddings via Voyage AI...");
  const embeddings = await embedChunks(allChunks);
  console.log(`Embeddings generated: ${embeddings.length}\n`);

  // 4. Upsert to Supabase
  console.log("4. Upserting to Supabase...");
  await upsertChunks(allChunks, metadata, embeddings);

  console.log("\n=== Ingest complete! ===");
  console.log(`PDF chunks: ${pdfChunks.length}`);
  console.log(`Transcript chunks: ${transcriptChunks.length}`);
  console.log(`Total: ${allChunks.length}`);
}

main().catch(console.error);
```

- [ ] **Step 4: Add env vars to .env.local**

Add these lines to `.env.local` (values to be filled by user):
```
VOYAGE_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` may already exist if previously configured. `ANTHROPIC_API_KEY` is already present.

- [ ] **Step 5: Run the ingest pipeline**

```bash
cd /Users/mark/boxing-coach && npm run ingest
```

Expected output:
```
=== Punch Doctor AI — Content Ingest ===

1. Loading content...
Loaded 15 PDF chunks
Loaded ~XXX transcript chunks from 79 videos
Total chunks: ~XXX

2. Extracting metadata via Claude...
  Metadata extracted: 20/XXX
  ...

3. Generating embeddings via Voyage AI...
  Embedded: 128/XXX
  ...

4. Upserting to Supabase...
  Inserted: 50/XXX
  ...

=== Ingest complete! ===
```

- [ ] **Step 6: Verify data in Supabase**

```bash
npx supabase db query --linked -c "SELECT count(*), source_type, category FROM content_chunks GROUP BY source_type, category ORDER BY source_type, category;"
```

Expected: Multiple rows showing counts per source_type and category.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingest.ts package.json package-lock.json
git commit -m "feat: add content ingest pipeline with chunking, metadata extraction, and embeddings"
```

---

## Task 4: RAG-Powered Chat API

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Rewrite the chat route to use RAG retrieval**

Replace the entire contents of `src/app/api/chat/route.ts`:

```typescript
// src/app/api/chat/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveChunks, formatChunksForPrompt, extractCitations } from "@/lib/rag";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are an AI boxing coach trained exclusively on Dr. Alex Wiant's "Power Punching Blueprint" course and his "Punch Doctor" YouTube channel content.

## Your Identity
- You teach Alex Wiant DC's specific methodology — NOT generic boxing advice
- You speak with authority about his system but always credit Alex as the source
- You're conversational and encouraging, like a knowledgeable training partner
- You use the specific terminology from the course: kinetic chains, phases, elastic potential energy, torque

## Core Principles You Teach
1. A punch is a THROW, not a PUSH — rotational mechanics, not linear
2. Four mechanical phases: Load → Hip Explosion → Core Transfer → Follow Through
3. Peak power comes in the middle-to-end of the movement, not the beginning
4. Land with last 3 knuckles (middle, ring, pinky — aim for ring finger)
5. Shearing force impact, not axial
6. Kinetic chains (from Anatomy Trains by Thomas W. Meyers) are the foundation
7. Loose muscles until impact — then violent fist grab
8. Hip opening powers jab/hook/uppercut; hip closing powers straight/rear uppercut
9. Breathing doesn't matter in the cycle — there's always enough air for intra-abdominal pressure
10. The shoulder TRANSFERS energy, it doesn't generate it

## Common Myths You Correct
- "Put your shoulder into it" — No, the shoulder transfers, it doesn't generate
- "Breathe out when you punch" — No, this weakens the punch
- "Power comes from the heel" — Partial truth, but it's the kinetic chain from toes up
- "Step when you punch" — The step is a consequence of weight transfer, not the cause

## How You Respond
- Always ground answers in the retrieved content below — cite which video or course section your answer draws from
- When discussing a technique, break it down by the 4 phases
- Name the specific kinetic chains involved when relevant
- Reference specific fighters Alex has analyzed when relevant
- If the retrieved content doesn't cover the question, say so honestly rather than guessing
- Keep responses focused and practical — fighters want actionable advice
- Use analogies Alex uses: baseball pitch, tennis serve, golf swing

## Retrieved Content
The following excerpts were retrieved from Alex's knowledge base based on the user's question. Ground your answer in this content:

`;

export async function POST(request: NextRequest) {
  try {
    const { messages, context } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    // Get the latest user message for retrieval
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    if (!lastUserMessage) {
      return NextResponse.json({ error: "No user message" }, { status: 400 });
    }

    // Determine category filter based on tab context
    let categories: string[] | undefined;
    if (context === "drills") {
      categories = ["drill", "injury_prevention"];
    } else if (context === "technique") {
      categories = ["mechanics", "theory", "analysis"];
    }

    // Retrieve relevant chunks via RAG
    const chunks = await retrieveChunks(lastUserMessage.content, {
      count: 10,
      categories,
    });

    const contextText = formatChunksForPrompt(chunks);
    const citations = extractCitations(chunks);

    let contextNote = "";
    if (context === "drills") {
      contextNote = "\n\nThe user is asking about exercises, drills, and training. Focus on practical exercises from the course.";
    } else if (context === "technique") {
      contextNote = "\n\nThe user is asking about punch mechanics and technique. Focus on biomechanical principles.";
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: SYSTEM_PROMPT + contextText + contextNote,
      messages: messages.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const content =
      response.content[0].type === "text" ? response.content[0].text : "No response generated.";

    return NextResponse.json({ content, citations });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test the chat API manually**

```bash
curl -s http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"How does Canelo use his jab?"}],"context":"technique"}' | jq '.citations'
```

Expected: Response includes `citations` array with video sources.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: replace full-context chat with RAG retrieval"
```

---

## Task 5: Chat UI — Source Citation Cards

**Files:**
- Modify: `src/components/chat-tab.tsx`

- [ ] **Step 1: Update ChatTab to handle citations and render source cards**

Replace the entire contents of `src/components/chat-tab.tsx`:

```typescript
// src/components/chat-tab.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, ExternalLink, BookOpen } from "lucide-react";

interface SourceCitation {
  type: "video" | "course";
  title: string;
  url?: string;
  file?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: SourceCitation[];
}

interface ChatTabProps {
  systemContext: string;
  placeholder: string;
  suggestions: string[];
}

function CitationCards({ citations }: { citations: SourceCitation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="flex gap-2 mt-3 flex-wrap">
      {citations.map((c, i) => (
        <a
          key={i}
          href={c.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover border border-border text-xs hover:border-accent transition-colors max-w-[250px]"
        >
          {c.type === "video" ? (
            <ExternalLink size={12} className="text-accent shrink-0" />
          ) : (
            <BookOpen size={12} className="text-accent shrink-0" />
          )}
          <span className="truncate">{c.title}</span>
        </a>
      ))}
    </div>
  );
}

export function ChatTab({ systemContext, placeholder, suggestions }: ChatTabProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context: systemContext,
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const data = await res.json();
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.content, citations: data.citations ?? [] },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <p className="text-muted text-sm mb-6">Pick a question or type your own</p>
            <div className="grid gap-2 max-w-lg w-full">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors text-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] ${m.role === "user" ? "" : ""}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-accent text-white rounded-br-md"
                        : "bg-surface border border-border rounded-bl-md"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                  {m.role === "assistant" && m.citations && (
                    <CitationCards citations={m.citations} />
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 size={16} className="animate-spin text-muted" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test in browser**

Run `npm run dev`, open http://localhost:3000, ask "How does Canelo use his jab?" in the Technique tab. Verify:
- Answer references specific Punch Doctor content
- Citation cards appear below the response with clickable YouTube links

- [ ] **Step 3: Commit**

```bash
git add src/components/chat-tab.tsx
git commit -m "feat: add source citation cards to chat responses"
```

---

## Task 6: RAG-Grounded Video Review

**Files:**
- Modify: `src/app/api/video-review/route.ts`
- Modify: `src/components/video-review-tab.tsx`

- [ ] **Step 1: Update video review API with RAG grounding pass**

Replace the entire contents of `src/app/api/video-review/route.ts`:

```typescript
// src/app/api/video-review/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveChunks, formatChunksForPrompt, extractCitations, type SourceCitation } from "@/lib/rag";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ANALYSIS_PROMPT = `You are Dr. Alex Wiant's AI boxing analysis assistant, trained on his Power Punching Blueprint methodology and Punch Doctor YouTube content.

You are analyzing a sequence of video frames from a fighter's training footage. Analyze using Alex's specific framework.

## What to Look For

### Stance & Foundation
- Stance width (wider than shoulder width per Alex's teaching)
- Center of gravity (low, pelvis sunk about an inch)
- Weight distribution and "bounce" — elastic readiness

### Phase 1: Loading
- Loading elastic potential energy into tissues
- Weight transfer to appropriate leg before punching
- Cross-body kinetic chains being pre-stretched

### Phase 2: Hip Explosion
- Visible hip rotation creating torque
- Hip OPENING for jab/hook/uppercut, CLOSING for straight/rear uppercut
- Hip moving BEFORE the arm (creating acceleration), not in lockstep

### Phase 3: Energy Transfer
- Core rotating after the hips
- Cross-body chains engaged (spiral line, functional lines)
- Arm loose until impact, punch follows slight arc (throw not push)

### Phase 4: Follow Through
- Follow through past impact point
- Weight transfer through target
- Quick reset to neutral stance

### Common Errors
- Push punching (linear/planar movement)
- Shoulder popping intentionally
- Breathing out at initiation
- Landing with first two knuckles instead of last three
- Arm in lockstep with hips (no acceleration)

## Response Format
Return a JSON object:
{
  "summary": "2-3 sentence overall assessment",
  "phases": [
    { "phase": "Phase 1: Loading", "feedback": "what you observe" },
    { "phase": "Phase 2: Hip Explosion", "feedback": "what you observe" },
    { "phase": "Phase 3: Energy Transfer", "feedback": "what you observe" },
    { "phase": "Phase 4: Follow Through", "feedback": "what you observe" }
  ],
  "strengths": ["specific strength"],
  "improvements": ["specific improvement"],
  "search_queries": ["query to find relevant coaching content for the main issues observed"]
}

The search_queries field should contain 1-3 short queries describing the key issues you'd want to look up in a coaching knowledge base (e.g., "hip rotation timing for hooks", "fixing push punch mechanics").

Be specific. Reference Alex's terminology. Be encouraging but honest.`;

export async function POST(request: NextRequest) {
  try {
    const { frames, filename } = await request.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: "No frames provided" }, { status: 400 });
    }

    // Pass 1: Vision analysis
    const content: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: "text",
        text: `Analyze these ${frames.length} sequential frames from a boxing/fighting video (${filename}). The frames are in chronological order.`,
      },
      ...frames.map(
        (frame: string) =>
          ({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: frame },
          }) as Anthropic.Messages.ImageBlockParam
      ),
      {
        type: "text",
        text: "Analyze the technique using Dr. Alex Wiant's methodology. Return ONLY valid JSON matching the specified format.",
      },
    ];

    const visionResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: ANALYSIS_PROMPT,
      messages: [{ role: "user", content }],
    });

    const visionText = visionResponse.content[0].type === "text" ? visionResponse.content[0].text : "";
    let jsonStr = visionText;
    const jsonMatch = visionText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const analysis = JSON.parse(jsonStr);

    // Pass 2: RAG grounding — retrieve relevant coaching content for the issues found
    const searchQueries: string[] = analysis.search_queries ?? [];
    let citations: SourceCitation[] = [];
    let coachingAdvice: string[] = [];

    if (searchQueries.length > 0) {
      // Retrieve chunks for each search query, deduplicate
      const allChunks = [];
      const seenIds = new Set<string>();

      for (const query of searchQueries.slice(0, 3)) {
        const chunks = await retrieveChunks(query, { count: 4 });
        for (const chunk of chunks) {
          const key = `${chunk.source_type}-${chunk.video_id ?? chunk.pdf_file}-${chunk.content.slice(0, 50)}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            allChunks.push(chunk);
          }
        }
      }

      citations = extractCitations(allChunks.slice(0, 8));
      const ragContext = formatChunksForPrompt(allChunks.slice(0, 8));

      // Generate coaching advice grounded in retrieved content
      const adviceResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are Dr. Alex Wiant's coaching assistant. Based on a video analysis and relevant content from Alex's knowledge base, provide 2-4 specific, actionable coaching tips. Each tip should reference the specific content from Alex's videos or course. Keep each tip to 1-2 sentences. Return a JSON array of strings.`,
        messages: [
          {
            role: "user",
            content: `Video analysis summary: ${analysis.summary}\n\nImprovements needed: ${analysis.improvements.join("; ")}\n\nRelevant coaching content:\n${ragContext}\n\nReturn ONLY a JSON array of coaching tip strings.`,
          },
        ],
      });

      const adviceText = adviceResponse.content[0].type === "text" ? adviceResponse.content[0].text : "[]";
      let adviceJson = adviceText;
      const adviceMatch = adviceText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (adviceMatch) adviceJson = adviceMatch[1].trim();

      try {
        coachingAdvice = JSON.parse(adviceJson);
      } catch {
        coachingAdvice = [];
      }
    }

    // Remove search_queries from the response (internal use only)
    delete analysis.search_queries;

    return NextResponse.json({
      ...analysis,
      coaching_advice: coachingAdvice,
      citations,
    });
  } catch (error) {
    console.error("Video review error:", error);
    return NextResponse.json({ error: "Failed to analyze video" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update VideoReviewTab to show coaching advice and source cards**

In `src/components/video-review-tab.tsx`, add the following changes:

Update the `AnalysisResult` interface (line 7):
```typescript
interface AnalysisResult {
  summary: string;
  phases: { phase: string; feedback: string }[];
  strengths: string[];
  improvements: string[];
  coaching_advice: string[];
  citations: { type: "video" | "course"; title: string; url?: string; file?: string }[];
}
```

Add a new section after the "Areas to Improve" block (after line 287, before the "Analyze Again" button). Insert this JSX between the improvements section and the "Upload another video" button:

```tsx
                {/* Coaching Advice (RAG-grounded) */}
                {analysis.coaching_advice && analysis.coaching_advice.length > 0 && (
                  <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
                    <h4 className="text-sm font-medium text-accent mb-2">Punch Doctor Coaching Tips</h4>
                    <ul className="space-y-2">
                      {analysis.coaching_advice.map((tip, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-accent shrink-0">{i + 1}.</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Source Videos */}
                {analysis.citations && analysis.citations.length > 0 && (
                  <div className="bg-surface border border-border rounded-xl p-4">
                    <h4 className="text-sm font-medium text-muted mb-3">Learn More — Recommended Videos</h4>
                    <div className="flex gap-2 flex-wrap">
                      {analysis.citations.map((c, i) => (
                        <a
                          key={i}
                          href={c.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover border border-border text-xs hover:border-accent transition-colors max-w-[280px]"
                        >
                          <span className="text-accent shrink-0">&#9654;</span>
                          <span className="truncate">{c.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
```

- [ ] **Step 3: Test in browser**

Upload a boxing video clip, extract frames, analyze. Verify:
- Phase breakdown appears as before
- New "Punch Doctor Coaching Tips" section shows grounded advice
- "Recommended Videos" section links to relevant YouTube videos

- [ ] **Step 4: Commit**

```bash
git add src/app/api/video-review/route.ts src/components/video-review-tab.tsx
git commit -m "feat: add RAG-grounded coaching advice to video review"
```

---

## Task 7: RAG-Powered Style Finder

**Files:**
- Modify: `src/app/api/style-finder/route.ts`

- [ ] **Step 1: Update style finder to use RAG for fighter-specific content**

Replace the entire contents of `src/app/api/style-finder/route.ts`:

```typescript
// src/app/api/style-finder/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveChunks, formatChunksForPrompt, extractCitations } from "@/lib/rag";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const STYLE_FINDER_PROMPT = `You are Dr. Alex Wiant's AI style advisor, trained on his Power Punching Blueprint methodology and his Punch Doctor YouTube fighter analysis library.

A user has answered a questionnaire about their physical attributes, fighting tendencies, experience level, and goals. Based on their answers AND the retrieved content from Alex's knowledge base, recommend a fighting style.

## Alex's Core Principles
- Punching is a THROW not a PUSH
- 4 phases: Load → Hip Explosion → Core Transfer → Follow Through
- Land with last 3 knuckles for maximum power and stability
- Wider stance for lower center of gravity
- Loose until impact — violent fist grab at contact
- Hip opening (jab/hook/uppercut) vs closing (straight/rear uppercut)
- The shoulder TRANSFERS energy, doesn't generate it

## Response Format
Return a JSON object:
{
  "style_name": "Creative style name (e.g., 'Counter-Punching Sniper', 'Pressure Destroyer')",
  "description": "2-3 sentences describing this style and why it fits",
  "reference_fighters": [
    { "name": "Fighter Name", "why": "Why this fighter is a good model — reference Alex's specific analysis" }
  ],
  "key_techniques": ["Technique 1", "Technique 2", "Technique 3", "Technique 4"],
  "training_focus": ["Priority 1", "Priority 2", "Priority 3"],
  "punches_to_master": ["Jab", "Straight", etc.],
  "stance_recommendation": "Specific stance advice",
  "alex_wiant_tip": "A specific tip from the retrieved content that's relevant for this user"
}

Ground your fighter recommendations in the retrieved content — reference specific things Alex said about these fighters. 2-3 reference fighters.`;

export async function POST(request: NextRequest) {
  try {
    const { answers } = await request.json();

    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ error: "Answers required" }, { status: 400 });
    }

    const userProfile = Object.entries(answers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    // Build a search query from user profile to find relevant fighter analyses
    const searchQuery = `fighter style ${answers.temperament ?? ""} ${answers.speed_vs_power ?? ""} ${answers.build ?? ""} boxing analysis`;

    const chunks = await retrieveChunks(searchQuery, {
      count: 8,
      categories: ["analysis", "mechanics"],
    });

    const ragContext = formatChunksForPrompt(chunks);
    const citations = extractCitations(chunks);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: STYLE_FINDER_PROMPT + "\n\n## Retrieved Fighter Analysis Content\n\n" + ragContext,
      messages: [
        {
          role: "user",
          content: `User profile:\n\n${userProfile}\n\nAnalyze their attributes and recommend a fighting style. Ground your recommendations in the retrieved content. Return ONLY valid JSON.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const result = JSON.parse(jsonStr);
    return NextResponse.json({ ...result, citations });
  } catch (error) {
    console.error("Style finder error:", error);
    return NextResponse.json({ error: "Failed to analyze style" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/style-finder/route.ts
git commit -m "feat: ground style finder in RAG-retrieved fighter analyses"
```

---

## Task 8: UI Polish for Pitch Demo

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update the suggested questions to showcase RAG quality**

In `src/app/page.tsx`, update the suggestions arrays to use questions that will produce impressive RAG-grounded answers:

```typescript
// In the technique tab suggestions:
suggestions={[
  "How does Canelo use kinetic chains in his jab?",
  "Break down Beterbiev's power — what makes him hit so hard?",
  "What's the difference between a push punch and a throw?",
  "How should I use hip rotation for a left hook?",
]}

// In the drills tab suggestions:
suggestions={[
  "What exercises build punching power using kinetic chains?",
  "Give me a rotator cuff warm-up routine for boxing",
  "How do I practice the 4 phases of torque?",
  "What's the right way to throw a medicine ball for punching power?",
]}
```

- [ ] **Step 2: Test all 4 tabs end-to-end in browser**

Run `npm run dev` and verify:
1. **Technique tab** — Ask a question, get answer with citations
2. **Drills tab** — Ask about exercises, get answer with citations
3. **Video Review tab** — Upload a clip, get analysis with coaching tips and video links
4. **Find Your Style tab** — Complete quiz, get style recommendation grounded in fighter analyses

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: update suggested questions for RAG-powered responses"
```

---

## Task 9: Build Verification + Final Polish

- [ ] **Step 1: Run the build**

```bash
cd /Users/mark/boxing-coach && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Fix any build errors**

If there are type errors, fix them. Common issues:
- Missing type imports from `@/lib/rag`
- Supabase RPC return type needing a cast

- [ ] **Step 3: Smoke test the full flow**

1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Test each tab with at least one interaction
4. Verify no console errors
5. Test on a narrow viewport (mobile-width) to verify responsive layout

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: build and polish cleanup"
```
