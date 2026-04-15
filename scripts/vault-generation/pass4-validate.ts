// scripts/vault-generation/pass4-validate.ts
// Pass 4: Validate graph, insert nodes/edges into Supabase, embed, compute centrality
import Anthropic from "@anthropic-ai/sdk";
import type { SynthesizedNode } from "./pass2-synthesize";
import type { DiscoveredEdge } from "./pass3-edges";

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

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
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    allEmbeddings.push(...data.data.map((d) => d.embedding));

    if (i + batchSize < texts.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return allEmbeddings;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function validateAndInsert(
  supabase: any,
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
  const validationResponse = await getAnthropic().messages.create({
    model: "claude-opus-4-6",
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
    const validation = JSON.parse(valJson) as {
      overall_quality?: string;
      summary?: string;
      issues?: { type: string; description: string }[];
    };
    console.log(`Validation: ${validation.overall_quality}`);
    console.log(`Summary: ${validation.summary}`);
    if (validation.issues && validation.issues.length > 0) {
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
