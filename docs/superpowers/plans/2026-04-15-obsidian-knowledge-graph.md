# Obsidian Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Obsidian-style knowledge graph with concept nodes, typed edges, and graph-enhanced retrieval (HyDE + query decomposition + Cohere Rerank) to the Punch Doctor AI boxing coach.

**Architecture:** Two-layer knowledge system (concept nodes + source chunks) stored in Supabase, mirrored as an Obsidian vault. Retrieval runs vector search and graph traversal in parallel, merges candidates, and reranks via Cohere cross-encoder.

**Tech Stack:** Supabase pgvector, Voyage AI voyage-3-lite, Claude Opus 4.6 (vault generation), Claude Sonnet 4 (runtime), Cohere Rerank, Next.js 16

**Spec:** `docs/superpowers/specs/2026-04-15-obsidian-knowledge-graph-design.md`

---

## Task 1: DB Schema

**Goal:** Create Supabase migration with `knowledge_nodes`, `knowledge_edges`, `query_logs` tables, `search_graph()` function, and centrality computation SQL.

**Files:**
- Create `supabase/migrations/002_knowledge_graph.sql`

### Steps

- [ ] **1.1** Create migration file `supabase/migrations/002_knowledge_graph.sql` with the following content:

```sql
-- Migration: Knowledge Graph tables, search function, and centrality computation
-- Applied to Supabase project: vrtuyqtbzacilcjlqzkt

-- ============================================================
-- Table: knowledge_nodes
-- ============================================================
CREATE TABLE knowledge_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  node_type text NOT NULL CHECK (node_type IN (
    'concept', 'fighter', 'technique', 'phase', 'drill', 'injury_prevention'
  )),
  content text NOT NULL,
  aliases text[] DEFAULT '{}',
  embedding vector(512),
  centrality float DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX knowledge_nodes_embedding_idx ON knowledge_nodes
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
CREATE INDEX knowledge_nodes_type_idx ON knowledge_nodes (node_type);
CREATE INDEX knowledge_nodes_slug_idx ON knowledge_nodes (slug);

-- ============================================================
-- Table: knowledge_edges
-- ============================================================
CREATE TABLE knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_node uuid REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_chunk uuid REFERENCES content_chunks(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN (
    'REQUIRES', 'DEMONSTRATES', 'TRAINS', 'SOURCED_FROM',
    'CORRECTS', 'SEQUENCES', 'RELATED'
  )),
  weight float DEFAULT 0.8 CHECK (weight >= 0 AND weight <= 1),
  evidence text,
  source_chunk uuid REFERENCES content_chunks(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT edge_has_target CHECK (target_node IS NOT NULL OR target_chunk IS NOT NULL)
);

CREATE INDEX knowledge_edges_source_idx ON knowledge_edges (source_node);
CREATE INDEX knowledge_edges_target_node_idx ON knowledge_edges (target_node);
CREATE INDEX knowledge_edges_target_chunk_idx ON knowledge_edges (target_chunk);
CREATE INDEX knowledge_edges_type_idx ON knowledge_edges (edge_type);

-- ============================================================
-- Table: query_logs
-- ============================================================
CREATE TABLE query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  context text,
  sub_queries text[],
  retrieved_node_ids uuid[],
  retrieved_chunk_ids uuid[],
  response_preview text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Function: search_graph (bidirectional traversal with deduplication)
-- ============================================================
CREATE OR REPLACE FUNCTION search_graph(
  query_embedding vector(512),
  entry_keywords text[],
  max_hops int DEFAULT 2,
  max_results int DEFAULT 20
)
RETURNS TABLE (
  item_type text,
  item_id uuid,
  content text,
  title text,
  node_type text,
  video_url text,
  hop_distance int,
  edge_weight float,
  node_centrality float,
  graph_score float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE
  -- Find entry nodes by keyword match on title/aliases + vector similarity
  entry_nodes AS (
    SELECT
      kn.id,
      kn.title,
      kn.content,
      kn.node_type,
      kn.centrality,
      0 AS hop,
      1.0::float AS path_weight,
      (1 - (kn.embedding <=> query_embedding))::float AS vector_sim
    FROM knowledge_nodes kn
    WHERE (
      kn.title ILIKE ANY(SELECT '%' || k || '%' FROM unnest(entry_keywords) k)
      OR kn.aliases && entry_keywords
    )
    ORDER BY kn.embedding <=> query_embedding
    LIMIT 5
  ),
  -- Traverse edges bidirectionally up to max_hops, deduplicated via visited array
  traversal AS (
    SELECT id, title, content, node_type, centrality, hop, path_weight, vector_sim,
           ARRAY[id] AS visited
    FROM entry_nodes
    UNION ALL
    -- Forward: source_node -> target_node
    (SELECT
      kn.id, kn.title, kn.content, kn.node_type, kn.centrality,
      t.hop + 1,
      t.path_weight * ke.weight,
      0::float,
      t.visited || kn.id
    FROM traversal t
    JOIN knowledge_edges ke ON ke.source_node = t.id
    JOIN knowledge_nodes kn ON kn.id = ke.target_node
    WHERE t.hop < max_hops AND NOT (kn.id = ANY(t.visited))
    UNION ALL
    -- Reverse: target_node -> source_node
    SELECT
      kn.id, kn.title, kn.content, kn.node_type, kn.centrality,
      t.hop + 1,
      t.path_weight * ke.weight,
      0::float,
      t.visited || kn.id
    FROM traversal t
    JOIN knowledge_edges ke ON ke.target_node = t.id
    JOIN knowledge_nodes kn ON kn.id = ke.source_node
    WHERE t.hop < max_hops AND NOT (kn.id = ANY(t.visited)))
  )
  -- Return nodes with their graph scores
  SELECT
    'node'::text AS item_type,
    t.id AS item_id,
    t.content,
    t.title,
    t.node_type,
    NULL::text AS video_url,
    t.hop AS hop_distance,
    t.path_weight AS edge_weight,
    t.centrality AS node_centrality,
    (t.path_weight * (1.0 / (t.hop + 1)) * GREATEST(t.centrality, 0.1))::float AS graph_score
  FROM traversal t

  UNION ALL

  -- Also return source chunks connected to traversed nodes via SOURCED_FROM
  SELECT
    'chunk'::text,
    cc.id,
    cc.content,
    cc.video_title,
    cc.category,
    cc.video_url,
    t.hop + 1,
    t.path_weight * ke.weight,
    t.centrality,
    (t.path_weight * ke.weight * (1.0 / (t.hop + 2)) * GREATEST(t.centrality, 0.1))::float
  FROM traversal t
  JOIN knowledge_edges ke ON ke.source_node = t.id AND ke.target_chunk IS NOT NULL
  JOIN content_chunks cc ON cc.id = ke.target_chunk

  ORDER BY graph_score DESC
  LIMIT max_results;
END;
$$;

-- ============================================================
-- Function: recompute_centrality
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_centrality()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE knowledge_nodes kn SET centrality = COALESCE(scores.raw / max_scores.max_raw, 0)
  FROM (
    SELECT node_id, SUM(weight) AS raw FROM (
      SELECT source_node AS node_id, weight FROM knowledge_edges
      UNION ALL
      SELECT target_node AS node_id, weight FROM knowledge_edges WHERE target_node IS NOT NULL
    ) edges GROUP BY node_id
  ) scores,
  (SELECT MAX(raw) AS max_raw FROM (
    SELECT node_id, SUM(weight) AS raw FROM (
      SELECT source_node AS node_id, weight FROM knowledge_edges
      UNION ALL
      SELECT target_node AS node_id, weight FROM knowledge_edges WHERE target_node IS NOT NULL
    ) edges GROUP BY node_id
  ) s) max_scores
  WHERE kn.id = scores.node_id;

  -- Set centrality to 0 for orphaned nodes (no edges)
  UPDATE knowledge_nodes SET centrality = 0
  WHERE id NOT IN (
    SELECT source_node FROM knowledge_edges
    UNION
    SELECT target_node FROM knowledge_edges WHERE target_node IS NOT NULL
  );
END;
$$;
```

- [ ] **1.2** Apply migration to Supabase:

```bash
npx supabase db query --linked -f supabase/migrations/002_knowledge_graph.sql
```

- [ ] **1.3** Verify tables exist:

```bash
npx supabase db query --linked -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('knowledge_nodes', 'knowledge_edges', 'query_logs') ORDER BY table_name;"
```

---

## Task 2: Install Dependencies + Add Scripts

**Goal:** Install `cohere-ai` and add new npm scripts for vault generation, sync, and eval.

**Files:**
- Modify `package.json`

### Steps

- [ ] **2.1** Install cohere-ai:

```bash
npm install cohere-ai
```

