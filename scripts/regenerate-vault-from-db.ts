// scripts/regenerate-vault-from-db.ts
// Rebuilds the vault/*.md files from the current DB state, without running any LLM passes.
// Use after scripts/rerun-pass3-edges.ts has inserted new edges to pick them up in the vault
// (generate-vault.ts uses pass3-edges.json cache which won't reflect DB inserts).
//
// No API calls. Read knowledge_nodes + knowledge_edges, shape them into the types
// writeVaultFiles() expects, call it, done.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { SynthesizedNode } from "./vault-generation/pass2-synthesize";
import type { DiscoveredEdge } from "./vault-generation/pass3-edges";
import { writeVaultFiles } from "./vault-generation/write-vault";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log("=== Regenerating vault files from current DB state ===\n");

  const { data: nodesRaw, error: nErr } = await sb
    .from("knowledge_nodes")
    .select("id, slug, title, node_type, content, aliases");
  if (nErr) throw nErr;
  const allNodes = nodesRaw ?? [];
  console.log(`Loaded ${allNodes.length} nodes.`);

  // Paginate — Supabase default row limit is 1000 and this table exceeds that
  const PAGE_SIZE = 1000;
  const allEdges: Array<{
    source_node: string;
    target_node: string | null;
    target_chunk: string | null;
    edge_type: string;
    weight: number;
    evidence: string;
  }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("knowledge_edges")
      .select("source_node, target_node, target_chunk, edge_type, weight, evidence")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allEdges.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  console.log(`Loaded ${allEdges.length} edges (including SOURCED_FROM).\n`);

  // Build id→slug map to convert DB UUIDs back to slug-based references
  const idToSlug = new Map<string, string>();
  for (const n of allNodes) idToSlug.set(n.id, n.slug);

  // Shape nodes as SynthesizedNode[]. source_chunk_ids comes from SOURCED_FROM edges.
  const sourceChunksByNodeId = new Map<string, string[]>();
  for (const e of allEdges) {
    if (e.edge_type === "SOURCED_FROM" && e.target_chunk) {
      const arr = sourceChunksByNodeId.get(e.source_node) ?? [];
      arr.push(e.target_chunk);
      sourceChunksByNodeId.set(e.source_node, arr);
    }
  }

  const nodes: SynthesizedNode[] = allNodes.map(n => ({
    title: n.title,
    slug: n.slug,
    node_type: n.node_type,
    aliases: n.aliases ?? [],
    description: "", // not used by writeVaultFiles
    content: n.content,
    source_chunk_ids: sourceChunksByNodeId.get(n.id) ?? [],
  }));

  // Shape edges as DiscoveredEdge[] — convert UUID references to slug references
  const edges: DiscoveredEdge[] = [];
  for (const e of allEdges) {
    const sourceSlug = idToSlug.get(e.source_node);
    if (!sourceSlug) continue;
    const targetSlug = e.target_node ? idToSlug.get(e.target_node) ?? null : null;
    edges.push({
      source_slug: sourceSlug,
      target_slug: targetSlug,
      target_chunk_id: e.target_chunk ?? null,
      edge_type: e.edge_type as DiscoveredEdge["edge_type"],
      weight: e.weight ?? 0.8,
      evidence: e.evidence ?? "",
    });
  }

  const nonSourcedFrom = edges.filter(e => e.edge_type !== "SOURCED_FROM").length;
  console.log(`Rendering ${nodes.length} files with ${nonSourcedFrom} node-to-node edges.\n`);

  await writeVaultFiles(nodes, edges);
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
