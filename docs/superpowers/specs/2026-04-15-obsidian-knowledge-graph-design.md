# Obsidian Knowledge Graph — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Goal:** Transform flat RAG chunks into an Obsidian-style knowledge graph with interconnected concept notes, typed edges, and graph-enhanced retrieval that produces significantly more accurate, grounded answers.

## Context

The Punch Doctor AI has a working v1 RAG pipeline: 254 content chunks (15 PDF + 239 transcript) embedded via Voyage AI and stored in Supabase pgvector. Vector search retrieves the top-10 most similar chunks for each query. This works, but answers lack depth — vector search finds surface-level matches but misses connected concepts that would make answers richer and more accurate.

The knowledge graph adds a second retrieval dimension: following concept connections to pull in related context the vector search alone would miss.

## Architecture Overview

```
Two-layer knowledge system:

Knowledge Layer (~60-80 concept notes)
  - Synthesized, structured notes on concepts, fighters, techniques, drills, phases
  - Dense backlinks between notes (typed edges with evidence)
  - Stored in Supabase knowledge_nodes + knowledge_edges tables
  - Mirrored as an Obsidian vault Alex can browse and edit

Evidence Layer (254 source chunks)
  - Original transcript/course content (already in content_chunks)
  - Linked from concept notes via SOURCED_FROM edges
  - Preserves Alex's exact voice and citations

Retrieval: parallel merge
  - Vector search (existing) + graph traversal (new) + query decomposition + HyDE
  - Cross-encoder reranking (Cohere Rerank)
  - Top 12 results → Claude with rich, connected context
```

## 1. Data Model

### knowledge_nodes

Each node is a synthesized concept note — everything Alex teaches about one topic.

```sql
CREATE TABLE knowledge_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,        -- "jab-mechanics", "canelo-alvarez"
  title text NOT NULL,              -- "Jab Mechanics", "Canelo Alvarez"
  node_type text NOT NULL CHECK (node_type IN (
    'concept', 'fighter', 'technique', 'phase', 'drill', 'injury_prevention'
  )),
  content text NOT NULL,            -- full structured note (see Node Content Format)
  aliases text[] DEFAULT '{}',      -- ["jab", "lead hand punch"]
  embedding vector(512),            -- Voyage AI embedding of content
  centrality float DEFAULT 0,       -- pre-computed, count of weighted edges
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX knowledge_nodes_embedding_idx ON knowledge_nodes
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
CREATE INDEX knowledge_nodes_type_idx ON knowledge_nodes (node_type);
CREATE INDEX knowledge_nodes_slug_idx ON knowledge_nodes (slug);
```

**Node types and expected counts:**
- `concept` (~15): Kinetic Chains, Shearing Force, Throw vs Push, Four Phases, Torque, etc.
- `fighter` (~20): Canelo, Beterbiev, GGG, Tyson, Mayweather, Crawford, Pereira, etc.
- `technique` (~15): Jab Mechanics, Straight Punch, Left Hook, Uppercut, Stance, Footwork, etc.
- `phase` (4): Phase 1 Loading, Phase 2 Hip Explosion, Phase 3 Core Transfer, Phase 4 Follow Through
- `drill` (~10): Hip Opening Drill, High Five Exercise, Medicine Ball Throw, Bag Work, etc.
- `injury_prevention` (~5): Rotator Cuff Warm-Up, Shoulder Stability, Neck Training, etc.

### knowledge_edges

Typed, directional connections with evidence.

```sql
CREATE TABLE knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_node uuid REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_chunk uuid REFERENCES content_chunks(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN (
    'REQUIRES',       -- prerequisite: "Jab" requires "Phase 2 Hip Opening"
    'DEMONSTRATES',   -- fighter shows technique: "Canelo" demonstrates "Jab Mechanics"
    'TRAINS',         -- drill builds skill: "Hip Opening Drill" trains "Phase 2"
    'SOURCED_FROM',   -- evidence link: node → source chunk
    'CORRECTS',       -- myth-busting: "Throw vs Push" corrects "Shoulder Power Myth"
    'SEQUENCES',      -- ordering: "Phase 1" sequences to "Phase 2"
    'RELATED'         -- weaker association
  )),
  weight float DEFAULT 0.8 CHECK (weight >= 0 AND weight <= 1),
  evidence text,                    -- quote or reason this connection exists
  source_chunk uuid REFERENCES content_chunks(id),  -- which chunk proves this edge
  created_at timestamptz DEFAULT now(),
  CONSTRAINT edge_has_target CHECK (target_node IS NOT NULL OR target_chunk IS NOT NULL)
);

CREATE INDEX knowledge_edges_source_idx ON knowledge_edges (source_node);
CREATE INDEX knowledge_edges_target_node_idx ON knowledge_edges (target_node);
CREATE INDEX knowledge_edges_target_chunk_idx ON knowledge_edges (target_chunk);
CREATE INDEX knowledge_edges_type_idx ON knowledge_edges (edge_type);
```