- [ ] **2.2** Add scripts to `package.json`. The `scripts` section should become:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "ingest": "tsx scripts/ingest.ts",
    "generate-vault": "tsx scripts/generate-vault.ts",
    "vault-to-db": "tsx scripts/vault-to-db.ts",
    "eval": "tsx scripts/eval.ts"
  }
}
```

- [ ] **2.3** Add `COHERE_API_KEY` to `.env.local` (ask user for value if not already present):

```
COHERE_API_KEY=<user-provided-key>
```

---

## Task 3: Vault Generation -- Pass 1 Entity Extraction

**Goal:** Script that reads all 254 content_chunks from Supabase, sends to Claude Opus in batches, outputs a JSON list of ~60-80 node candidates with title, type, aliases.

**Files:**
- Create `scripts/generate-vault.ts` (this task creates the file with Pass 1; Tasks 4-6 add to it)
- Create `scripts/vault-generation/pass1-extract.ts`

### Steps

- [ ] **3.1** Create `scripts/vault-generation/pass1-extract.ts`:

```typescript
// scripts/vault-generation/pass1-extract.ts
// Pass 1: Entity Extraction — identify all concept nodes from source chunks
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export interface NodeCandidate {
  title: string;
  slug: string;
  node_type: "concept" | "fighter" | "technique" | "phase" | "drill" | "injury_prevention";
  aliases: string[];
  description: string; // 1-sentence reason this deserves a node
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function extractEntities(
  supabase: ReturnType<typeof createClient>
): Promise<NodeCandidate[]> {
  console.log("=== Pass 1: Entity Extraction ===\n");

  // Fetch all content_chunks
  const { data: chunks, error } = await supabase
    .from("content_chunks")
    .select("id, content, source_type, video_title, pdf_file, category")
    .order("created_at");

  if (error || !chunks) {
    throw new Error(`Failed to fetch chunks: ${error?.message}`);
  }
  console.log(`Loaded ${chunks.length} content chunks\n`);

  // Batch chunks for Claude — ~40 chunks per batch to stay within context
  const batchSize = 40;
  const allCandidates: NodeCandidate[] = [];
  const seenSlugs = new Set<string>();

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchText = batch
      .map((c, idx) => {
        const source = c.source_type === "transcript"
          ? `[Video: ${c.video_title}]`
          : `[Course: ${c.pdf_file}]`;
        return `[CHUNK ${i + idx}] ${source}\n${c.content.slice(0, 2000)}`;
      })
      .join("\n\n---\n\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6-20250515",
      max_tokens: 8192,
      system: `You are analyzing boxing coaching content from Dr. Alex Wiant's "Punch Doctor" channel and "Power Punching Blueprint" course.

Your job: identify every distinct concept, fighter, technique, drill, phase, and injury prevention topic mentioned in these chunks.

For each entity, provide:
- title: Human-readable name (e.g., "Jab Mechanics", "Canelo Alvarez")
- slug: URL-safe lowercase (e.g., "jab-mechanics", "canelo-alvarez")
- node_type: One of "concept", "fighter", "technique", "phase", "drill", "injury_prevention"
- aliases: Alternative names users might use (e.g., ["jab", "lead hand punch"])
- description: One sentence explaining why this deserves its own knowledge node

Guidelines:
- A "concept" is a theoretical principle (kinetic chains, shearing force, throw vs push)
- A "fighter" is a specific boxer Alex analyzes
- A "technique" is a specific punch or movement pattern
- A "phase" is one of Alex's 4 mechanical phases
- A "drill" is a specific exercise or training activity
- An "injury_prevention" topic is about body maintenance/prehab
- Only create nodes for topics with substantial content — at least 2-3 mentions across the corpus
- The four phases should each be separate nodes
- Merge duplicates (e.g., "hook" and "left hook" should be one node if Alex treats them as the same topic)

Return ONLY a JSON array of objects. No markdown fencing.`,
      messages: [{ role: "user", content: batchText }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    try {
      const candidates = JSON.parse(jsonStr) as NodeCandidate[];
      for (const c of candidates) {
        if (!seenSlugs.has(c.slug)) {
          seenSlugs.add(c.slug);
          allCandidates.push(c);
        }
      }
    } catch (e) {
      console.warn(`Failed to parse batch ${i}, skipping: ${e}`);
    }

    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}: ${allCandidates.length} unique candidates so far`);
  }

  // Deduplication pass — ask Claude to merge overlapping candidates
  if (allCandidates.length > 0) {
    console.log(`\nDeduplication pass on ${allCandidates.length} candidates...`);

    const dedupeResponse = await anthropic.messages.create({
      model: "claude-opus-4-6-20250515",
      max_tokens: 8192,
      system: `You are deduplicating a list of knowledge graph node candidates from a boxing coaching corpus.

Rules:
- Merge nodes that cover the same topic (e.g., "Left Hook" and "Hook Mechanics" should be one node)
- Keep the more specific/descriptive title
- Combine aliases from merged nodes
- The 4 phases must remain as separate nodes
- Target: 60-80 total nodes
- Preserve node_type accuracy

Return the deduplicated JSON array. No markdown fencing.`,
      messages: [
        {
          role: "user",
          content: JSON.stringify(allCandidates, null, 2),
        },
      ],
    });

    const dedupeText = dedupeResponse.content[0].type === "text" ? dedupeResponse.content[0].text : "[]";
    let dedupeJson = dedupeText;
    const dedupeMatch = dedupeText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (dedupeMatch) dedupeJson = dedupeMatch[1].trim();

    try {
      const deduplicated = JSON.parse(dedupeJson) as NodeCandidate[];
      console.log(`Deduplicated: ${allCandidates.length} → ${deduplicated.length} nodes\n`);
      return deduplicated;
    } catch {
      console.warn("Deduplication parse failed, using raw candidates");
    }
  }

  return allCandidates;
}
```

- [ ] **3.2** Create the main orchestrator `scripts/generate-vault.ts` (initially with just Pass 1 call; Passes 2-4 added in subsequent tasks):

```typescript
// scripts/generate-vault.ts
// Orchestrates the full vault generation pipeline: Extract → Synthesize → Edges → Validate+Insert
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { extractEntities, type NodeCandidate } from "./vault-generation/pass1-extract";
import { synthesizeNodes, type SynthesizedNode } from "./vault-generation/pass2-synthesize";
import { discoverEdges, type DiscoveredEdge } from "./vault-generation/pass3-edges";
import { validateAndInsert } from "./vault-generation/pass4-validate";
import { writeVaultFiles } from "./vault-generation/write-vault";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CACHE_DIR = path.join(process.cwd(), "scripts", "vault-generation", ".cache");

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function loadCache<T>(filename: string): Promise<T | null> {
  try {
    const data = await fs.readFile(path.join(CACHE_DIR, filename), "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function saveCache<T>(filename: string, data: T): Promise<void> {
  await fs.writeFile(path.join(CACHE_DIR, filename), JSON.stringify(data, null, 2));
}

async function main() {
  console.log("=== Punch Doctor AI — Vault Generation Pipeline ===\n");
  await ensureCacheDir();

  // Pass 1: Entity Extraction
  let candidates = await loadCache<NodeCandidate[]>("pass1-candidates.json");
  if (candidates) {
    console.log(`Pass 1: Loaded ${candidates.length} candidates from cache\n`);
  } else {
    candidates = await extractEntities(supabase);
    await saveCache("pass1-candidates.json", candidates);
  }

  // Pass 2: Knowledge Synthesis
  let nodes = await loadCache<SynthesizedNode[]>("pass2-nodes.json");
  if (nodes) {
    console.log(`Pass 2: Loaded ${nodes.length} synthesized nodes from cache\n`);
  } else {
    nodes = await synthesizeNodes(supabase, candidates);
    await saveCache("pass2-nodes.json", nodes);
  }

  // Pass 3: Edge Discovery
  let edges = await loadCache<DiscoveredEdge[]>("pass3-edges.json");
  if (edges) {
    console.log(`Pass 3: Loaded ${edges.length} edges from cache\n`);
  } else {
    edges = await discoverEdges(supabase, nodes);
    await saveCache("pass3-edges.json", edges);
  }

  // Pass 4: Validate + Insert into DB
  const { nodes: finalNodes, edges: finalEdges } = await validateAndInsert(
    supabase, nodes, edges
  );

  // Write vault files
  await writeVaultFiles(finalNodes, finalEdges);

  console.log("\n=== Vault generation complete! ===");
  console.log(`Nodes: ${finalNodes.length}`);
  console.log(`Edges: ${finalEdges.length}`);
  console.log(`Vault: ${path.join(process.cwd(), "vault")}`);
}

main().catch(console.error);
```

---

## Task 4: Vault Generation -- Pass 2 Knowledge Synthesis

**Goal:** For each node candidate, gather relevant chunks via vector search + keyword match, send to Claude Opus to synthesize a structured concept note following the Node Content Format.

**Files:**
- Create `scripts/vault-generation/pass2-synthesize.ts`

### Steps

- [ ] **4.1** Create `scripts/vault-generation/pass2-synthesize.ts`:

```typescript
// scripts/vault-generation/pass2-synthesize.ts
// Pass 2: For each node candidate, synthesize a structured concept note from source chunks
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { NodeCandidate } from "./pass1-extract";

export interface SynthesizedNode extends NodeCandidate {
  content: string; // Full structured markdown content
  source_chunk_ids: string[]; // UUIDs of chunks used
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-3-lite" }),
  });
  if (!res.ok) throw new Error(`Voyage error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function findRelevantChunks(
  supabase: ReturnType<typeof createClient>,
  candidate: NodeCandidate
): Promise<{ id: string; content: string; video_title: string | null; pdf_file: string | null; source_type: string }[]> {
  // Vector search using title + aliases
  const searchText = [candidate.title, ...candidate.aliases].join(" ");
  const embedding = await embedText(searchText);

  const { data: vectorResults } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_count: 15,
    filter_categories: null,
  });

  // Keyword search on content for title and aliases
  const keywords = [candidate.title, ...candidate.aliases];
  const keywordFilter = keywords.map(k => `content.ilike.%${k}%`).join(",");

  const { data: keywordResults } = await supabase
    .from("content_chunks")
    .select("id, content, video_title, pdf_file, source_type")
    .or(keywordFilter)
    .limit(10);

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: typeof vectorResults = [];

  for (const r of [...(vectorResults ?? []), ...(keywordResults ?? [])]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      merged.push(r);
    }
  }

  return merged.slice(0, 15);
}

