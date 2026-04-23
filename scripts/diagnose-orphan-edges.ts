// scripts/diagnose-orphan-edges.ts
// Diagnostic — are the 8 orphan vault notes missing edges in the DB, or is write-vault.ts not rendering them?
// Context: docs/outreach/vault-graph-audit.md flagged 8 orphans. pass3-edges.ts uses Opus to fill knowledge_edges.
// write-vault.ts (line 104) only replaces the placeholder when non-empty connections exist, so zero edges = placeholder remains.
// This script distinguishes "no edges in DB" (pass3 issue) from "edges exist but rendering skipped" (write-vault bug).
// No API calls — just DB queries. Safe to run any time.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ORPHAN_SLUGS = [
  "ciryl-gane",
  "dmitry-bivol",
  "james-toney",
  "tim-bradley",
  "oscar-de-la-hoya",
  "accelerate-phase",
  "follow-through-phase",
  "one-inch-punch",
];

interface Node {
  id: string;
  slug: string;
  title: string;
  node_type: string;
}

interface Edge {
  source_node: string;
  target_node: string | null;
  edge_type: string;
}

async function main() {
  console.log("=== Diagnostic: orphan edge status in DB ===\n");

  // 1. Fetch all nodes
  const { data: nodes, error: nodesErr } = await sb
    .from("knowledge_nodes")
    .select("id, slug, title, node_type");
  if (nodesErr) throw nodesErr;
  const allNodes = (nodes ?? []) as Node[];
  console.log(`Total nodes in DB: ${allNodes.length}`);

  // 2. Fetch all non-SOURCED_FROM edges (these are the only ones that become vault Connections)
  const { data: edges, error: edgesErr } = await sb
    .from("knowledge_edges")
    .select("source_node, target_node, edge_type")
    .neq("edge_type", "SOURCED_FROM");
  if (edgesErr) throw edgesErr;
  const allEdges = (edges ?? []) as Edge[];
  console.log(`Total non-SOURCED_FROM edges in DB: ${allEdges.length}\n`);

  // 3. Build per-node edge counts (both directions)
  const edgeCount = new Map<string, { out: number; in: number }>();
  for (const n of allNodes) edgeCount.set(n.id, { out: 0, in: 0 });
  for (const e of allEdges) {
    if (edgeCount.has(e.source_node)) edgeCount.get(e.source_node)!.out += 1;
    if (e.target_node && edgeCount.has(e.target_node)) edgeCount.get(e.target_node)!.in += 1;
  }

  // 4. Report on the 8 orphans
  console.log("=== The 8 orphan nodes ===");
  console.log("slug                       | id-in-db? | out | in  | verdict");
  console.log("---------------------------|-----------|-----|-----|------------------");
  let orphansMissing = 0;
  let orphansWithEdges = 0;
  for (const slug of ORPHAN_SLUGS) {
    const node = allNodes.find(n => n.slug === slug);
    if (!node) {
      console.log(`${slug.padEnd(26)} | NO        |   - |   - | not in DB (!)`);
      orphansMissing++;
      continue;
    }
    const c = edgeCount.get(node.id)!;
    const total = c.out + c.in;
    const verdict = total === 0 ? "zero edges (pass3)" : `edges exist (${total})`;
    if (total === 0) orphansMissing++; else orphansWithEdges++;
    console.log(`${slug.padEnd(26)} | yes       | ${String(c.out).padStart(3)} | ${String(c.in).padStart(3)} | ${verdict}`);
  }

  // 5. Compare to overall — how many nodes total have zero non-SOURCED_FROM edges?
  const allZeroEdge = allNodes.filter(n => {
    const c = edgeCount.get(n.id)!;
    return c.out + c.in === 0;
  });
  console.log(`\n=== Overall zero-edge nodes ===`);
  console.log(`${allZeroEdge.length} of ${allNodes.length} nodes have ZERO non-SOURCED_FROM edges.`);
  if (allZeroEdge.length <= 20) {
    for (const n of allZeroEdge) {
      const inOrphanList = ORPHAN_SLUGS.includes(n.slug) ? " [ORPHAN]" : "";
      console.log(`  - ${n.slug} (${n.node_type})${inOrphanList}`);
    }
  }

  // 6. Diagnosis
  console.log("\n=== Diagnosis ===");
  if (orphansMissing === ORPHAN_SLUGS.length) {
    console.log("All 8 orphans have ZERO edges in the DB. This is a pass3-edges problem —");
    console.log("edges were never discovered/saved for these nodes. Fix: re-run pass3-edges");
    console.log("for the affected nodes (expensive — Opus calls), OR investigate whether a");
    console.log("batch parse failure swallowed them silently during the original run.");
  } else if (orphansWithEdges === ORPHAN_SLUGS.length) {
    console.log("All 8 orphans HAVE edges in the DB. This is a write-vault.ts bug —");
    console.log("the renderer isn't using them. Fix: investigate why buildConnectionsSection");
    console.log("returns empty for these nodes (slug mismatch? edge type filter?).");
  } else {
    console.log(`Mixed: ${orphansWithEdges} have edges, ${orphansMissing} have zero edges.`);
    console.log("Fix combines both approaches per-orphan.");
  }

  console.log("\nSecondary finding — write-vault.ts:104 has an orthogonal bug:");
  console.log("the 'if (connections && ...)' check skips replacement when connections is empty,");
  console.log("leaving the [Leave empty — to be filled in Pass 3] placeholder in rendered files.");
  console.log("Even if pass3 genuinely has zero edges for a node, the placeholder shouldn't survive.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