### Node Content Format

Every concept note follows this structure (in the `content` field and in the Obsidian vault file):

```markdown
# Jab Mechanics

## Summary
The jab is the most important punch in boxing — it sets up everything
else. Alex teaches it as a throw using hip opening and kinetic chains,
not a push from the shoulder.

## What Alex Teaches
[Full synthesis of his methodology on this topic — 3-5 paragraphs
drawing from ALL relevant source material. Specific, technical,
grounded in his framework.]

## Key Quotes
> "The jab uses hip opening to create torque — it's the same
> rotational mechanic as a pitcher's fastball."
> — Canelo Alvarez Jab Analysis video

> "Most people push the jab. They extend the arm without loading
> the hip first. That's why it has no pop."
> — How to Throw a Powerful Straight Punch video

## Common Mistakes
- Pushing the jab straight out from the shoulder (no hip involvement)
- Tensing the arm before impact instead of staying loose
- Landing with the first two knuckles instead of the last three

## Connections
- Uses [[Phase 2 Hip Opening]] — hip opens to create torque
- Involves [[Kinetic Chains - Spiral Line]] — cross-body energy transfer
- Analyzed in [[Canelo Alvarez]] — excellent jab mechanics breakdown
- Drill: [[Hip Opening Drill]] — builds the foundation for jab power
- See also: [[Straight Punch Mechanics]] — contrasts hip closing

## Sources
- [[src/sZ1caNzodLU — Canelo Alvarez Excellent Jab Mechanics]]
- [[src/kzbbGHIKwxA — How to Throw a Powerful Straight Punch]]
- [[src/10-jab-mechanics.md — Course: Jab Phases]]
```

## 2. Retrieval Pipeline — Parallel Merge with HyDE + Cross-Encoder

### Full Query Flow

```
User query: "How does Canelo generate power in his jab?"
                    │
                    ▼
        ┌─── Query Decomposition (Claude) ───┐
        │                                     │
        ▼                                     ▼
  Sub-query 1:                          Sub-query 2:
  "Canelo Alvarez                       "jab power generation
   fighting analysis"                    kinetic chains mechanics"
        │                                     │
   ┌────┴────┐                           ┌────┴────┐
   ▼         ▼                           ▼         ▼
 HyDE    Graph Search                  HyDE    Graph Search
   │         │                           │         │
   ▼         ▼                           ▼         ▼
Vector    Find entry nodes            Vector    Find entry nodes
search    by keyword + embedding      search    by keyword + embedding
on hyp.   │                           on hyp.   │
answer    Traverse 1-2 hops           answer    Traverse 1-2 hops
   │      Collect connected chunks       │      Collect connected chunks
   │         │                           │         │
   └────┬────┘                           └────┬────┘
        │                                     │
        └──────────┬──────────────────────────┘
                   ▼
            Deduplicate all candidates
                   │
                   ▼
            Cohere Rerank against original query
            (cross-encoder, sees query + chunk together)
                   │
                   ▼
            Top 12 chunks + connected concept summaries
                   │
                   ▼
            Claude generates final answer
            with citations and video links
```

### HyDE (Hypothetical Document Embedding)

For each sub-query, Claude generates a short hypothetical answer (~100 words) as if it already knew the answer. This hypothetical is embedded and used for vector search instead of the raw question. Research shows 10-20% retrieval improvement because the hypothesis embedding sits closer to the actual answer chunks in vector space.

### Graph Search Details

1. **Entry point discovery:** Keyword match on node `title` and `aliases` + vector similarity on node `embedding`. Top 3 entry nodes per sub-query.
2. **Traversal:** Recursive CTE walks edges 1-2 hops from entry nodes. Collects:
   - Node content from connected nodes (concept summaries)
   - Source chunks via SOURCED_FROM edges (evidence)
   - Edge evidence text (why things connect)
3. **Scoring:** Each collected item gets a graph score: `edge_weight * (1 / hop_distance) * source_node_centrality`

### Cross-Encoder Reranking

After deduplication, all candidates (typically 20-30) go to **Cohere Rerank API** with the original user query. Cohere's cross-encoder reads each (query, chunk) pair and returns a relevance score. Take top 12.

Use Claude as reranker for eval/debugging only (slower but explainable).

### Graph Search SQL Function

