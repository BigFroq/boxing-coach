import Anthropic from "@anthropic-ai/sdk";
import { CohereClient } from "cohere-ai";

import { createServerClient } from "./supabase";
import { embedText } from "./voyage";
import {
  type RetrievedChunk,
  type SourceCitation,
  formatChunksForPrompt,
  extractCitations,
} from "./rag";

// Re-export for use in API routes
export { formatChunksForPrompt, extractCitations };
export type { RetrievedChunk, SourceCitation };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DecomposedQuery {
  sub_queries: string[];
  keywords: string[];
}

interface GraphSearchRow {
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

interface RawCandidate {
  content: string;
  source: "vector" | "graph";
  similarity: number;
  // Fields needed to build RetrievedChunk
  source_type: "pdf" | "transcript";
  video_id: string | null;
  video_title: string | null;
  video_url: string | null;
  pdf_file: string | null;
  techniques: string[];
  fighters: string[];
  category: string;
  // Graph-specific metadata
  node_type?: string | null;
  graph_title?: string | null;
}

// ---------------------------------------------------------------------------
// Clients (lazy-initialized)
// ---------------------------------------------------------------------------

function getAnthropic(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getCohere(): CohereClient | null {
  const token = process.env.COHERE_API_KEY;
  if (!token) return null;
  return new CohereClient({ token });
}

// ---------------------------------------------------------------------------
// Step 1: Query Decomposition
// ---------------------------------------------------------------------------

async function decomposeQuery(query: string): Promise<DecomposedQuery> {
  const anthropic = getAnthropic();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system:
      'Break this boxing question into 2-3 focused sub-queries for knowledge retrieval. Also extract key terms (fighter names, technique names, concepts). Return JSON only, no markdown: { "sub_queries": string[], "keywords": string[] }',
    messages: [{ role: "user", content: query }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  let result: DecomposedQuery;
  try {
    const parsed = JSON.parse(text) as DecomposedQuery;
    if (
      !Array.isArray(parsed.sub_queries) ||
      !Array.isArray(parsed.keywords)
    ) {
      throw new Error("Invalid decomposition shape");
    }
    result = parsed;
  } catch {
    result = { sub_queries: [query], keywords: [] };
  }

  // Always supplement with keywords extracted directly from the query
  // This catches fighter names and terms Claude might miss
  const words = query.toLowerCase().split(/\s+/);
  const supplemental = words.filter(
    (w) => w.length > 3 && !["does", "what", "how", "the", "with", "from", "this", "that", "when", "where", "which", "about", "their", "your", "have", "been", "should", "would", "could"].includes(w)
  );
  const allKeywords = [...new Set([...result.keywords.map(k => k.toLowerCase()), ...supplemental])];
  result.keywords = allKeywords;

  return result;
}

// ---------------------------------------------------------------------------
// Step 2a: HyDE — Hypothetical Document Embedding
// ---------------------------------------------------------------------------

async function generateHypotheticalAnswer(subQuery: string): Promise<string> {
  const anthropic = getAnthropic();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    system:
      "Generate a short hypothetical answer (~100 words) to a boxing technique question, as if you were Dr. Alex Wiant explaining his methodology. Use specific terminology: kinetic chains, phases, hip opening/closing, shearing force, throw vs push. Respond with the answer text only, no preamble.",
    messages: [{ role: "user", content: subQuery }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ---------------------------------------------------------------------------
// Step 2b: Vector Search via match_chunks
// ---------------------------------------------------------------------------

async function vectorSearch(
  embedding: number[],
  count: number,
  categories?: string[]
): Promise<RawCandidate[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_count: count,
    filter_categories: categories ?? null,
  });

  if (error) {
    console.error("Vector search error:", error);
    return [];
  }

  return (data as RetrievedChunk[]).map((chunk) => ({
    content: chunk.content,
    source: "vector" as const,
    similarity: chunk.similarity,
    source_type: chunk.source_type,
    video_id: chunk.video_id,
    video_title: chunk.video_title,
    video_url: chunk.video_url,
    pdf_file: chunk.pdf_file,
    techniques: chunk.techniques,
    fighters: chunk.fighters,
    category: chunk.category,
  }));
}

// ---------------------------------------------------------------------------
// Step 2c: Graph Search via search_graph RPC
// ---------------------------------------------------------------------------

async function graphSearch(
  embedding: number[],
  keywords: string[]
): Promise<RawCandidate[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("search_graph", {
    query_embedding: embedding,
    entry_keywords: keywords,
    max_hops: 1,
    max_results: 15,
  });

  if (error) {
    // Graph search may not be available yet (empty knowledge_nodes table)
    console.warn("Graph search error (falling back to vector-only):", error);
    return [];
  }

  if (!data || !Array.isArray(data)) return [];

  return (data as GraphSearchRow[]).map((row) => ({
    content: row.content,
    source: "graph" as const,
    similarity: row.graph_score,
    // Distinguish graph nodes from source chunks
    source_type: row.item_type === "chunk" ? ("transcript" as const) : ("pdf" as const),
    video_id: null,
    video_title: row.item_type === "chunk" ? row.title : null,
    video_url: row.item_type === "chunk" ? row.video_url : null,
    pdf_file: row.item_type === "node" ? `concept:${row.title}` : null,
    techniques: [],
    fighters: [],
    category: row.node_type ?? "concept",
    node_type: row.node_type,
    graph_title: row.title,
  }));
}

// ---------------------------------------------------------------------------
// Step 2: Process a single sub-query (HyDE → vector + graph in parallel)
// ---------------------------------------------------------------------------

async function processSubQuery(
  subQuery: string,
  keywords: string[],
  categories?: string[]
): Promise<RawCandidate[]> {
  // Generate hypothetical answer and embed it
  const hypotheticalAnswer = await generateHypotheticalAnswer(subQuery);
  const hydeEmbedding = await embedText(hypotheticalAnswer);

  // Run vector search and graph search in parallel
  const [vectorResults, graphResults] = await Promise.all([
    vectorSearch(hydeEmbedding, 10, categories),
    graphSearch(hydeEmbedding, keywords),
  ]);

  return [...vectorResults, ...graphResults];
}

// ---------------------------------------------------------------------------
// Step 3: Deduplicate candidates
// ---------------------------------------------------------------------------

function deduplicateCandidates(candidates: RawCandidate[]): RawCandidate[] {
  const seen = new Map<string, RawCandidate>();

  for (const candidate of candidates) {
    // Use content hash as dedup key (first 200 chars to handle minor variations)
    const key = candidate.content.slice(0, 200);

    const existing = seen.get(key);
    if (!existing || candidate.similarity > existing.similarity) {
      seen.set(key, candidate);
    }
  }

  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Step 4: Cohere Rerank (with fallback)
// ---------------------------------------------------------------------------

async function rerankCandidates(
  query: string,
  candidates: RawCandidate[],
  topN: number
): Promise<RawCandidate[]> {
  if (candidates.length === 0) return [];
  if (candidates.length <= topN) return candidates;

  const cohere = getCohere();
  if (!cohere) {
    // No Cohere API key — fall back to sorting by similarity
    console.warn("No COHERE_API_KEY — falling back to similarity sorting");
    return candidates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topN);
  }

  try {
    const response = await cohere.v2.rerank({
      model: "rerank-v3.5",
      query,
      documents: candidates.map((c) => c.content),
      topN,
    });

    return response.results.map((result) => ({
      ...candidates[result.index],
      similarity: result.relevanceScore,
    }));
  } catch (err) {
    console.error("Cohere rerank failed, falling back to similarity:", err);
    return candidates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topN);
  }
}

// ---------------------------------------------------------------------------
// Step 5: Convert candidates to RetrievedChunk[] + SourceCitation[]
// ---------------------------------------------------------------------------

function candidatesToChunks(candidates: RawCandidate[]): RetrievedChunk[] {
  return candidates.map((c) => ({
    content: c.content,
    source_type: c.source_type,
    video_id: c.video_id,
    video_title: c.video_title,
    video_url: c.video_url,
    pdf_file: c.pdf_file,
    techniques: c.techniques,
    fighters: c.fighters,
    category: c.category,
    similarity: c.similarity,
  }));
}

function buildCitations(candidates: RawCandidate[]): SourceCitation[] {
  const seen = new Set<string>();
  const citations: SourceCitation[] = [];

  for (const c of candidates) {
    // Graph concept nodes get "concept" citation type
    if (c.source === "graph" && c.node_type && c.graph_title) {
      const key = `concept:${c.graph_title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push({
        type: "concept" as SourceCitation["type"],
        title: c.graph_title,
        url: c.video_url ?? undefined,
      });
      continue;
    }

    // Standard chunk citations
    const key = c.video_id ?? c.pdf_file ?? "";
    if (seen.has(key)) continue;
    seen.add(key);

    if (c.source_type === "transcript" && c.video_title) {
      citations.push({
        type: "video",
        title: c.video_title,
        url: c.video_url ?? undefined,
      });
    } else if (c.pdf_file) {
      citations.push({
        type: "course",
        title: c.pdf_file
          .replace(".md", "")
          .replace(/^\d+-/, "")
          .replace(/-/g, " "),
        file: c.pdf_file,
      });
    }
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Main: retrieveContext()
// ---------------------------------------------------------------------------

export async function retrieveContext(
  query: string,
  options?: { count?: number; categories?: string[] }
): Promise<{ chunks: RetrievedChunk[]; citations: SourceCitation[] }> {
  const topN = options?.count ?? 12;

  // Step 1: Decompose query
  const { sub_queries, keywords } = await decomposeQuery(query);

  // Step 2: Process all sub-queries in parallel
  const subQueryResults = await Promise.all(
    sub_queries.map((sq) => processSubQuery(sq, keywords, options?.categories))
  );

  // Step 3: Merge and deduplicate
  const allCandidates = deduplicateCandidates(subQueryResults.flat());

  // Step 4: Rerank
  const reranked = await rerankCandidates(query, allCandidates, topN);

  // Step 5: Convert to output types
  const chunks = candidatesToChunks(reranked);
  const citations = buildCitations(reranked);

  return { chunks, citations };
}