export async function synthesizeNodes(
  supabase: ReturnType<typeof createClient>,
  candidates: NodeCandidate[]
): Promise<SynthesizedNode[]> {
  console.log("=== Pass 2: Knowledge Synthesis ===\n");

  const synthesized: SynthesizedNode[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    console.log(`  [${i + 1}/${candidates.length}] Synthesizing: ${candidate.title}`);

    const relevantChunks = await findRelevantChunks(supabase, candidate);

    if (relevantChunks.length === 0) {
      console.warn(`    No chunks found for "${candidate.title}", skipping`);
      continue;
    }

    const chunksText = relevantChunks
      .map((c, idx) => {
        const source = c.source_type === "transcript"
          ? `[Video: ${c.video_title}]`
          : `[Course: ${c.pdf_file}]`;
        return `[SOURCE ${idx + 1}] ${source}\n${c.content}`;
      })
      .join("\n\n---\n\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6-20250515",
      max_tokens: 4096,
      system: `You are synthesizing a knowledge node for Dr. Alex Wiant's boxing methodology knowledge graph.

Create a structured concept note about "${candidate.title}" (type: ${candidate.node_type}).

Follow this EXACT format:

# ${candidate.title}

## Summary
[2-3 sentences capturing the essence of what Alex teaches about this topic]

## What Alex Teaches
[3-5 paragraphs synthesizing ALL relevant information from the source material. Be specific and technical. Use Alex's exact terminology, analogies (baseball pitch, tennis serve, golf swing), and framework. Do NOT add information Alex hasn't taught.]

## Key Quotes
> "Exact quote from source material..."
> — Video/Course title

[Include 2-4 direct quotes that capture Alex's voice]

## Common Mistakes
- [Specific mistake Alex corrects, if applicable]
[List 2-5 if the topic has common errors. Omit this section entirely if not applicable.]

## Connections
[Leave this section empty — it will be filled in Pass 3]

## Sources
[List each source chunk used, formatted as:]
- [[src/VIDEO_ID]] — Video title
- [[src/PDF_FILE]] — Course section title

Rules:
- Preserve Alex's EXACT voice, terminology, and analogies
- Every claim must be traceable to the source material provided
- Do NOT invent content Alex hasn't said
- Be comprehensive — use ALL relevant source material
- Key Quotes must be verbatim from the sources (or very close paraphrases clearly marked)`,
      messages: [
        {
          role: "user",
          content: `Synthesize everything about "${candidate.title}" from these source chunks:\n\n${chunksText}`,
        },
      ],
    });

    const content = response.content[0].type === "text" ? response.content[0].text : "";

    synthesized.push({
      ...candidate,
      content,
      source_chunk_ids: relevantChunks.map(c => c.id),
    });

    // Rate limiting — small delay between Opus calls
    if (i < candidates.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nSynthesized ${synthesized.length} nodes\n`);
  return synthesized;
}
```

---

## Task 5: Vault Generation -- Pass 3 Edge Discovery

**Goal:** For each node, Claude identifies connections to other nodes with edge types, weights, and evidence. Also creates SOURCED_FROM edges linking nodes to their source chunks.

**Files:**
- Create `scripts/vault-generation/pass3-edges.ts`

### Steps

- [ ] **5.1** Create `scripts/vault-generation/pass3-edges.ts`:

```typescript
// scripts/vault-generation/pass3-edges.ts
// Pass 3: Discover edges between nodes + SOURCED_FROM edges to chunks
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { SynthesizedNode } from "./pass2-synthesize";

export interface DiscoveredEdge {
  source_slug: string;
  target_slug: string | null; // null for SOURCED_FROM edges targeting chunks
  target_chunk_id: string | null; // for SOURCED_FROM edges
  edge_type: "REQUIRES" | "DEMONSTRATES" | "TRAINS" | "SOURCED_FROM" | "CORRECTS" | "SEQUENCES" | "RELATED";
  weight: number;
  evidence: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function discoverEdges(
  supabase: ReturnType<typeof createClient>,
  nodes: SynthesizedNode[]
): Promise<DiscoveredEdge[]> {
  console.log("=== Pass 3: Edge Discovery ===\n");

  const allEdges: DiscoveredEdge[] = [];
  const slugSet = new Set(nodes.map(n => n.slug));

  // Build a compact summary of all nodes for Claude's reference
  const nodeIndex = nodes.map(n => ({
    slug: n.slug,
    title: n.title,
    type: n.node_type,
    aliases: n.aliases,
  }));
  const nodeIndexText = JSON.stringify(nodeIndex, null, 2);

  // Process nodes in batches of 5 for edge discovery
  const batchSize = 5;

  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);
    const batchText = batch
      .map(n => `### ${n.title} (${n.slug}, type: ${n.node_type})\n${n.content.slice(0, 2000)}`)
      .join("\n\n===\n\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6-20250515",
      max_tokens: 8192,
      system: `You are discovering connections between nodes in a boxing knowledge graph.

Available edge types:
- REQUIRES: prerequisite ("Jab" requires "Phase 2 Hip Opening")
- DEMONSTRATES: fighter shows technique ("Canelo" demonstrates "Jab Mechanics")
- TRAINS: drill builds skill ("Hip Opening Drill" trains "Phase 2")
- CORRECTS: myth-busting ("Throw vs Push" corrects a misconception)
- SEQUENCES: ordering ("Phase 1" sequences to "Phase 2")
- RELATED: weaker association (use sparingly, weight 0.3-0.5)

Rules:
- Only create edges DIRECTLY SUPPORTED by the source material
- If inferring a connection Alex didn't explicitly make, use RELATED with weight <= 0.5
- Each edge needs evidence: a quote or specific reason from the content
- Weight scale: 1.0 = essential/explicit, 0.8 = strong, 0.6 = moderate, 0.3-0.5 = inferred
- Source slug = the node you're analyzing, target slug = the connected node
- Only use slugs from the available nodes list

For each node in the batch, return its edges as a JSON array.

Available nodes:
${nodeIndexText}

Return a flat JSON array of edge objects. No markdown fencing.
Each object: {"source_slug": "...", "target_slug": "...", "edge_type": "...", "weight": 0.8, "evidence": "..."}`,
      messages: [
        {
          role: "user",
          content: `Discover edges for these nodes:\n\n${batchText}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    try {
      const edges = JSON.parse(jsonStr) as DiscoveredEdge[];
      // Validate edges — only keep those with valid slugs
      for (const edge of edges) {
        if (slugSet.has(edge.source_slug) && edge.target_slug && slugSet.has(edge.target_slug)) {
          allEdges.push({ ...edge, target_chunk_id: null });
        }
      }
    } catch (e) {
      console.warn(`  Failed to parse edges for batch ${i}: ${e}`);
    }

    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(nodes.length / batchSize)}: ${allEdges.length} edges so far`);

    if (i + batchSize < nodes.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Add SOURCED_FROM edges — link each node to its source chunks
  for (const node of nodes) {
    for (const chunkId of node.source_chunk_ids) {
      allEdges.push({
        source_slug: node.slug,
        target_slug: null,
        target_chunk_id: chunkId,
        edge_type: "SOURCED_FROM",
        weight: 1.0,
        evidence: `Node "${node.title}" synthesized from this source chunk`,
      });
    }
  }

  // Deduplicate edges (same source+target+type)
  const edgeKeys = new Set<string>();
  const deduped: DiscoveredEdge[] = [];
  for (const edge of allEdges) {
    const key = `${edge.source_slug}|${edge.target_slug ?? edge.target_chunk_id}|${edge.edge_type}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      deduped.push(edge);
    }
  }

  console.log(`\nDiscovered ${deduped.length} edges (${deduped.filter(e => e.edge_type !== "SOURCED_FROM").length} node-to-node, ${deduped.filter(e => e.edge_type === "SOURCED_FROM").length} SOURCED_FROM)\n`);
  return deduped;
}
```

---

## Task 6: Vault Generation -- Pass 4 Validation + DB Insert

**Goal:** Claude validates the graph for missing concepts, hallucinated edges, orphaned nodes. Then insert all nodes and edges into Supabase, embed node content, compute centrality.

**Files:**
- Create `scripts/vault-generation/pass4-validate.ts`

### Steps

- [ ] **6.1** Create `scripts/vault-generation/pass4-validate.ts`:

```typescript
// scripts/vault-generation/pass4-validate.ts
// Pass 4: Validate graph, insert nodes/edges into Supabase, embed, compute centrality
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { SynthesizedNode } from "./pass2-synthesize";
import type { DiscoveredEdge } from "./pass3-edges";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

async function embedBatch(texts: string[]): Promise<number[][]> {
  const batchSize = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: batch, model: "voyage-3-lite" }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Voyage error ${res.status}: ${body}`);
    }
    const data = await res.json();
    allEmbeddings.push(...data.data.map((d: { embedding: number[] }) => d.embedding));

    if (i + batchSize < texts.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return allEmbeddings;
}

export async function validateAndInsert(
  supabase: ReturnType<typeof createClient>,
  nodes: SynthesizedNode[],
  edges: DiscoveredEdge[]
): Promise<{ nodes: SynthesizedNode[]; edges: DiscoveredEdge[] }> {
  console.log("=== Pass 4: Validation + DB Insert ===\n");

  // --- Validation with Claude ---
  const graphSummary = {
    node_count: nodes.length,
    edge_count: edges.length,
    nodes: nodes.map(n => ({
      slug: n.slug,
      title: n.title,
      type: n.node_type,
      edge_count: edges.filter(
        e => e.source_slug === n.slug || e.target_slug === n.slug
      ).length,
    })),
    edge_type_counts: edges.reduce((acc, e) => {
      acc[e.edge_type] = (acc[e.edge_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    orphaned_nodes: nodes
      .filter(n => !edges.some(e => e.source_slug === n.slug || e.target_slug === n.slug))
      .map(n => n.slug),
  };

  console.log("Running validation with Claude...");
  const validationResponse = await anthropic.messages.create({
    model: "claude-opus-4-6-20250515",
    max_tokens: 4096,
    system: `You are validating a boxing knowledge graph for completeness and accuracy.

Review the graph summary and identify:
1. Missing concepts — important topics from boxing coaching that don't have nodes
2. Orphaned nodes — nodes with no edges (listed in the summary)
3. Suspicious patterns — e.g., a fighter node with no DEMONSTRATES edges
4. Overall assessment — is this graph sufficient for a boxing coaching AI?

Return JSON:
{
  "issues": [{"type": "missing_node|orphaned|suspicious", "description": "..."}],
  "overall_quality": "good|needs_work|poor",
  "summary": "1-2 sentences"
}
No markdown fencing.`,
    messages: [
      { role: "user", content: JSON.stringify(graphSummary, null, 2) },
    ],
  });

  const valText = validationResponse.content[0].type === "text" ? validationResponse.content[0].text : "{}";
  let valJson = valText;
  const valMatch = valText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (valMatch) valJson = valMatch[1].trim();

  try {
    const validation = JSON.parse(valJson);
    console.log(`Validation: ${validation.overall_quality}`);
    console.log(`Summary: ${validation.summary}`);
    if (validation.issues?.length > 0) {
      console.log(`Issues found: ${validation.issues.length}`);
      for (const issue of validation.issues) {
        console.log(`  [${issue.type}] ${issue.description}`);
      }
    }
  } catch {
    console.warn("Could not parse validation response, continuing with insert");
  }

  // --- Clear existing graph data ---
  console.log("\nClearing existing knowledge graph data...");
  await supabase.from("knowledge_edges").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("knowledge_nodes").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // --- Embed all node content ---
  console.log("Embedding node content...");
  const nodeContents = nodes.map(n => n.content.slice(0, 8000)); // Voyage input limit
  const embeddings = await embedBatch(nodeContents);
  console.log(`Embedded ${embeddings.length} nodes`);

  // --- Insert nodes ---
  console.log("Inserting nodes...");
  const nodeIdMap = new Map<string, string>(); // slug -> uuid

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const { data, error } = await supabase
      .from("knowledge_nodes")
      .insert({
        slug: node.slug,
        title: node.title,
        node_type: node.node_type,
        content: node.content,
        aliases: node.aliases,
        embedding: JSON.stringify(embeddings[i]),
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  Failed to insert node "${node.slug}": ${error.message}`);
      continue;
    }
    nodeIdMap.set(node.slug, data.id);
  }
  console.log(`Inserted ${nodeIdMap.size} nodes`);

  // --- Insert edges ---
  console.log("Inserting edges...");
  let edgeCount = 0;

  const edgeBatch: {
    source_node: string;
    target_node: string | null;
    target_chunk: string | null;
    edge_type: string;
    weight: number;
    evidence: string;
  }[] = [];

  for (const edge of edges) {
    const sourceId = nodeIdMap.get(edge.source_slug);
    if (!sourceId) continue;

    let targetNodeId: string | null = null;
    let targetChunkId: string | null = null;

    if (edge.target_slug) {
      targetNodeId = nodeIdMap.get(edge.target_slug) ?? null;
      if (!targetNodeId) continue;
    } else if (edge.target_chunk_id) {
      targetChunkId = edge.target_chunk_id;
    } else {
      continue;
    }

    edgeBatch.push({
      source_node: sourceId,
      target_node: targetNodeId,
      target_chunk: targetChunkId,
      edge_type: edge.edge_type,
      weight: edge.weight,
      evidence: edge.evidence,
    });
  }

  // Insert in batches
  const insertBatchSize = 50;
  for (let i = 0; i < edgeBatch.length; i += insertBatchSize) {
    const batch = edgeBatch.slice(i, i + insertBatchSize);
    const { error } = await supabase.from("knowledge_edges").insert(batch);
    if (error) {
      console.error(`  Edge insert error at batch ${i}: ${error.message}`);
    } else {
      edgeCount += batch.length;
    }
  }
  console.log(`Inserted ${edgeCount} edges`);

  // --- Recompute centrality ---
  console.log("Computing centrality scores...");
  const { error: centralityError } = await supabase.rpc("recompute_centrality");
  if (centralityError) {
    console.error(`Centrality computation error: ${centralityError.message}`);
  } else {
    console.log("Centrality scores updated");
  }

  return { nodes, edges };
}
```

---

## Task 7: Obsidian Vault Output

**Goal:** Write vault files to `/Users/mark/boxing-coach/vault/` -- one .md per node with frontmatter + content + backlinks, organized in folders by type. Generate _MOC.md.

**Files:**
- Create `scripts/vault-generation/write-vault.ts`

### Steps

- [ ] **7.1** Create `scripts/vault-generation/write-vault.ts`:

```typescript
// scripts/vault-generation/write-vault.ts
// Write Obsidian-compatible vault files from synthesized nodes and edges
import { promises as fs } from "fs";
import path from "path";
import type { SynthesizedNode } from "./pass2-synthesize";
import type { DiscoveredEdge } from "./pass3-edges";

const VAULT_DIR = path.join(process.cwd(), "vault");

const TYPE_FOLDERS: Record<string, string> = {
  concept: "concepts",
  fighter: "fighters",
  technique: "techniques",
  phase: "phases",
  drill: "drills",
  injury_prevention: "injury-prevention",
};

function buildConnectionsSection(
  node: SynthesizedNode,
  edges: DiscoveredEdge[],
  nodesBySlug: Map<string, SynthesizedNode>
): string {
  const relevant = edges.filter(
    e => (e.source_slug === node.slug || e.target_slug === node.slug) && e.edge_type !== "SOURCED_FROM"
  );

  if (relevant.length === 0) return "";

  const lines: string[] = [];
  const edgePrefixes: Record<string, string> = {
    REQUIRES: "Requires",
    DEMONSTRATES: "Demonstrates",
    TRAINS: "Trains",
    CORRECTS: "Corrects",
    SEQUENCES: "Sequences to",
    RELATED: "See also",
  };

  for (const edge of relevant) {
    const otherSlug = edge.source_slug === node.slug ? edge.target_slug : edge.source_slug;
    if (!otherSlug) continue;
    const otherNode = nodesBySlug.get(otherSlug);
    if (!otherNode) continue;

    const prefix = edge.source_slug === node.slug
      ? edgePrefixes[edge.edge_type] ?? "Related"
      : `${edgePrefixes[edge.edge_type] ?? "Related"} (from)`;

    lines.push(`- ${prefix}: [[${otherNode.title}]] — ${edge.evidence}`);
  }

  return lines.join("\n");
}

function buildFrontmatter(
  node: SynthesizedNode,
  edges: DiscoveredEdge[]
): string {
  const sourceCount = edges.filter(
    e => e.source_slug === node.slug && e.edge_type === "SOURCED_FROM"
  ).length;

  const tags: string[] = [];
  // Extract tags from node type and connections
  if (node.node_type === "phase") tags.push("four-phases");
  if (node.node_type === "technique") tags.push("punch-mechanics");
  if (node.node_type === "drill") tags.push("training");

  return [
    "---",
    `type: ${node.node_type}`,
    `aliases: [${node.aliases.map(a => `"${a}"`).join(", ")}]`,
    `tags: [${tags.join(", ")}]`,
    `centrality: 0`,
    `sources: ${sourceCount}`,
    "---",
  ].join("\n");
}

export async function writeVaultFiles(
  nodes: SynthesizedNode[],
  edges: DiscoveredEdge[]
): Promise<void> {
  console.log("=== Writing Vault Files ===\n");

  // Create directory structure
  const folders = new Set(Object.values(TYPE_FOLDERS));
  for (const folder of folders) {
    await fs.mkdir(path.join(VAULT_DIR, folder), { recursive: true });
  }

  const nodesBySlug = new Map(nodes.map(n => [n.slug, n]));

  // Write each node as a .md file
  for (const node of nodes) {
    const folder = TYPE_FOLDERS[node.node_type] ?? "concepts";
    const frontmatter = buildFrontmatter(node, edges);
    const connections = buildConnectionsSection(node, edges, nodesBySlug);

    // Replace the empty Connections section in content with discovered connections
    let content = node.content;
    const connectionsPattern = /## Connections\n[\s\S]*?(?=\n## |$)/;
    if (connections && connectionsPattern.test(content)) {
      content = content.replace(connectionsPattern, `## Connections\n${connections}`);
    } else if (connections) {
      // Append before ## Sources if it exists, otherwise at end
      const sourcesIdx = content.indexOf("## Sources");
      if (sourcesIdx !== -1) {
        content = content.slice(0, sourcesIdx) + `## Connections\n${connections}\n\n` + content.slice(sourcesIdx);
      } else {
        content += `\n\n## Connections\n${connections}`;
      }
    }

    const fileContent = `${frontmatter}\n\n${content}\n`;
    const filePath = path.join(VAULT_DIR, folder, `${node.slug}.md`);
    await fs.writeFile(filePath, fileContent, "utf-8");
  }

  console.log(`Wrote ${nodes.length} node files`);

  // Write _MOC.md
  const grouped: Record<string, SynthesizedNode[]> = {};
  for (const node of nodes) {
    const group = node.node_type;
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(node);
  }

  const mocSections: string[] = [
    "# Punch Doctor Knowledge Base\n",
    "Welcome to Dr. Alex Wiant's Power Punching methodology, organized as an interconnected knowledge system.\n",
  ];

  const sectionConfig: { type: string; heading: string }[] = [
    { type: "concept", heading: "Core Concepts" },
    { type: "phase", heading: "The Four Phases" },
    { type: "technique", heading: "Punch Mechanics" },
    { type: "fighter", heading: "Fighter Analyses" },
    { type: "drill", heading: "Training & Drills" },
    { type: "injury_prevention", heading: "Injury Prevention" },
  ];

  for (const { type, heading } of sectionConfig) {
    const typeNodes = grouped[type] ?? [];
    if (typeNodes.length === 0) continue;

    mocSections.push(`## ${heading}`);
    if (type === "phase") {
      // Special formatting for phases — show sequence
      const sorted = typeNodes.sort((a, b) => a.slug.localeCompare(b.slug));
      mocSections.push(sorted.map(n => `[[${n.title}]]`).join(" → "));
    } else {
      mocSections.push(typeNodes.map(n => `- [[${n.title}]]`).join("\n"));
    }
    mocSections.push("");
  }

  await fs.writeFile(path.join(VAULT_DIR, "_MOC.md"), mocSections.join("\n"), "utf-8");
  console.log("Wrote _MOC.md");
}
```

---

## Task 8: Vault-to-DB Sync

**Goal:** `npm run vault-to-db` script that parses vault .md files, extracts frontmatter + backlinks, diffs against DB, updates changed nodes/edges, re-embeds changed content, recomputes centrality.

**Files:**
- Create `scripts/vault-to-db.ts`

### Steps

- [ ] **8.1** Create `scripts/vault-to-db.ts`:

```typescript
// scripts/vault-to-db.ts
// Sync Obsidian vault edits back to Supabase — parse .md files, diff, update
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VAULT_DIR = path.join(process.cwd(), "vault");
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

interface VaultNode {
  slug: string;
  title: string;
  node_type: string;
  aliases: string[];
  content: string; // content without frontmatter
  backlinks: string[]; // titles extracted from [[...]]
  filePath: string;
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content: raw };

  const fm: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // Parse arrays like [a, b, c]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map(s => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    fm[key] = value;
  }
  return { frontmatter: fm, content: match[2].trim() };
}

function extractBacklinks(content: string): string[] {
  const regex = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const link = match[1].trim();
    // Skip source chunk links
    if (!link.startsWith("src/")) {
      links.push(link);
    }
  }
  return [...new Set(links)];
}

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text.slice(0, 8000)], model: "voyage-3-lite" }),
  });
  if (!res.ok) throw new Error(`Voyage error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function loadVaultFiles(): Promise<VaultNode[]> {
  const nodes: VaultNode[] = [];
  const typeFolders = ["concepts", "fighters", "techniques", "phases", "drills", "injury-prevention"];
  const folderToType: Record<string, string> = {
    concepts: "concept",
    fighters: "fighter",
    techniques: "technique",
    phases: "phase",
    drills: "drill",
    "injury-prevention": "injury_prevention",
  };

  for (const folder of typeFolders) {
    const dir = path.join(VAULT_DIR, folder);
    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter(f => f.endsWith(".md"));
    } catch {
      continue;
    }

    for (const file of files) {
      const raw = await fs.readFile(path.join(dir, file), "utf-8");
      const { frontmatter, content } = parseFrontmatter(raw);
      const titleMatch = content.match(/^# (.+)/m);
      const slug = file.replace(".md", "");

      nodes.push({
        slug,
        title: titleMatch?.[1] ?? slug,
        node_type: (frontmatter.type as string) ?? folderToType[folder] ?? "concept",
        aliases: (frontmatter.aliases as string[]) ?? [],
        content,
        backlinks: extractBacklinks(content),
        filePath: path.join(dir, file),
      });
    }
  }
  return nodes;
}

async function main() {
  console.log("=== Vault → DB Sync ===\n");

  // Load vault files
  const vaultNodes = await loadVaultFiles();
  console.log(`Loaded ${vaultNodes.length} vault files\n`);

  // Load current DB state
  const { data: dbNodes } = await supabase
    .from("knowledge_nodes")
    .select("id, slug, title, content, aliases, updated_at");

  const dbNodeMap = new Map(
    (dbNodes ?? []).map(n => [n.slug, n])
  );

  // Diff and update
  let updated = 0;
  let created = 0;
  const changedSlugs: string[] = [];

  for (const vault of vaultNodes) {
    const existing = dbNodeMap.get(vault.slug);

    if (!existing) {
      // New node — insert
      console.log(`  CREATE: ${vault.slug}`);
      const embedding = await embedText(vault.content);
      const { error } = await supabase.from("knowledge_nodes").insert({
        slug: vault.slug,
        title: vault.title,
        node_type: vault.node_type,
        content: vault.content,
        aliases: vault.aliases,
        embedding: JSON.stringify(embedding),
      });
      if (error) console.error(`    Error: ${error.message}`);
      else created++;
      changedSlugs.push(vault.slug);
    } else if (existing.content !== vault.content || JSON.stringify(existing.aliases) !== JSON.stringify(vault.aliases)) {
      // Changed — update + re-embed
      console.log(`  UPDATE: ${vault.slug}`);
      const embedding = await embedText(vault.content);
      const { error } = await supabase
        .from("knowledge_nodes")
        .update({
          title: vault.title,
          content: vault.content,
          aliases: vault.aliases,
          embedding: JSON.stringify(embedding),
          updated_at: new Date().toISOString(),
        })
        .eq("slug", vault.slug);
      if (error) console.error(`    Error: ${error.message}`);
      else updated++;
      changedSlugs.push(vault.slug);
    }
  }

  console.log(`\nCreated: ${created}, Updated: ${updated}, Unchanged: ${vaultNodes.length - created - updated}`);

  // Recompute centrality if anything changed
  if (changedSlugs.length > 0) {
    console.log("\nRecomputing centrality...");
    const { error } = await supabase.rpc("recompute_centrality");
    if (error) console.error(`Centrality error: ${error.message}`);
    else console.log("Centrality updated");
  }

  console.log("\n=== Sync complete ===");
}

main().catch(console.error);
```

---

## Task 9: Graph-Enhanced RAG Module

**Goal:** New `src/lib/graph-rag.ts` with query decomposition, HyDE, graph search, Cohere Rerank, and full retrieval pipeline. Must return `RetrievedChunk[]` and `SourceCitation[]` for backward compatibility.

**Files:**
- Create `src/lib/graph-rag.ts`

### Steps

- [ ] **9.1** Create `src/lib/graph-rag.ts`:

```typescript
// src/lib/graph-rag.ts
// Graph-enhanced RAG: decompose → HyDE → parallel (vector + graph) → merge → Cohere Rerank
import Anthropic from "@anthropic-ai/sdk";
import { CohereClientV2 } from "cohere-ai";
import { createServerClient } from "./supabase";
import { embedText } from "./voyage";
import type { RetrievedChunk, SourceCitation } from "./rag";
import { extractCitations } from "./rag";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });

// --- Types ---

interface SubQuery {
  query: string;
  keywords: string[];
}

interface GraphResult {
  item_type: "node" | "chunk";
  item_id: string;
  content: string;
  title: string | null;
  node_type: string | null;
  video_url: string | null;
  hop_distance: number;
  edge_weight: number;
  node_centrality: number;
  graph_score: number;
}

interface MergedCandidate {
  id: string;
  content: string;
  source: "vector" | "graph" | "both";
  item_type: "node" | "chunk";
  title: string | null;
  node_type: string | null;
  video_url: string | null;
  similarity: number;
  graph_score: number;
  // Original chunk fields for backward compat
  source_type?: "pdf" | "transcript";
  video_id?: string | null;
  video_title?: string | null;
  pdf_file?: string | null;
  techniques?: string[];
  fighters?: string[];
  category?: string;
}

// --- Query Decomposition ---

export async function decomposeQuery(query: string): Promise<SubQuery[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `Decompose a boxing-related query into 2-3 focused sub-queries for retrieval. For each sub-query, extract keywords (proper nouns, technique names, key terms) for graph entry point matching.

Return JSON array. No markdown fencing.
[{"query": "...", "keywords": ["...", "..."]}]

Rules:
- Each sub-query should target a different aspect of the question
- Keywords should be specific terms that would match knowledge graph node titles
- Include fighter names, technique names, and concept terms as keywords
- 2 sub-queries for simple questions, 3 for complex ones`,
    messages: [{ role: "user", content: query }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  let jsonStr = text;
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) jsonStr = match[1].trim();

  try {
    return JSON.parse(jsonStr) as SubQuery[];
  } catch {
    // Fallback: single sub-query
    return [{ query, keywords: query.split(" ").filter(w => w.length > 3) }];
  }
}

// --- HyDE (Hypothetical Document Embedding) ---

export async function generateHypothesis(query: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    system: `Generate a short hypothetical answer (~100 words) to a boxing technique question, as if you were Dr. Alex Wiant explaining his methodology. Use specific terminology: kinetic chains, phases, hip opening/closing, shearing force, throw vs push. This hypothetical will be used for embedding-based retrieval, so include relevant technical terms.`,
    messages: [{ role: "user", content: query }],
  });

  return response.content[0].type === "text" ? response.content[0].text : query;
}

// --- Graph Search ---

export async function searchGraph(
  queryEmbedding: number[],
  keywords: string[],
  maxHops: number = 2,
  maxResults: number = 20
): Promise<GraphResult[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("search_graph", {
    query_embedding: queryEmbedding,
    entry_keywords: keywords,
    max_hops: maxHops,
    max_results: maxResults,
  });

  if (error) {
    console.error("Graph search error:", error);
    return [];
  }

  return (data ?? []) as GraphResult[];
}

// --- Cohere Rerank ---

export async function rerankResults(
  query: string,
  candidates: MergedCandidate[],
  topK: number = 12
): Promise<MergedCandidate[]> {
  if (candidates.length === 0) return [];
  if (candidates.length <= topK) return candidates;

  try {
    const response = await cohere.rerank({
      model: "rerank-v3.5",
      query,
      documents: candidates.map(c => ({
        text: c.content.slice(0, 4096), // Cohere input limit
      })),
      topN: topK,
    });

    return response.results.map(r => candidates[r.index]);
  } catch (error) {
    console.error("Cohere rerank error, falling back to score-based ranking:", error);
    // Fallback: sort by combined score
    return candidates
      .sort((a, b) => {
        const scoreA = a.similarity * 0.5 + a.graph_score * 0.5;
        const scoreB = b.similarity * 0.5 + b.graph_score * 0.5;
        return scoreB - scoreA;
      })
      .slice(0, topK);
  }
}

// --- Full Pipeline ---

export async function retrieveContext(
  query: string,
  options: {
    count?: number;
    categories?: string[];
  } = {}
): Promise<{ chunks: RetrievedChunk[]; citations: SourceCitation[] }> {
  const { count = 12, categories } = options;
  const supabase = createServerClient();

  // Step 1: Decompose query
  const subQueries = await decomposeQuery(query);

  // Step 2: For each sub-query, run HyDE vector search + graph search in parallel
  const allCandidates = new Map<string, MergedCandidate>();

  await Promise.all(
    subQueries.map(async (sq) => {
      // HyDE: generate hypothesis → embed → vector search
      const [hypothesis, graphEmbedding] = await Promise.all([
        generateHypothesis(sq.query),
        embedText(sq.query),
      ]);

      const hydeEmbedding = await embedText(hypothesis);

      // Parallel: vector search + graph search
      const [vectorResults, graphResults] = await Promise.all([
        supabase.rpc("match_chunks", {
          query_embedding: hydeEmbedding,
          match_count: 10,
          filter_categories: categories ?? null,
        }),
        searchGraph(graphEmbedding, sq.keywords, 2, 15),
      ]);

      // Merge vector results
      for (const chunk of (vectorResults.data ?? []) as RetrievedChunk[]) {
        const key = `chunk:${(chunk as RetrievedChunk & { id?: string }).id ?? chunk.content.slice(0, 50)}`;
        const existing = allCandidates.get(key);
        if (existing) {
          existing.source = "both";
          existing.similarity = Math.max(existing.similarity, chunk.similarity);
        } else {
          allCandidates.set(key, {
            id: key,
            content: chunk.content,
            source: "vector",
            item_type: "chunk",
            title: chunk.video_title,
            node_type: null,
            video_url: chunk.video_url,
            similarity: chunk.similarity,
            graph_score: 0,
            source_type: chunk.source_type,
            video_id: chunk.video_id,
            video_title: chunk.video_title,
            pdf_file: chunk.pdf_file,
            techniques: chunk.techniques,
            fighters: chunk.fighters,
            category: chunk.category,
          });
        }
      }

      // Merge graph results
      for (const gr of graphResults) {
        const key = `${gr.item_type}:${gr.item_id}`;
        const existing = allCandidates.get(key);
        if (existing) {
          existing.source = "both";
          existing.graph_score = Math.max(existing.graph_score, gr.graph_score);
        } else {
          allCandidates.set(key, {
            id: key,
            content: gr.content,
            source: "graph",
            item_type: gr.item_type,
            title: gr.title,
            node_type: gr.node_type,
            video_url: gr.video_url,
            similarity: 0,
            graph_score: gr.graph_score,
            // Chunk fields populated for chunk-type graph results
            source_type: gr.video_url ? "transcript" : "pdf",
            video_id: null,
            video_title: gr.title,
            pdf_file: null,
            techniques: [],
            fighters: [],
            category: gr.node_type ?? "theory",
          });
        }
      }
    })
  );

  // Step 3: Rerank all candidates
  const candidates = Array.from(allCandidates.values());
  const reranked = await rerankResults(query, candidates, count);

  // Step 4: Convert to RetrievedChunk[] for backward compatibility
  const chunks: RetrievedChunk[] = reranked.map(c => ({
    content: c.content,
    source_type: c.source_type ?? "transcript",
    video_id: c.video_id ?? null,
    video_title: c.video_title ?? c.title ?? null,
    video_url: c.video_url ?? null,
    pdf_file: c.pdf_file ?? null,
    techniques: c.techniques ?? [],
    fighters: c.fighters ?? [],
    category: c.category ?? "theory",
    similarity: Math.max(c.similarity, c.graph_score),
  }));

  const citations = extractCitations(chunks);

  return { chunks, citations };
}

// --- Context Formatter (enhanced with concept summaries) ---

export function formatContextForPrompt(
  candidates: RetrievedChunk[],
  conceptSummaries?: { title: string; summary: string }[]
): string {
  let output = "";

  // Add concept summaries first for richer context
  if (conceptSummaries && conceptSummaries.length > 0) {
    output += "=== CONCEPT SUMMARIES ===\n\n";
    for (const cs of conceptSummaries) {
      output += `[Concept: ${cs.title}]\n${cs.summary}\n\n`;
    }
    output += "=== SOURCE EVIDENCE ===\n\n";
  }

  output += candidates
    .map((chunk) => {
      const source =
        chunk.source_type === "transcript"
          ? `[Video: ${chunk.video_title} | ${chunk.video_url}]`
          : `[Course: ${chunk.pdf_file}]`;
      return `${source}\n${chunk.content}`;
    })
    .join("\n\n---\n\n");

  return output;
}
```

---

## Task 10: Update API Routes

**Goal:** Replace `retrieveChunks()` calls with `retrieveContext()` in chat, video-review, and style-finder routes. Update context formatting to include concept summaries + edge evidence.

**Files:**
- Modify `src/app/api/chat/route.ts`
- Modify `src/app/api/video-review/route.ts`
- Modify `src/app/api/style-finder/route.ts`

### Steps

- [ ] **10.1** Update `src/app/api/chat/route.ts` -- replace the RAG call (lines 69-75 of current file):

Replace:
```typescript
import { retrieveChunks, formatChunksForPrompt, extractCitations } from "@/lib/rag";
```
With:
```typescript
import { retrieveContext, formatContextForPrompt } from "@/lib/graph-rag";
import { extractCitations } from "@/lib/rag";
```

Replace lines 69-75:
```typescript
    const chunks = await retrieveChunks(lastUserMessage.content, {
      count: 10,
      categories,
    });

    const contextText = formatChunksForPrompt(chunks);
    const citations = extractCitations(chunks);
```
With:
```typescript
    const { chunks, citations } = await retrieveContext(lastUserMessage.content, {
      count: 12,
      categories,
    });

    const contextText = formatContextForPrompt(chunks);
```

- [ ] **10.2** Update `src/app/api/video-review/route.ts` -- replace the RAG import and calls:

Replace:
```typescript
import { retrieveChunks, formatChunksForPrompt, extractCitations, type SourceCitation } from "@/lib/rag";
```
With:
```typescript
import { retrieveContext, formatContextForPrompt } from "@/lib/graph-rag";
import { type SourceCitation } from "@/lib/rag";
```

Replace lines 112-129 (the RAG grounding section):
```typescript
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
```
With:
```typescript
      const combinedQuery = searchQueries.slice(0, 3).join(". ");
      const { chunks: ragChunks, citations: ragCitations } = await retrieveContext(
        combinedQuery,
        { count: 8 }
      );

      citations = ragCitations;
      const ragContext = formatContextForPrompt(ragChunks);
```

Remove the now-unused `allChunks` and `seenIds` variables.

- [ ] **10.3** Update `src/app/api/style-finder/route.ts` -- replace the RAG import and calls:

Replace:
```typescript
import { retrieveChunks, formatChunksForPrompt, extractCitations } from "@/lib/rag";
```
With:
```typescript
import { retrieveContext, formatContextForPrompt } from "@/lib/graph-rag";
```

Replace lines 54-60:
```typescript
    const chunks = await retrieveChunks(searchQuery, {
      count: 8,
      categories: ["analysis", "mechanics"],
    });

    const ragContext = formatChunksForPrompt(chunks);
    const citations = extractCitations(chunks);
```
With:
```typescript
    const { chunks, citations } = await retrieveContext(searchQuery, {
      count: 8,
      categories: ["analysis", "mechanics"],
    });

    const ragContext = formatContextForPrompt(chunks);
```

---

## Task 11: Query Logging

**Goal:** Add logging to chat route: store query, sub-queries, retrieved IDs, response preview in `query_logs` table.

**Files:**
- Modify `src/app/api/chat/route.ts` (add logging after response)
- Modify `src/lib/graph-rag.ts` (return sub-queries and IDs from retrieveContext)

### Steps

- [ ] **11.1** Update the `retrieveContext` return type in `src/lib/graph-rag.ts` to also return metadata needed for logging. Add a new return field:

```typescript
export async function retrieveContext(
  query: string,
  options: {
    count?: number;
    categories?: string[];
  } = {}
): Promise<{
  chunks: RetrievedChunk[];
  citations: SourceCitation[];
  meta: {
    subQueries: string[];
    retrievedNodeIds: string[];
    retrievedChunkIds: string[];
  };
}> {
```

At the end of the function, before the return statement, compute the meta:

```typescript
  const meta = {
    subQueries: subQueries.map(sq => sq.query),
    retrievedNodeIds: reranked
      .filter(c => c.item_type === "node")
      .map(c => c.id.replace("node:", "")),
    retrievedChunkIds: reranked
      .filter(c => c.item_type === "chunk")
      .map(c => c.id.replace("chunk:", "")),
  };

  return { chunks, citations, meta };
```

- [ ] **11.2** Add logging to `src/app/api/chat/route.ts` after the Claude response (after line 96 in current file). Insert before the return statement:

```typescript
    // Log query for analysis (fire-and-forget, don't block response)
    const supabaseForLog = (await import("@/lib/supabase")).createServerClient();
    supabaseForLog
      .from("query_logs")
      .insert({
        query: lastUserMessage.content,
        context: context ?? null,
        sub_queries: result.meta.subQueries,
        retrieved_node_ids: result.meta.retrievedNodeIds,
        retrieved_chunk_ids: result.meta.retrievedChunkIds,
        response_preview: content.slice(0, 500),
      })
      .then(({ error }) => {
        if (error) console.error("Query log error:", error.message);
      });
```

Note: Update the `retrieveContext` call to capture the full result:

```typescript
    const result = await retrieveContext(lastUserMessage.content, {
      count: 12,
      categories,
    });
    const { chunks, citations } = result;
```

---

## Task 12: Eval Suite

**Goal:** `npm run eval` script with 20+ test queries, expected retrieval targets, recall/precision scoring.

**Files:**
- Create `scripts/eval.ts`

### Steps

- [ ] **12.1** Create `scripts/eval.ts`:

```typescript
// scripts/eval.ts
// Eval suite: test retrieval quality with expected targets
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Manually construct what retrieveContext does, since we can't import from src/lib in scripts
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-3-lite" }),
  });
  if (!res.ok) throw new Error(`Voyage error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

interface TestCase {
  query: string;
  mustRetrieveNodes: string[]; // node slugs that must appear
  mustRetrieveKeywords: string[]; // keywords that must appear in retrieved content
  mustNotRetrieveKeywords: string[]; // keywords that must NOT appear
}

const TEST_CASES: TestCase[] = [
  {
    query: "How does Canelo generate power in his jab?",
    mustRetrieveNodes: ["canelo-alvarez", "jab-mechanics"],
    mustRetrieveKeywords: ["canelo", "jab", "hip"],
    mustNotRetrieveKeywords: ["shoulder stability", "neck training"],
  },
  {
    query: "What drill helps with hip rotation?",
    mustRetrieveNodes: ["hip-opening-drill"],
    mustRetrieveKeywords: ["hip", "drill", "rotation"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "What's wrong with push punching?",
    mustRetrieveNodes: ["throw-vs-push"],
    mustRetrieveKeywords: ["push", "throw", "rotational"],
    mustNotRetrieveKeywords: ["hand wrapping"],
  },
  {
    query: "How does Beterbiev generate power?",
    mustRetrieveNodes: ["beterbiev"],
    mustRetrieveKeywords: ["beterbiev", "power", "kinetic"],
    mustNotRetrieveKeywords: ["neck training"],
  },
  {
    query: "Explain the four phases of a punch",
    mustRetrieveNodes: ["phase-1-loading", "phase-2-hip-explosion"],
    mustRetrieveKeywords: ["phase", "loading", "hip"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "How do kinetic chains work in boxing?",
    mustRetrieveNodes: ["kinetic-chains"],
    mustRetrieveKeywords: ["kinetic", "chain", "spiral"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "What is shearing force and why does it matter?",
    mustRetrieveNodes: ["shearing-force"],
    mustRetrieveKeywords: ["shearing", "knuckle"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "How should I throw a left hook?",
    mustRetrieveNodes: ["left-hook"],
    mustRetrieveKeywords: ["hook", "hip opening"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "What can I learn from GGG's style?",
    mustRetrieveNodes: ["ggg"],
    mustRetrieveKeywords: ["ggg", "golovkin"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "How do I prevent shoulder injuries in boxing?",
    mustRetrieveNodes: ["rotator-cuff-warm-up"],
    mustRetrieveKeywords: ["shoulder", "rotator", "warm"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "What's the difference between hip opening and hip closing?",
    mustRetrieveNodes: ["phase-2-hip-explosion"],
    mustRetrieveKeywords: ["hip opening", "hip closing", "jab", "straight"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "How does Mike Tyson generate knockout power?",
    mustRetrieveNodes: ["mike-tyson"],
    mustRetrieveKeywords: ["tyson", "power"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "What exercises build punching power?",
    mustRetrieveNodes: [],
    mustRetrieveKeywords: ["drill", "exercise", "power"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "Why should I land with the last three knuckles?",
    mustRetrieveNodes: ["shearing-force"],
    mustRetrieveKeywords: ["knuckle", "shearing", "ring finger"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "How does Mayweather use defensive technique?",
    mustRetrieveNodes: ["mayweather"],
    mustRetrieveKeywords: ["mayweather"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "What is the medicine ball throw drill?",
    mustRetrieveNodes: ["medicine-ball-throw"],
    mustRetrieveKeywords: ["medicine ball"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "How does the straight right hand work?",
    mustRetrieveNodes: ["straight-punch"],
    mustRetrieveKeywords: ["straight", "hip closing"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "What is proper boxing stance?",
    mustRetrieveNodes: ["stance"],
    mustRetrieveKeywords: ["stance", "width", "center of gravity"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "How does Crawford throw combinations?",
    mustRetrieveNodes: ["crawford"],
    mustRetrieveKeywords: ["crawford"],
    mustNotRetrieveKeywords: [],
  },
  {
    query: "What role does breathing play in punching?",
    mustRetrieveNodes: [],
    mustRetrieveKeywords: ["breathing", "intra-abdominal"],
    mustNotRetrieveKeywords: [],
  },
];

interface EvalResult {
  query: string;
  nodeRecall: number;
  keywordRecall: number;
  noFalsePositives: boolean;
  pass: boolean;
  details: string;
}

async function runEval(): Promise<void> {
  console.log("=== Punch Doctor AI — Eval Suite ===\n");
  console.log(`Running ${TEST_CASES.length} test cases...\n`);

  const results: EvalResult[] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`[${i + 1}/${TEST_CASES.length}] "${tc.query}"`);

    try {
      // Run vector search on query
      const queryEmbedding = await embedText(tc.query);

      // Vector search
      const { data: vectorResults } = await supabase.rpc("match_chunks", {
        query_embedding: queryEmbedding,
        match_count: 12,
        filter_categories: null,
      });

      // Graph search
      const keywords = tc.query.split(" ").filter(w => w.length > 3);
      const { data: graphResults } = await supabase.rpc("search_graph", {
        query_embedding: queryEmbedding,
        entry_keywords: keywords,
        max_hops: 2,
        max_results: 15,
      });

      const allContent = [
        ...(vectorResults ?? []).map((r: { content: string }) => r.content),
        ...(graphResults ?? []).map((r: { content: string }) => r.content),
      ].join(" ").toLowerCase();

      const retrievedNodeSlugs = (graphResults ?? [])
        .filter((r: { item_type: string }) => r.item_type === "node")
        .map((r: { title: string }) => r.title?.toLowerCase().replace(/\s+/g, "-") ?? "");

      // Check node recall
      const foundNodes = tc.mustRetrieveNodes.filter(slug =>
        retrievedNodeSlugs.some((rs: string) => rs.includes(slug) || slug.includes(rs))
      );
      const nodeRecall = tc.mustRetrieveNodes.length > 0
        ? foundNodes.length / tc.mustRetrieveNodes.length
        : 1;

      // Check keyword recall
      const foundKeywords = tc.mustRetrieveKeywords.filter(kw =>
        allContent.includes(kw.toLowerCase())
      );
      const keywordRecall = tc.mustRetrieveKeywords.length > 0
        ? foundKeywords.length / tc.mustRetrieveKeywords.length
        : 1;

      // Check false positives
      const falsePositives = tc.mustNotRetrieveKeywords.filter(kw =>
        allContent.includes(kw.toLowerCase())
      );
      const noFalsePositives = falsePositives.length === 0;

      const pass = nodeRecall >= 0.8 && keywordRecall >= 0.8 && noFalsePositives;

      const details = [
        `Nodes: ${foundNodes.length}/${tc.mustRetrieveNodes.length}`,
        `Keywords: ${foundKeywords.length}/${tc.mustRetrieveKeywords.length}`,
        falsePositives.length > 0 ? `FALSE POSITIVES: ${falsePositives.join(", ")}` : "",
      ].filter(Boolean).join(" | ");

      results.push({ query: tc.query, nodeRecall, keywordRecall, noFalsePositives, pass, details });
      console.log(`  ${pass ? "PASS" : "FAIL"} — ${details}`);
    } catch (error) {
      console.error(`  ERROR: ${error}`);
      results.push({
        query: tc.query,
        nodeRecall: 0,
        keywordRecall: 0,
        noFalsePositives: true,
        pass: false,
        details: `Error: ${error}`,
      });
    }

    // Rate limiting
    if (i < TEST_CASES.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Summary
  const passing = results.filter(r => r.pass).length;
  const failing = results.filter(r => !r.pass).length;
  const avgNodeRecall = results.reduce((sum, r) => sum + r.nodeRecall, 0) / results.length;
  const avgKeywordRecall = results.reduce((sum, r) => sum + r.keywordRecall, 0) / results.length;

  console.log("\n=== EVAL RESULTS ===");
  console.log(`Pass: ${passing}/${results.length} (${((passing / results.length) * 100).toFixed(1)}%)`);
  console.log(`Fail: ${failing}/${results.length}`);
  console.log(`Avg Node Recall: ${(avgNodeRecall * 100).toFixed(1)}%`);
  console.log(`Avg Keyword Recall: ${(avgKeywordRecall * 100).toFixed(1)}%`);

  if (failing > 0) {
    console.log("\nFailing cases:");
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  "${r.query}" — ${r.details}`);
    }
  }
}

runEval().catch(console.error);
```

---

## Task 13: Incremental Pipeline

**Goal:** Extend ingest.ts: after chunking new content, identify related nodes, create SOURCED_FROM edges, optionally create new nodes, update vault files.

**Files:**
- Modify `scripts/ingest.ts` (add post-ingest graph integration)

### Steps

- [ ] **13.1** Add the following function at the end of `scripts/ingest.ts`, before the `main()` function:

```typescript
async function integrateWithGraph(newChunks: RawChunk[]): Promise<void> {
  console.log("\n5. Integrating new chunks with knowledge graph...");

  // Check if knowledge_nodes table has data
  const { count } = await supabase
    .from("knowledge_nodes")
    .select("id", { count: "exact", head: true });

  if (!count || count === 0) {
    console.log("  No knowledge graph found, skipping integration");
    return;
  }

  // For each new chunk, find related nodes and create SOURCED_FROM edges
  const { data: nodes } = await supabase
    .from("knowledge_nodes")
    .select("id, slug, title, aliases");

  if (!nodes || nodes.length === 0) return;

  for (const chunk of newChunks) {
    const chunkContent = chunk.content.toLowerCase();

    // Find nodes whose title or aliases appear in the chunk
    const relatedNodes = nodes.filter(node => {
      const terms = [node.title.toLowerCase(), ...(node.aliases ?? []).map((a: string) => a.toLowerCase())];
      return terms.some(term => chunkContent.includes(term));
    });

    if (relatedNodes.length === 0) continue;

    // Get the chunk's DB id
    const { data: dbChunks } = await supabase
      .from("content_chunks")
      .select("id")
      .eq("content", chunk.content)
      .limit(1);

    if (!dbChunks || dbChunks.length === 0) continue;
    const chunkId = dbChunks[0].id;

    // Create SOURCED_FROM edges
    for (const node of relatedNodes) {
      const { error } = await supabase.from("knowledge_edges").insert({
        source_node: node.id,
        target_chunk: chunkId,
        edge_type: "SOURCED_FROM",
        weight: 0.8,
        evidence: `New content chunk mentions "${node.title}"`,
      });
      if (!error) {
        console.log(`  Linked chunk → ${node.slug}`);
      }
    }
  }

  // Recompute centrality
  const { error } = await supabase.rpc("recompute_centrality");
  if (error) console.error("  Centrality error:", error.message);
  else console.log("  Centrality scores updated");
}
```

- [ ] **13.2** Update the `main()` function in `scripts/ingest.ts` to call `integrateWithGraph` after upsert:

Add after the upsert step:

```typescript
  // Step 5: Integrate with knowledge graph (if it exists)
  await integrateWithGraph(allChunks);
```

---

## Task 14: Run Generation + Build Verification

**Goal:** Execute the full vault generation pipeline, verify data in Supabase, test all 4 app tabs, run eval suite, npm run build.

### Steps

- [ ] **14.1** Run the vault generation pipeline:

```bash
npm run generate-vault
```

Expected output: ~60-80 nodes, 200+ edges, vault files written to `/Users/mark/boxing-coach/vault/`.

- [ ] **14.2** Verify data in Supabase:

```bash
npx supabase db query --linked -c "SELECT node_type, COUNT(*) FROM knowledge_nodes GROUP BY node_type ORDER BY node_type;"
npx supabase db query --linked -c "SELECT edge_type, COUNT(*) FROM knowledge_edges GROUP BY edge_type ORDER BY edge_type;"
npx supabase db query --linked -c "SELECT COUNT(*) FROM knowledge_nodes WHERE centrality > 0;"
npx supabase db query --linked -c "SELECT COUNT(*) FROM knowledge_nodes WHERE embedding IS NOT NULL;"
```

- [ ] **14.3** Open the vault in Obsidian and verify:
  - Graph view shows meaningful connections
  - Spot-check 5 concept notes for accuracy
  - Backlinks resolve correctly

- [ ] **14.4** Run the eval suite:

```bash
npm run eval
```

Target: >80% recall on all test cases.

- [ ] **14.5** Test the app end-to-end:

```bash
npm run dev
```

Test each tab:
1. Chat: Ask "How does Canelo generate power in his jab?" — verify answer cites videos and references connected concepts
2. Video Review: Upload a test video — verify coaching advice is grounded
3. Style Finder: Complete the questionnaire — verify fighter recommendations cite specific analyses
4. Drills: Ask about training — verify drill recommendations

- [ ] **14.6** Build verification:

```bash
npm run build
```

Must pass with zero errors.

- [ ] **14.7** Test vault-to-db sync:

```bash
# Make a small edit to a vault file, then:
npm run vault-to-db
```

Verify the DB reflects the change.

---

## File Manifest

| File | Action | Task |
|------|--------|------|
| `supabase/migrations/002_knowledge_graph.sql` | Create | 1 |
| `package.json` | Modify | 2 |
| `scripts/generate-vault.ts` | Create | 3 |
| `scripts/vault-generation/pass1-extract.ts` | Create | 3 |
| `scripts/vault-generation/pass2-synthesize.ts` | Create | 4 |
| `scripts/vault-generation/pass3-edges.ts` | Create | 5 |
| `scripts/vault-generation/pass4-validate.ts` | Create | 6 |
| `scripts/vault-generation/write-vault.ts` | Create | 7 |
| `scripts/vault-to-db.ts` | Create | 8 |
| `src/lib/graph-rag.ts` | Create | 9 |
| `src/app/api/chat/route.ts` | Modify | 10, 11 |
| `src/app/api/video-review/route.ts` | Modify | 10 |
| `src/app/api/style-finder/route.ts` | Modify | 10 |
| `scripts/ingest.ts` | Modify | 13 |
| `scripts/eval.ts` | Create | 12 |

---

### Critical Files for Implementation
- `/Users/mark/boxing-coach/supabase/migrations/002_knowledge_graph.sql`
- `/Users/mark/boxing-coach/src/lib/graph-rag.ts`
- `/Users/mark/boxing-coach/scripts/generate-vault.ts`
- `/Users/mark/boxing-coach/scripts/vault-generation/pass4-validate.ts`
- `/Users/mark/boxing-coach/src/app/api/chat/route.ts`