```sql
CREATE OR REPLACE FUNCTION search_graph(
  query_embedding vector(512),
  entry_keywords text[],
  max_hops int DEFAULT 2,
  max_results int DEFAULT 20
)
RETURNS TABLE (
  item_type text,           -- 'node' or 'chunk'
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
  -- Traverse edges up to max_hops
  traversal AS (
    SELECT id, title, content, node_type, centrality, hop, path_weight, vector_sim
    FROM entry_nodes
    UNION ALL
    SELECT
      kn.id, kn.title, kn.content, kn.node_type, kn.centrality,
      t.hop + 1,
      t.path_weight * ke.weight,
      0::float
    FROM traversal t
    JOIN knowledge_edges ke ON ke.source_node = t.id
    JOIN knowledge_nodes kn ON kn.id = ke.target_node
    WHERE t.hop < max_hops
  )
  -- Return nodes with their scores
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

  -- Also return source chunks connected to traversed nodes
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
```

## 3. Vault Generation Pipeline

### Multi-Pass Generation (using Claude Opus for quality)

**Pass 1 — Entity Extraction:**
Feed all 254 source chunks to Claude in batches. Claude identifies every distinct concept, fighter, technique, drill, and phase across the entire corpus. Output: list of ~60-80 node candidates with titles, types, and aliases.

**Pass 2 — Knowledge Synthesis:**
For each identified node, gather ALL source chunks that mention this topic (use vector search + keyword match). Feed these chunks to Claude Opus with the instruction: "Synthesize everything Alex Wiant teaches about {topic}. Follow the Node Content Format. Preserve his exact language, analogies, and terminology. Include key quotes verbatim."

**Pass 3 — Edge Discovery:**
For each pair of related nodes, Claude identifies the connection type, provides evidence (a quote or explanation from the source material), and assigns a confidence weight. Claude is instructed: "Only create edges that are directly supported by the source material. If you're inferring a connection that Alex didn't explicitly make, mark it as RELATED with weight 0.5 or lower."

**Pass 4 — Validation:**
Claude reviews the complete graph with fresh eyes:
- Are any important concepts missing nodes?
- Are any edges hallucinated (not supported by source material)?
- Are any nodes orphaned (no edges)?
- Does the graph feel complete for someone learning Alex's methodology?

Fix issues found in validation before writing to vault/database.

### Vault File Structure

```
/Users/mark/boxing-coach/vault/
├── _MOC.md                          -- Map of Content (home note)
├── concepts/
│   ├── kinetic-chains.md
│   ├── shearing-force.md
│   ├── throw-vs-push.md
│   ├── four-phases-overview.md
│   └── ...
├── fighters/
│   ├── canelo-alvarez.md
│   ├── beterbiev.md
│   ├── ggg.md
│   └── ...
├── techniques/
│   ├── jab-mechanics.md
│   ├── straight-punch.md
│   ├── left-hook.md
│   └── ...
├── phases/
│   ├── phase-1-loading.md
│   ├── phase-2-hip-explosion.md
│   ├── phase-3-core-transfer.md
│   └── phase-4-follow-through.md
├── drills/
│   ├── hip-opening-drill.md
│   ├── high-five-exercise.md
│   └── ...
├── injury-prevention/
│   ├── rotator-cuff-warm-up.md
│   └── ...
└── src/                             -- source chunks (read-only reference)
    ├── sZ1caNzodLU.md
    ├── kzbbGHIKwxA.md
    └── ...
```

### Vault File Format (Obsidian-compatible)

```markdown
---
type: technique
aliases: [jab, lead hand punch, front hand punch]
tags: [power, phase-2, kinetic-chains, hip-opening]
centrality: 0.85
sources: 5
---

# Jab Mechanics

## Summary
[2-3 sentences]

## What Alex Teaches
[3-5 paragraphs, synthesis]

## Key Quotes
> "Quote 1..."
> — Video title

> "Quote 2..."
> — Video title

## Common Mistakes
- Mistake 1
- Mistake 2

## Connections
- Uses [[Phase 2 Hip Opening]] — hip opens to create torque
- Involves [[Kinetic Chains]] — cross-body energy transfer
- Analyzed in [[Canelo Alvarez]] — excellent jab mechanics
- Drill: [[Hip Opening Drill]] — builds foundation
- See also: [[Straight Punch]] — contrasts hip closing

## Sources
- [[src/sZ1caNzodLU]] — Canelo Alvarez Excellent Jab Mechanics
- [[src/kzbbGHIKwxA]] — How to Throw a Powerful Straight Punch
- [[src/10-jab-mechanics.md]] — Course: Jab Phases
```

### Map of Content (_MOC.md)

