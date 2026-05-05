// scripts/recover-ppb-edges.ts
// One-shot recovery: backfill SOURCED_FROM edges for ppb-* content chunks that
// ended up with zero edges after a partial run where stage 6 of incremental-ingest
// was killed early (parent bash session terminated mid-loop).
//
// Inserts edges using the same logic as incremental-ingest.ts: Claude (via CLI/SDK
// per SYNTHESIS_PROVIDER) decides which knowledge nodes each chunk relates to,
// edges with relevance "high" → weight 0.9, "medium" → weight 0.6, "low" skipped.
//
// Usage:
//   SYNTHESIS_PROVIDER=cli npx tsx scripts/recover-ppb-edges.ts
//
// Idempotent: only operates on chunks where target_chunk has zero rows in
// knowledge_edges. Safe to re-run if interrupted.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { callLLM } from "./vault-generation/llm-provider";
import { withRetry } from "../src/lib/retry";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function shouldRetryLLM(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof TypeError) return true;
  if (/429|rate[\s_-]?limit/i.test(msg)) return true;
  if (/\b5\d\d\b/.test(msg)) return true;
  if (/timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND/i.test(msg)) return true;
  if (/overloaded/i.test(msg)) return true;
  if (/claude CLI (exit|api error|output not JSON)/i.test(msg)) return true;
  return false;
}

interface NodeMatch {
  slug: string;
  relevance: "high" | "medium" | "low";
}

async function matchChunkToNodes(
  chunkContent: string,
  nodes: { id: string; slug: string; title: string }[]
): Promise<NodeMatch[]> {
  if (nodes.length === 0) return [];
  const nodeList = nodes.map((n) => `- ${n.slug} (${n.title})`).join("\n");
  const text = await withRetry(
    () =>
      callLLM({
        model: "claude-opus-4-7",
        maxTokens: 2048,
        system: `Given a boxing content chunk and a list of existing knowledge graph nodes, identify which nodes this chunk is related to. Return a JSON array of { slug: string, relevance: "high" | "medium" | "low" }. Only include nodes that are genuinely mentioned or directly relevant. Return ONLY the JSON array, no markdown.`,
        user: `Chunk content: ${chunkContent.slice(0, 2000)}\n\nExisting nodes:\n${nodeList}`,
      }),
    { label: `node-match`, maxAttempts: 4, shouldRetry: shouldRetryLLM }
  );
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  try {
    const matches = JSON.parse(jsonStr) as NodeMatch[];
    return matches.filter(
      (m) =>
        typeof m.slug === "string" &&
        (m.relevance === "high" || m.relevance === "medium" || m.relevance === "low")
    );
  } catch {
    console.warn("  Failed to parse node matches, skipping");
    return [];
  }
}

async function main() {
  console.log(`Provider: ${process.env.SYNTHESIS_PROVIDER ?? "sdk"} | Model: claude-opus-4-7`);
  console.log("=== PPB Edge Recovery ===\n");

  // 1. Fetch all ppb-* chunks
  const { data: chunks, error: chunksErr } = await supabase
    .from("content_chunks")
    .select("id, content, video_id")
    .like("video_id", "ppb-%");
  if (chunksErr) throw new Error(`Fetch chunks failed: ${chunksErr.message}`);
  console.log(`Total ppb-* chunks: ${chunks?.length ?? 0}`);

  // 2. Find chunks that have zero edges
  const allIds = (chunks ?? []).map((c) => c.id);
  const { data: existingEdges, error: edgesErr } = await supabase
    .from("knowledge_edges")
    .select("target_chunk")
    .in("target_chunk", allIds);
  if (edgesErr) throw new Error(`Fetch edges failed: ${edgesErr.message}`);
  const chunksWithEdges = new Set((existingEdges ?? []).map((e) => e.target_chunk));
  const orphans = (chunks ?? []).filter((c) => !chunksWithEdges.has(c.id));
  console.log(`Chunks with edges already: ${chunksWithEdges.size}`);
  console.log(`Chunks missing edges (will recover): ${orphans.length}\n`);

  if (orphans.length === 0) {
    console.log("Nothing to recover. Done.");
    return;
  }

  // 3. Fetch knowledge nodes
  const { data: nodes, error: nodesErr } = await supabase
    .from("knowledge_nodes")
    .select("id, slug, title");
  if (nodesErr) throw new Error(`Fetch nodes failed: ${nodesErr.message}`);
  const nodeBySlug = new Map((nodes ?? []).map((n) => [n.slug, n]));
  console.log(`Knowledge nodes available: ${nodes?.length ?? 0}\n`);

  // 4. For each orphan, match + insert
  let totalEdges = 0;
  let chunksWithMatches = 0;
  const dirtySet = new Set<string>();
  for (let i = 0; i < orphans.length; i++) {
    const chunk = orphans[i];
    console.log(`  ${i + 1}/${orphans.length} ${chunk.video_id}`);
    const matches = await matchChunkToNodes(chunk.content, nodes ?? []);
    const edges = matches
      .filter((m) => m.relevance !== "low")
      .map((m) => {
        const node = nodeBySlug.get(m.slug);
        if (!node) return null;
        return {
          source_node: node.id,
          target_chunk: chunk.id,
          edge_type: "SOURCED_FROM",
          weight: m.relevance === "high" ? 0.9 : 0.6,
          evidence: `Recovery backfill: ${m.relevance} relevance match`,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (edges.length > 0) {
      const { error } = await supabase.from("knowledge_edges").insert(edges);
      if (error) {
        console.error(`    Insert failed: ${error.message}`);
      } else {
        totalEdges += edges.length;
        chunksWithMatches += 1;
        for (const e of edges) {
          const slug = (nodes ?? []).find((n) => n.id === e.source_node)?.slug;
          if (slug) dirtySet.add(slug);
        }
        console.log(`    +${edges.length} edges`);
      }
    } else {
      console.log(`    no high/medium matches`);
    }

    // Small delay between chunks
    if (i + 1 < orphans.length) await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Recovery complete ===`);
  console.log(`Chunks processed: ${orphans.length}`);
  console.log(`Chunks with at least one edge: ${chunksWithMatches}`);
  console.log(`Total edges created: ${totalEdges}`);
  console.log(`Dirty slugs flagged: ${dirtySet.size}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
