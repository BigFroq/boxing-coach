// scripts/rematch-ppb2-chunks.ts
// Re-runs knowledge-graph matching for the already-ingested ppb2-* pdf chunks.
// Needed because the original incremental-ingest matching ran while another
// session was rebuilding knowledge_nodes (FK violations, stale node ids).
//
// Idempotent: wipes prior SOURCED_FROM edges targeting ppb2 chunks, then
// re-matches against the CURRENT node set and merges dirty slugs.
//
// Run: SYNTHESIS_PROVIDER=cli SYNTHESIS_MODEL=claude-fable-5 npx tsx scripts/rematch-ppb2-chunks.ts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { callLLM } from "./vault-generation/llm-provider";
import { withRetry } from "../src/lib/retry";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LLM_MODEL = process.env.SYNTHESIS_MODEL ?? "claude-opus-4-8";
const DIRTY_SLUGS_FILE = path.join(process.cwd(), "scripts", "vault-generation", ".cache", "dirty-slugs.json");

function shouldRetryLLM(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof TypeError) return true;
  if (/429|rate[\s_-]?limit|\b5\d\d\b|timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|overloaded/i.test(msg)) return true;
  if (/claude CLI (exit|api error|output not JSON)/i.test(msg)) return true;
  return false;
}

async function main() {
  const { data: chunks, error: cErr } = await sb
    .from("content_chunks")
    .select("id, content, pdf_file")
    .like("pdf_file", "ppb2-%")
    .order("pdf_file");
  if (cErr) throw cErr;
  if (!chunks?.length) throw new Error("No ppb2 chunks found in content_chunks");
  console.log(`ppb2 chunks: ${chunks.length}`);

  // Clean slate: drop prior SOURCED_FROM edges pointing at these chunks
  const chunkIds = chunks.map((c) => c.id);
  const { error: delErr } = await sb
    .from("knowledge_edges")
    .delete()
    .eq("edge_type", "SOURCED_FROM")
    .in("target_chunk", chunkIds);
  if (delErr) console.warn(`edge cleanup warning: ${delErr.message}`);

  const { data: nodes, error: nErr } = await sb
    .from("knowledge_nodes")
    .select("id, slug, title, node_type");
  if (nErr) throw nErr;
  console.log(`current nodes: ${nodes!.length}`);
  const nodeBySlug = new Map(nodes!.map((n) => [n.slug, n]));
  const nodeList = nodes!.map((n) => `- ${n.slug} (${n.title})`).join("\n");

  const dirty = new Set<string>();
  try {
    for (const s of JSON.parse(await fs.readFile(DIRTY_SLUGS_FILE, "utf-8"))) dirty.add(s);
  } catch { /* start fresh */ }
  const flagged = new Set<string>();
  let edgesCreated = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[${i + 1}/${chunks.length}] ${chunk.pdf_file}`);
    const text = await withRetry(
      () =>
        callLLM({
          model: LLM_MODEL,
          maxTokens: 2048,
          system: `Given a boxing content chunk and a list of existing knowledge graph nodes, identify which nodes this chunk is related to. Return a JSON array of { slug: string, relevance: "high" | "medium" | "low" }. Only include nodes that are genuinely mentioned or directly relevant. Return ONLY the JSON array, no markdown.`,
          user: `Chunk content: ${chunk.content.slice(0, 2000)}\n\nExisting nodes:\n${nodeList}`,
        }),
      { label: `rematch-${chunk.pdf_file}`, maxAttempts: 4, shouldRetry: shouldRetryLLM }
    );
    let jsonStr = text;
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) jsonStr = m[1].trim();

    let matches: Array<{ slug: string; relevance: string }> = [];
    try {
      matches = JSON.parse(jsonStr);
    } catch {
      console.warn(`  parse failure, skipping`);
      continue;
    }

    const edges = [];
    for (const match of matches) {
      if (match.relevance === "low") continue;
      const node = nodeBySlug.get(match.slug);
      if (!node) {
        flagged.add(match.slug);
        continue;
      }
      edges.push({
        source_node: node.id,
        target_chunk: chunk.id,
        edge_type: "SOURCED_FROM",
        weight: match.relevance === "high" ? 0.9 : 0.6,
        evidence: `PPB 2.0 rematch: ${match.relevance} relevance`,
      });
    }
    if (edges.length) {
      const { error } = await sb.from("knowledge_edges").insert(edges);
      if (error) console.error(`  edge insert failed: ${error.message}`);
      else {
        edgesCreated += edges.length;
        for (const e of edges) {
          const slug = nodes!.find((n) => n.id === e.source_node)?.slug;
          if (slug) dirty.add(slug);
        }
        console.log(`  ${edges.length} edges`);
      }
    }
    // Incremental save of the dirty queue after every chunk (crash-safe)
    await fs.writeFile(DIRTY_SLUGS_FILE, JSON.stringify([...dirty], null, 2));
  }

  console.log(`\nedges created: ${edgesCreated}`);
  console.log(`dirty queue: ${dirty.size} slugs`);
  if (flagged.size) console.log(`flagged (no node in graph): ${[...flagged].join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