```markdown
# Punch Doctor Knowledge Base

Welcome to Dr. Alex Wiant's Power Punching methodology, organized
as an interconnected knowledge system.

## Core Concepts
- [[Throw vs Push]] — the foundation of everything
- [[Four Phases Overview]] — Load → Hip Explosion → Core Transfer → Follow Through
- [[Kinetic Chains]] — how energy transfers through the body
- [[Shearing Force]] — why you land with the last 3 knuckles

## The Four Phases
- [[Phase 1 Loading]] → [[Phase 2 Hip Explosion]] → [[Phase 3 Core Transfer]] → [[Phase 4 Follow Through]]

## Punch Mechanics
- [[Jab Mechanics]] | [[Straight Punch]] | [[Left Hook]] | [[Uppercut]]

## Fighter Analyses
- [[Canelo Alvarez]] | [[Beterbiev]] | [[GGG]] | [[Mike Tyson]]
- [[Crawford]] | [[Mayweather]] | [[Pereira]] | [[Gervonta Davis]]

## Training
- [[Hip Opening Drill]] | [[High Five Exercise]] | [[Medicine Ball Throw]]
- [[Bag Work]] | [[Hand Wrapping]]

## Injury Prevention
- [[Rotator Cuff Warm-Up]] | [[Shoulder Stability]] | [[Neck Training]]
```

## 4. Incremental Pipeline

When new content is added:

1. **Ingest:** New transcript → chunk → embed → insert into `content_chunks` (existing pipeline)
2. **Analyze:** Claude reads new chunks and identifies:
   - Which existing nodes they relate to (add SOURCED_FROM edges)
   - Whether new nodes are needed (new fighter, new concept)
   - Whether existing node content should be updated (new information about a known topic)
3. **Update vault:** Write new/modified `.md` files to the vault directory
4. **Sync to DB:** Update `knowledge_nodes`, `knowledge_edges`, re-embed changed nodes, recompute centrality

### Vault → DB Sync (after Alex edits)

`npm run vault-to-db`:
1. Parse all vault `.md` files — extract frontmatter, content sections, `[[backlinks]]`
2. Diff against current database state
3. Update changed nodes (content, aliases, tags)
4. Add/remove edges based on backlink changes
5. Re-embed nodes whose content changed
6. Recompute centrality scores

## 5. Eval Suite

20-30 test queries with expected retrieval targets. Run after every pipeline change.

**Example test cases:**

| Query | Must retrieve | Must NOT retrieve |
|-------|--------------|-------------------|
| "How does Canelo use his jab?" | Canelo node, Jab Mechanics node, Canelo jab transcript chunks | Shoulder stability chunks |
| "What drill helps with hip rotation?" | Hip Opening Drill node, Phase 2 node, drill chunks | Fighter analysis chunks |
| "What's wrong with push punching?" | Throw vs Push node, Common Misconceptions PDF chunk | Hand wrapping chunks |
| "How does Beterbiev generate power?" | Beterbiev node, Kinetic Chains node, Beterbiev transcript chunks | Neck training chunks |

**Eval script** (`npm run eval`):
- Runs each test query through the full retrieval pipeline
- Checks if expected chunks/nodes appear in top 12 results
- Reports recall score (% of expected items found) and precision (% of results that were expected)
- Flags any test case below 80% recall

**Query logging:**
- Every production query logs: query text, retrieved items, response, timestamp
- Stored in Supabase `query_logs` table
- Enables future analysis of what users ask and whether retrieval was good

## 6. Integration with Existing RAG

The knowledge graph enhances — not replaces — the existing v1 pipeline.

**Updated `src/lib/rag.ts`:**
- `retrieveChunks()` → becomes `retrieveContext()` which runs the full parallel merge pipeline
- Returns both chunks and concept node summaries
- Citations include both video links AND concept node references

**Updated API routes:**
- `/api/chat` calls `retrieveContext()` instead of `retrieveChunks()`
- Context sent to Claude includes concept summaries (from knowledge nodes) + source excerpts (from chunks) + connection explanations (from edge evidence)
- Claude gets richer, structured context → better answers

**New dependencies:**
- `cohere-ai` — for Rerank API (cross-encoder)
- No other new services

## 7. Environment Variables

```
COHERE_API_KEY=...           -- for Rerank API
VOYAGE_API_KEY=...           -- already configured
SUPABASE_URL=...             -- already configured
SUPABASE_SERVICE_ROLE_KEY=...-- already configured
ANTHROPIC_API_KEY=...        -- already configured
```

## Verification Plan

1. **Vault generation:** Run generation pipeline, open vault in Obsidian, verify graph view shows meaningful connections. Spot-check 5 concept notes for accuracy against source material.
2. **DB sync:** Verify `knowledge_nodes` and `knowledge_edges` tables have expected counts. Check centrality scores are non-zero for major concepts.
3. **Retrieval quality:** Run eval suite, verify >80% recall on all test cases.
4. **End-to-end:** Ask 5 queries in the app, verify answers cite specific videos and reference connected concepts.
5. **Incremental:** Add a fake transcript, run incremental pipeline, verify it creates edges to existing nodes.
6. **Vault edit sync:** Edit a vault file in Obsidian, run `vault-to-db`, verify DB reflects changes.
7. **Build:** `npm run build` passes.
