// scripts/vault-generation/pass3-edges.ts
// Pass 3: Discover edges between nodes + SOURCED_FROM edges to chunks
import type { SynthesizedNode } from "./pass2-synthesize";
import { callLLM } from "./llm-provider";

export interface DiscoveredEdge {
  source_slug: string;
  target_slug: string | null; // null for SOURCED_FROM edges targeting chunks
  target_chunk_id: string | null; // for SOURCED_FROM edges
  edge_type: "REQUIRES" | "DEMONSTRATES" | "TRAINS" | "SOURCED_FROM" | "CORRECTS" | "SEQUENCES" | "RELATED";
  weight: number;
  evidence: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function discoverEdges(
  _supabase: any,
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

    const text = await callLLM({
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
      user: `Discover edges for these nodes:\n\n${batchText}`,
      model: process.env.SYNTHESIS_MODEL ?? "claude-opus-4-6",
      maxTokens: 8192,
    });

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
